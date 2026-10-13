// Integration tests against the real database connection (DATABASE_URL). Exercises the
// seat-allocation engine directly -- no server needed. Run with: npm run test:booking
// Uses a disposable, clearly-marked customer name so re-runs don't accumulate junk and
// a cleanup pass at the end removes everything this run created.
import assert from "node:assert/strict";
import "dotenv/config";
import { createReservation, cancelReservation, modifyReservation } from "../src/lib/reservations.js";
import { query, pool } from "../src/lib/db.js";

const RESTAURANT_ID = 1;
const MARKER = "TEST-BOOKING-ENGINE";
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (error) {
    console.error(`FAIL  - ${name}\n        ${error.message}`);
    failed++;
  }
}

async function cleanup() {
  await query(
    `delete from seat_allocations where reservation_id in (select id from reservations where customer_name like $1)`,
    [`${MARKER}%`]
  );
  await query(`delete from reservations where customer_name like $1`, [`${MARKER}%`]);
  await query(`delete from group_booking_requests where customer_name like $1`, [`${MARKER}%`]);
}

async function run() {
  await cleanup();

  await test("confirms a basic two-person reservation with real seats", async () => {
    const result = await createReservation({
      restaurantId: RESTAURANT_ID, customerName: `${MARKER} Two`, phone: "9000000001",
      partySize: 2, reservationDate: "2027-01-10", startTime: "19:00", seatingPreference: "together"
    });
    assert.equal(result.status, "confirmed");
    assert.ok(result.plan.seatIds.length === 2);
  });

  await test("prevents double-booking the same seats for an overlapping time", async () => {
    const first = await createReservation({
      restaurantId: RESTAURANT_ID, customerName: `${MARKER} ConflictA`, phone: "9000000002",
      partySize: 2, reservationDate: "2027-01-11", startTime: "19:00", seatingPreference: "shared_ok"
    });
    assert.equal(first.status, "confirmed");
    // Same restaurant, same window, enough demand to exhaust every free table -- eventually one
    // of these must either land on a different table or come back pending. Either is correct;
    // what must never happen is two reservations claiming the exact same seat id.
    const seatIdsSeen = new Set(first.plan.seatIds.map(String));
    for (let i = 0; i < 6; i++) {
      const next = await createReservation({
        restaurantId: RESTAURANT_ID, customerName: `${MARKER} ConflictB${i}`, phone: `900000003${i}`,
        partySize: 2, reservationDate: "2027-01-11", startTime: "19:00", seatingPreference: "shared_ok"
      });
      if (next.status === "confirmed") {
        for (const id of next.plan.seatIds.map(String)) {
          assert.ok(!seatIdsSeen.has(id), `seat ${id} was double-booked`);
          seatIdsSeen.add(id);
        }
      }
    }
  });

  await test("a cancelled reservation releases its seats for reuse", async () => {
    const booked = await createReservation({
      restaurantId: RESTAURANT_ID, customerName: `${MARKER} Cancelled`, phone: "9000000010",
      partySize: 2, reservationDate: "2027-01-12", startTime: "12:00", seatingPreference: "together"
    });
    assert.equal(booked.status, "confirmed");
    await cancelReservation({ restaurantId: RESTAURANT_ID, reservationId: booked.reservation.id, reason: "test" });
    const rebooked = await createReservation({
      restaurantId: RESTAURANT_ID, customerName: `${MARKER} Rebooked`, phone: "9000000011",
      partySize: 2, reservationDate: "2027-01-12", startTime: "12:00", seatingPreference: "together"
    });
    assert.equal(rebooked.status, "confirmed");
  });

  await test("large party over the auto-confirm threshold becomes a pending group request", async () => {
    const result = await createReservation({
      restaurantId: RESTAURANT_ID, customerName: `${MARKER} LargeGroup`, phone: "9000000020",
      partySize: 9, reservationDate: "2027-01-13", startTime: "20:00", seatingPreference: "together"
    });
    assert.equal(result.status, "pending");
    assert.ok(result.groupRequest);
  });

  await test("modifying a confirmed reservation to an unavailable slot keeps the original booking", async () => {
    const booked = await createReservation({
      restaurantId: RESTAURANT_ID, customerName: `${MARKER} ModifyMe`, phone: "9000000030",
      partySize: 2, reservationDate: "2027-01-14", startTime: "19:00", seatingPreference: "together"
    });
    // Fill every other seat at that exact time so there is nowhere for a modified, bigger
    // party to go -- the modification must then fail without touching the original booking.
    for (let i = 0; i < 20; i++) {
      await createReservation({
        restaurantId: RESTAURANT_ID, customerName: `${MARKER} Filler${i}`, phone: `900000004${i}`,
        partySize: 2, reservationDate: "2027-01-14", startTime: "19:00", seatingPreference: "shared_ok"
      }).catch(() => {});
    }
    let threw = false;
    try {
      await modifyReservation({
        restaurantId: RESTAURANT_ID, reservationId: booked.reservation.id,
        changes: { partySize: 10 }, modifiedBy: "staff"
      });
    } catch {
      threw = true;
    }
    const stillThere = await query("select status, party_size from reservations where id = $1", [booked.reservation.id]);
    assert.equal(stillThere.rows[0].status, "confirmed");
    assert.equal(stillThere.rows[0].party_size, 2);
    assert.ok(threw, "expected the oversized modification to be rejected");
  });

  await cleanup();
  await pool.end();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

run();

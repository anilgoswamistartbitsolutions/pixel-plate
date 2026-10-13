/**
 * Fills the next 7 days with realistic demo traffic: ~10 reservations a day, a few leads a
 * day, and a few takeaway orders a day.
 *
 * Reservations go through the real createReservation() so every one gets genuine seat
 * allocations and respects the live booking rules -- raw inserts would leave reservations
 * with no seats, which quietly corrupts the availability engine for every later booking.
 *
 * Takeaway is inserted directly instead: createTakeawayOrder() validates the pickup time
 * against the prep buffer relative to *now*, which correctly refuses the seeded times on
 * other days. The money and the line items still come from the real quoteTakeaway(), so the
 * totals and service charge match what the app itself would have written.
 *
 * Idempotent-ish: run with `--clean` to remove previously seeded demo rows first (they are
 * tagged in notes with SEED_TAG) so repeated runs do not pile up.
 *
 *   node --env-file=.env --import ./tests/register.mjs scripts/seed-week.mjs [--clean]
 */
import { createReservation } from "@/lib/reservations";
import { createGroupRequest } from "@/lib/group-requests";
import { quoteTakeaway } from "@/lib/takeaway";
import { getSettings, getBookingRules, windowsForDate } from "@/lib/restaurant";
import { query } from "@/lib/db";

const RESTAURANT_ID = 1;
const SEED_TAG = "[demo-week]";
const DAYS = 7;
const RESERVATIONS_PER_DAY = 10;

const GUESTS = [
  ["Maria Lopez", "3105550142"], ["James Whitfield", "4155550118"], ["Priya Raman", "6195550173"],
  ["Daniel Okafor", "8185550164"], ["Sofia Marchetti", "9495550127"], ["Ethan Brooks", "5105550139"],
  ["Hannah Kim", "7145550186"], ["Marcus Delgado", "3235550151"], ["Olivia Chen", "6505550194"],
  ["Rahul Mehta", "4085550108"], ["Grace Adeyemi", "2135550176"], ["Tomas Nunez", "5595550133"],
  ["Leila Haddad", "8315550147"], ["Connor Walsh", "9165550162"], ["Yuki Tanaka", "4245550115"],
  ["Nadia Petrova", "7075550189"], ["Samuel Ortiz", "3105550121"], ["Chloe Dubois", "4155550155"],
  ["Arjun Kapoor", "6265550178"], ["Beatriz Silva", "9515550192"]
];

const GROUPS = [
  ["Whitfield Anniversary Party", "4155550118", 14, "Anniversary dinner -- asking about a cake and a toast."],
  ["Nexora Offsite Dinner", "6505550194", 18, "Corporate offsite, needs one long table and an invoice."],
  ["Adeyemi Family Reunion", "2135550176", 22, "Family reunion, mix of adults and children, two high chairs."],
  ["Santa Monica Running Club", "3235550151", 16, "Post-race dinner, flexible on time, wants the terrace."],
  ["Kim Wedding Rehearsal", "7145550186", 25, "Rehearsal dinner -- asked about the Private Dining Room."],
  ["Delgado 60th Birthday", "5105550139", 12, "Surprise birthday, wants a quiet corner away from the bar."],
  ["Mehta Diwali Dinner", "4085550108", 20, "Festival dinner, asked for a vegetarian-only menu."],
  ["Harbour Capital Client Dinner", "9165550162", 11, "Client dinner, wine pairing requested."],
  ["Tanaka Graduation Lunch", "4245550115", 15, "Graduation lunch, photos afterwards on the rooftop."],
  ["Ocean Ridge HOA Meeting", "8315550147", 13, "Wants a semi-private space with a projector."]
];

const TAKEAWAY_ORDERS = [
  ["Ethan Brooks", "5105550139", "2 Pixel Plate Classic Burger, 1 Garlic Parmesan Fries"],
  ["Priya Raman", "6195550173", "1 California Veggie Bowl, 1 Butternut Squash Soup"],
  ["Marcus Delgado", "3235550151", "3 Baja Fish Tacos (3)"],
  ["Olivia Chen", "6505550194", "1 Pan-Seared Salmon, 1 Santa Monica Kale Caesar"],
  ["Connor Walsh", "9165550162", "2 Wild Mushroom Risotto, 1 Crispy Brussels Sprouts"],
  ["Hannah Kim", "7145550186", "1 Ahi Tuna Poke Bowl Bites, 2 Garlic Parmesan Fries"],
  ["Rahul Mehta", "4085550108", "2 Grilled Portobello Sandwich"],
  ["Leila Haddad", "8315550147", "1 California Guacamole & Chips, 1 Heirloom Tomato & Burrata"],
  ["Samuel Ortiz", "3105550121", "1 Grilled Santa Barbara Ribeye"],
  ["Yuki Tanaka", "4245550115", "2 California Veggie Bowl, 1 Butternut Squash Soup"]
];

const PREFERENCES = ["together", "together", "together", "anywhere"];
const PARTY_SIZES = [2, 2, 2, 3, 3, 4, 4, 5, 6, 2];
const TAKEAWAY_STATUSES = ["pending", "preparing", "prepared_paid", "taken"];

/** Today in the restaurant's own terms -- UTC, which is what the server runs on. */
function isoDay(offset) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function minutesToHhmm(total) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
}

/**
 * Start times spread across the day's real open windows, every one of them leaving a full
 * sitting before close. Seeding a time the booking engine would refuse is pointless -- it
 * just produces failures -- so the candidates are derived from the same hours the engine reads.
 */
function startTimesFor(settings, isoDate, duration, count) {
  const windows = windowsForDate(settings, isoDate) || [];
  const candidates = [];
  for (const w of windows) {
    const open = toMinutes(w.open);
    const lastStart = toMinutes(w.close) - duration;
    for (let t = open; t <= lastStart; t += 30) candidates.push(t);
  }
  if (!candidates.length) return [];
  // Even spread rather than the first N, so a day's bookings are not all stacked at opening.
  const picked = [];
  for (let i = 0; i < count; i += 1) {
    picked.push(candidates[Math.floor((i * candidates.length) / count)]);
  }
  return picked.map(minutesToHhmm);
}

async function clean() {
  const res = await query(
    `delete from reservations where restaurant_id = $1 and notes like $2 returning id`,
    [RESTAURANT_ID, `%${SEED_TAG}%`]
  );
  const leads = await query(
    `delete from group_booking_requests where restaurant_id = $1 and notes like $2 returning id`,
    [RESTAURANT_ID, `%${SEED_TAG}%`]
  );
  const orders = await query(
    `delete from takeaway_orders where restaurant_id = $1 and notes like $2 returning id`,
    [RESTAURANT_ID, `%${SEED_TAG}%`]
  );
  console.log(`cleaned: ${res.rowCount} reservations, ${leads.rowCount} leads, ${orders.rowCount} takeaway orders`);
}

async function seedTakeaway(isoDate, dayIndex) {
  const settings = await getSettings(RESTAURANT_ID);
  const slots = (await query(
    "select slot, start_time, end_time from daily_slots where restaurant_id = $1 order by start_time",
    [RESTAURANT_ID]
  )).rows;
  if (!slots.length) return 0;

  const howMany = 3 + (dayIndex % 2); // 3 or 4 a day
  let made = 0;
  for (let i = 0; i < howMany; i += 1) {
    const [name, phone, itemsText] = TAKEAWAY_ORDERS[(dayIndex * 4 + i) % TAKEAWAY_ORDERS.length];
    const slot = slots[(dayIndex + i) % slots.length];
    // A pickup time inside the slot, on the half hour, matching the fixed-slot model the
    // staff UI and the agent both offer.
    const base = toMinutes(slot.start_time.slice(0, 5));
    const pickup = minutesToHhmm(base + 30 * (1 + (i % 3)));

    const lines = itemsText.split(",").map((part) => {
      const m = part.trim().match(/^(\d+)\s+(.*)$/);
      return m ? { name: m[2].trim(), quantity: Number(m[1]) } : { name: part.trim(), quantity: 1 };
    });

    let quote;
    try {
      quote = await quoteTakeaway(RESTAURANT_ID, lines);
    } catch (error) {
      console.log(`  takeaway skipped (${name}): ${error.message}`);
      continue;
    }
    if (!quote.items.length) {
      console.log(`  takeaway skipped (${name}): no matching menu items`);
      continue;
    }

    // created_at is the only date a takeaway order carries, so it is what places the order on
    // a given day in the dashboard's queue -- hence stamping it rather than letting it default.
    const status = TAKEAWAY_STATUSES[(dayIndex + i) % TAKEAWAY_STATUSES.length];
    const inserted = await query(
      `insert into takeaway_orders
         (restaurant_id, customer_name, phone, requested_slot, requested_time, subtotal_cents,
          service_charge_pct, service_charge_cents, total_cents, status, payment_status, notes,
          source, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'voice_agent',$13,$13) returning id`,
      [
        RESTAURANT_ID, name, phone, slot.slot, pickup,
        quote.subtotalCents, quote.serviceChargePct, quote.serviceChargeCents, quote.totalCents,
        status, status === "prepared_paid" || status === "taken" ? "paid" : "unpaid",
        `${SEED_TAG} phone order for ${slot.slot} pickup`,
        `${isoDate}T${pickup}:00Z`
      ]
    );
    for (const item of quote.items) {
      await query(
        `insert into takeaway_order_items (takeaway_order_id, menu_item_id, item_name, quantity, unit_price_cents, variant_label)
         values ($1,$2,$3,$4,$5,$6)`,
        [inserted.rows[0].id, item.menuItemId, item.name, item.quantity, item.unitPriceCents, item.variantLabel]
      );
    }
    made += 1;
  }
  void settings;
  return made;
}

async function main() {
  if (process.argv.includes("--clean")) await clean();

  const settings = await getSettings(RESTAURANT_ID);
  const rules = await getBookingRules(RESTAURANT_ID);
  if (!settings || !rules) throw new Error("Restaurant is not configured -- run db:migrate and db:seed first.");
  const duration = rules.reservation_duration_minutes;

  const totals = { reservations: 0, pending: 0, leads: 0, takeaway: 0, failed: 0 };

  for (let day = 0; day < DAYS; day += 1) {
    const isoDate = isoDay(day);
    const times = startTimesFor(settings, isoDate, duration, RESERVATIONS_PER_DAY);
    if (!times.length) {
      console.log(`${isoDate}: closed -- skipped`);
      continue;
    }

    let confirmed = 0;
    let pending = 0;
    for (let i = 0; i < times.length; i += 1) {
      const [name, phone] = GUESTS[(day * RESERVATIONS_PER_DAY + i) % GUESTS.length];
      const partySize = PARTY_SIZES[(day + i) % PARTY_SIZES.length];
      try {
        const result = await createReservation({
          restaurantId: RESTAURANT_ID,
          customerName: name,
          phone,
          partySize,
          reservationDate: isoDate,
          startTime: times[i],
          seatingPreference: PREFERENCES[(day + i) % PREFERENCES.length],
          notes: `${SEED_TAG} party of ${partySize} at ${times[i]}`,
          source: "voice_agent"
        });
        if (result.status === "confirmed") confirmed += 1;
        else pending += 1;
      } catch (error) {
        totals.failed += 1;
        console.log(`  ${isoDate} ${times[i]} ${name}: ${error.message}`);
      }
    }

    // A couple of leads a day, dated a few weeks out -- a group enquiry taken today is almost
    // never for today, and the full-floor rule needs real notice anyway.
    let leads = 0;
    for (let i = 0; i < 2; i += 1) {
      const [name, phone, partySize, note] = GROUPS[(day * 2 + i) % GROUPS.length];
      const requestedDate = isoDay(day + 21 + i);
      try {
        await createGroupRequest({
          restaurantId: RESTAURANT_ID,
          customerName: name,
          phone,
          partySize,
          requestedDate,
          requestedTime: i === 0 ? "19:00" : "13:00",
          seatingPreference: "together",
          notes: `${SEED_TAG} ${note}`,
          priority: partySize >= 20 ? "high" : "normal"
        });
        leads += 1;
      } catch (error) {
        console.log(`  lead ${name}: ${error.message}`);
      }
    }

    const takeaway = await seedTakeaway(isoDate, day);

    totals.reservations += confirmed;
    totals.pending += pending;
    totals.leads += leads;
    totals.takeaway += takeaway;
    console.log(`${isoDate}: ${confirmed} confirmed, ${pending} pending, ${leads} leads, ${takeaway} takeaway`);
  }

  console.log(
    `\ntotal: ${totals.reservations} confirmed reservations, ${totals.pending} pending, ` +
    `${totals.leads} leads, ${totals.takeaway} takeaway orders, ${totals.failed} failed`
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

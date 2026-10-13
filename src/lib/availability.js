import { query } from "@/lib/db";

/**
 * Seat-level availability & allocation engine.
 *
 * Models tables/seats/allocations exactly as the schema does: a seat is "free" for a
 * requested [start, end) window when no seat_allocations row with status in
 * ('held','active') overlaps it. The database also enforces this with a gist exclusion
 * constraint (seat_allocations), so even a race between two concurrent requests cannot
 * double-book a seat -- the loser's INSERT raises a 23P01 exclusion_violation that the
 * caller (see reservations.js) turns into "no longer available" rather than a false success.
 */

export function toWindow(isoDate, hhmm, durationMinutes) {
  const start = new Date(`${isoDate}T${hhmm}:00Z`);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

async function loadTablesWithFreeSeats(client, restaurantId, startAt, endAt) {
  const tablesResult = await client.query(
    `select * from restaurant_tables where restaurant_id = $1 and active = true order by code`,
    [restaurantId]
  );
  const seatsResult = await client.query(
    `select s.* from table_seats s
     join restaurant_tables t on t.id = s.table_id
     where t.restaurant_id = $1 and s.active = true and t.active = true
     order by s.table_id, s.seat_index`,
    [restaurantId]
  );
  const busyResult = await client.query(
    `select distinct seat_id from seat_allocations
     where restaurant_id = $1 and status in ('held','active')
       and tstzrange(start_at, end_at, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
    [restaurantId, startAt, endAt]
  );
  const busySeatIds = new Set(busyResult.rows.map((r) => String(r.seat_id)));

  const seatsByTable = new Map();
  for (const seat of seatsResult.rows) {
    const list = seatsByTable.get(seat.table_id) || [];
    list.push({ ...seat, free: !busySeatIds.has(String(seat.id)) });
    seatsByTable.set(seat.table_id, list);
  }

  return tablesResult.rows.map((table) => {
    const seats = seatsByTable.get(table.id) || [];
    const freeSeats = seats.filter((s) => s.free);
    return { ...table, seats, freeSeats, isFullyFree: freeSeats.length === seats.length && seats.length > 0 };
  });
}

async function loadCombinations(client, restaurantId) {
  const result = await client.query(
    "select * from table_combinations where restaurant_id = $1 and active = true",
    [restaurantId]
  );
  return result.rows;
}

/**
 * preference: 'together' (default -- everyone at one table/combo), 'split_ok' (several
 * nearby tables acceptable), or 'shared_ok' (willing to share a table with strangers).
 */
export async function planAllocation({ client, restaurantId, startAt, endAt, partySize, preference = "together" }) {
  const tables = await loadTablesWithFreeSeats(client, restaurantId, startAt, endAt);

  // 1. One table, exactly enough free seats, everyone together.
  const singleTable = tables
    .filter((t) => t.freeSeats.length >= partySize)
    .sort((a, b) => a.capacity - b.capacity)[0];

  if (singleTable) {
    const seats = singleTable.freeSeats.slice(0, partySize);
    const fullTable = seats.length === singleTable.seats.length;
    return {
      ok: true,
      seatingMode: fullTable ? "full_table" : singleTable.shareable ? "shared" : "partial",
      tableIds: [singleTable.id],
      seatIds: seats.map((s) => s.id),
      requiresApproval: fullTable && singleTable.full_table_requires_approval,
      summary: `${singleTable.display_name}: seats ${seats.map((s) => s.code).join(", ")}`
    };
  }

  // 2. Approved combined tables, when the party must sit together and exceeds one table.
  if (preference === "together" || preference === "split_ok") {
    const combos = await loadCombinations(client, restaurantId);
    for (const combo of combos) {
      const comboTables = tables.filter((t) => combo.table_ids.includes(t.id));
      if (comboTables.length !== combo.table_ids.length) continue;
      const freeSeats = comboTables.flatMap((t) => t.freeSeats);
      if (freeSeats.length >= partySize && comboTables.every((t) => t.isFullyFree)) {
        const seats = freeSeats.slice(0, partySize);
        return {
          ok: true,
          seatingMode: "combined",
          tableIds: comboTables.map((t) => t.id),
          seatIds: seats.map((s) => s.id),
          requiresApproval: combo.requires_approval,
          summary: `${combo.name}: ${comboTables.map((t) => t.display_name).join(" + ")}`
        };
      }
    }
  }

  // 3. Multiple nearby (not necessarily adjacent) tables, when the guest accepts a split.
  if (preference === "split_ok") {
    const sorted = [...tables].sort((a, b) => b.freeSeats.length - a.freeSeats.length);
    const picked = [];
    let remaining = partySize;
    for (const table of sorted) {
      if (remaining <= 0) break;
      if (!table.freeSeats.length) continue;
      const take = Math.min(table.freeSeats.length, remaining);
      picked.push({ table, seats: table.freeSeats.slice(0, take) });
      remaining -= take;
    }
    if (remaining <= 0) {
      return {
        ok: true,
        seatingMode: "partial",
        tableIds: picked.map((p) => p.table.id),
        seatIds: picked.flatMap((p) => p.seats.map((s) => s.id)),
        requiresApproval: picked.length > 1,
        summary: picked.map((p) => `${p.table.display_name}: ${p.seats.map((s) => s.code).join(", ")}`).join(" / ")
      };
    }
  }

  // 4. Shared seating: drop seats into any shareable table with enough free capacity.
  if (preference === "shared_ok" || preference === "together") {
    const sharedCandidate = tables
      .filter((t) => t.shareable && t.freeSeats.length >= partySize)
      .sort((a, b) => a.freeSeats.length - b.freeSeats.length)[0];
    if (sharedCandidate) {
      const seats = sharedCandidate.freeSeats.slice(0, partySize);
      return {
        ok: true,
        seatingMode: "shared",
        tableIds: [sharedCandidate.id],
        seatIds: seats.map((s) => s.id),
        requiresApproval: false,
        summary: `${sharedCandidate.display_name} (shared): seats ${seats.map((s) => s.code).join(", ")}`
      };
    }
  }

  return { ok: false, reason: "No seating arrangement currently satisfies that party size and preference." };
}

export async function checkAvailability({ restaurantId, startAt, endAt, partySize, preference }) {
  const { withTransaction } = await import("@/lib/db");
  return withTransaction((client) => planAllocation({ client, restaurantId, startAt, endAt, partySize, preference }));
}

export async function sweepExpiredHolds(client, restaurantId) {
  await client.query(
    `update seat_allocations set status = 'released'
     where restaurant_id = $1 and status = 'held' and expires_at is not null and expires_at < now()`,
    [restaurantId]
  );
}

export { query };

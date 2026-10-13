import { withTransaction, query } from "@/lib/db";
import { planAllocation, sweepExpiredHolds, toWindow } from "@/lib/availability";
import { getSettings, getBookingRules, isWithinOpeningHours } from "@/lib/restaurant";
import { normalizePhone, phonesMatch, phoneDigits } from "@/lib/phone";

const EXCLUSION_VIOLATION = "23P01";

export class BookingError extends Error {
  constructor(message, code = "booking_failed") {
    super(message);
    this.code = code;
  }
}

/** pg hands back a `date` column as a Date object and a `time` column as "HH:MM:SS", while the
 * booking helpers expect "YYYY-MM-DD" and "HH:MM". Interpolating the raw values produced an
 * invalid date, which silently disabled the cancel/change deadline checks and made a
 * date-only or party-size-only modification fail outright. */
function toIsoDate(value) {
  // Local parts rather than toISOString() -- pg builds a `date` column's Date at LOCAL
  // midnight, so toISOString() shifts it to the previous day anywhere behind UTC, which
  // silently moved the deadline comparisons below onto the wrong day.
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  return String(value).slice(0, 10);
}
function toHhmm(value) {
  return String(value).slice(0, 5);
}

/**
 * The single entry point the dashboard AND the voice-agent tools both call. Never lets a
 * caller choose seat IDs directly -- it revalidates real-time availability, enforces the
 * restaurant's configured booking rules, and either (a) commits a confirmed reservation
 * with real seat allocations in one transaction, or (b) returns a pending result when the
 * rules require staff approval. Nothing here is ever reported back as confirmed unless the
 * database transaction actually committed.
 */
export async function createReservation({
  restaurantId,
  customerName,
  phone,
  altPhone,
  partySize,
  reservationDate,
  startTime,
  seatingPreference = "together",
  notes,
  source = "staff",
  createdByStaffId = null,
  preferredTableId = null,
  preferredTableIds = null,
  tableSeatCounts = null
}) {
  if (!customerName?.trim()) throw new BookingError("Customer name is required.", "validation");
  if (!phone?.trim()) throw new BookingError("A contact phone number is required.", "validation");
  // Stored in one canonical digits-only form so the same caller is never written twice.
  phone = normalizePhone(phone);
  altPhone = normalizePhone(altPhone);
  if (!partySize || partySize < 1) throw new BookingError("Party size must be at least 1.", "validation");

  const settings = await getSettings(restaurantId);
  const rules = await getBookingRules(restaurantId);
  if (!settings || !rules) throw new BookingError("Restaurant is not configured yet.", "not_configured");

  const hoursCheck = isWithinOpeningHours(settings, reservationDate, startTime, rules.reservation_duration_minutes);
  if (!hoursCheck.ok) throw new BookingError(hoursCheck.reason, "closed");

  const { startAt, endAt } = toWindow(reservationDate, startTime, rules.reservation_duration_minutes);

  const exceedsAutoLimits = partySize > rules.max_party_size_auto || partySize >= rules.large_group_threshold;

  return withTransaction(async (client) => {
    await sweepExpiredHolds(client, restaurantId);
    const plan = await planAllocation({ client, restaurantId, startAt, endAt, partySize, preference: seatingPreference, preferredTableId, preferredTableIds, tableSeatCounts });

    if (!plan.ok) {
      // No seats fit right now -- offer a pending group/staff-reviewed request instead of
      // failing silently, so the guest's request is never lost.
      const pending = await client.query(
        `insert into group_booking_requests
           (restaurant_id, customer_name, phone, party_size, requested_date, requested_time, seating_preference, notes, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'needs_info') returning *`,
        [restaurantId, customerName, phone, partySize, reservationDate, startTime, seatingPreference, notes || plan.reason]
      );
      return { status: "pending", reason: plan.reason, groupRequest: pending.rows[0] };
    }

    // Below the large-group threshold, a multi-table/shared split is allowed to auto-confirm
    // on its own -- the per-table/per-combination approval cap (max_tables_per_auto_booking)
    // only kicks in once the party is already large enough to need review anyway.
    const tooManyTables = partySize >= rules.large_group_threshold && plan.tableIds.length > rules.max_tables_per_auto_booking;
    const requiresApproval = plan.requiresApproval || exceedsAutoLimits || tooManyTables;

    if (requiresApproval) {
      const pending = await client.query(
        `insert into group_booking_requests
           (restaurant_id, customer_name, phone, party_size, requested_date, requested_time, seating_preference, notes, status, proposed_table_ids)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9) returning *`,
        [restaurantId, customerName, phone, partySize, reservationDate, startTime, seatingPreference, notes, plan.tableIds]
      );
      return { status: "pending", reason: "This request needs staff review before it can be confirmed.", plan, groupRequest: pending.rows[0] };
    }

    try {
      const reservationResult = await client.query(
        `insert into reservations
           (restaurant_id, customer_name, phone, alt_phone, party_size, reservation_date, start_time, duration_minutes,
            seating_preference, seating_mode, status, source, notes, created_by_staff_id, confirmed_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'confirmed',$11,$12,$13, now())
         returning *`,
        [
          restaurantId, customerName, phone, altPhone || null, partySize, reservationDate, startTime,
          rules.reservation_duration_minutes, seatingPreference, plan.seatingMode, source, notes || null, createdByStaffId
        ]
      );
      const reservation = reservationResult.rows[0];

      for (const seatId of plan.seatIds) {
        // table_id is read from the seat itself rather than positionally from plan.tableIds:
        // seats and tables are different-length lists, so indexing one by the other's offset
        // filed seats against tables they do not belong to on every split booking.
        await client.query(
          `insert into seat_allocations (restaurant_id, seat_id, table_id, reservation_id, status, start_at, end_at)
           select $1, s.id, s.table_id, $3, 'active', $4, $5 from table_seats s where s.id = $2`,
          [restaurantId, seatId, reservation.id, startAt, endAt]
        );
      }

      return { status: "confirmed", reservation, plan };
    } catch (error) {
      if (error.code === EXCLUSION_VIOLATION) {
        throw new BookingError("Those seats were just taken by another booking. Please try a different time.", "conflict");
      }
      throw error;
    }
  });
}

export async function cancelReservation({ restaurantId, reservationId, reason, cancelledBy = "staff" }) {
  const rules = await getBookingRules(restaurantId);
  return withTransaction(async (client) => {
    const existingResult = await client.query(
      "select * from reservations where id = $1 and restaurant_id = $2 for update",
      [reservationId, restaurantId]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new BookingError("Reservation not found.", "not_found");
    if (existing.status === "cancelled") return existing;
    if (existing.status === "completed") throw new BookingError("A completed reservation cannot be cancelled.", "invalid_state");

    if (cancelledBy === "voice_agent") {
      const hoursUntil = (new Date(`${toIsoDate(existing.reservation_date)}T${toHhmm(existing.start_time)}:00Z`) - new Date()) / 3600000;
      if (hoursUntil < (rules?.cancellation_deadline_hours ?? 2)) {
        throw new BookingError(
          `This reservation is inside the ${rules?.cancellation_deadline_hours ?? 2}-hour cancellation window -- please have staff confirm the cancellation.`,
          "needs_staff"
        );
      }
    }

    await client.query(
      "update seat_allocations set status = 'released' where reservation_id = $1 and status = 'active'",
      [reservationId]
    );
    const updated = await client.query(
      `update reservations set status = 'cancelled', cancelled_at = now(), cancel_reason = $2, updated_at = now()
       where id = $1 returning *`,
      [reservationId, reason || null]
    );
    return updated.rows[0];
  });
}

export async function modifyReservation({ restaurantId, reservationId, changes, modifiedBy = "staff" }) {
  const rules = await getBookingRules(restaurantId);
  const settings = await getSettings(restaurantId);

  return withTransaction(async (client) => {
    const existingResult = await client.query(
      "select * from reservations where id = $1 and restaurant_id = $2 for update",
      [reservationId, restaurantId]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new BookingError("Reservation not found.", "not_found");
    if (!["pending", "confirmed"].includes(existing.status)) {
      throw new BookingError("Only pending or confirmed reservations can be modified.", "invalid_state");
    }

    if (modifiedBy === "voice_agent") {
      const hoursUntil = (new Date(`${toIsoDate(existing.reservation_date)}T${toHhmm(existing.start_time)}:00Z`) - new Date()) / 3600000;
      if (hoursUntil < (rules?.modification_deadline_hours ?? 2)) {
        throw new BookingError(
          `This reservation is inside the ${rules?.modification_deadline_hours ?? 2}-hour change window -- please have staff make this change.`,
          "needs_staff"
        );
      }
    }

    const nextDate = changes.reservationDate || toIsoDate(existing.reservation_date);
    const nextTime = toHhmm(changes.startTime || existing.start_time);
    const nextParty = changes.partySize || existing.party_size;
    const duration = existing.duration_minutes;

    // The same threshold createReservation enforces: growing a booking past the auto-confirm
    // limit is a large-group request and needs staff, otherwise the rule could be sidestepped
    // by booking small and then modifying upwards.
    if (nextParty > existing.party_size && (nextParty > rules.max_party_size_auto || nextParty >= rules.large_group_threshold)) {
      throw new BookingError(
        `A party of ${nextParty} needs staff review -- the original booking is unchanged.`,
        "needs_staff"
      );
    }

    const hoursCheck = isWithinOpeningHours(settings, nextDate, nextTime, duration);
    if (!hoursCheck.ok) throw new BookingError(hoursCheck.reason, "closed");

    const { startAt, endAt } = toWindow(nextDate, nextTime, duration);

    await sweepExpiredHolds(client, restaurantId);
    const plan = await planAllocation({
      client, restaurantId, startAt, endAt, partySize: nextParty, preference: existing.seating_preference || "together"
    });
    if (!plan.ok) {
      // Preserve the original confirmed booking rather than leaving it partially updated.
      throw new BookingError("The new time/party size is not available -- the original booking is unchanged.", "unavailable");
    }

    try {
      await client.query("update seat_allocations set status = 'released' where reservation_id = $1 and status = 'active'", [reservationId]);
      for (let i = 0; i < plan.seatIds.length; i++) {
        await client.query(
          `insert into seat_allocations (restaurant_id, seat_id, table_id, reservation_id, status, start_at, end_at)
           values ($1,$2,$3,$4,'active',$5,$6)`,
          [restaurantId, plan.seatIds[i], plan.tableIds[plan.tableIds.length === 1 ? 0 : i] ?? plan.tableIds[0], reservationId, startAt, endAt]
        );
      }
      const updated = await client.query(
        `update reservations set reservation_date = $2, start_time = $3, party_size = $4, seating_mode = $5, updated_at = now()
         where id = $1 returning *`,
        [reservationId, nextDate, nextTime, nextParty, plan.seatingMode]
      );
      return { reservation: updated.rows[0], plan };
    } catch (error) {
      if (error.code === EXCLUSION_VIOLATION) {
        throw new BookingError("Those seats were just taken by another booking -- the original booking is unchanged.", "conflict");
      }
      throw error;
    }
  });
}

export async function getReservationStatus({ restaurantId, bookingRef, phone }) {
  const result = await query(
    "select * from reservations where restaurant_id = $1 and booking_ref = $2",
    [restaurantId, bookingRef]
  );
  const reservation = result.rows[0];
  if (!reservation) return null;
  // Verification gate: a caller must know the phone on file. Never disclose another
  // guest's booking just because they guessed a reference number.
  // The phone is REQUIRED, not optional: guarding on `phone && ...` meant a caller who simply
  // omitted it skipped the check entirely and was handed the whole booking. phonesMatch
  // returns false for a missing or empty number, so no phone now fails verification.
  if (!phonesMatch(reservation.phone, phone)) {
    return { verificationFailed: true };
  }
  return reservation;
}

/**
 * Find a caller's own live bookings from their phone number alone -- the "what's my booking?"
 * lookup, where the guest has no reference number to hand. This is not a weakening of the
 * verification gate in getReservationStatus: there the phone proves the caller owns a
 * reference someone could have guessed, whereas here the phone IS the only key, so it can
 * only ever return the bookings already filed against that number.
 *
 * Only upcoming, still-live bookings -- a cancelled or long-past booking is not what someone
 * asking "is my table still booked?" means, and listing it invites the agent to read it back
 * as if it were active.
 */
export async function findReservationsByPhone({ restaurantId, phone, limit = 5 }) {
  const digits = phoneDigits(phone);
  if (digits.length < 6) return [];
  const result = await query(
    `select * from reservations
      where restaurant_id = $1
        and status in ('confirmed','seated')
        and reservation_date >= (now() at time zone 'utc')::date
        and right(regexp_replace(phone, '\\D', '', 'g'), 10) = right($2, 10)
      order by reservation_date, start_time
      limit $3`,
    [restaurantId, digits, limit]
  );
  return result.rows;
}

export async function listReservations({ restaurantId, date, dateFrom, dateTo, status, limit = 200 }) {
  const conditions = ["restaurant_id = $1"];
  const values = [restaurantId];
  if (dateFrom || dateTo) {
    if (dateFrom) {
      values.push(dateFrom);
      conditions.push(`reservation_date >= $${values.length}`);
    }
    if (dateTo) {
      values.push(dateTo);
      conditions.push(`reservation_date <= $${values.length}`);
    }
  } else if (date) {
    values.push(date);
    conditions.push(`reservation_date = $${values.length}`);
  }
  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  values.push(limit);
  const result = await query(
    `select r.*, coalesce(
        (select json_agg(json_build_object(
            'seat_id', sa.seat_id, 'table_id', sa.table_id, 'code', ts.code,
            'table_code', rt.code, 'table_name', rt.display_name, 'table_capacity', rt.capacity
          ))
         from seat_allocations sa
         join table_seats ts on ts.id = sa.seat_id
         join restaurant_tables rt on rt.id = sa.table_id
         where sa.reservation_id = r.id and sa.status = 'active'),
        '[]'
      ) as seats
     from reservations r
     where ${conditions.join(" and ")}
     order by r.reservation_date, r.start_time
     limit $${values.length}`,
    values
  );
  return result.rows;
}

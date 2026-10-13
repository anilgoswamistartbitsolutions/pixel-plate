import { query, withTransaction } from "@/lib/db";
import { createReservation, BookingError } from "@/lib/reservations";
import { getBookingRules } from "@/lib/restaurant";
import { normalizePhone } from "@/lib/phone";

// "Leads" is the dashboard-facing name for this table -- it now handles every kind of
// request that needs staff review before becoming a real booking: oversized parties the
// engine couldn't auto-seat, explicit full-floor requests, and general inquiries, each with
// a priority and a status a staff member can work through like any other queue.

export async function listGroupRequests({ restaurantId, status, priority, leadType }) {
  const conditions = ["restaurant_id = $1"];
  const values = [restaurantId];
  if (status) { values.push(status); conditions.push(`status = $${values.length}`); }
  if (priority) { values.push(priority); conditions.push(`priority = $${values.length}`); }
  if (leadType) { values.push(leadType); conditions.push(`lead_type = $${values.length}`); }
  const result = await query(
    `select * from group_booking_requests where ${conditions.join(" and ")}
     order by case priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end, created_at desc`,
    values
  );
  return result.rows;
}

export async function createGroupRequest({
  restaurantId, customerName, phone, partySize, requestedDate, requestedTime,
  seatingPreference, notes, priority = "normal", leadType = "group_booking", floorId = null
}) {
  if (leadType === "full_floor") {
    const rules = await getBookingRules(restaurantId);
    const minDays = rules?.full_floor_min_advance_days ?? 7;
    const daysOut = (new Date(`${requestedDate}T00:00:00Z`) - new Date()) / 86400000;
    if (daysOut < minDays) {
      throw new BookingError(`A full-floor booking needs at least ${minDays} days' notice -- please choose a later date or ask staff to review an exception.`, "validation");
    }
  }
  const result = await query(
    `insert into group_booking_requests
       (restaurant_id, customer_name, phone, party_size, requested_date, requested_time, seating_preference, notes, priority, lead_type, floor_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
    [restaurantId, customerName, normalizePhone(phone), partySize || 1, requestedDate, requestedTime, seatingPreference || null, notes || null, priority, leadType, floorId]
  );
  return result.rows[0];
}

export async function updateLeadMeta(restaurantId, id, { priority, status, staffNotes }) {
  const sets = [];
  const values = [id, restaurantId];
  if (priority) { values.push(priority); sets.push(`priority = $${values.length}`); }
  if (status) { values.push(status); sets.push(`status = $${values.length}`); }
  if (staffNotes !== undefined) { values.push(staffNotes); sets.push(`staff_notes = $${values.length}`); }
  if (!sets.length) return null;
  sets.push("updated_at = now()");
  const result = await query(
    `update group_booking_requests set ${sets.join(", ")} where id = $1 and restaurant_id = $2 returning *`,
    values
  );
  return result.rows[0];
}

/** A full floor request is never auto-committed by this path -- it always needs explicit
 * staff review of real floor-wide availability, so confirming one here only marks it
 * reviewed/approved; staff then create the actual reservation(s)/blocks by hand. */
export async function confirmGroupRequest({ restaurantId, requestId, staffId, staffNotes }) {
  return withTransaction(async (client) => {
    const requestResult = await client.query(
      "select * from group_booking_requests where id = $1 and restaurant_id = $2 for update",
      [requestId, restaurantId]
    );
    const request = requestResult.rows[0];
    if (!request) throw new BookingError("Lead not found.", "not_found");
    if (request.status === "confirmed") return request;

    if (request.lead_type === "full_floor") {
      const updated = await client.query(
        `update group_booking_requests set status = 'confirmed', resolved_by_staff_id = $2, staff_notes = $3, updated_at = now()
         where id = $1 returning *`,
        [requestId, staffId, staffNotes || "Full-floor request approved by staff."]
      );
      return updated.rows[0];
    }

    const outcome = await createReservation({
      restaurantId,
      customerName: request.customer_name,
      phone: request.phone,
      partySize: request.party_size,
      reservationDate: request.requested_date,
      startTime: request.requested_time,
      seatingPreference: request.seating_preference || "together",
      notes: request.notes,
      source: "staff",
      createdByStaffId: staffId
    });

    if (outcome.status !== "confirmed") {
      await client.query(
        "update group_booking_requests set status = 'needs_info', staff_notes = $2, updated_at = now() where id = $1",
        [requestId, staffNotes || "Still no seats available for this slot -- try another time."]
      );
      return { ...request, status: "needs_info" };
    }

    const updated = await client.query(
      `update group_booking_requests
       set status = 'confirmed', resulting_reservation_id = $2, resolved_by_staff_id = $3, staff_notes = $4, updated_at = now()
       where id = $1 returning *`,
      [requestId, outcome.reservation.id, staffId, staffNotes || null]
    );
    return updated.rows[0];
  });
}

export async function rejectGroupRequest({ restaurantId, requestId, staffId, staffNotes }) {
  const result = await query(
    `update group_booking_requests
     set status = 'rejected', resolved_by_staff_id = $3, staff_notes = $4, updated_at = now()
     where id = $1 and restaurant_id = $2 returning *`,
    [requestId, restaurantId, staffId, staffNotes || null]
  );
  return result.rows[0];
}

import { query, withTransaction } from "@/lib/db";
import { createReservation, BookingError } from "@/lib/reservations";

export async function listGroupRequests({ restaurantId, status }) {
  const conditions = ["restaurant_id = $1"];
  const values = [restaurantId];
  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  const result = await query(
    `select * from group_booking_requests where ${conditions.join(" and ")} order by created_at desc`,
    values
  );
  return result.rows;
}

export async function createGroupRequest({ restaurantId, customerName, phone, partySize, requestedDate, requestedTime, seatingPreference, notes }) {
  const result = await query(
    `insert into group_booking_requests
       (restaurant_id, customer_name, phone, party_size, requested_date, requested_time, seating_preference, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [restaurantId, customerName, phone, partySize, requestedDate, requestedTime, seatingPreference || null, notes || null]
  );
  return result.rows[0];
}

/** Staff confirms a pending group request -- this is the only path that turns it into a real, seat-allocated reservation. */
export async function confirmGroupRequest({ restaurantId, requestId, staffId, staffNotes }) {
  return withTransaction(async (client) => {
    const requestResult = await client.query(
      "select * from group_booking_requests where id = $1 and restaurant_id = $2 for update",
      [requestId, restaurantId]
    );
    const request = requestResult.rows[0];
    if (!request) throw new BookingError("Group request not found.", "not_found");
    if (request.status === "confirmed") return request;

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

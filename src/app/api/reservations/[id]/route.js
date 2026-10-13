import { requireStaffAuth } from "@/lib/auth";
import { fail, ok, readJson } from "@/lib/http";
import { cancelReservation, modifyReservation, BookingError } from "@/lib/reservations";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const body = await readJson(request);

  try {
    if (body.action === "cancel") {
      const reservation = await cancelReservation({ restaurantId: auth.restaurantId, reservationId: id, reason: body.reason, cancelledBy: "staff" });
      return ok(reservation);
    }
    if (body.action === "modify") {
      const result = await modifyReservation({
        restaurantId: auth.restaurantId, reservationId: id,
        changes: { reservationDate: body.reservationDate, startTime: body.startTime, partySize: body.partySize },
        modifiedBy: "staff"
      });
      return ok(result);
    }
    if (body.action === "status") {
      const result = await query(
        "update reservations set status = $3, updated_at = now() where id = $1 and restaurant_id = $2 returning *",
        [id, auth.restaurantId, body.status]
      );
      return ok(result.rows[0]);
    }
    return fail("Unrecognized action", 400);
  } catch (error) {
    if (error instanceof BookingError) return fail(error.message, error.code === "conflict" ? 409 : 400);
    return fail("Unable to update reservation", 500, error.message);
  }
}

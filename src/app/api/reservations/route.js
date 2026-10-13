import { requireStaffAuth } from "@/lib/auth";
import { fail, created, ok, readJson, getSearchParam } from "@/lib/http";
import { createReservation, listReservations, BookingError } from "@/lib/reservations";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const date = getSearchParam(request, "date");
  const dateFrom = getSearchParam(request, "from");
  const dateTo = getSearchParam(request, "to");
  const status = getSearchParam(request, "status");
  const list = await listReservations({ restaurantId: auth.restaurantId, date, dateFrom, dateTo, status });
  return ok(list);
}

export async function POST(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  try {
    const result = await createReservation({
      restaurantId: auth.restaurantId,
      customerName: body.customerName,
      phone: body.phone,
      altPhone: body.altPhone,
      partySize: Number(body.partySize),
      reservationDate: body.reservationDate,
      startTime: body.startTime,
      seatingPreference: body.seatingPreference || "together",
      notes: body.notes,
      source: "staff",
      createdByStaffId: auth.sub,
      preferredTableId: body.preferredTableId || null
    });
    return created(result);
  } catch (error) {
    if (error instanceof BookingError) return fail(error.message, error.code === "conflict" ? 409 : 400);
    return fail("Unable to create reservation", 500, error.message);
  }
}

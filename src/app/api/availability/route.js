import { requireStaffAuth } from "@/lib/auth";
import { fail, ok, getSearchParam } from "@/lib/http";
import { listTableOptions, toWindow } from "@/lib/availability";
import { getBookingRules } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

// Staff-facing "which tables are free for this date/time/party size" check, used by the New
// Reservation form so staff pick from real options instead of guessing a time blind.
export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;

  const date = getSearchParam(request, "date");
  const time = getSearchParam(request, "time");
  const partySize = Number(getSearchParam(request, "partySize"));
  if (!date || !time || !partySize) return fail("date, time and partySize are required", 400);

  try {
    const rules = await getBookingRules(auth.restaurantId);
    const { startAt, endAt } = toWindow(date, time, rules?.reservation_duration_minutes || 90);
    const options = await listTableOptions({ restaurantId: auth.restaurantId, startAt, endAt, partySize });
    return ok({ options, count: options.length });
  } catch (error) {
    return fail("Unable to check availability", 500, error.message);
  }
}

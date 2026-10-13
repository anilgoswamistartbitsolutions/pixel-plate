import { requireStaffAuth } from "@/lib/auth";
import { fail, ok, getSearchParam } from "@/lib/http";
import { getScheduleForRange, getMenuForDate, clearScheduleForDate } from "@/lib/menu-config";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const date = getSearchParam(request, "date");
  const from = getSearchParam(request, "from");
  const to = getSearchParam(request, "to");

  if (date) {
    return ok(await getMenuForDate(auth.restaurantId, date));
  }
  if (!from || !to) return fail("Pass either date, or from and to", 400);
  return ok(await getScheduleForRange(auth.restaurantId, from, to));
}

export async function DELETE(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const date = getSearchParam(request, "date");
  if (!date) return fail("date is required", 400);
  await clearScheduleForDate(auth.restaurantId, date);
  return ok({ cleared: true });
}

import { requireStaffAuth } from "@/lib/auth";
import { fail, ok, readJson } from "@/lib/http";
import { getDailySlots, setDailySlot } from "@/lib/floors";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  return ok(await getDailySlots(auth.restaurantId));
}

export async function PUT(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJson(request);
    if (!body.slot || !body.startTime || !body.endTime) return fail("slot, startTime and endTime are required", 400);
    return ok(await setDailySlot(auth.restaurantId, body.slot, body));
  } catch (error) {
    return fail("Unable to update slot", 500, error.message);
  }
}

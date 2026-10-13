import { requireStaffAuth } from "@/lib/auth";
import { fail, ok, readJson } from "@/lib/http";
import { getBookingRules, updateBookingRules } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  return ok(await getBookingRules(auth.restaurantId));
}

export async function PUT(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJson(request);
    return ok(await updateBookingRules(auth.restaurantId, body));
  } catch (error) {
    return fail("Unable to save booking rules", 500, error.message);
  }
}

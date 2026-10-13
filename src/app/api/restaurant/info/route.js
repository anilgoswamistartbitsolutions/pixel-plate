import { requireStaffAuth } from "@/lib/auth";
import { fail, ok, readJson } from "@/lib/http";
import { getRestaurant, getSettings, updateSettings } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const restaurant = await getRestaurant(auth.restaurantId);
  const settings = await getSettings(auth.restaurantId);
  return ok({ restaurant, settings });
}

export async function PUT(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJson(request);
    const settings = await updateSettings(auth.restaurantId, body);
    return ok(settings);
  } catch (error) {
    return fail("Unable to save restaurant information", 500, error.message);
  }
}

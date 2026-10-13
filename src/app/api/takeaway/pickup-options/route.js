import { requireStaffAuth } from "@/lib/auth";
import { ok } from "@/lib/http";
import { getSearchParam } from "@/lib/http";
import { listPickupOptions } from "@/lib/takeaway";

export const dynamic = "force-dynamic";

/** Fixed pickup time slots still bookable today, optionally narrowed to one shift. The logic
 * lives in lib/takeaway so the voice agent's get_takeaway_pickup_times tool returns exactly
 * the same times this form offers. */
export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const slot = getSearchParam(request, "slot");
  return ok(await listPickupOptions(auth.restaurantId, { slot: slot || undefined }));
}

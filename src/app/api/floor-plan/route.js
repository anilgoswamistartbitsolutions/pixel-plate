import { requireStaffAuth } from "@/lib/auth";
import { ok } from "@/lib/http";
import { listFloorPlan } from "@/lib/tables";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  return ok(await listFloorPlan(auth.restaurantId));
}

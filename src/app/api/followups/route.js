import { requireStaffAuth } from "@/lib/auth";
import { created, fail, ok, readJson, getSearchParam } from "@/lib/http";
import { listFollowups, createFollowup } from "@/lib/calls";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const status = getSearchParam(request, "status");
  return ok(await listFollowups({ restaurantId: auth.restaurantId, status }));
}

export async function POST(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJson(request);
    return created(await createFollowup({ restaurantId: auth.restaurantId, ...body }));
  } catch (error) {
    return fail("Unable to create follow-up", 500, error.message);
  }
}

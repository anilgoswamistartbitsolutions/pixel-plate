import { requireStaffAuth } from "@/lib/auth";
import { created, fail, ok, readJson } from "@/lib/http";
import { listExtraInfo, upsertExtraInfo } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  return ok(await listExtraInfo(auth.restaurantId));
}

export async function POST(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJson(request);
    if (!body.topic?.trim() || !body.detail?.trim()) return fail("Topic and detail are both required", 400);
    return created(await upsertExtraInfo(auth.restaurantId, body));
  } catch (error) {
    return fail("Unable to save extra info", 500, error.message);
  }
}

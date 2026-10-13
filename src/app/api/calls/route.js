import { requireStaffAuth } from "@/lib/auth";
import { created, fail, ok, readJson, getSearchParam } from "@/lib/http";
import { listCalls, createCall } from "@/lib/calls";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const status = getSearchParam(request, "status");
  return ok(await listCalls({ restaurantId: auth.restaurantId, status }));
}

export async function POST(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJson(request);
    return created(await createCall({ restaurantId: auth.restaurantId, callerNumber: body.callerNumber, channel: body.channel || "browser_test" }));
  } catch (error) {
    return fail("Unable to create call record", 500, error.message);
  }
}

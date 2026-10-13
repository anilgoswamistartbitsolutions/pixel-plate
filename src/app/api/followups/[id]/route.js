import { requireStaffAuth } from "@/lib/auth";
import { fail, ok, readJson } from "@/lib/http";
import { updateFollowup } from "@/lib/calls";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  try {
    const body = await readJson(request);
    const updated = await updateFollowup(auth.restaurantId, id, body);
    if (!updated) return fail("Follow-up not found", 404);
    return ok(updated);
  } catch (error) {
    return fail("Unable to update follow-up", 500, error.message);
  }
}

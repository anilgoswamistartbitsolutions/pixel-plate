import { requireStaffAuth } from "@/lib/auth";
import { fail, ok, readJson } from "@/lib/http";
import { upsertExtraInfo, deleteExtraInfo } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  try {
    const body = await readJson(request);
    return ok(await upsertExtraInfo(auth.restaurantId, { ...body, id }));
  } catch (error) {
    return fail("Unable to update extra info", 500, error.message);
  }
}

export async function DELETE(request, { params }) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  try {
    await deleteExtraInfo(auth.restaurantId, id);
    return ok({ deleted: true });
  } catch (error) {
    return fail("Unable to delete extra info", 500, error.message);
  }
}

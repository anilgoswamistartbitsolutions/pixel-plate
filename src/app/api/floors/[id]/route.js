import { requireStaffAuth, requireSuperAdmin } from "@/lib/auth";
import { fail, ok, readJson } from "@/lib/http";
import { updateFloor, deleteFloor } from "@/lib/floors";

export const dynamic = "force-dynamic";

export async function DELETE(request, { params }) {
  const auth = requireSuperAdmin(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  try {
    const result = await deleteFloor(auth.restaurantId, id);
    return ok(result);
  } catch (error) {
    if (error.code === "has_tables") return fail(error.message, 409);
    return fail("Unable to delete floor", 500, error.message);
  }
}

export async function PATCH(request, { params }) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  try {
    const body = await readJson(request);
    const updated = await updateFloor(auth.restaurantId, id, body);
    if (!updated) return fail("Floor not found", 404);
    return ok(updated);
  } catch (error) {
    return fail("Unable to update floor", 500, error.message);
  }
}

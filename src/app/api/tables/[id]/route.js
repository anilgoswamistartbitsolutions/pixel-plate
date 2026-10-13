import { requireStaffAuth } from "@/lib/auth";
import { fail, ok, readJson } from "@/lib/http";
import { updateTable, deactivateTable, reactivateTable, moveTable } from "@/lib/tables";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const body = await readJson(request);

  try {
    if (body.action === "deactivate") return ok(await deactivateTable(auth.restaurantId, id));
    if (body.action === "reactivate") return ok(await reactivateTable(auth.restaurantId, id));
    if (body.action === "move") return ok(await moveTable(auth.restaurantId, id, body.posX, body.posY));
    const updated = await updateTable(auth.restaurantId, id, body);
    if (!updated) return fail("No recognized fields to update", 400);
    return ok(updated);
  } catch (error) {
    return fail("Unable to update table", 500, error.message);
  }
}

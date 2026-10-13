import { requireStaffAuth } from "@/lib/auth";
import { fail, ok, readJson } from "@/lib/http";
import { upsertMenuItem, setSoldOut, deleteMenuItem } from "@/lib/menu";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const body = await readJson(request);
  try {
    if ("soldOut" in body && Object.keys(body).length === 1) {
      return ok(await setSoldOut(auth.restaurantId, id, body.soldOut));
    }
    return ok(await upsertMenuItem(auth.restaurantId, { ...body, id }));
  } catch (error) {
    return fail("Unable to update menu item", 500, error.message);
  }
}

export async function DELETE(request, { params }) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  try {
    return ok(await deleteMenuItem(auth.restaurantId, id));
  } catch (error) {
    return fail("Unable to delete menu item", 400, error.message);
  }
}

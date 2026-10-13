import { requireStaffAuth } from "@/lib/auth";
import { fail, ok, readJson } from "@/lib/http";
import { updateConfigurationItems, assignConfigurationToDates } from "@/lib/menu-config";

export const dynamic = "force-dynamic";

// body.action = "set_items" (itemIds) or "assign_dates" (dates: [iso...])
export async function PATCH(request, { params }) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  try {
    const body = await readJson(request);
    if (body.action === "set_items") {
      return ok(await updateConfigurationItems(auth.restaurantId, id, body.itemIds || []));
    }
    if (body.action === "assign_dates") {
      if (!body.dates?.length) return fail("At least one date is required", 400);
      return ok(await assignConfigurationToDates(auth.restaurantId, id, body.dates));
    }
    return fail("Unrecognized action", 400);
  } catch (error) {
    return fail("Unable to update configuration", 500, error.message);
  }
}

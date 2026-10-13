import { requireStaffAuth } from "@/lib/auth";
import { fail, ok, readJson } from "@/lib/http";
import { updateTakeawayStatus, modifyTakeawayOrder, TakeawayError } from "@/lib/takeaway";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  try {
    const body = await readJson(request);
    if (body.action === "modify_items") {
      return ok(await modifyTakeawayOrder(auth.restaurantId, id, body.lines));
    }
    const updated = await updateTakeawayStatus(auth.restaurantId, id, body);
    if (!updated) return fail("Takeaway order not found", 404);
    return ok(updated);
  } catch (error) {
    if (error instanceof TakeawayError) return fail(error.message, 400);
    return fail("Unable to update takeaway order", 500, error.message);
  }
}

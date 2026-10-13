import { requireStaffAuth } from "@/lib/auth";
import { fail, ok, readJson } from "@/lib/http";
import { confirmGroupRequest, rejectGroupRequest, updateLeadMeta } from "@/lib/group-requests";
import { BookingError } from "@/lib/reservations";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const body = await readJson(request);

  try {
    if (body.action === "confirm") {
      const result = await confirmGroupRequest({ restaurantId: auth.restaurantId, requestId: id, staffId: auth.sub, staffNotes: body.staffNotes });
      return ok(result);
    }
    if (body.action === "reject") {
      const result = await rejectGroupRequest({ restaurantId: auth.restaurantId, requestId: id, staffId: auth.sub, staffNotes: body.staffNotes });
      return ok(result);
    }
    if (body.action === "update_meta") {
      const result = await updateLeadMeta(auth.restaurantId, id, body);
      if (!result) return fail("No recognized fields to update", 400);
      return ok(result);
    }
    return fail("Unrecognized action", 400);
  } catch (error) {
    if (error instanceof BookingError) return fail(error.message, 400);
    return fail("Unable to update group request", 500, error.message);
  }
}

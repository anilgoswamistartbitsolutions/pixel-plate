import { requireStaffAuth } from "@/lib/auth";
import { fail, created, ok, readJson, getSearchParam } from "@/lib/http";
import { listGroupRequests, createGroupRequest } from "@/lib/group-requests";
import { BookingError } from "@/lib/reservations";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const status = getSearchParam(request, "status");
  const priority = getSearchParam(request, "priority");
  const leadType = getSearchParam(request, "leadType");
  return ok(await listGroupRequests({ restaurantId: auth.restaurantId, status, priority, leadType }));
}

export async function POST(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJson(request);
    if (!body.customerName?.trim() || !body.phone?.trim()) return fail("Customer name and phone are required", 400);
    const request_ = await createGroupRequest({
      restaurantId: auth.restaurantId, customerName: body.customerName, phone: body.phone,
      partySize: Number(body.partySize) || 1, requestedDate: body.requestedDate, requestedTime: body.requestedTime,
      seatingPreference: body.seatingPreference, notes: body.notes,
      priority: body.priority, leadType: body.leadType, floorId: body.floorId || null
    });
    return created(request_);
  } catch (error) {
    if (error instanceof BookingError) return fail(error.message, 400);
    return fail("Unable to create lead", 500, error.message);
  }
}

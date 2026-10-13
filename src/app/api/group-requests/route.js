import { requireStaffAuth } from "@/lib/auth";
import { fail, created, ok, readJson, getSearchParam } from "@/lib/http";
import { listGroupRequests, createGroupRequest } from "@/lib/group-requests";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const status = getSearchParam(request, "status");
  return ok(await listGroupRequests({ restaurantId: auth.restaurantId, status }));
}

export async function POST(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJson(request);
    const request_ = await createGroupRequest({
      restaurantId: auth.restaurantId, customerName: body.customerName, phone: body.phone,
      partySize: Number(body.partySize), requestedDate: body.requestedDate, requestedTime: body.requestedTime,
      seatingPreference: body.seatingPreference, notes: body.notes
    });
    return created(request_);
  } catch (error) {
    return fail("Unable to create group request", 500, error.message);
  }
}

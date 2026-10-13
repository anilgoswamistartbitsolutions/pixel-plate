import { requireStaffAuth } from "@/lib/auth";
import { created, fail, ok, readJson, getSearchParam } from "@/lib/http";
import { listTakeawayOrders, createTakeawayOrder, quoteTakeaway, TakeawayError } from "@/lib/takeaway";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const status = getSearchParam(request, "status");
  return ok(await listTakeawayOrders({ restaurantId: auth.restaurantId, status }));
}

// body.quoteOnly = true just prices the order without creating it (used by the "how much
// will this be" step before the guest confirms).
export async function POST(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJson(request);
    if (body.quoteOnly) {
      return ok(await quoteTakeaway(auth.restaurantId, body.lines));
    }
    const result = await createTakeawayOrder({
      restaurantId: auth.restaurantId,
      customerName: body.customerName,
      phone: body.phone,
      lines: body.lines,
      requestedSlot: body.requestedSlot,
      requestedTime: body.requestedTime,
      notes: body.notes,
      source: "staff",
      createdByStaffId: auth.sub
    });
    return created(result);
  } catch (error) {
    if (error instanceof TakeawayError) return fail(error.message, 400);
    return fail("Unable to create takeaway order", 500, error.message);
  }
}

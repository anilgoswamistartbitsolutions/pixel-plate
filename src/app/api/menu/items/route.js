import { requireStaffAuth } from "@/lib/auth";
import { created, fail, ok, readJson } from "@/lib/http";
import { listMenu, upsertMenuItem } from "@/lib/menu";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  return ok(await listMenu({ restaurantId: auth.restaurantId, onlyAvailable: false }));
}

export async function POST(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJson(request);
    if (!body.name) return fail("Item name is required", 400);
    return created(await upsertMenuItem(auth.restaurantId, body));
  } catch (error) {
    return fail("Unable to save menu item", 500, error.message);
  }
}

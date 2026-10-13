import { requireStaffAuth } from "@/lib/auth";
import { created, fail, ok, readJson } from "@/lib/http";
import { listCategories, upsertCategory } from "@/lib/menu";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  return ok(await listCategories(auth.restaurantId));
}

export async function POST(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJson(request);
    return created(await upsertCategory(auth.restaurantId, body));
  } catch (error) {
    return fail("Unable to save category", 500, error.message);
  }
}

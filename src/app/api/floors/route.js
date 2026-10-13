import { requireStaffAuth } from "@/lib/auth";
import { created, fail, ok, readJson } from "@/lib/http";
import { listFloors, createFloor } from "@/lib/floors";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  return ok(await listFloors(auth.restaurantId));
}

export async function POST(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJson(request);
    if (!body.name?.trim()) return fail("Floor name is required", 400);
    return created(await createFloor(auth.restaurantId, body));
  } catch (error) {
    if (error.code === "23505") return fail("A floor with that name already exists", 409);
    return fail("Unable to create floor", 500, error.message);
  }
}

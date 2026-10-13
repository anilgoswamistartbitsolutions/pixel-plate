import { requireStaffAuth } from "@/lib/auth";
import { created, fail, ok, readJson } from "@/lib/http";
import { listConfigurations, createConfiguration } from "@/lib/menu-config";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  return ok(await listConfigurations(auth.restaurantId));
}

export async function POST(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJson(request);
    if (!body.name?.trim()) return fail("Configuration name is required", 400);
    return created(await createConfiguration(auth.restaurantId, body));
  } catch (error) {
    if (error.code === "23505") return fail("A configuration with that name already exists", 409);
    return fail("Unable to create configuration", 500, error.message);
  }
}

import { requireStaffAuth } from "@/lib/auth";
import { fail, created, ok, readJson } from "@/lib/http";
import { createTable } from "@/lib/tables";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const result = await query("select * from restaurant_tables where restaurant_id = $1 order by code", [auth.restaurantId]);
  return ok(result.rows);
}

export async function POST(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJson(request);
    if (!body.code || !body.displayName || !body.capacity) {
      return fail("code, displayName and capacity are required", 400);
    }
    const table = await createTable(auth.restaurantId, body);
    return created(table);
  } catch (error) {
    if (error.code === "23505") return fail("A table with that code already exists", 409);
    return fail("Unable to create table", 500, error.message);
  }
}

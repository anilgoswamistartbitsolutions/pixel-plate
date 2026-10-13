import bcrypt from "bcryptjs";
import { requireSuperAdmin } from "@/lib/auth";
import { fail, ok, readJson } from "@/lib/http";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const auth = requireSuperAdmin(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const body = await readJson(request);

  try {
    const sets = [];
    const values = [id, auth.restaurantId];
    if ("active" in body) { values.push(body.active); sets.push(`active = $${values.length}`); }
    if ("role" in body) { values.push(body.role === "super_admin" ? "super_admin" : "admin"); sets.push(`role = $${values.length}`); }
    if (body.password) {
      values.push(await bcrypt.hash(body.password, 10));
      sets.push(`password_hash = $${values.length}`);
    }
    if (!sets.length) return fail("No recognized fields to update", 400);
    sets.push("updated_at = now()");
    const result = await query(
      `update staff_users set ${sets.join(", ")} where id = $1 and restaurant_id = $2
       returning id, name, username, email, role, active`,
      values
    );
    if (!result.rows[0]) return fail("Staff account not found", 404);
    return ok(result.rows[0]);
  } catch (error) {
    return fail("Unable to update staff account", 500, error.message);
  }
}

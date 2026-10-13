import bcrypt from "bcryptjs";
import { requireStaffAuth, requireSuperAdmin } from "@/lib/auth";
import { created, fail, ok, readJson } from "@/lib/http";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const result = await query(
    "select id, name, username, email, role, active, created_at from staff_users where restaurant_id = $1 order by created_at",
    [auth.restaurantId]
  );
  return ok(result.rows);
}

// Only a super admin can create staff accounts or grant the super_admin role -- mirrors
// the hospital-assist pattern where only that tier can touch agent/team configuration.
export async function POST(request) {
  const auth = requireSuperAdmin(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJson(request);
    if (!body.name || !body.username || !body.password) {
      return fail("name, username and password are required", 400);
    }
    const role = body.role === "super_admin" ? "super_admin" : "admin";
    const hash = await bcrypt.hash(body.password, 10);
    const result = await query(
      `insert into staff_users (restaurant_id, name, username, email, password_hash, role)
       values ($1,$2,$3,$4,$5,$6) returning id, name, username, email, role, active, created_at`,
      [auth.restaurantId, body.name, body.username, body.email || null, hash, role]
    );
    return created(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") return fail("That username or email is already in use", 409);
    return fail("Unable to create staff account", 500, error.message);
  }
}

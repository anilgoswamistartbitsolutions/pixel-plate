import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { fail, ok, readJson } from "@/lib/http";
import { signStaffToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const body = await readJson(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) return fail("Username and password are required", 400);

  try {
    const result = await query("select * from staff_users where username = $1 and active = true", [username]);
    const staff = result.rows[0];
    if (!staff || !(await bcrypt.compare(password, staff.password_hash))) {
      return fail("Invalid username or password", 401);
    }
    const token = signStaffToken(staff);
    return ok({
      token,
      staff: { id: staff.id, name: staff.name, username: staff.username, role: staff.role, restaurantId: staff.restaurant_id }
    });
  } catch (error) {
    return fail("Unable to sign in", 500, error.message);
  }
}

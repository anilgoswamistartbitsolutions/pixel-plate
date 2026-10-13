import { requireStaffAuth } from "@/lib/auth";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  return ok({ id: auth.sub, name: auth.name, username: auth.username, role: auth.role, restaurantId: auth.restaurantId });
}

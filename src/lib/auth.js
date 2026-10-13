import jwt from "jsonwebtoken";
import { fail } from "@/lib/http";

const jwtSecret = process.env.JWT_SECRET || "dev-only-change-me";

export function signStaffToken(staff) {
  return jwt.sign(
    {
      sub: staff.id,
      username: staff.username,
      email: staff.email,
      name: staff.name,
      role: staff.role,
      restaurantId: staff.restaurant_id
    },
    jwtSecret,
    { expiresIn: "8h" }
  );
}

export function signVoiceSession(session) {
  return jwt.sign(
    { scope: "voice-agent", sessionId: session.id, phoneNumber: session.phone_number },
    jwtSecret,
    { expiresIn: "10m" }
  );
}

export function requireVoiceSession(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  try {
    const payload = jwt.verify(token, jwtSecret);
    return payload.scope === "voice-agent" ? payload : fail("Invalid voice session", 401);
  } catch {
    return fail("Invalid or expired voice session", 401);
  }
}

// The explicit server-side reservation/menu/availability tools the voice agent calls are
// authorized with this key, never with staff credentials -- see /api/agent-tools/*.
export function requireAgentApiKey(request) {
  if (process.env.VOICE_API_PUBLIC === "true") return null;

  const configuredKey = process.env.AGENT_TOOLS_API_KEY;
  const providedKey = request.headers.get("x-api-key");

  if (!configuredKey || !providedKey || providedKey !== configuredKey) {
    return fail("Invalid agent API key", 401);
  }
  return null;
}

export function requireStaffAuth(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) return fail("Missing staff authorization token", 401);

  try {
    const payload = jwt.verify(token, jwtSecret);
    if (typeof payload !== "object" || payload.scope || !payload.sub || !["admin", "super_admin"].includes(payload.role)) {
      return fail("Staff authorization required", 403);
    }
    return payload;
  } catch {
    return fail("Invalid or expired staff token", 401);
  }
}

export function requireSuperAdmin(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  if (auth.role !== "super_admin") return fail("Super admin access required", 403);
  return auth;
}

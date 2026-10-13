import { requireVoiceSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { updateCall } from "@/lib/calls";
import { DEFAULT_RESTAURANT_ID } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const auth = requireVoiceSession(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  if (String(auth.sessionId) !== String(id)) return fail("Session mismatch", 403);

  try {
    const body = await request.json();
    const patch = { status: body.status };
    if (body.interaction_id) patch.interaction_id = body.interaction_id;
    if (body.error_message) patch.error_message = body.error_message;
    if (body.status === "connected") patch.connected_at = new Date().toISOString();
    if (["ended", "failed"].includes(body.status)) patch.ended_at = new Date().toISOString();

    const result = await query(
      `update voice_sessions set status = $2,
         interaction_id = coalesce($3, interaction_id),
         connected_at = coalesce($4, connected_at),
         ended_at = coalesce($5, ended_at),
         error_message = coalesce($6, error_message)
       where id = $1 returning *`,
      [id, patch.status, patch.interaction_id || null, patch.connected_at || null, patch.ended_at || null, patch.error_message || null]
    );
    const session = result.rows[0];
    if (session?.call_id) {
      const callStatus = { initiated: "initiated", connecting: "connecting", connected: "connected", ended: "ended", failed: "failed" }[body.status] || "ended";
      await updateCall(DEFAULT_RESTAURANT_ID, session.call_id, {
        status: callStatus,
        connected_at: patch.connected_at,
        ended_at: patch.ended_at,
        error_message: patch.error_message
      });
    }
    return ok(session);
  } catch (error) {
    return fail("Unable to update voice session", 500, error.message);
  }
}

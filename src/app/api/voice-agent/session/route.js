import { signVoiceSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { created, fail } from "@/lib/http";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { createCall } from "@/lib/calls";
import { DEFAULT_RESTAURANT_ID } from "@/lib/db";

export const dynamic = "force-dynamic";

// Starts a browser test-call session for the "Test Agent" screen. Staff speak to the real
// configured agent from the dashboard; this never fabricates a connected call -- if the
// agent isn't configured yet, it fails loudly instead of pretending to work.
export async function POST(request) {
  try {
    const body = await request.json();
    const phoneNumber = normalizePhone(body.phone_number);
    if (body.confirmed !== true) return fail("Confirm the phone number before starting", 400);
    if (!isValidPhone(phoneNumber)) return fail("Enter a valid phone number with 10 to 15 digits", 400);

    const config = (await query(
      `select agent_name, org_id, workspace_id, app_id, input_sample_rate, output_sample_rate,
              initial_language_name, initial_bot_message
       from voice_agent_config
       where id = 1 and enabled = true and app_id <> '' and org_id <> '' and workspace_id <> ''
         and (api_key_encrypted is not null or $1::boolean)`,
      [Boolean(process.env.VOICE_API_KEY?.trim())]
    )).rows[0];
    if (!config) return fail("The voice agent is not configured yet -- see AI Voice Agent > Configuration", 503);

    const call = await createCall({ restaurantId: DEFAULT_RESTAURANT_ID, callerNumber: phoneNumber, channel: "browser_test" });
    const session = (await query(
      "insert into voice_sessions (restaurant_id, phone_number, status, call_id) values ($1,$2,'initiated',$3) returning *",
      [DEFAULT_RESTAURANT_ID, phoneNumber, call.id]
    )).rows[0];

    return created({
      session_id: session.id,
      call_id: call.id,
      token: signVoiceSession(session),
      phone_number: phoneNumber,
      config
    });
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : 500;
    return fail(status === 400 ? "Invalid request body" : "Unable to start voice session", status, status === 500 ? error.message : undefined);
  }
}

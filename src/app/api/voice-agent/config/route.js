import { requireStaffAuth, requireSuperAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { fail, ok, readJson } from "@/lib/http";
import { encryptSecret } from "@/lib/secure-config";

export const dynamic = "force-dynamic";

const defaults = {
  agent_name: "Pixel Plate (Prod)",
  provider_agent_id: "",
  org_id: "",
  workspace_id: "",
  app_id: "",
  input_sample_rate: 16000,
  output_sample_rate: 16000,
  initial_language_name: "English",
  initial_bot_message: "Welcome to Pixel Plate! I can check tables, share the menu, or book a reservation for you -- how can I help today?",
  telephony_configured: false,
  enabled: false
};

function publicConfig(row) {
  const environmentKey = Boolean(process.env.VOICE_API_KEY?.trim());
  if (!row) return { ...defaults, configured: false, has_api_key: environmentKey };
  const { api_key_encrypted, ...config } = row;
  return {
    ...config,
    configured: true,
    has_api_key: environmentKey || Boolean(api_key_encrypted),
    key_source: environmentKey ? "environment" : api_key_encrypted ? "database" : null
  };
}

// Visible to any signed-in staff (so Overview can show the agent name/status), but only a
// super admin can change credentials or flip it live -- see PUT below.
export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const result = await query("select * from voice_agent_config where id = 1");
    return ok(publicConfig(result.rows[0]));
  } catch (error) {
    return fail("Unable to load voice agent configuration", 500, error.message);
  }
}

export async function PUT(request) {
  const auth = requireSuperAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await readJson(request);
    const current = (await query("select api_key_encrypted from voice_agent_config where id = 1")).rows[0];
    const agentName = String(body.agent_name || "Pixel Plate (Prod)").trim();
    const orgId = String(body.org_id || "").trim();
    const workspaceId = String(body.workspace_id || "").trim();
    const appId = String(body.app_id || "").trim();
    const providerAgentId = String(body.provider_agent_id || "").trim();
    const apiKey = String(body.api_key || process.env.VOICE_API_KEY || "").trim();
    const inputRate = Number(body.input_sample_rate || 16000);
    const outputRate = Number(body.output_sample_rate || 16000);

    if (![8000, 16000].includes(inputRate) || ![16000, 22050].includes(outputRate)) {
      return fail("Unsupported audio sample rate", 400);
    }

    const encryptedKey = apiKey ? encryptSecret(apiKey) : current?.api_key_encrypted || null;
    const result = await query(
      `insert into voice_agent_config
        (id, agent_name, provider_agent_id, api_key_encrypted, org_id, workspace_id, app_id, input_sample_rate,
         output_sample_rate, initial_language_name, initial_bot_message, telephony_configured, enabled)
       values (1, $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       on conflict (id) do update set
         agent_name = excluded.agent_name,
         provider_agent_id = excluded.provider_agent_id,
         api_key_encrypted = excluded.api_key_encrypted,
         org_id = excluded.org_id,
         workspace_id = excluded.workspace_id,
         app_id = excluded.app_id,
         input_sample_rate = excluded.input_sample_rate,
         output_sample_rate = excluded.output_sample_rate,
         initial_language_name = excluded.initial_language_name,
         initial_bot_message = excluded.initial_bot_message,
         telephony_configured = excluded.telephony_configured,
         enabled = excluded.enabled,
         updated_at = now()
       returning *`,
      [
        agentName, providerAgentId, encryptedKey, orgId, workspaceId, appId, inputRate, outputRate,
        String(body.initial_language_name || "").trim() || null,
        String(body.initial_bot_message || "").trim() || null,
        Boolean(body.telephony_configured),
        Boolean(body.enabled)
      ]
    );
    return ok(publicConfig(result.rows[0]));
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : 500;
    return fail(status === 400 ? "Invalid request body" : "Unable to save voice agent configuration", status, status === 500 ? error.message : undefined);
  }
}

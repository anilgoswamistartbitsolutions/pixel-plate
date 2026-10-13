import { query } from "@/lib/db";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await query(
      `select agent_name from voice_agent_config where id = 1 and enabled = true
         and app_id <> '' and org_id <> '' and workspace_id <> ''
         and (api_key_encrypted is not null or $1::boolean)`,
      [Boolean(process.env.VOICE_API_KEY?.trim())]
    );
    return ok({ enabled: Boolean(result.rows[0]), agent_name: result.rows[0]?.agent_name || null });
  } catch {
    return ok({ enabled: false, agent_name: null });
  }
}

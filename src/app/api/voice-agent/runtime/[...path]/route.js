import { requireVoiceSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { fail } from "@/lib/http";
import { decryptSecret } from "@/lib/secure-config";

export const dynamic = "force-dynamic";

// Browser SDK never sees the platform API key -- it only holds a short-lived voice-session
// JWT. This route is the only thing that holds the real key, and only forwards the exact
// runtime URL this agent's own config says it should.
export async function GET(request, { params }) {
  const auth = requireVoiceSession(request);
  if (auth instanceof Response) return auth;

  try {
    const { path } = await params;
    const config = (await query("select * from voice_agent_config where id = 1 and enabled = true")).rows[0];
    if (!config) return fail("The voice agent is disabled", 503);
    const platformKey = process.env.VOICE_API_KEY?.trim() || (config.api_key_encrypted ? decryptSecret(config.api_key_encrypted) : "");
    if (!platformKey) return fail("Add VOICE_API_KEY to connect the voice agent", 503);

    const expected = `orgs/${config.org_id}/workspaces/${config.workspace_id}/apps/${config.app_id}/url`;
    const requested = path.join("/");
    if (requested !== expected) return fail("Invalid runtime path", 403);

    const sourceUrl = new URL(request.url);
    const upstreamUrl = new URL(`https://apps.sarvam.ai/api/app-runtime/${requested}`);
    upstreamUrl.search = sourceUrl.search;
    const upstream = await fetch(upstreamUrl, { headers: { "X-API-Key": platformKey }, cache: "no-store" });
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", upstream.headers.get("content-type") || "application/json");
    return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    return fail("Unable to connect to the voice runtime", 502, error.message);
  }
}

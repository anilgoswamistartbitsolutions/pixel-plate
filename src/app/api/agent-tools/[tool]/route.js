import { requireAgentApiKey } from "@/lib/auth";
import { fail, ok, readJson } from "@/lib/http";
import { runTool } from "@/lib/agent-tools";
import { DEFAULT_RESTAURANT_ID } from "@/lib/db";

export const dynamic = "force-dynamic";

// One endpoint per tool name: POST /api/agent-tools/create_reservation, etc. This is the
// exact surface the "Pixel Plate (Prod)" voice agent's webhook tools call -- see
// scripts/configure-voice-agent.cjs and docs/voice-agent-tools.md for the full contract.
export async function POST(request, { params }) {
  const authFailure = requireAgentApiKey(request);
  if (authFailure) return authFailure;

  const { tool } = await params;
  const body = await readJson(request);

  try {
    const result = await runTool(tool, { restaurantId: DEFAULT_RESTAURANT_ID, ...body });
    return ok(result);
  } catch (error) {
    if (error.message?.startsWith("Unknown agent tool")) return fail(error.message, 404);
    return fail("Tool execution failed", 500, error.message);
  }
}

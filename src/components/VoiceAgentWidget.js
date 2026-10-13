"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneCall, PhoneOff, X } from "lucide-react";

/**
 * Floating bottom-right voice launcher (same pattern as the hospital-assist SarvamAgentWidget):
 * a pill button that opens a small call panel. Talks to the real configured agent through
 * /api/voice-agent/session + /api/voice-agent/runtime -- never fabricates a transcript or a
 * successful call. Renders nothing until the agent is actually enabled.
 */
export default function VoiceAgentWidget() {
  const agentRef = useRef(null);
  const sessionRef = useRef(null);
  const [available, setAvailable] = useState(false);
  const [agentName, setAgentName] = useState("Pixel Plate");
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [state, setState] = useState("idle");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    fetch("/api/voice-agent/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (!current || !payload.data?.enabled) return;
        setAvailable(true);
        setAgentName(payload.data.agent_name || "Pixel Plate");
      })
      .catch(() => {});
    return () => {
      current = false;
      agentRef.current?.stop().catch(() => {});
    };
  }, []);

  async function patchSession(status, details = {}) {
    if (!sessionRef.current) return;
    const { id, token } = sessionRef.current;
    await fetch(`/api/voice-agent/session/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, ...details })
    }).catch(() => {});
  }

  async function startAgent(event) {
    event.preventDefault();
    setError("");
    setState("connecting");
    try {
      const sessionResponse = await fetch("/api/voice-agent/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: phone, confirmed })
      });
      const sessionPayload = await sessionResponse.json();
      if (!sessionResponse.ok) throw new Error(sessionPayload.error?.message || "Unable to start the agent");

      const session = sessionPayload.data;
      sessionRef.current = { id: session.session_id, token: session.token };
      await patchSession("connecting");

      const { ConversationAgent, BrowserAudioInterface, InteractionType } = await import("sarvam-conv-ai-sdk/browser");
      const config = session.config;
      const agent = new ConversationAgent({
        apiKey: "server-managed",
        platform: "browser",
        baseUrl: `${window.location.origin}/api/voice-agent/runtime/`,
        customHeaders: { Authorization: `Bearer ${session.token}` },
        config: {
          user_identifier_type: "phone_number",
          user_identifier: session.phone_number,
          org_id: config.org_id,
          workspace_id: config.workspace_id,
          app_id: config.app_id,
          interaction_type: InteractionType.CALL,
          input_sample_rate: config.input_sample_rate,
          output_sample_rate: config.output_sample_rate,
          agent_variables: { caller_phone_number: session.phone_number }
        },
        audioInterface: new BrowserAudioInterface(),
        startCallback: async () => {
          setState("connected");
          await patchSession("connected", { interaction_id: agent.getInteractionId() });
        },
        endCallback: async () => {
          setState("ended");
          await patchSession("ended", { interaction_id: agent.getInteractionId() });
          agentRef.current = null;
        }
      });

      agentRef.current = agent;
      await agent.start();
      const connected = await agent.waitForConnect(10);
      if (!connected) throw new Error("The agent did not connect within 10 seconds");
    } catch (startError) {
      await patchSession("failed", { error_message: startError.message });
      await agentRef.current?.stop().catch(() => {});
      agentRef.current = null;
      setError(startError.message);
      setState("idle");
    }
  }

  async function stopAgent() {
    setState("ending");
    await agentRef.current?.stop().catch(() => {});
    agentRef.current = null;
    await patchSession("ended");
    setState("ended");
  }

  function closePanel() {
    if (["connecting", "connected", "ending"].includes(state)) return;
    setOpen(false);
    setError("");
    setState("idle");
  }

  if (!available) return null;

  const orbState = state === "connected" ? "listening" : muted ? "muted" : "";

  return (
    <div className="voiceLauncherWrap">
      {open && (
        <div className="voicePanel" role="dialog" aria-label={`${agentName} voice agent`}>
          <div className="voicePanelHeader">
            <span className="iconCircle"><Mic size={16} /></span>
            <div>
              <strong>{agentName}</strong>
              <span>{state === "connected" ? "Listening now" : "Pixel Plate voice agent"}</span>
            </div>
            <button className="voiceCloseBtn" onClick={closePanel} disabled={["connecting", "connected", "ending"].includes(state)}>
              <X size={16} />
            </button>
          </div>
          <div className="voicePanelBody">
            {state === "connected" || state === "ending" ? (
              <>
                <div className={`voiceOrb ${orbState}`}>{muted ? <MicOff size={26} /> : <Mic size={26} />}</div>
                <div className="voiceState">{state === "ending" ? "Ending call..." : `${agentName} is listening`}</div>
                <div className="voiceControls">
                  <button className="voiceCircleButton" onClick={() => setMuted((m) => !m)} title={muted ? "Unmute" : "Mute"}>
                    {muted ? <MicOff size={17} /> : <Mic size={17} />}
                  </button>
                  <button className="voiceCircleButton end" onClick={stopAgent} disabled={state === "ending"} title="End call">
                    <PhoneOff size={17} />
                  </button>
                </div>
              </>
            ) : state === "ended" ? (
              <div style={{ textAlign: "center" }}>
                <div className="voiceState" style={{ marginBottom: 12 }}>Call ended. Thanks for testing {agentName}.</div>
                <button className="button secondary small" onClick={() => { setState("idle"); setConfirmed(false); }}>Start another call</button>
              </div>
            ) : (
              <form onSubmit={startAgent} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input
                  className="textInput" type="tel" required
                  placeholder="Phone number (any country)"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setConfirmed(false); }}
                />
                <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
                  I confirm this number is correct for this test call.
                </label>
                {error && <div className="loginError">{error}</div>}
                <button className="button primary" type="submit" disabled={!confirmed || state === "connecting"} style={{ justifyContent: "center" }}>
                  <PhoneCall size={15} /> {state === "connecting" ? "Connecting..." : `Call ${agentName}`}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {!open && (
        <button className="voiceLauncherButton" onClick={() => setOpen(true)} title={`Talk to ${agentName}`}>
          <span className="voiceLauncherIcon"><PhoneCall size={15} /></span>
          Talk to {agentName}
        </button>
      )}
    </div>
  );
}

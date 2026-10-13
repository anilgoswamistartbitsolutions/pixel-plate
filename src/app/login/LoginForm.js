"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Unable to sign in");
      localStorage.setItem("pp_token", payload.data.token);
      localStorage.setItem("pp_staff", JSON.stringify(payload.data.staff));
      router.push("/admin");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="loginPage">
      <div className="loginVisual">
        <div className="loginVisualBrand">
          <div className="loginMark"><UtensilsCrossed size={22} /></div>
          <div>
            <strong>Pixel Plate</strong>
            <span>Restaurant console</span>
          </div>
        </div>

        <div className="loginVisualArt" aria-hidden="true">
          <PlateIllustration />
        </div>

        <div className="loginVisualCopy">
          <h1>Run the floor, the phone, and the kitchen from one place.</h1>
          <p>
            Live tables, real-time bookings, a California-fresh menu, and an AI voice agent that
            answers the phone the way your best host would.
          </p>
        </div>
      </div>

      <div className="loginFormSide">
        <div className="loginCard">
          <div className="loginBrand">
            <div className="loginMark"><UtensilsCrossed size={24} /></div>
            <div className="loginTitle">Welcome back</div>
            <div className="loginSub">Sign in to the Pixel Plate console</div>
          </div>
          {error && <div className="loginError">{error}</div>}
          <form onSubmit={handleSubmit} className="field" style={{ gap: 14 }}>
            <div className="field">
              <label>Username</label>
              <input className="textInput" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
            </div>
            <div className="field">
              <label>Password</label>
              <input className="textInput" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button className="button primary" type="submit" disabled={loading} style={{ justifyContent: "center", marginTop: 4 }}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <div className="demoCreds">
            Super admin: pixelplate / pixelplate123 &middot; Manager: manager / manager123<br />
            Change these in Team &amp; Settings after your first sign-in.
          </div>
        </div>
      </div>
    </div>
  );
}

function PlateIllustration() {
  return (
    <svg viewBox="0 0 320 320" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="160" cy="168" r="128" fill="rgba(255,255,255,0.08)" />
      <ellipse cx="160" cy="230" rx="118" ry="18" fill="rgba(0,0,0,0.12)" />
      <circle cx="160" cy="168" r="104" fill="#fdf6ee" />
      <circle cx="160" cy="168" r="104" fill="none" stroke="#f0ddc4" strokeWidth="2" />
      <circle cx="160" cy="168" r="76" fill="none" stroke="#f0ddc4" strokeWidth="2" />
      {/* main plate contents -- abstracted salad / entree */}
      <ellipse cx="160" cy="160" rx="52" ry="34" fill="#e3a23a" opacity="0.9" />
      <ellipse cx="138" cy="150" rx="22" ry="14" fill="#6fa06a" />
      <ellipse cx="178" cy="146" rx="18" ry="12" fill="#7fb178" />
      <ellipse cx="162" cy="172" rx="26" ry="12" fill="#c1603d" />
      <circle cx="120" cy="178" r="7" fill="#e85d4a" />
      <circle cx="136" cy="190" r="6" fill="#e85d4a" />
      <circle cx="196" cy="180" r="6" fill="#f0c35a" />
      {/* steam */}
      <path d="M150 90c-6-10 4-16-2-28" stroke="rgba(255,255,255,0.55)" strokeWidth="4" strokeLinecap="round" />
      <path d="M170 86c-6-10 4-18-2-30" stroke="rgba(255,255,255,0.45)" strokeWidth="4" strokeLinecap="round" />
      {/* fork */}
      <g transform="translate(36,96) rotate(-18)">
        <rect x="0" y="40" width="10" height="120" rx="5" fill="#fff" opacity="0.92" />
        <path d="M0 40V10M5 40V5M10 40V10" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.92" />
      </g>
      {/* knife */}
      <g transform="translate(262,96) rotate(18)">
        <rect x="0" y="48" width="9" height="112" rx="4.5" fill="#fff" opacity="0.92" />
        <path d="M4.5 48C-10 40-10 6 4.5 0c10 10 14 36 0 48Z" fill="#fff" opacity="0.92" />
      </g>
    </svg>
  );
}

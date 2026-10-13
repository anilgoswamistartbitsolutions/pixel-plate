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
    <div className="loginShell">
      <div className="loginCard">
        <div className="loginBrand">
          <div className="loginMark"><UtensilsCrossed size={24} /></div>
          <div className="loginTitle">Pixel Plate</div>
          <div className="loginSub">Reservations, floor plan & voice agent console</div>
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
  );
}

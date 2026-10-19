"use client";

import { useState } from "react";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const csrf = await fetch("/api/auth/csrf", { credentials: "same-origin", cache: "no-store" });
      if (!csrf.ok) throw new Error("Demo login is unavailable. Please contact the presenter.");
      const { csrfToken } = await csrf.json();
      if (typeof csrfToken !== "string") throw new Error("Unable to verify login request.");
      const response = await fetch("/api/auth/login", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ password }),
      });
      setPassword("");
      if (!response.ok) throw new Error(response.status === 401 ? "Invalid password." : "Unable to sign in. Please try again.");
      window.location.replace("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to sign in.");
      setBusy(false);
    }
  }
  return <form onSubmit={login}>
    <label className="crud-field">
      <span>Demo password</span>
      <input type="password" name="password" required autoComplete="current-password"
        disabled={busy} value={password} onChange={event => setPassword(event.target.value)} />
    </label>
    {error && <p role="alert">{error}</p>}
    <button className="primary-button" type="submit" disabled={busy}>
      {busy ? "Signing in..." : "Login"}
    </button>
    <p>Session expires after two hours. Use demo data only.</p>
  </form>;
}

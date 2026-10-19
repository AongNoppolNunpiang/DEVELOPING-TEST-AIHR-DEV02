"use client";

import { useState } from "react";
import { authenticatedFetch } from "@/lib/authenticated-fetch";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Unable to sign out. Please try again.");
      window.location.replace("/login");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to sign out.");
      setBusy(false);
    }
  }
  return <div>
    <button type="button" className="secondary-button" disabled={busy} onClick={logout}>
      {busy ? "Signing out..." : "Logout"}
    </button>
    {error && <p role="alert">{error}</p>}
  </div>;
}

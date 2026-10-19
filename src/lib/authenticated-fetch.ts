// Browser-only: signed session cookies stay HttpOnly.
export async function authenticatedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (new URL(input, window.location.origin).origin !== window.location.origin) {
    throw new Error("Only same-origin requests are allowed.");
  }
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = await fetch("/api/auth/csrf", { credentials: "same-origin", cache: "no-store" });
    if (!csrf.ok) throw new Error("Unable to verify this request. Please sign in again.");
    const result = await csrf.json();
    if (typeof result.csrfToken !== "string") throw new Error("Unable to verify this request.");
    headers.set("X-CSRF-Token", result.csrfToken);
  }
  const response = await fetch(input, { ...init, headers, credentials: "same-origin", cache: "no-store" });
  if (response.status === 401) {
    window.location.replace("/login");
    throw new Error("Your session has expired. Please sign in again.");
  }
  return response;
}

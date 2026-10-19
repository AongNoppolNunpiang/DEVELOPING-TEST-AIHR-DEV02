// Framework-independent HTTP core. No Prisma imports, network calls, or logs.
import {
  type DemoAuthConfig, csrfForToken, csrfMatches, demoCookie, issueDemoToken,
  passwordMatches, readDemoAuthConfig, readDemoCookie, trustedMutationOrigin, verifyDemoToken,
} from "./demo-auth";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: {
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}
const failure = (status: number, error: string) => json({ error }, status);

async function smallJson(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("invalid-json");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) { await reader.cancel(); throw new Error("too-large"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { reader.releaseLock(); }
}

/** Dependency injection is for tests; production callers use the defaults.
 * withSession must wrap the data callback BEFORE invoking any Prisma operation.
 * Stateless logout clears this browser only; it cannot revoke copied cookies.
 * There is deliberately no claim of distributed login rate limiting here.
 */
export function createDemoAuth(
  configProvider: () => DemoAuthConfig = readDemoAuthConfig,
  clock: () => number = () => Math.floor(Date.now() / 1000),
) {
  function configOrFailure(): DemoAuthConfig | Response {
    try { return configProvider(); }
    catch { return failure(503, "Demo authentication is unavailable."); }
  }

  async function withSession(request: Request, dataHandler: () => Response | Promise<Response>): Promise<Response> {
    const config = configOrFailure();
    if (config instanceof Response) return config;
    const token = readDemoCookie(request, config, "session");
    if (!verifyDemoToken(token, config, "session", clock())) return failure(401, "Authentication required.");
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase()) &&
        (!trustedMutationOrigin(request, config) || !csrfMatches(request.headers.get("x-csrf-token"), token!, config))) {
      return failure(403, "Request verification failed.");
    }
    const response = await dataHandler();
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  async function csrf(request: Request): Promise<Response> {
    if (request.method !== "GET") return failure(405, "Method not allowed.");
    const config = configOrFailure();
    if (config instanceof Response) return config;
    const origin = request.headers.get("origin");
    if ((origin !== null && origin !== config.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
      return failure(403, "Request verification failed.");
    }
    const current = readDemoCookie(request, config, "session");
    if (verifyDemoToken(current, config, "session", clock())) return json({ csrfToken: csrfForToken(current!, config) });
    const challenge = readDemoCookie(request, config, "login");
    const token = verifyDemoToken(challenge, config, "login", clock()) ? challenge! : issueDemoToken(config, "login", clock());
    const response = json({ csrfToken: csrfForToken(token, config) });
    response.headers.append("Set-Cookie", demoCookie(config, "login", token));
    return response;
  }

  async function login(request: Request): Promise<Response> {
    if (request.method !== "POST") return failure(405, "Method not allowed.");
    const config = configOrFailure();
    if (config instanceof Response) return config;
    const token = readDemoCookie(request, config, "login");
    if (!trustedMutationOrigin(request, config) || !verifyDemoToken(token, config, "login", clock()) ||
        !csrfMatches(request.headers.get("x-csrf-token"), token!, config)) return failure(403, "Request verification failed.");
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return failure(415, "JSON is required.");
    }
    let body: unknown;
    try { body = await smallJson(request); }
    catch (error) { return error instanceof Error && error.message === "too-large"
      ? failure(413, "Request body is too large.") : failure(400, "Invalid login request."); }
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        !passwordMatches((body as Record<string, unknown>).password, config)) return failure(401, "Invalid credentials.");
    const session = issueDemoToken(config, "session", clock());
    const response = json({ success: true });
    response.headers.append("Set-Cookie", demoCookie(config, "session", session));
    response.headers.append("Set-Cookie", demoCookie(config, "login", "", true));
    return response;
  }

  async function logout(request: Request): Promise<Response> {
    if (request.method !== "POST") return failure(405, "Method not allowed.");
    return withSession(request, () => {
      const config = configOrFailure();
      if (config instanceof Response) return config;
      const response = json({ success: true });
      response.headers.append("Set-Cookie", demoCookie(config, "session", "", true));
      response.headers.append("Set-Cookie", demoCookie(config, "login", "", true));
      return response;
    });
  }

  return { withSession, csrf, login, logout };
}

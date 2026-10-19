// Only import from server pages, Proxy, and Route Handlers.
import { createDemoAuth } from "./demo-auth-http";
import { readDemoAuthConfig, readDemoCookie, verifyDemoToken } from "./demo-auth";

// Read configuration at request time, never at build/import time.
export const demoAuth = createDemoAuth();

export function hasDemoSession(request: Pick<Request, "headers">): boolean {
  try {
    const config = readDemoAuthConfig();
    return !!verifyDemoToken(readDemoCookie(request, config, "session"), config,
      "session", Math.floor(Date.now() / 1000));
  } catch { return false; }
}

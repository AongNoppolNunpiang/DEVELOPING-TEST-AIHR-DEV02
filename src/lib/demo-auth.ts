// Server-only primitives: never import this Node crypto module into client UI.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_SECONDS = 7200;
export const LOGIN_CHALLENGE_SECONDS = 300;
export type DemoAuthConfig = Readonly<{
  password: string;
  secret: string;
  origin: string;
  secure: boolean;
}>;
export type DemoClaims = Readonly<{
  v: 1;
  purpose: "session" | "login";
  aud: string;
  iat: number;
  exp: number;
  nonce: string;
}>;

export function readDemoAuthConfig(env: NodeJS.ProcessEnv = process.env): DemoAuthConfig {
  const password = env.DEMO_PASSWORD;
  const secret = env.DEMO_SESSION_SECRET;
  // These are authentication safeguards, not CRUD/business validation rules.
  if (!password || Buffer.byteLength(password) < 16 || Buffer.byteLength(password) > 256 ||
      !secret || Buffer.byteLength(secret) < 32 || Buffer.byteLength(secret) > 1024 ||
      /^<.*>$/.test(password) || /^<.*>$/.test(secret) ||
      secret === password || !env.DEMO_APP_ORIGIN ||
      (env.DEMO_SESSION_TTL_SECONDS !== undefined && env.DEMO_SESSION_TTL_SECONDS !== "7200")) {
    throw new Error("Demo authentication configuration is invalid.");
  }
  let url: URL;
  try { url = new URL(env.DEMO_APP_ORIGIN); }
  catch { throw new Error("Demo authentication configuration is invalid."); }
  const secure = url.protocol === "https:";
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!secure && !localHttp) || (env.NODE_ENV === "production" && !secure) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      env.DEMO_APP_ORIGIN !== url.origin) {
    throw new Error("Demo authentication configuration is invalid.");
  }
  return Object.freeze({ password, secret, origin: url.origin, secure });
}

function mac(config: DemoAuthConfig, message: string): Buffer {
  return createHmac("sha256", config.secret).update(message).digest();
}

function decodeCanonical(text: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const bytes = Buffer.from(text, "base64url");
  return bytes.toString("base64url") === text ? bytes : null;
}

export function passwordMatches(value: unknown, config: DemoAuthConfig): boolean {
  if (typeof value !== "string" || Buffer.byteLength(value) > 256) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(value), digest(config.password));
}

export function issueDemoToken(config: DemoAuthConfig, purpose: DemoClaims["purpose"], now: number): string {
  const claims: DemoClaims = { v: 1, purpose, aud: config.origin, iat: now,
    exp: now + (purpose === "session" ? SESSION_SECONDS : LOGIN_CHALLENGE_SECONDS),
    nonce: randomBytes(32).toString("base64url") };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${mac(config, `demo-cookie-v1:${payload}`).toString("base64url")}`;
}

export function verifyDemoToken(token: string | null, config: DemoAuthConfig,
  purpose: DemoClaims["purpose"], now: number): DemoClaims | null {
  if (!token || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const supplied = decodeCanonical(signature);
  if (!supplied || supplied.length !== 32 || !timingSafeEqual(supplied, mac(config, `demo-cookie-v1:${payload}`))) return null;
  const decoded = decodeCanonical(payload);
  if (!decoded) return null;
  try {
    const c = JSON.parse(decoded.toString("utf8"));
    const lifetime = purpose === "session" ? SESSION_SECONDS : LOGIN_CHALLENGE_SECONDS;
    if (!c || c.v !== 1 || c.purpose !== purpose || c.aud !== config.origin ||
        !Number.isSafeInteger(c.iat) || !Number.isSafeInteger(c.exp) || c.iat < 0 ||
        c.iat > now || c.exp <= now || c.exp - c.iat !== lifetime ||
        typeof c.nonce !== "string" || decodeCanonical(c.nonce)?.length !== 32) return null;
    return c as DemoClaims;
  } catch { return null; }
}

export function csrfForToken(token: string, config: DemoAuthConfig): string {
  // Separate HMAC purpose; bound to the complete signed session/challenge.
  return mac(config, `demo-csrf-v1:${token}`).toString("base64url");
}

export function csrfMatches(value: string | null, token: string, config: DemoAuthConfig): boolean {
  if (!value || value.length !== 43) return false;
  const supplied = decodeCanonical(value);
  return !!supplied && supplied.length === 32 &&
    timingSafeEqual(supplied, mac(config, `demo-csrf-v1:${token}`));
}

export function cookieName(config: DemoAuthConfig, purpose: DemoClaims["purpose"]): string {
  return `${config.secure ? "__Host-" : ""}demo-${purpose}`;
}

export function readDemoCookie(request: Pick<Request, "headers">, config: DemoAuthConfig, purpose: DemoClaims["purpose"]): string | null {
  const raw = request.headers.get("cookie") || "";
  if (raw.length > 8192) return null;
  const name = cookieName(config, purpose);
  const matches = raw.split(";").map(s => s.trim()).filter(s => s.startsWith(`${name}=`));
  // Reject ambiguous/path-shadowed duplicate cookies rather than choosing one.
  return matches.length === 1 ? matches[0].slice(name.length + 1) : null;
}

export function demoCookie(config: DemoAuthConfig, purpose: DemoClaims["purpose"], token: string, clear = false): string {
  const maxAge = clear ? 0 : purpose === "session" ? SESSION_SECONDS : LOGIN_CHALLENGE_SECONDS;
  return `${cookieName(config, purpose)}=${clear ? "" : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}` +
    (config.secure ? "; Secure" : "") + (clear ? "; Expires=Thu, 01 Jan 1970 00:00:00 GMT" : "");
}

export function trustedMutationOrigin(request: Request, config: DemoAuthConfig): boolean {
  return request.headers.get("origin") === config.origin &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}

/* eslint-disable @typescript-eslint/no-require-imports -- In-memory Node tests; no DB, HTTP server, or emitted files. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const loaded = new Map();
function load(name) {
  if (loaded.has(name)) return loaded.get(name);
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/', name + '.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  const testModule = { exports: {} };
  const restrictedRequire = id => {
    if (id === 'node:crypto') return crypto;
    if (id === './demo-auth') return load('demo-auth');
    throw new Error('Unexpected dependency: auth tests must never load Prisma or network clients.');
  };
  new Function('require', 'module', 'exports', code)(restrictedRequire, testModule, testModule.exports);
  loaded.set(name, testModule.exports);
  return testModule.exports;
}
const core = load('demo-auth');
const { createDemoAuth } = load('demo-auth-http');
// Ephemeral credentials are generated for each run, never real environment values.
const env = {
  NODE_ENV: 'production', DEMO_PASSWORD: crypto.randomBytes(24).toString('base64url'),
  DEMO_SESSION_SECRET: crypto.randomBytes(48).toString('base64url'),
  DEMO_APP_ORIGIN: 'https://demo.example.test', DEMO_SESSION_TTL_SECONDS: '7200',
};
const config = core.readDemoAuthConfig(env);
const start = 1900000000;
function setup() {
  let now = start;
  return { auth: createDemoAuth(() => config, () => now), setTime: t => { now = t; } };
}
function req(method = 'GET', token, csrfToken, origin = config.origin, body) {
  const headers = new Headers();
  if (origin !== null) headers.set('Origin', origin);
  if (token) headers.set('Cookie', `${core.cookieName(config, 'session')}=${token}`);
  if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  return new Request(config.origin + '/api/test', { method, headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
function cookieValue(response, purpose) {
  const name = core.cookieName(config, purpose);
  const cookies = response.headers.getSetCookie();
  const line = cookies.find(s => s.startsWith(name + '='));
  return line?.split(';')[0].slice(name.length + 1);
}
async function loginRequest(auth, password = env.DEMO_PASSWORD) {
  const response = await auth.csrf(req());
  const csrf = (await response.json()).csrfToken;
  const token = cookieValue(response, 'login');
  const request = req('POST', null, csrf, config.origin, { password });
  request.headers.set('Cookie', `${core.cookieName(config, 'login')}=${token}`);
  return request;
}
test('configuration fixes lifetime at two hours and accepts only explicit safe origins', () => {
  assert.equal(core.SESSION_SECONDS, 7200);
  for (const patch of [
    { DEMO_PASSWORD: undefined }, { DEMO_PASSWORD: 'short' }, { DEMO_SESSION_SECRET: undefined },
    { DEMO_SESSION_SECRET: env.DEMO_PASSWORD }, { DEMO_SESSION_SECRET: 'short' },
    { DEMO_PASSWORD: '<REPLACE_WITH_DEMO_PASSWORD>' },
    { DEMO_SESSION_SECRET: '<REPLACE_WITH_INDEPENDENT_RANDOM_SECRET>' },
    { DEMO_SESSION_TTL_SECONDS: '3600' }, { DEMO_APP_ORIGIN: 'http://demo.example.test' },
    { DEMO_APP_ORIGIN: 'http://localhost:3000' }, { DEMO_APP_ORIGIN: 'https://demo.example.test/path' },
    { DEMO_APP_ORIGIN: 'https://demo.example.test/' }, { DEMO_APP_ORIGIN: 'not-a-url' },
  ]) assert.throws(() => core.readDemoAuthConfig({ ...env, ...patch }), /configuration is invalid/);
  assert.equal(core.readDemoAuthConfig({ ...env, NODE_ENV: 'development', DEMO_APP_ORIGIN: 'http://localhost:3000' }).secure, false);
});
test('session signature, exact expiry boundary, future issuance, and random nonce', () => {
  const token = core.issueDemoToken(config, 'session', start);
  assert.ok(core.verifyDemoToken(token, config, 'session', start));
  assert.ok(core.verifyDemoToken(token, config, 'session', start + 7199));
  assert.equal(core.verifyDemoToken(token, config, 'session', start + 7200), null);
  assert.equal(core.verifyDemoToken(token, config, 'session', start - 1), null);
  assert.ok(token !== core.issueDemoToken(config, 'session', start));
});
test('tampering, malformed signatures, oversized cookies, purpose and audience isolation', () => {
  const token = core.issueDemoToken(config, 'session', start);
  const [payload, signature] = token.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  claims.exp += 7200;
  const modified = Buffer.from(JSON.stringify(claims)).toString('base64url') + '.' + signature;
  for (const value of [null, '', modified, payload + '.AAAA', token + '.extra', 'x'.repeat(2049),
    token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')]) {
    assert.equal(core.verifyDemoToken(value, config, 'session', start), null);
  }
  assert.equal(core.verifyDemoToken(token, { ...config, origin: 'https://other.example.test' }, 'session', start), null);
  assert.equal(core.verifyDemoToken(token, { ...config, secret: crypto.randomBytes(48).toString('hex') }, 'session', start), null);
  assert.equal(core.verifyDemoToken(token, config, 'login', start), null);
});
test('production cookies have required flags; local cookie name cannot shadow production', () => {
  const cookie = core.demoCookie(config, 'session', 'test-token');
  for (const flag of ['__Host-demo-session=', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=7200']) assert.ok(cookie.includes(flag));
  assert.ok(!cookie.includes('Domain='));
  assert.equal(core.readDemoCookie(new Request(config.origin, { headers: { cookie: 'demo-session=x' } }), config, 'session'), null);
  assert.equal(core.readDemoCookie(new Request(config.origin, { headers: { cookie: '__Host-demo-session=x; __Host-demo-session=y' } }), config, 'session'), null);
});
for (const method of ['GET', 'HEAD', 'OPTIONS', 'POST', 'PATCH', 'PUT', 'DELETE']) {
  test(`unauthenticated ${method}: 401 before data callback, including bad Origin`, async () => {
    const { auth } = setup(); let calls = 0;
    const response = await auth.withSession(req(method, null, null, 'https://evil.example.test'), () => { calls++; return Response.json({}); });
    assert.equal(response.status, 401); assert.equal(calls, 0);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
}
test('invalid/expired cookies never reach data callback', async () => {
  const { auth, setTime } = setup(); let calls = 0;
  const handler = () => { calls++; return Response.json({}); };
  assert.equal((await auth.withSession(req('GET', 'forged'), handler)).status, 401);
  const token = core.issueDemoToken(config, 'session', start); setTime(start + 7200);
  assert.equal((await auth.withSession(req('GET', token), handler)).status, 401);
  assert.equal(calls, 0);
});
for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
  test(`${method}: signed-in mutation requires exact Origin and session-bound CSRF`, async () => {
    const { auth } = setup(); let calls = 0;
    const token = core.issueDemoToken(config, 'session', start), csrf = core.csrfForToken(token, config);
    const other = core.issueDemoToken(config, 'session', start);
    for (const [origin, csrfToken] of [[null, csrf], ['null', csrf], ['https://demo.example.test.evil.test', csrf],
      ['https://demo.example.test:444', csrf], [config.origin, null], [config.origin, 'bad'],
      [config.origin, core.csrfForToken(other, config)]]) {
      const response = await auth.withSession(req(method, token, csrfToken, origin), () => { calls++; return Response.json({}); });
      assert.equal(response.status, 403);
    }
    assert.equal(calls, 0);
    assert.equal((await auth.withSession(req(method, token, csrf), () => { calls++; return Response.json({ ok: true }); })).status, 200);
    assert.equal(calls, 1);
  });
}
test('forwarded Host cannot bypass Origin; cross-site fetch metadata rejected', async () => {
  const { auth } = setup(); const token = core.issueDemoToken(config, 'session', start);
  const request = req('DELETE', token, core.csrfForToken(token, config), 'https://evil.example.test');
  request.headers.set('x-forwarded-host', 'demo.example.test');
  assert.equal((await auth.withSession(request, () => assert.fail('must not execute'))).status, 403);
  request.headers.set('origin', config.origin); request.headers.set('sec-fetch-site', 'cross-site');
  assert.equal((await auth.withSession(request, () => assert.fail('must not execute'))).status, 403);
});
test('login requires pre-login CSRF, and wrong password cannot issue session', async () => {
  const { auth } = setup();
  assert.equal((await auth.login(req('POST', null, null, config.origin, { password: env.DEMO_PASSWORD }))).status, 403);
  const response = await auth.login(await loginRequest(auth, 'incorrect-test-input'));
  assert.equal(response.status, 401); assert.equal(response.headers.get('set-cookie'), null);
});
test('login succeeds without exposing password, signed token, or secret in JSON', async () => {
  const { auth } = setup(); const response = await auth.login(await loginRequest(auth));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  const token = cookieValue(response, 'session');
  assert.ok(core.verifyDemoToken(token, config, 'session', start));
  assert.equal(cookieValue(response, 'login'), '');
  const csrfResponse = await auth.csrf(req('GET', token));
  assert.ok(core.csrfMatches((await csrfResponse.json()).csrfToken, token, config));
});
test('login rejects invalid JSON, wrong content type, large streamed bodies and cross-origin requests', async () => {
  const { auth } = setup();
  const invalid = await loginRequest(auth); const headers = invalid.headers;
  assert.equal((await auth.login(new Request(invalid.url, { method: 'POST', headers, body: '{' }))).status, 400);
  const large = await loginRequest(auth);
  assert.equal((await auth.login(new Request(large.url, { method: 'POST', headers: large.headers, body: 'x'.repeat(1025) }))).status, 413);
  const form = await loginRequest(auth); form.headers.set('content-type', 'text/plain');
  assert.equal((await auth.login(form)).status, 415);
  const foreign = await loginRequest(auth); foreign.headers.set('origin', 'https://evil.example.test');
  assert.equal((await auth.login(foreign)).status, 403);
});
test('pre-login CSRF expires at five minutes; token endpoint rejects cross-origin', async () => {
  const { auth, setTime } = setup(); const request = await loginRequest(auth); setTime(start + 300);
  assert.equal((await auth.login(request)).status, 403);
  assert.equal((await auth.csrf(req('GET', null, null, 'https://evil.example.test'))).status, 403);
});
test('logout checks auth/CSRF, clears both cookies, but copied token remains valid until expiry', async () => {
  const { auth } = setup(); const response = await auth.login(await loginRequest(auth));
  const token = cookieValue(response, 'session'), csrf = core.csrfForToken(token, config);
  assert.equal((await auth.logout(req('POST'))).status, 401);
  assert.equal((await auth.logout(req('POST', token))).status, 403);
  const logout = await auth.logout(req('POST', token, csrf)); assert.equal(logout.status, 200);
  assert.equal(cookieValue(logout, 'session'), ''); assert.equal(cookieValue(logout, 'login'), '');
  for (const cookie of logout.headers.getSetCookie()) assert.ok(cookie.includes('Max-Age=0') && cookie.includes('Secure'));
  assert.equal((await auth.withSession(req(), () => assert.fail('logged-out browser'))).status, 401);
  assert.equal((await auth.withSession(req('GET', token), () => Response.json({}))).status, 200);
});
test('missing config fails closed with generic error, and GET cannot log in/out', async () => {
  const auth = createDemoAuth(() => { throw new Error('internal configuration detail'); });
  const response = await auth.withSession(req(), () => assert.fail('must not execute'));
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'Demo authentication is unavailable.' });
  const ready = setup().auth;
  assert.equal((await ready.login(req())).status, 405); assert.equal((await ready.logout(req())).status, 405);
});

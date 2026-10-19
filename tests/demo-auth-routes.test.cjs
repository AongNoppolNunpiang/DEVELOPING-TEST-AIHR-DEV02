/* eslint-disable @typescript-eslint/no-require-imports -- Actual route modules, transpiled in memory; database imports are forbidden. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const cache = new Map();
let auth;
let databaseImports = 0;
function load(file) {
  file = path.resolve(root, file);
  if (cache.has(file)) return cache.get(file);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loadedModule = { exports: {} };
  const restrictedRequire = id => {
    if (id === '@/lib/prisma' || id === '@prisma/client') {
      if (id === '@prisma/client') return { Prisma: new Proxy({}, { get() { throw new Error('Prisma accessed before authorization'); } }) };
      databaseImports++;
      throw new Error('Database client must never load in rejected requests');
    }
    if (id === '@/lib/demo-auth-server') return { demoAuth: auth };
    if (id === 'node:crypto') return crypto;
    if (id === 'next/server') return require('next/server');
    if (id.startsWith('@/lib/')) return load('src/lib/' + id.slice(6) + '.ts');
    if (id.startsWith('./')) return load(path.relative(root, path.resolve(path.dirname(file), id + '.ts')));
    throw new Error('Unexpected dependency in isolated route test');
  };
  new Function('require', 'module', 'exports', code)(restrictedRequire, loadedModule, loadedModule.exports);
  cache.set(file, loadedModule.exports);
  return loadedModule.exports;
}
const core = load('src/lib/demo-auth.ts');
const config = core.readDemoAuthConfig({ NODE_ENV: 'production',
  DEMO_PASSWORD: crypto.randomBytes(24).toString('base64url'),
  DEMO_SESSION_SECRET: crypto.randomBytes(48).toString('base64url'),
  DEMO_APP_ORIGIN: 'https://routes.example.test', DEMO_SESSION_TTL_SECONDS: '7200' });
const now = 1900000000;
auth = load('src/lib/demo-auth-http.ts').createDemoAuth(() => config, () => now);
const routes = [];
function collect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'auth') collect(file); }
    else if (entry.name === 'route.ts') routes.push(file);
  }
}
collect(path.join(root, 'src/app/api'));
let methods = 0;
for (const file of routes) {
  const handlers = load(path.relative(root, file));
  for (const [method, handler] of Object.entries(handlers)) {
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) continue;
    methods++;
    test(`${method} ${path.relative(root, file)} rejects all invalid sessions without Prisma`, async () => {
      const expired = core.issueDemoToken(config, 'session', now - 7200);
      for (const cookie of [null, 'forged', expired]) {
        const request = new Request(config.origin + '/api/test', { method,
          headers: cookie ? { cookie: `${core.cookieName(config, 'session')}=${cookie}` } : {} });
        // Rejection must occur before params/body parsing as well as database access.
        Object.defineProperty(request, 'json', { value: () => assert.fail('body parsed before authentication') });
        const context = { get params() { assert.fail('params read before authentication'); } };
        const response = await handler(request, context);
        assert.equal(response.status, 401);
        assert.match(response.headers.get('content-type'), /application\/json/);
        assert.deepEqual(await response.json(), { error: 'Authentication required.' });
        assert.equal(databaseImports, 0);
      }
    });
    if (method !== 'GET') test(`${method} ${path.relative(root, file)} checks CSRF before Prisma`, async () => {
      const token = core.issueDemoToken(config, 'session', now);
      const request = new Request(config.origin + '/api/test', { method,
        headers: { cookie: `${core.cookieName(config, 'session')}=${token}`, origin: config.origin } });
      const response = await handler(request, { params: Promise.resolve({ id: 'never-query', thicknessId: 'never-query' }) });
      assert.equal(response.status, 403);
      assert.equal(databaseImports, 0);
    });
  }
}
test('inventory covers all 9 data route files and 14 exported methods', () => {
  assert.equal(routes.length, 9); assert.equal(methods, 14); assert.equal(databaseImports, 0);
});
test('actual auth Route Handlers delegate login, CSRF, and logout without database imports', async () => {
  const csrfRoute = load('src/app/api/auth/csrf/route.ts');
  const loginRoute = load('src/app/api/auth/login/route.ts');
  const logoutRoute = load('src/app/api/auth/logout/route.ts');
  assert.equal((await csrfRoute.GET(new Request(config.origin + '/api/auth/csrf'))).status, 200);
  assert.equal((await loginRoute.POST(new Request(config.origin + '/api/auth/login', { method: 'POST' }))).status, 403);
  assert.equal((await logoutRoute.POST(new Request(config.origin + '/api/auth/logout', { method: 'POST' }))).status, 401);
  assert.equal(databaseImports, 0);
});

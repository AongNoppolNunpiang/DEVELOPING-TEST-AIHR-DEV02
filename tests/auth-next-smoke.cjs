/* eslint-disable @typescript-eslint/no-require-imports -- Explicit opt-in isolated build/auth HTTP test. Never runs CRUD or database tools. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

async function main() {
  assert(process.argv.includes('--run'), 'Use --run explicitly; creates a temporary source/dependency copy and build.');
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const reuseIndex = process.argv.indexOf('--reuse');
  const directory = reuseIndex >= 0 ? path.resolve(process.argv[reuseIndex + 1] || '') :
    fs.mkdtempSync(path.join(os.tmpdir(), 'aihr-auth-next-'));
  if (reuseIndex >= 0) {
    assert.equal(path.dirname(directory).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
    assert(/^aihr-auth-next-[A-Za-z0-9]+$/.test(path.basename(directory)));
    assert(!fs.lstatSync(directory).isSymbolicLink());
    assert.equal(fs.readFileSync(path.join(directory, 'package-lock.json'), 'utf8'), fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    assert(!fs.readdirSync(directory).some(n => /^\.env(?:\.|$)/.test(n)), 'Refuse reuse containing env files');
    assert(fs.existsSync(path.join(directory, 'node_modules/next/dist/bin/next')));
  }
  console.log(JSON.stringify({ phase: 'isolated-copy', directory, port, originalEnvCopied: false }));
  const include = ['src', 'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts', 'eslint.config.mjs', 'postcss.config.mjs'];
  for (const name of include) fs.cpSync(path.join(root, name), path.join(directory, name), { recursive: true,
    filter: file => !/^\.env(?:\.|$)|\.backup|^\.npmrc$/.test(path.basename(file)) });
  fs.mkdirSync(path.join(directory, 'prisma'), { recursive: true });
  fs.copyFileSync(path.join(root, 'prisma/schema.prisma'), path.join(directory, 'prisma/schema.prisma'));
  // Copy installed dependencies without running installation/postinstall scripts.
  // No junction: Turbopack must resolve dependencies entirely inside this copy.
  if (reuseIndex < 0) fs.cpSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), { recursive: true,
    filter: file => !/^\.env(?:\.|$)|^\.npmrc$/.test(path.basename(file)) });
  console.log(JSON.stringify({ phase: 'copy-complete', envFilesPresent: fs.readdirSync(directory).some(n => /^\.env(?:\.|$)/.test(n)) }));
  const safeEnv = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'COMSPEC', 'PATHEXT', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE']) {
    if (process.env[key] !== undefined) safeEnv[key] = process.env[key];
  }
  Object.assign(safeEnv, { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', CI: '1',
    DEMO_PASSWORD: crypto.randomBytes(24).toString('base64url'),
    DEMO_SESSION_SECRET: crypto.randomBytes(48).toString('base64url'),
    DEMO_APP_ORIGIN: 'https://auth-smoke.example.test', DEMO_SESSION_TTL_SECONDS: '7200', AUTH_SMOKE_PORT: String(port),
    NODE_OPTIONS: `--require "${path.join(__dirname, 'auth-network-guard.cjs').replaceAll('\\', '/')}"` });
  assert(!('DATABASE_URL' in safeEnv));
  const next = path.join(directory, 'node_modules/next/dist/bin/next');
  let server;
  let output = '';
  let checks = 0;
  function launch(args) {
    const child = spawn(process.execPath, [next, ...args], { cwd: directory, env: safeEnv, windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', b => { output = (output + b).slice(-16000); });
    child.stderr.on('data', b => { output = (output + b).slice(-16000); });
    return child;
  }
  try {
    console.log(JSON.stringify({ phase: 'production-build', databaseUrlProvided: false, nodeNetworkGuard: true }));
    const build = launch(['build']);
    const code = await new Promise((resolve, reject) => { build.once('error', reject); build.once('exit', resolve); });
    if (code !== 0) throw new Error('Production build failed.');
    console.log(JSON.stringify({ phase: 'production-build', passed: true }));
    let clientAssets = 0;
    function checkClientAssets(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) checkClientAssets(file);
        else {
          const bytes = fs.readFileSync(file);
          assert(!bytes.includes(Buffer.from(safeEnv.DEMO_PASSWORD)) && !bytes.includes(Buffer.from(safeEnv.DEMO_SESSION_SECRET)), 'Credential in client build output');
          clientAssets++;
        }
      }
    }
    checkClientAssets(path.join(directory, '.next/static'));
    console.log(JSON.stringify({ phase: 'client-assets', scanned: clientAssets, ephemeralCredentialsAbsent: true }));
    output = '';
    server = launch(['start', '-H', '127.0.0.1', '-p', String(port)]);
    const base = 'http://127.0.0.1:' + port;
    const origin = safeEnv.DEMO_APP_ORIGIN;
    const cookie = (r, name) => r.headers.getSetCookie().find(s => s.startsWith(name + '='))?.split(';')[0];
    const get = (url, options = {}) => fetch(base + url, { redirect: 'manual', signal: AbortSignal.timeout(15000), ...options });
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (server.exitCode !== null || server.signalCode !== null) throw new Error('Isolated server exited before readiness.');
      // Startup is observed from this child, not by contacting an unrelated port.
      if (/Ready in/.test(output)) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert(ready, 'Server readiness timeout');
    const challengeResponse = await get('/api/auth/csrf');
    assert.equal(challengeResponse.status, 200);
    const challengeCookie = cookie(challengeResponse, '__Host-demo-login');
    assert(challengeCookie, 'Missing challenge cookie');
    // Cryptographically verify this response belongs to the freshly launched
    // instance, using its ephemeral secret; never print the token or secret.
    const coreExports = {};
    const coreCode = ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/demo-auth.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    new Function('require', 'exports', coreCode)(require, coreExports);
    assert(coreExports.verifyDemoToken(challengeCookie.slice(challengeCookie.indexOf('=') + 1),
      coreExports.readDemoAuthConfig(safeEnv), 'login', Math.floor(Date.now() / 1000)));
    const csrfToken = (await challengeResponse.json()).csrfToken;
    for (const url of ['/', '/lines/never-query']) {
      const response = await get(url); assert.equal(response.status, 307);
      assert(new URL(response.headers.get('location'), base).pathname === '/login'); checks++;
    }
    const loginPage = await get('/login'); assert.equal(loginPage.status, 200); assert((await loginPage.text()).includes('AIHR Demo Login')); checks++;
    const routes = [
      ['/api/dashboard', ['GET']], ['/api/lines', ['POST']], ['/api/lines/never-query', ['GET', 'PUT', 'DELETE']],
      ['/api/lines/never-query/cmls', ['POST']], ['/api/cmls/never-query', ['PUT', 'DELETE']],
      ['/api/cmls/never-query/test-points', ['POST']], ['/api/test-points/never-query', ['PUT', 'DELETE']],
      ['/api/test-points/never-query/thicknesses', ['POST']], ['/api/test-points/never-query/thicknesses/never-query', ['PUT', 'DELETE']],
    ];
    for (const [url, methods] of routes) for (const method of methods) {
      const response = await get(url, { method }); assert.equal(response.status, 401);
      assert.equal((await response.json()).error, 'Authentication required.'); checks++;
    }
    for (const method of ['HEAD', 'OPTIONS', 'PATCH']) { assert.equal((await get('/api/lines/never-query', { method })).status, 401); checks++; }
    const loginHeaders = { Cookie: challengeCookie, Origin: origin, 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' };
    assert.equal((await get('/api/auth/login', { method: 'POST', headers: { ...loginHeaders, Origin: 'https://foreign.example.test' }, body: JSON.stringify({ password: safeEnv.DEMO_PASSWORD }) })).status, 403); checks++;
    assert.equal((await get('/api/auth/login', { method: 'POST', headers: loginHeaders, body: JSON.stringify({ password: 'incorrect-input' }) })).status, 401); checks++;
    const login = await get('/api/auth/login', { method: 'POST', headers: loginHeaders, body: JSON.stringify({ password: safeEnv.DEMO_PASSWORD }) });
    assert.equal(login.status, 200); const session = cookie(login, '__Host-demo-session'); assert(session); checks++;
    // SSR is safe: these client pages fetch data only in browser effects. No
    // browser or authenticated data API is invoked by this HTTP-only test.
    for (const url of ['/', '/lines/never-query']) { assert.equal((await get(url, { headers: { Cookie: session } })).status, 200); checks++; }
    for (const [url, methods] of routes) for (const method of methods.filter(m => m !== 'GET')) {
      assert.equal((await get(url, { method, headers: { Cookie: session, Origin: origin } })).status, 403); checks++;
    }
    assert.equal((await get('/api/dashboard', { headers: { Cookie: '__Host-demo-session=forged' } })).status, 401); checks++;
    const expired = coreExports.issueDemoToken(coreExports.readDemoAuthConfig(safeEnv), 'session', Math.floor(Date.now() / 1000) - 7201);
    assert.equal((await get('/api/dashboard', { headers: { Cookie: '__Host-demo-session=' + expired } })).status, 401); checks++;
    const tokenResponse = await get('/api/auth/csrf', { headers: { Cookie: session } });
    const sessionCsrf = (await tokenResponse.json()).csrfToken;
    assert.equal((await get('/api/lines/never-query', { method: 'DELETE', headers: { Cookie: session, Origin: 'https://foreign.example.test', 'X-CSRF-Token': sessionCsrf } })).status, 403); checks++;
    assert.equal((await get('/api/lines/never-query', { method: 'DELETE', headers: { Cookie: session, 'X-CSRF-Token': sessionCsrf } })).status, 403); checks++;
    assert.equal((await get('/api/auth/logout', { method: 'POST', headers: { Cookie: session, Origin: origin } })).status, 403); checks++;
    const logout = await get('/api/auth/logout', { method: 'POST', headers: { Cookie: session, Origin: origin, 'X-CSRF-Token': sessionCsrf } });
    assert.equal(logout.status, 200); assert(logout.headers.getSetCookie().every(s => s.includes('Max-Age=0'))); checks++;
    assert.equal((await get('/api/dashboard')).status, 401); checks++;
    // Document stateless revocation limits without invoking a data API.
    assert.equal((await get('/', { headers: { Cookie: session } })).status, 200); checks++;
    console.log(JSON.stringify({ phase: 'next-http-auth', passed: true, checks, authorizedDataApiRequests: 0, databaseUrlProvided: false }));
  } catch (error) {
    // No request/response headers or credential values are ever printed.
    const redact = s => String(s).split(safeEnv.DEMO_PASSWORD).join('[REDACTED]').split(safeEnv.DEMO_SESSION_SECRET).join('[REDACTED]');
    console.error(JSON.stringify({ passed: false, checks, error: redact(error.message), diagnostic: redact(output) }));
    process.exitCode = 1;
  } finally {
    if (server && server.exitCode === null && server.signalCode === null) {
      server.kill();
      await new Promise(resolve => { if (server.exitCode !== null || server.signalCode !== null) resolve(); else server.once('exit', resolve); });
    }
    console.log(JSON.stringify({ phase: 'finished', serverStopped: !server || server.exitCode !== null || server.signalCode !== null, temporaryCopyRetained: directory }));
  }
}
if (require.main === module) main().catch(() => { console.error('Isolated auth setup failed; no database commands were run.'); process.exitCode = 1; });

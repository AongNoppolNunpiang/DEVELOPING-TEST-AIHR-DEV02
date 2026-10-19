/* eslint-disable @typescript-eslint/no-require-imports -- Browser fetch mocked entirely in memory. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/authenticated-fetch.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
} }).outputText;
function setup(responses) {
  const calls = [], redirects = [], api = {};
  const window = { location: { origin: 'https://client.example.test', replace: url => redirects.push(url) } };
  const fetch = async (url, init) => { calls.push({ url, init }); assert(responses.length); return responses.shift(); };
  new Function('exports', 'fetch', 'window', code)(api, fetch, window);
  return { fetch: api.authenticatedFetch, calls, redirects };
}
test('GET uses same-origin cookies/no-store and preserves cancellation', async () => {
  const s = setup([Response.json({})]); const signal = new AbortController().signal;
  await s.fetch('/api/dashboard', { signal });
  assert.equal(s.calls.length, 1); assert.equal(s.calls[0].init.credentials, 'same-origin');
  assert.equal(s.calls[0].init.cache, 'no-store'); assert.equal(s.calls[0].init.signal, signal);
});
for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) test(`${method} obtains CSRF before mutation`, async () => {
  const s = setup([Response.json({ csrfToken: 'unit-test-csrf' }), Response.json({})]);
  await s.fetch('/api/lines/test', { method, headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(s.calls[0].url, '/api/auth/csrf'); assert.equal(s.calls[1].init.method, method);
  assert.equal(s.calls[1].init.headers.get('x-csrf-token'), 'unit-test-csrf');
  assert.equal(s.calls[1].init.headers.get('content-type'), 'application/json');
});
test('external/protocol-relative URLs rejected before any fetch', async () => {
  const s = setup([]);
  for (const url of ['https://foreign.example.test/api', '//foreign.example.test/api', 'javascript:alert(1)']) {
    await assert.rejects(() => s.fetch(url, { method: 'DELETE' }), /same-origin/);
  }
  assert.equal(s.calls.length, 0);
});
test('CSRF failure prevents mutation request', async () => {
  const s = setup([Response.json({}, { status: 503 })]);
  await assert.rejects(() => s.fetch('/api/lines', { method: 'POST' }), /Unable to verify/);
  assert.equal(s.calls.length, 1);
});
test('401 redirects via full navigation rather than returning stale protected data', async () => {
  const s = setup([Response.json({}, { status: 401 })]);
  await assert.rejects(() => s.fetch('/api/dashboard'), /session has expired/);
  assert.deepEqual(s.redirects, ['/login']);
});

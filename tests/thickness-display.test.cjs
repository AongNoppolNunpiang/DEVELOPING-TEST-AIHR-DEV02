/* eslint-disable @typescript-eslint/no-require-imports -- In-memory source tests with synthetic Prisma and React state; no database or network. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

test('Forms do not invent positive/non-negative constraints absent from the specification', () => {
  for (const file of ['src/components/dashboard-client.tsx','src/components/line-detail-client.tsx']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.doesNotMatch(source, /\bmin=/);
  }
});

test('CML number suggestion uses an unused number, not the count of existing CMLs', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/components/line-detail-client.tsx'), 'utf8');
  assert.match(source, /while \(usedNumbers\.has\(suggestedNumber\)\) suggestedNumber\+\+/);
  assert.doesNotMatch(source, /cmlNumber: String\(\(line\?\.cmls\.length/);
});

function load(file, dependencies = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loadedModule = { exports: {} };
  const restrictedRequire = id => {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    // No real Prisma import, fetch, environment loading, or other dependency.
    throw new Error(`Unexpected dependency in isolated display test: ${id}`);
  };
  new Function('require', 'module', 'exports', output)(restrictedRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

async function dashboard(thickness) {
  const records = [{ id: 'synthetic-line', lineNumber: 'TEST-THICKNESS-DISPLAY',
    location: 'Synthetic', fromLocation: 'A', toLocation: 'B', service: 'Mock', material: 'Mock',
    pipeSize: 6, originalThickness: 8,
    cmls: [{ testPoints: [{ thicknesses: thickness === null ? [] : [{
      inspectionDate: new Date('2026-10-19T00:00:00Z'),
      actualThickness: {
        toFixed(scale) { assert.equal(scale, 3); return thickness; },
        valueOf() { assert.fail('Stored Decimal must not be converted to Number'); },
      },
    }] }] }] }];
  let reads = 0;
  const count = async () => { reads++; return 1; };
  const prisma = { info: { count, findMany: async () => { reads++; return records; } },
    cml: { count }, testPoint: { count }, thickness: { count } };
  const route = load('src/app/api/dashboard/route.ts', {
    '@/lib/demo-auth-server': { demoAuth: { withSession: (_request, handler) => handler() } },
    '@/lib/prisma': { prisma }, 'next/server': require('next/server'),
  });
  const response = await route.GET({ nextUrl: new URL('http://localhost/api/dashboard') });
  assert.equal(response.status, 200); assert.equal(reads, 5);
  return response.json();
}

function renderDashboard(data, { formOpen = false, editingId = null, jointEfficiency, operatingTemperature } = {}) {
  let index = 0;
  // Render the existing shared Add/Edit form without effects, HTTP, or Prisma.
  const states = [data, '', false, '', 0, formOpen, editingId];
  const component = load('src/components/dashboard-client.tsx', {
    'react': { ...React, useState(initial) {
      const position = index++;
      const value = position === 7
        ? { ...initial, ...(jointEfficiency === undefined ? {} : { jointEfficiency }),
          ...(operatingTemperature === undefined ? {} : { operatingTemperature }) }
        : position < states.length ? states[position] : initial;
      return [value, () => {}];
    }, useEffect() {}, useCallback: callback => callback },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': ({ children, href }) => React.createElement('a', { href }, children),
    '@/lib/authenticated-fetch': { authenticatedFetch() { assert.fail('No network in display tests'); } },
    '@/components/logout-button': { LogoutButton: () => null },
  }).default;
  return renderToStaticMarkup(React.createElement(component));
}

for (const editingId of [null, 'synthetic-line']) {
  for (const operatingTemperature of ['73', '73.27', '0.01', '-73.27', '9999999999.999']) {
    test(`${editingId ? 'Edit' : 'Add'} form retains decimal temperature text ${operatingTemperature}`, () => {
      const html = renderDashboard({ summary: { lineCount: 0, cmlCount: 0, testPointCount: 0, thicknessCount: 0 }, lines: [] },
        { formOpen: true, editingId, operatingTemperature });
      const label = (html.match(/<label\b[^>]*>[\s\S]*?<\/label>/g) ?? [])
        .find(label => label.includes('Operating Temperature'));
      assert.ok(label);
      const input = label.match(/<input\b[^>]*>/)?.[0];
      assert.ok(input);
      assert.match(input, /\stype="number"/);
      assert.match(input, /\sstep="any"/);
      assert.doesNotMatch(input, /\s(?:min|max)=/);
      assert.ok(input.includes(`value="${operatingTemperature}"`));
    });
  }
}

for (const editingId of [null, 'synthetic-line']) {
  for (const jointEfficiency of ['1', '0', '-1', '2', '100']) {
    test(`${editingId ? 'Edit' : 'Add'} form specifies integer Joint Efficiency without a 0–1 range (${jointEfficiency})`, () => {
      const html = renderDashboard({ summary: { lineCount: 0, cmlCount: 0, testPointCount: 0, thicknessCount: 0 }, lines: [] },
        { formOpen: true, editingId, jointEfficiency });
      assert.ok(html.includes(editingId ? 'Edit Pipe Line' : 'Add Pipe Line'));
      const labels = (html.match(/<label\b[^>]*>[\s\S]*?<\/label>/g) ?? [])
        .filter(label => label.includes('Joint Efficiency'));
      assert.equal(labels.length, 1);
      assert.ok(labels[0].includes('<span>Joint Efficiency <b>'));
      assert.doesNotMatch(labels[0], /0\s*[-–]\s*1/);
      const input = labels[0].match(/<input\b[^>]*>/)?.[0];
      assert.ok(input);
      assert.match(input, /\stype="number"/);
      assert.match(input, /\sstep="1"/);
      assert.doesNotMatch(input, /\s(?:min|max)=/);
      assert.ok(input.includes(`value="${jointEfficiency}"`));
    });
  }
}

for (const thickness of ['7.125', '6.789', '0.001', '0.000', '7.100', '8.000', '99999.999', '-99999.999']) {
  test(`Dashboard API and rendered UI preserve stored thickness ${thickness}`, async () => {
    const data = await dashboard(thickness);
    assert.equal(data.lines[0].latestInspection.thickness, thickness);
    assert.equal(typeof data.lines[0].latestInspection.thickness, 'string');
    assert.equal(data.lines[0].latestInspection.date, '2026-10-19');
    assert.ok(renderDashboard(data).includes(`<strong>${thickness} mm</strong>`));
  });
}

test('No inspection remains null; UI does not invent a zero thickness', async () => {
  const data = await dashboard(null);
  assert.equal(data.lines[0].latestInspection, null);
  const html = renderDashboard(data);
  assert.ok(!html.includes('<strong>0.000 mm</strong>'));
});

const { parseThicknessInput } = load('src/lib/thickness-validation.ts');
test('Existing validation preserves supported decimal precision, not integer coercion', () => {
  for (const [input, expected] of [['7.125', '7.125'], [7.125, '7.125'], ['6.78', '6.780'],
    ['0.001', '0.001'], ['-99999.999', '-99999.999'], ['99999.999', '99999.999']]) {
    assert.equal(parseThicknessInput({ inspectionDate: '2026-10-19', actualThickness: input }).actualThickness, expected);
  }
});
test('Existing validation rejects excess precision/range instead of rounding for display', () => {
  for (const actualThickness of ['7.1251', '99999.9999', '100000', '-100000', true, null]) {
    assert.throws(() => parseThicknessInput({ inspectionDate: '2026-10-19', actualThickness }));
  }
});

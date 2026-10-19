# DEVELOPING-TEST-AIHR-DEV02

Next.js piping-inspection application backed by PostgreSQL and Prisma:
Info → CML → TestPoint → Thickness. All data APIs use real Prisma queries.

## Prerequisites

- Verified locally: Node.js 22.17.1, npm 10.9.2, PostgreSQL 16.15,
  Next.js 16.4.2, Prisma Client/CLI 6.19.3.
- Use `package-lock.json` and `npm ci`; development dependencies are needed to build.
- Python 3 (standard library only) is optional, needed only to prepare authorized
  company sample data from the original workbook. It is not needed to run the app.

## Install and configure a NEW database

1. Clone the repository after access and publication rights are approved.
2. Provision a separate PostgreSQL database and role. Confirm its identity and
   permissions before running schema/data commands. Never reuse the original Dev
   database on port 5434. Port 5435 is reserved for an existing isolated local test
   database; do not create another container or replace its volume automatically.
3. Copy `.env.example` only if `.env` does not already exist:

   ```powershell
   if (Test-Path -LiteralPath '.env') { throw 'Existing .env: do not overwrite' }
   Copy-Item -LiteralPath '.env.example' -Destination '.env'
   ```

4. Privately replace placeholders with the NEW database's connection information.
   URL-encode reserved password characters. Never print, commit or share the URL.
   The example is a template, not working credentials or a verified database.

Required server-side keys:

| Key | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL URL, including the selected database and `schema=public` |
| `DEMO_PASSWORD` | Shared demo password, 16–256 UTF-8 bytes |
| `DEMO_SESSION_SECRET` | Independent random signing secret, 32–1024 bytes |
| `DEMO_APP_ORIGIN` | Exact application origin, no trailing slash; HTTPS in production |
| `DEMO_SESSION_TTL_SECONDS` | `7200` (two hours) |

Never use `NEXT_PUBLIC_` for these keys. Keep Dev, local Test, Preview and
Production database targets, origins and secrets separate. Local HTTP works only
in development on localhost/loopback; production authentication requires HTTPS.

Run each step separately and stop on a nonzero exit code:

```powershell
npm ci
npm run prisma:generate
```

After the administrator confirms the NEW database target, apply the existing
migrations, not generated/reset migrations:

```powershell
npx prisma migrate deploy
npx prisma migrate status
```

The initial migration creates all four tables and constraints. The second changes
`info.operating_temperature` from INTEGER to DECIMAL(13,3). Both are applied and
verified on the isolated local Test database, NOT on an intended Neon/production
database. Existing integers fit the new type. ALTER TYPE can lock/rewrite the
table, so schedule production changes separately. Never run reset, db push, seed
or migrate dev casually against a database containing data.

## Optional authorized company samples (separate from migration)

The application works with an empty database. Company workbooks and sample JSON
are deliberately ignored and must be transferred separately only to authorized
recipients. Private GitHub visibility is not permission to distribute them.

To prepare data locally, place the authorized original workbook in the project
root, or provide its path explicitly:

```powershell
python scripts-export-seed.py --workbook '<AUTHORIZED_WORKBOOK_PATH>'
node prisma/seed.cjs
```

The second command previews counts without connecting to a database. The exporter
creates ignored `prisma/company-seed-data.json` and
`prisma/company-seed-provenance.json`; it does not modify the workbook or legacy
`prisma/seed-data.json`. It refuses to overwrite a different generated dataset.

For an approved NEW/Demo target, configure `DATABASE_URL` privately in the seed
process environment. The standalone seed does not load `.env`. Set the following
non-secret confirmation keys to that exact URL's destination:

```powershell
$env:SEED_EXPECTED_HOST = '<VERIFIED_HOST>'
$env:SEED_EXPECTED_PORT = '<VERIFIED_PORT>'
$env:SEED_EXPECTED_DATABASE = '<VERIFIED_DATABASE_NAME>'
$env:SEED_CONFIRM_DATABASE = '<SAME_VERIFIED_DATABASE_NAME>'
node prisma/seed.cjs --apply
```

Only `--apply` enables writes. The seed rejects the original local Dev port 5434,
verifies the database/schema, and inserts in foreign-key order in one Serializable
transaction. Matching existing records are preserved; differing records cause a
conflict and full rollback, not an update/reset. A repeated run was verified with
zero inserts, zero overwrites, and unchanged table hashes. No automatic retry is
performed on transaction failures. Review concurrent seed/API conflicts before
rerunning. `db:seed` remains opt-in; migration never seeds automatically.

The sample workbook contains 5 Info, 9 CML, 36 TestPoint and 72 Thickness records.
The exporter preserves decimal strings, dates, blank CML calculation fields and
relationships. The only explicit displayed-value normalization is the authorized
Operating Temperature artifact in Sample Info Data S7:S9: raw
`73.270000000000039` is imported as `73.27`, with provenance retained. This is NOT
a company engineering rounding rule or blanket rounding of sample data.

## Run, checks and build

```powershell
npm run dev
```

Log in at `/login`. Stop the server normally with Ctrl+C after use. Protect the
local server's network exposure; the normal CLI can be bound to loopback:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3000
```

On a fresh checkout:

```powershell
npx next typegen
npx tsc --noEmit --incremental false
npm run lint
npm test
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

`npm run build` explicitly generates Prisma Client and uses Next's Webpack build.
Do not describe this as a verified default Turbopack build. `npm test` runs the
four repository-safe auth/route/display test files. Full-workspace verification
also runs the calculation and Operating Temperature tests (187 tests after the
latest two UI regressions). Some full-workspace tests depend on private legacy
sample JSON and must not be included/shared without permission. Passing mock/unit
tests does not prove PostgreSQL or Browser CRUD.

## Deployment preparation (not an authorization to deploy)

1. Approve the source allowlist and intended recipients. Prefer private repository
   access while company-derived formulas/data publication rights are unresolved.
2. Verify the separate hosted PostgreSQL project/branch/database and owner. Do not
   assume a branch called production is empty. Never use the local Dev database.
3. Configure server-side environment keys above on Hosting. Set the exact HTTPS
   Demo origin and independent secrets for each deployment environment.
4. Install with `npm ci`; build with `npm run build`; Next.js handles the hosted
   start/runtime. Apply `prisma migrate deploy` once in an approved release step,
   NOT from a request handler, every app startup, or a seed script.
5. For a provider with pooled and direct URLs, use the provider's supported runtime
   pool URL and an explicitly selected migration/admin URL in that command's
   process environment. This schema has only `DATABASE_URL`; no `DIRECT_URL` is
   currently wired. A DATABASE_URL override must be scoped to the intended
   process, never replace the original workspace's environment implicitly.
6. Transfer company sample data through an approved private channel only, then
   explicitly authorize/configure the optional seed on the confirmed Demo target.
7. Verify HTTPS login/cookie flags, dashboard, all CRUD and cleanup on the actual
   hosted environment. No verified public Demo URL or production deployment is
   claimed by the local tests.

## Implemented behavior and documented limitations

- CRUD, duplicate/missing-parent validation, signed two-hour sessions, CSRF/Origin
  checks, and API parent-deletion guards are implemented. Deletion is leaf-first;
  parent APIs reject children rather than relying on database cascades.
- Joint Efficiency remains INTEGER with integer UI steps; no invented 0–1 range.
- Thickness uses Decimal(8,3); Operating Temperature uses Decimal(13,3).
  Prefer decimal strings in API requests: JSON numeric literals pass through JS
  Number before validation. Storage precision is not an engineering rounding rule.
- Database-sheet integer declarations conflict with decimal sample values for
  several fields. The retained schema and the Operating Temperature change are
  development decisions, not company approval. Missing units/precision/rules
  require company confirmation.
- Calculation preview implements only the supplied exact OD lookup, explicit
  Structural bands, Design formula and Required MAX. It does not overwrite saved
  CML values, interpolate, fill Structural gaps or round nonterminating results.
  Input units, efficiency scale and engineering outputs still need confirmation;
  no corrosion-rate/remaining-life formula is invented.
- Stateless logout clears this browser, not copied cookies. Secret rotation
  invalidates all sessions; password changes alone do not. No distributed login
  rate limiter, individual accounts or per-session revocation is claimed.
- Recorded dependency findings remain unresolved: braces 3.0.3 and deepmerge-ts
  7.1.5 chains previously produced 8 high affected packages. No dependency fix or
  latest advisory re-audit is claimed in this implementation. Passing tests/build
  does not establish absence of exploitable vulnerabilities.

## Delivery allowlist and data restrictions

### Latest local verification (19 October 2026)

- TypeScript without incremental cache, final ESLint (no warnings), all 187
  full-workspace tests and all 92 repository-safe tests passed.
- The actual package build script (Prisma generation + Webpack) passed in an
  isolated source copy with database/network/environment-file access blocked.
- Company seed matched 5/9/36/72 source records; a repeat inserted/overwrote zero
  rows and preserved table hashes.
- 42 unique authenticated/unauthenticated HTTP/API cases passed against local
  Test PostgreSQL, including CRUD and parent-delete protection. One run stopped
  on a transport error; the known fixture IDs were resumed and cleaned safely.
  This is not a claim of one uninterrupted run. Sample rows stayed unchanged.
- A real browser verified login rendering, wrong-password feedback and protected
  page redirect. Successful browser login/full UI CRUD, production HTTPS,
  hosted deployment and a fresh clone of the final delivery set are NOT verified.
- Test servers were stopped normally; no CRUD fixtures remained. The company
  sample seed intentionally remains only in the authorized Test database.

Install/build source: root package/lock/config files, `.env.example`, `.gitignore`,
README/AGENTS, all `src/` files including `src/lib/excel-calculations.ts`, Prisma
schema and both migration folders plus migration_lock.toml. Repository-safe tests
are those referenced by `npm test`, with their existing smoke/network support.
The generic seed/export scripts contain no embedded sample rows and may be
delivered after review; the workbook and JSON must be supplied separately if
authorized. Source calculations and migration comments remain company-derived
logic requiring publication-rights review even in a private repository.

Do not publish `.env`, credentials, workbook/sample JSON, provenance, backups,
reports/logs, generated clients/build output or local mutation scripts by default.
Do not use `git add .`. No Git stage/commit/push, visibility change or deployment
is performed by these instructions.

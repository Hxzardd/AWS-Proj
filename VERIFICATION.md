# Verification — VectorPay demo

Run 2026-09-23 on Windows 11 / PowerShell, continuing from `NEXT_LLM_HANDOFF.md`.
This records what was actually executed this session and observed to pass. It is not a
claim of production readiness or exhaustive testing. All traffic and AWS-shaped metrics
remain synthetic.

## Environment recovered

- Docker Desktop was down at session start (Linux engine pipe unavailable). Restarted it;
  engine came up at server version **29.5.3**.
- `docker compose up -d --wait mysql redis` → both healthy, **volumes preserved**
  (no `down --volumes`, no reseed of the saved Q-table):
  - `api-optimizer-demo-mysql-1` (mysql:8.4) — healthy
  - `api-optimizer-demo-redis-1` (redis:7.4-alpine) — healthy
- No listener was on port 3000 at start. A demo dev server is now running there (see the
  "Live demo server" section below).

## Failures resolved this session

1. **Playwright alert selector ambiguity** (the outstanding failure named in the handoff).
   `e2e/demo.spec.ts:84` asserted on `getByRole("alert")`, which matches both the app's
   password error and Next.js's route announcer. Scoped it to the app's own error node:
   ```diff
   - await expect(page.getByRole("alert")).toContainText("Incorrect admin password");
   + await expect(page.locator("#admin-password-error")).toContainText("Incorrect admin password");
   ```
   The element (`components/settings-console.tsx:28`) has `id="admin-password-error"`.
   Application authentication was **not** changed. Test #8 now passes.

2. **Missing Playwright browser binary.** The suite first failed on all 8 tests with
   `chrome-headless-shell.exe` not found (Playwright had been updated since the prior
   session). Fixed by `npx playwright install chromium` → Chrome for Testing 153.0.8010.12
   (playwright chromium v1243). No source change.

## Commands run and observed results

| Command | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | Passed, no errors |
| `npm run lint` | ESLint: No issues found |
| `npm test` (vitest 4.1.11) | **51 passed, 2 skipped** (storage skipped in ordinary run) |
| `npm run test:storage` | **2 passed** (DB-backed) |
| `prisma generate` | Prisma Client v6.19.3 generated |
| `prisma migrate status` | 2 migrations found; schema up to date |
| `npm run build` (Next.js 16.3.5) | Passed; 9 routes incl. `/dashboard/lab` |
| `npm run test:e2e` (Playwright) | **8 passed (31.2s)** |

### e2e breakdown (all green)

1. learning lab trains, pauses, replays and exports actual evidence (12.7s)
2. custom traffic validation and recovery (724ms)
3–6. lab fits 375 / 768 / 1024 / 1440 px, keyboard nav + reduced motion
7. health and database-backed control loop smoke (6.7s) — `/api/health` returns
   `{ database: true, redis: true }`; comparison runs and stops
8. saved live loop makes decisions and admin login rejects an incorrect password (1.8s)
   — the fixed assertion

## Code change

- `e2e/demo.spec.ts` — one line, the selector fix above. No other files were modified.

## Live demo server (P0 #5, #9)

- `npm run demo` bootstrap runs cleanly: `docker compose up -d --wait mysql redis`,
  `docker compose stop app`, `prisma generate`, `prisma migrate deploy`, `prisma/seed.ts`,
  then `next dev` on `127.0.0.1:3000`. `USE_REAL_AWS=false` is forced by the script.
- The seed is non-destructive: `appSetting.upsert({ update: {} })` only fills missing keys,
  and the Q-table is trained/inserted **only when empty** (`qTableEntry.count() === 0`).
  Existing settings and the saved Q-table were preserved.
- **A dev server is left running on port 3000** (the presentation deliverable). Verified:
  `/api/health` → `{"status":"ok","checks":{"database":true,"redis":true}}`, and all routes
  return 200: `/`, `/dashboard`, `/dashboard/lab`, `/dashboard/agent`, `/dashboard/compare`,
  `/dashboard/logs`, `/settings`.

## Docker image build + container smoke test (P0 #6)

- `docker compose build app` succeeded → image `api-optimizer-demo-app:latest` (2.06 GB;
  large because the runner stage copies full `node_modules`).
- Smoke test: briefly stopped the host dev server, ran `docker compose up -d app` on 3000
  (compose supplies the correct in-network `DATABASE_URL` → `mysql:3306`), verified, then
  stopped it and restored the dev server — never two servers on 3000 at once.
- Container behaved correctly: `migrate deploy` → "No pending migrations", `db:seed` ran
  (non-destructive), `next start` → Ready. `/api/health` = 200 and **all routes returned 200
  with real content** (`/dashboard/lab` renders "See learning happen").
- **Known cosmetic warning (not fixed, deliberately):**
  `⚠ "next start" does not work with "output: standalone" configuration.` Despite the wording
  the container works fully. Converting to the true standalone entrypoint
  (`node .next/standalone/server.js`) is **not** a small change: the standalone bundle omits
  the Prisma CLI and `tsx` that the container CMD needs for `migrate deploy` + `db:seed`, so a
  conversion would risk the seed/migration flow. Left as a P2 image-size optimization rather
  than redesigning a working container to silence a warning.
- Container was stopped after the test (`Exited 143`, i.e. clean SIGTERM); image preserved.

## Not run this session

- `npm run demo:backtest` / timed backtest — not re-run; prior artifacts in `outputs/` are
  from earlier runs and should not be mixed with the lab experiment numbers.

## Artifact locations

- Playwright HTML report: `playwright-report/`
- Per-test traces/screenshots (on failure): `test-results/`
- Lab/viewport screenshots refreshed by the suite: `outputs/demo/`
- Prior measured results: `outputs/demo/report.md`, `outputs/demo/evidence.json`,
  `outputs/backtest-latest.{json,md}`

## Standing limitations (unchanged from handoff)

- Observations are synthetic; "P95" is mean interval P95, not a percentile over raw
  requests. Costs are model assumptions, not AWS bills.
- Real AWS stays disabled (`USE_REAL_AWS=false`); adapters are not a production control loop.

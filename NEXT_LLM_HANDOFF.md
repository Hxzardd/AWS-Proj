# Next LLM handoff — VectorPay

Prepared 2026-09-23. This is a continuation brief, not a claim that all work is complete.

## Mission and user intent

The user asked to finish this college project, test it thoroughly (unit, smoke, regression, backtest), and supply custom simulated AWS-style traffic so a professor can see the engine learning and improving before real AWS credentials are introduced. They requested at least 60% implementation and a presentation-ready demonstration. They now want another LLM to continue.

Continue from the existing implementation. Prioritize a reliable demonstration, reproducible evidence, and honest scope reporting. Do not redesign the product or replace the engine. Do not claim production AWS readiness, exhaustive testing, or a completion percentage without defining the denominator.

## Workspace and working rules

Repository root:

```text
C:\Users\Lenovo\Documents\Codex\2026-08-04\project-title-autonomous-api-performance-optimization
```

- Windows / PowerShell; Node 24.13.1 was observed locally. Docker uses Node 22 Alpine.
- Filesystem access is now unrestricted. An earlier read-only restriction was removed.
- Read `DEMO.md`, `README.md`, `package.json`, and this file first. Inspect applicable `AGENTS.md` if present; none was found in the workspace ancestor chain in this session.
- Keep real AWS disabled. This task does not authorize using live credentials or changing AWS infrastructure.
- Preserve MySQL/Redis volumes and existing runs/Q-values. Never use `docker compose down --volumes` or reset the saved Q-table as routine setup.
- `.env` contains local secrets. Do not print or commit it. The prior file was backed up as `.env.before-demo`, also ignored.
- Almost the entire project is **untracked**, including the original implementation. Do not infer that every untracked file was created in the last session; do not clean or discard anything.
- Git reports dubious ownership under the current Windows user. For inspection, use the command-scoped override below rather than changing global configuration:

```powershell
git -c safe.directory=C:/Users/Lenovo/Documents/Codex/2026-08-04/project-title-autonomous-api-performance-optimization status --short
```

## Current environment — recheck before proceeding

As of the final 2026-09-23 check:

- Docker CLI exists, but its Linux engine pipe is unavailable. `docker compose ps` fails. Docker Desktop needs to be running before storage or container tests can continue.
- No listener on port 3000 was found.
- Prior tool process IDs no longer exist. Do not try to reuse them.
- A Docker image build was started but its completion was **not observed**. Recheck/rebuild; do not report it as passing.
- Earlier, MySQL and Redis were healthy and the app was successfully exercised on a local production Next.js server.
- The old Compose `app` container was stopped to free port 3000; its database/cache containers and volumes were preserved.
- The host `.env` database URL was repaired after verifying the Compose-configured MySQL account. It now points to the local Compose database. `USE_REAL_AWS=false` was set; the stored `useRealAws` setting was also observed as false.

## Implemented work — do not redo

### Learning Lab and custom traffic

- New page: `/dashboard/lab`, with a sidebar link.
- Files: `components/learning-lab.tsx`, `app/dashboard/lab/page.tsx`, `lib/simulation/experiment.ts`, `lib/simulation/scenarios.ts`.
- Real project Q-learning modules run in the browser with an isolated, temporary Q-table. Lab operations cannot invoke AWS adapters or alter the saved MySQL policy.
- Training from scratch runs 10 episodes per UI tick, up to 1,000 episodes / 288,000 updates. It shows exploration decay, state-action count, and evaluation checkpoints.
- Training uses seed base 42424 and increment 7919. Default evaluation seed is 20260922. The UI rejects seeds overlapping its 1,000-episode training set.
- Each checkpoint evaluates without learning or exploration. Untrained/current/baseline values are shown separately. The graph retains regressions; learning is not claimed to be monotonic.
- Frozen replay and continued online-learning replay are separate controls, with pause/resume, adjustable speed, live action/Q-value/reward and infrastructure state.
- Six generated scenarios: normal, quiet, peak, flash, ramp, oscillating. A seventh custom mode accepts validated `step,rps` CSV with piecewise-constant demand, zero traffic, and up to 288 rows.
- Sample custom input: `examples/traffic/payday.csv`.
- Downloads: traffic CSV, synthetic CloudWatch-shaped JSON, learning evidence including checkpoints and the Q-table.
- Browser lab state is ephemeral. Download before leaving the page. The ordinary Control loop page still persists runs and learning.

### Engine and saved-run fixes

- `simulateObservation` supports a validated `requestRateOverride`; both controllers receive the same custom demand.
- Dashboard queries now fetch the latest 240 metric records, then display them chronologically. Previously the charts froze on the first 240 records.
- Polling recovers after thrown connection errors instead of leaving its guard permanently set.
- A Redis token lock serializes saved-loop ticks and shared Q-table writes. It has a 60-second TTL and token-checked release.
- Each new comparison captures its Q-table, reward weights, intensity and learning configuration in `SimulationRun.policySnapshot`. It no longer reloads a changing learned policy on every tick.
- Migration: `prisma/migrations/20260922000100_frozen_comparison/migration.sql`. Applied successfully to the local database; generated Prisma client was refreshed.
- Legacy comparison runs lacking a snapshot must be restarted if still running. Completed history is preserved.
- Only actual RL learning increments the saved learning-update counter. Frozen comparison ticks no longer count as learning.
- Agent internals now show rolling mean reward, not a misleading cumulative-negative-reward learning curve.
- Chart Y-axis space was widened after visual inspection found clipped negative signs.

### AWS boundary

- Explicit simulation mode exits without requiring server/AWS configuration.
- Real execution requires BOTH server `USE_REAL_AWS=true` and the saved opt-in. Saved real-AWS RL ticks require an administrator session.
- CloudWatch `OptimizerReward` now receives the actual reward rather than throughput efficiency mislabeled as reward.
- Tests mock SDK transports for scaling, routing, telemetry and provider failures. No AWS requests were made by these tests.
- These are action adapters, not a completed production cloud control loop. Observations remain synthetic.

### Tooling, documentation and dependencies

- `DEMO.md`: three-minute walkthrough, commands, caveats, and an explicit implementation checklist.
- `scripts/demo-start.ts` / `npm run demo`: local bootstrap (dependencies, migration, seed, development server), with server AWS mode forced off. The whole new bootstrap command has not yet been verified end-to-end.
- `scripts/demo-backtest.ts` / `npm run demo:backtest`: credential-free reproducible multi-scenario report and traffic exports.
- `scripts/test-storage.ts` / `npm run test:storage`: opt-in database integration suite.
- `playwright.config.ts`, `e2e/demo.spec.ts`: browser regression suite.
- `.env.example` defaults now match Compose's local MySQL account.
- Next.js / eslint-config-next updated to 16.3.5; dependency fixes applied. `@prisma/config` overrides `deepmerge-ts` to 8.0.2 to fix the remaining audit finding. Prisma generate/validate/migration status succeeded afterward.
- Last npm install/audit reported **0 vulnerabilities**. This was a point-in-time package audit, not a security certification.

## Verification: what actually passed

Most recent observed completed checks:

| Check | Observed result |
|---|---|
| `npm test` | 51 passed; 2 storage tests intentionally skipped in this ordinary invocation |
| `npm run test:storage` | Both storage tests passed separately |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Production build passed with the Learning Lab route |
| Prisma generate / validate / migrate status | Passed; schema current |
| Earlier seven-test Playwright suite | All seven passed against the production server |
| Latest expanded eight-test Playwright suite | **Failed**; one test recorded as failed (see immediate TODO below) |
| Multi-scenario backtest | Completed and exported evidence |
| Five-minute persisted backtest | Completed, 120 matched intervals per controller |
| Docker rebuild | Started; completion unverified |

The previous seven browser tests covered complete training, pause/replay, evidence download, custom-input error/recovery, widths 375/768/1024/1440, keyboard skip navigation, reduced-motion mode, health and saved comparison smoke. Screenshots are under `outputs/demo/`. They were visually inspected; the axis clipping fix was added afterward.

### Exact outstanding browser failure

The new eighth test successfully reached the incorrect-password screen, but its assertion is ambiguous:

```ts
await expect(page.getByRole("alert")).toContainText("Incorrect admin password");
```

Both the app's password error and Next.js's route announcer have `role="alert"`. Evidence:

```text
test-results/demo-saved-live-loop-makes-4c3ca-jects-an-incorrect-password/error-context.md
test-results/demo-saved-live-loop-makes-4c3ca-jects-an-incorrect-password/trace.zip
test-results/.last-run.json
```

The trace explicitly shows the correct rejection message. Scope the assertion to `page.locator("#admin-password-error")` (or the login form's alert), then rerun. Do not change application authentication merely to satisfy this locator failure.

## Measured results and artifacts

`outputs/demo/report.md` and `outputs/demo/evidence.json` contain four checkpoints (0, 10, 100, 1,000 training episodes), evaluated over seven scenarios × five holdout seeds. At the final checkpoint, each scenario has 1,440 observations per controller.

| Scenario | Agent mean interval P95 | Baseline | Improvement |
|---|---:|---:|---:|
| Normal | 142.13 ms | 162.08 ms | 12.31% |
| Quiet | 136.21 ms | 152.21 ms | 10.51% |
| Peak | 141.84 ms | 167.67 ms | 15.40% |
| Flash | 136.36 ms | 153.37 ms | 11.09% |
| Ramp | 139.39 ms | 165.19 ms | 15.62% |
| Oscillating | 146.66 ms | 171.66 ms | 14.56% |
| Custom | 143.14 ms | 173.27 ms | 17.39% |

For normal traffic, mean reward improved from -0.3005 untrained to -0.2670 trained; SLA violations were 0.07% trained versus 5% baseline. The baseline only scales, whereas the agent can route/cache and has safety constraints; do not attribute its entire advantage to learned Q-values.

The separate timed backtest (`outputs/backtest-latest.json` / `.md`, seed 20260922) measured 8.49% lower mean P95, 15.6% lower modeled average cost, unchanged throughput and zero SLA violations versus eight. This is a different 120-step evaluation using the saved policy, so do not mix its numbers with the 288-step lab experiments.

All traffic and AWS-shaped metrics are synthetic. Reported P95 means average interval P95, not a percentile computed from raw request samples. Costs are model assumptions, not AWS bills or current pricing.

## Next TODO — ordered

### P0: finish and verify the presentation handoff

1. Inspect the current workspace and services; recover Docker Desktop availability. Start only required services without deleting volumes.
2. Fix the specific Playwright alert selector described above.
3. Check the migration and generated client. On Windows, generating Prisma while another local Node process has loaded its DLL can fail with EPERM. Stop only this project's relevant process and retry; do not kill all Node processes.
4. Run the complete eight-test browser suite against the updated app and confirm the latest report is green. Also verify the reward chart's negative signs and the new online-learning counter after repeated replays.
5. Verify `npm run demo` from the actual local setup. If the persisted AWS setting could be true, the script currently forces only the environment gate off: assess whether it should explicitly select simulation mode in persisted settings or explain the blocked saved-loop state. Do not enable AWS.
6. Finish/retry the Docker build and smoke-test the resulting container. The current Dockerfile uses `npm run start` with `output: standalone`, which emits a Next.js warning. Align the startup strategy with the build output if necessary, retaining Prisma migrations/seeding and static assets. Do not claim container validation until it passes.
7. Verify `/api/health`, the lab, saved RL loop, comparison, agent internals, logs, and Settings. Confirm no unintended AWS calls.
8. Produce a concise `VERIFICATION.md` with actual commands, counts, failures resolved, artifact locations and remaining limitations. Update `DEMO.md` if behavior changed.
9. Leave one working demo server on port 3000 and provide the user the exact URL, custom traffic file, report, and three-step presentation path. Avoid duplicate host/container servers competing for the port.

### P1: tighten demo correctness without changing its scope

- Review zero-demand cost aggregation: `summarize` weights per-request cost by throughput, which can omit idle infrastructure cost for zero-throughput intervals. Represent interval cost explicitly if correcting this; add a regression test.
- Review saved-loop concurrency beyond the current happy-path tests: lock expiry during slow provider calls, stop/tick races, reset/training mutations outside the tick lock, and safe recovery when Redis fails after a committed database write. The lock is not a durable distributed controller.
- Add a meaningful test that a running comparison is insulated from concurrent policy/settings changes; existing storage tests check captured snapshots, unchanged Q-table during comparison, latest metric windows, and overlapping polls.
- Review the tabular state's omission of control/cooldown/demand trend and the transition's same-step next-state approximation before claiming predictive RL. Treat this as a modeling question; preserve the current reproducible baseline while experimenting.
- Do not equate a rising reward on a changing workload with proof of learning. Preserve fixed holdout evaluation, untrained-policy comparisons, and early regressions.
- Consider successful admin login/logout coverage and an explicit browser check that the server AWS gate rejects enabling real execution with `.env` disabled.
- Add CI if useful after the local verification is complete; keep service-dependent and credential-free suites separate.

### P2: production work — separate from today's simulator demo

- Real CloudWatch observation ingestion, timestamps/statistics/units validation, stale/missing-data handling, and calibration against sanitized traces.
- Background worker/control cadence independent of browser polling.
- Durable action reconciliation/idempotency, observed-state feedback, rollback/canary policies, timeouts/retries, and audit trails for partial provider failure.
- Multi-user authorization, resource allowlists, and least-privilege AWS sandbox validation.
- Stronger policy evaluation: multiple training seeds, confidence intervals, matched-action-space baselines and safety-rule ablations.

Do not implement or deploy real-AWS changes by silently supplying credentials. The user's current objective is a credible credential-free demonstration.

## Useful commands

Run from the repository root. Start Docker Desktop first for storage/container commands.

```powershell
docker compose up -d --wait mysql redis
node node_modules/prisma/build/index.js generate
node node_modules/prisma/build/index.js migrate deploy
npm run db:seed
npm test
npm run test:storage
npm run lint
npm run typecheck
npm run build
npm run test:e2e
npm run demo:backtest
npm run backtest -- --duration-seconds=300 --interval-ms=2500 --seed=20260922
docker compose build app
```

For a presentation, follow `DEMO.md`. Prefer running the existing commands and inspecting their output over inventing replacement harnesses. No new long-running automation or additional task needs to be created for this handoff.

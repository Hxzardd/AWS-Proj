# Live AWS demo — flood it and watch the agent react

This turns the project from simulation-only into a **real closed loop**: real traffic
hits a real payment-style gateway behind a real ALB + Auto Scaling group, the agent
**observes the live fleet**, and it **acts on real AWS** (scale the ASG, shift ALB
routing weights, change the cache TTL via SSM) to recover — live, on screen.

It is free-tier sized with a `$1` budget alarm baked into the stack. **Tear it down
right after the demo** (`teardown.ps1`).

## What is real vs. still simulated

| | Real on AWS | Notes |
|---|---|---|
| Traffic / bottleneck | ✅ you flood a real endpoint with k6 | CPU burn per cache miss |
| Metrics the agent sees | ✅ scraped from the live gateway fleet (`/fleet`) every ~5s | hybrid: snappy, not CloudWatch-lagged |
| Scale action | ✅ `SetDesiredCapacity` on the real ASG | new instance in ~60–120s |
| Routing action | ✅ `ModifyRule` weights on the real ALB | primary/secondary pools |
| Cache action | ✅ `PutParameter` to SSM; instances poll it | changes real cache TTL |
| Optimizer telemetry | ✅ `PutMetricData` to CloudWatch | visible in the console |
| RL-vs-baseline **scored** comparison | ❌ stays in the sim lab | you can't run both controllers on one real fleet — say this on stage |

## Prerequisites
- AWS free-tier account, AWS CLI v2 configured (`aws configure`) with an admin user **for deploy only**.
- [k6](https://k6.io/docs/get-started/installation/) installed (for the flood).
- The app running locally (`npm run demo`) with MySQL + Redis, as usual.

## 1. Deploy the stack (~5–8 min)
```powershell
./aws/infra/deploy.ps1 -Region ap-south-1 -NotificationEmail you@example.com
```
It validates the template, deploys ALB + 2 target groups + primary ASG (1→3 `t3.micro`)
+ a secondary instance + ElastiCache Redis + the SSM TTL param + a scoped controller
IAM user + a `$1` budget, then prints a ready-to-paste `.env` block and the controller
access keys.

## 2. Fill `.env` and confirm health
Paste the printed block into `.env` (the `USE_REAL_AWS=true`, all `AWS_*`, and the two
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` lines). Wait ~2–3 min for instances to go
healthy, then dry-run (read-only, mutates nothing):
```powershell
npm run aws:check
```
You should see the real control state (desired capacity, routing weight, cache TTL) and
a live fleet observation.

## 3. Arm real mode in the app
1. Open `/settings`, sign in with `ADMIN_PASSWORD`.
2. Turn **Real AWS mode** on (the toggle is the second half of the safety gate; the first
   half is `USE_REAL_AWS=true` in `.env`).
3. Open `/dashboard` and **Start simulation** (mode `rl`). The header shows a
   **LIVE · Real AWS** badge once ticks start hitting AWS.

## 4. Drive the loop headlessly (recommended for the demo)
So the loop keeps running even when you switch tabs, run the background controller with
the run id shown in the dashboard URL / recent runs:
```powershell
npm run controller -- <runId>
```
It ticks every `REAL_TICK_MS` (default 5s): observe → decide → act on AWS → learn → persist.
The dashboard is then just a live viewer. (Leaving the dashboard tab open also drives ticks,
but the controller is steadier.)

## 5. Flood it and watch it react
In another terminal (PowerShell env-var syntax shown):
```powershell
$env:BASE_URL = "http://<ALB_DNS>"   # from the deploy output
npm run load:spike
```
On stage you should see, within a few ticks:
- P95 latency + CPU climb, the **P95 tile turns critical** (SLA breached),
- the agent fire **SCALE_UP** → `DesiredCapacity` rises (confirm in the EC2 console → Auto
  Scaling groups → Activity), a new instance reaches **InService** (~60–120s),
- P95 drops back under the 200 ms SLA. Then release:
```powershell
npm run load:calm
```
and the agent scales back **down** once there is headroom. Use `npm run load:sustain` to
hold a steady bottleneck while you narrate.

Cross-check the same story in the AWS console: ASG activity, ALB target health, and
CloudWatch → Metrics → `PaymentGateway/Custom` (OptimizerLatency / OptimizerReward).

## 6. Tear down (do this!)
```powershell
./aws/infra/teardown.ps1 -Region ap-south-1
```
Deletes every resource (ALB, ASG, instances, ElastiCache, IAM user + keys, budget).
Then turn the Settings toggle off and stop `npm run controller`.

## Cost & safety
- `t3.micro` only, ASG capped at 3, ElastiCache `cache.t3.micro`, ALB — all free-tier for
  the first 12 months; a few hours of demo stays well under `$1`.
- Budget alarm at `$1` is in the stack. Also enable Billing alerts in your account.
- Controller IAM user is scoped to these actions only; its keys live in the stack outputs —
  treat them as secrets and let teardown delete them.

## Troubleshooting
- `aws:check` fails on `/fleet` → instances not healthy yet; check EC2 → Target Groups health,
  or SSH/Session-Manager into an instance and `journalctl -u gateway`.
- No `SCALE_UP` under load → the capacity/cooldown guards in `lib/rl/safety.ts` may judge the
  load safe; push `npm run load:spike` harder (raise `ID_CARDINALITY` or the target rate).
- Metrics look flat → make sure the flood targets the **ALB DNS**, not localhost.

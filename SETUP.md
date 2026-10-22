# SETUP — from a fresh AWS account to the live demo

This is the complete, do-this-then-that guide. Part 1 gets the project running locally
(simulation only — no AWS, no cost). Part 2 turns on the **real AWS live loop**: a real
gateway you flood with traffic while the agent scales/routes/caches on real infrastructure.

> Commands are shown for **Windows PowerShell** (your shell). Where a bash variant differs
> it is noted. Default region used throughout: **`ap-south-1`** (Mumbai) — change it if you
> prefer, but use the same region everywhere.

---

# Part 0 — Install the tools (one time)

| Tool | Why | Get it |
|---|---|---|
| Node.js 22.13+ | runs the app + scripts | https://nodejs.org/en/download |
| Docker Desktop | easiest local MySQL + Redis | https://www.docker.com/products/docker-desktop/ |
| AWS CLI v2 | deploy/manage the AWS stack | https://aws.amazon.com/cli/ |
| k6 | generates the load (the "flood") | https://grafana.com/docs/k6/latest/set-up/install-k6/ |

Verify:
```powershell
node -v        # v22.13 or newer
docker --version
aws --version  # aws-cli/2.x
k6 version
```

---

# Part 1 — Run it locally (simulation only, no AWS)

### 1.1 Install dependencies
```powershell
npm install
```

### 1.2 Create your `.env`
```powershell
Copy-Item .env.example .env
```
Open `.env` and set at least these (leave the `AWS_*` lines empty for now):

| Variable | What to put |
|---|---|
| `DATABASE_URL` | keep the default if you use the Docker MySQL below |
| `REDIS_URL` | keep the default (`redis://localhost:6379`) |
| `ADMIN_PASSWORD` | any password — you'll type it on the `/settings` page |
| `SESSION_SECRET` | a random string **≥ 32 chars** (generate below) |
| `USE_REAL_AWS` | leave `false` for now |

Generate a session secret:
```powershell
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```
Paste the output as `SESSION_SECRET`.

### 1.3 Start MySQL + Redis (Docker)
```powershell
npm run services:up
npm run services:status   # both should be healthy
```

### 1.4 Create the schema, seed the policy, and run
```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
npm run demo
```
Open **http://localhost:3000**. The demo/lab works with **no AWS** at all. If this works,
Part 1 is done.

---

# Part 2 — Turn on the real AWS live loop

Everything here is **free-tier sized** and the stack installs a **$1 budget alarm**. You
will **tear it all down** at the end (one command). Budget a few hours; cost stays well
under $1 if you tear down the same day.

## 2.1 Create / prepare your AWS account

1. Sign up (or sign in): https://portal.aws.amazon.com/billing/signup → https://console.aws.amazon.com/
2. **Turn on billing alerts** (so you get warned early):
   - Billing preferences: https://console.aws.amazon.com/billing/home#/preferences → enable
     "Receive Free Tier alerts" and "Receive CloudWatch billing alerts".
   - Free-tier usage dashboard (check anytime): https://console.aws.amazon.com/billing/home#/freetier

## 2.2 Create a deploy user and get access keys

The deploy step creates a VPC, EC2/ASG, load balancer, ElastiCache, IAM, SSM, and a budget,
so your **deploy identity needs broad permissions**. In a personal sandbox account the
simplest is an IAM user with `AdministratorAccess` used **only to deploy**. (The *controller*
that touches infra during the demo is a separate, tightly-scoped user the stack creates for
you — you don't make that one.)

1. IAM → Users → Create user: https://console.aws.amazon.com/iam/home#/users → "Create user"
   - Name e.g. `optimizer-deploy`. **Do not** enable console access (keys only).
2. Permissions → "Attach policies directly" → tick **AdministratorAccess** → create.
3. Open the user → **Security credentials** → **Create access key** → use case
   "Command Line Interface (CLI)" → copy the **Access key ID** and **Secret access key**.
   (You can only see the secret once — copy it now.)

## 2.3 Point the AWS CLI at that user
```powershell
aws configure
```
Enter when prompted:
- AWS Access Key ID → *(from 2.2)*
- AWS Secret Access Key → *(from 2.2)*
- Default region name → `ap-south-1`
- Default output format → `json`

Verify it works:
```powershell
aws sts get-caller-identity
```
You should see your account id and the `optimizer-deploy` user ARN.

## 2.4 Deploy the stack (~5–8 minutes)

From the project root:
```powershell
./aws/infra/deploy.ps1 -Region ap-south-1 -NotificationEmail you@example.com
```
- Use a **real email** — AWS sends a budget-alert confirmation; click the confirm link in
  that email.
- The script validates the template, deploys, then **prints a block of `.env` values plus
  your controller access keys**. Keep that output.

Watch progress if you like, in the CloudFormation console:
https://console.aws.amazon.com/cloudformation/home?region=ap-south-1

## 2.5 Fill the AWS section of `.env`

Paste the printed values into `.env`. They map one-to-one:

```ini
USE_REAL_AWS=true
AWS_REGION=ap-south-1
AWS_AUTO_SCALING_GROUP_NAME=optimizer-demo-PrimaryAsg-XXXX   # from output
AWS_ALB_TARGET_GROUP_ARN=arn:aws:elasticloadbalancing:...    # from output
AWS_ALB_SECONDARY_TARGET_GROUP_ARN=arn:aws:elasticloadbalancing:...
AWS_ALB_LISTENER_RULE_ARN=arn:aws:elasticloadbalancing:...listener-rule/...
AWS_ALB_DNS=optimizer-demo-...ap-south-1.elb.amazonaws.com   # host only, no http://
AWS_CLOUDWATCH_NAMESPACE=PaymentGateway/Custom
AWS_CACHE_TTL_PARAM=/optimizer/cacheTtlSec

# the controller user's keys (also printed by deploy.ps1):
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

> These controller keys are **different** from your deploy keys in 2.2. They are the
> least-privilege user the stack made. Treat the secret as sensitive; teardown deletes it.

If you ever lose the output, re-print it:
```powershell
aws cloudformation describe-stacks --stack-name optimizer-demo --region ap-south-1 --query "Stacks[0].Outputs"
```

## 2.6 Wait for the gateway to be healthy, then dry-run

Give the instances ~2–3 minutes to boot and pass health checks. Confirm in the console:
- Auto Scaling groups: https://console.aws.amazon.com/ec2/home?region=ap-south-1#AutoScalingGroups:
- Target groups (should show **healthy** targets):
  https://console.aws.amazon.com/ec2/home?region=ap-south-1#TargetGroups:

Then run the read-only check (mutates nothing):
```powershell
npm run aws:check
```
You should see the real control state (desired capacity, routing weight, cache TTL) and a
live fleet observation. If this passes, you're ready.

## 2.7 Arm real mode in the app

1. Restart the app so it picks up the new `.env`:
   ```powershell
   npm run demo
   ```
2. Go to **http://localhost:3000/settings**, sign in with `ADMIN_PASSWORD`.
3. Turn **Real AWS mode ON**. (Two-part safety gate: `USE_REAL_AWS=true` in `.env` **and**
   this toggle.)
4. Go to **http://localhost:3000/dashboard** → **Start simulation** (mode `rl`). Copy the
   **run id** from the page/URL.

## 2.8 Drive the loop headlessly (recommended)

In a new terminal, run the background controller with that run id:
```powershell
npm run controller -- <runId>
```
It ticks every 5s (`REAL_TICK_MS`): observe the live fleet → decide → act on real AWS →
learn → persist. The dashboard shows a **LIVE · Real AWS** badge and updates live.

## 2.9 Flood it and watch it react 🎬

In another terminal, set the ALB URL and start the flood:
```powershell
$env:BASE_URL = "http://<AWS_ALB_DNS>"   # the DNS from 2.5, with http://
npm run load:spike
```
Watch, within a few ticks:
- P95 latency + CPU climb; the **P95 tile turns red** (SLA breached).
- The agent fires **SCALE_UP** → desired capacity rises (see ASG → Activity), a new instance
  reaches **InService** (~60–120s).
- P95 drops back under the 200 ms SLA.

Then release and watch it scale back down:
```powershell
npm run load:calm
```
Hold a steady bottleneck while you talk: `npm run load:sustain`.

Cross-check in AWS:
- CloudWatch metrics (optimizer telemetry):
  https://console.aws.amazon.com/cloudwatch/home?region=ap-south-1#metricsV2 → namespace
  `PaymentGateway/Custom` (OptimizerLatency, OptimizerReward).

## 2.10 TEAR IT DOWN (do this when finished) ⚠️

```powershell
./aws/infra/teardown.ps1 -Region ap-south-1
```
Deletes **everything** (ALB, ASG, instances, ElastiCache, IAM controller user + keys,
budget). Then in the app: turn the Settings toggle **off** and stop the controller
(Ctrl+C). Confirm nothing lingers:
```powershell
aws cloudformation describe-stacks --stack-name optimizer-demo --region ap-south-1
# should say: Stack with id optimizer-demo does not exist
```

---

# Quick reference — the whole Part 2 in order

```powershell
aws configure                                                   # 2.3 (deploy keys)
./aws/infra/deploy.ps1 -Region ap-south-1 -NotificationEmail you@example.com   # 2.4
# paste outputs into .env                                       # 2.5
npm run aws:check                                               # 2.6
npm run demo                                                    # 2.7 (toggle ON in /settings, start run)
npm run controller -- <runId>                                   # 2.8
$env:BASE_URL="http://<AWS_ALB_DNS>"; npm run load:spike        # 2.9
./aws/infra/teardown.ps1 -Region ap-south-1                     # 2.10
```

---

# Cost & safety summary
- Only `t3.micro` instances (ASG capped at 3) + `cache.t3.micro` + one ALB — all free-tier
  for the first 12 months. A few demo hours stays under **$1**.
- The stack includes a **$1 budget alarm**; also enable billing alerts (2.1).
- The controller IAM user is scoped to just the scale/route/SSM/CloudWatch actions it needs.
- **Always run teardown** after the demo.

# If something's off
- `aws:check` fails on `/fleet` → instances not healthy yet; recheck Target Groups health, or
  wait another minute. You can inspect an instance via EC2 → Connect → Session Manager, then
  `journalctl -u gateway`.
- Toggle won't turn on / "Real AWS mode requires: AWS_ALB_DNS" → a required `AWS_*` value is
  missing in `.env`; re-check 2.5 and restart `npm run demo`.
- No SCALE_UP under load → push harder: `$env:ID_CARDINALITY="8000"; npm run load:spike`.
- Flat metrics → make sure `BASE_URL` points at the **ALB DNS**, not localhost.

For the on-stage demo script (what to say while flooding), see
[`aws/README.md`](aws/README.md).

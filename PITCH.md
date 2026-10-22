# Presentation Pitch

**Autonomous API Performance Optimization Framework for Digital Payment Gateways using Reinforcement Learning**

*A speaking script for presenting the project. Times are approximate for a 6–8 minute slot; each section can stand alone.*

---

## 1. The hook (30 seconds)

Every second, digital payment gateways process a flood of API requests — and traffic is never flat. It spikes at payday, at sale events, at the end of the month. Today, most gateways handle those spikes with **static rules**: "if CPU crosses 70%, add a server." Those thresholds are set once by an engineer and rarely change. The result is predictable: during bursts, latency climbs, SLAs are breached, and customers watch a spinner while their payment hangs.

Our project asks a simple question: **what if the system learned to tune itself, before the spike hurt anyone?**

---

## 2. The problem (45 seconds)

Static configuration has three weaknesses:

- **It reacts late.** Thresholds fire *after* load has already degraded response time.
- **It is one-dimensional.** It usually only scales servers. It does not rethink *routing* (which pool serves the request) or *caching* (how long results stay warm).
- **It never improves.** The same rules run on day one and day one thousand, regardless of what the traffic has taught the system.

For a payment gateway, where reliability and latency are the product, that gap is expensive.

---

## 3. What we built (1 minute)

We built an **autonomous control loop** driven by **Reinforcement Learning**. It continuously watches live system metrics — P95 latency, CPU, memory, request rate, network latency — and on every interval it *chooses an action*: scale up or down, shift traffic toward the least-loaded pool, or raise or lower the cache TTL.

The decision-maker is a **tabular Q-learning agent**. It learns a policy that maps the *state* of the gateway to the *action* with the best long-term reward. The reward function is deliberate and cost-aware:

> reward = −(latency) − (SLA-violation penalty) + (throughput) − (cost per request)

So the agent is not just chasing speed — it is explicitly penalized for breaching the SLA and for spending money it did not need to spend.

Crucially, we did not just build the AI. We built a **fair, reproducible comparison**: the same learned agent runs side by side against a classic static-threshold controller, both fed the *exact same* seeded traffic waveform, so any difference is the policy, not luck.

---

## 4. The evidence — this is the part that matters (1.5 minutes)

We evaluated the trained policy on **traffic it had never seen during training** — six holdout seeds, 1,728 observations per controller. Against the static baseline, on identical traffic:

| Metric | RL agent | Static baseline | Improvement |
|---|---:|---:|---:|
| Average P95 latency | 139 ms | 164 ms | **15.1% lower** |
| **SLA violation rate** | **0.52%** | **7.18%** | **92.7% lower** |
| Cost per 1,000 requests | $0.0000714 | $0.0000831 | **14.1% lower** |
| Throughput | 2,052 req/s | 2,052 req/s | Equal |

Read that middle row again. The learned policy cut SLA violations by roughly **93%** — nine breaches versus the baseline's one hundred and twenty-four — while *also* spending 14% less. It served the same volume of traffic, faster, more reliably, and cheaper.

We confirmed this on a separate **five-minute untouched holdout run**: latency 14.4% lower, **zero SLA violations versus six** for the baseline, and 21% better cumulative reward. And we can prove the test was honest — the Q-table stayed at exactly 247 entries before and after the run, so the evaluation traffic never leaked into learning. These figures are the result of a disciplined tuning pass — a six-round hyperparameter search that selected on a *separate* validation set and only then reported these test numbers, so nothing was fitted to the test seeds.

Every one of those numbers is **reproducible**. Give it the same seed and you get the same result, every time.

---

## 5. Engineering credibility (1 minute)

This is a working platform, not a slide deck:

- **Real stack:** Next.js and strict TypeScript, a Prisma/MySQL database, a Redis cache, AWS SDK v3 adapters for Auto Scaling, load balancing, and CloudWatch, all containerized with Docker.
- **Real safety:** Real AWS calls are **off by default** and sit behind a two-part gate — an environment flag *and* a password-protected toggle. Every simulated infrastructure action is labeled and logged. The system never quietly touches live cloud resources.
- **Real testing:** A unit suite covers the exact reward equation, the Bellman update, epsilon decay, and seeded reproducibility; there are storage-integration tests and Playwright browser tests across four viewport sizes.
- **A live demo:** In about twenty seconds, the lab trains a policy from an empty table across 288,000 learning updates, then replays it against the baseline with latency updating live on screen — and lets the examiner download the evidence.

---

## 6. Honesty about scope — say this, don't hide it (45 seconds)

We are careful about what we claim. This is a **simulation-first college project**, not a certified production payment gateway. We measured ourselves against an explicit **ten-deliverable checklist** and completed eight: the simulator, the learning engine, the fair baseline comparison, live visualization, persisted runs, custom traffic and AWS-shaped exports, reproducible backtests, and the full demo workflow.

The two remaining are honestly production tasks: **calibrating the simulator against real CloudWatch traces**, and running a **background controller with canary rollout and automatic rollback** in a real AWS sandbox. We name these limitations on the record — reward-weight sensitivity, simulation fidelity, and the fact that tabular Q-learning gives decisions but not causal explanations. Stating the boundary is part of the engineering.

---

## 7. The close (30 seconds)

So here is what this project demonstrates: an API layer that **learns from its own traffic**, makes **cost-aware** decisions across scaling, routing, and caching without a human in the loop, and — on fair, reproducible, held-out tests — beats the industry-standard static approach on latency, reliability, *and* cost at the same time.

The roadmap writes itself: multi-cloud failover, one agent per microservice with a shared-capacity coordinator, fraud-aware reward shaping, and federated learning across gateways. But the core idea already stands on evidence: **static rules are the ceiling; a system that learns is the floor.**

Thank you — I'm happy to run the live demo or take questions.

---

## Anticipated viva questions (keep in your back pocket)

- **"Is the improvement really the AI, or just the extra actions?"** — Fair point, and we say so: the baseline only scales, while the agent also routes and caches, so the full gap can't be attributed to Q-learning alone. That's exactly why the lab shows an *Untrained* column too — to isolate learning from the routing/caching/safety rules that exist before any training.
- **"How do you know it didn't just memorize the test?"** — The evaluation seeds are excluded from training, and the Q-table entry count is identical before and after the holdout run. Comparison mode freezes the table and sets exploration to zero.
- **"Why tabular Q-learning and not deep RL?"** — The state space is discretized and small, so a table is transparent, fast, reproducible, and inspectable — you can literally read the learned Q-values on the dashboard. Deep RL is future scope once we have real traces.
- **"Is this safe to run on real infrastructure?"** — Not yet, by design. Real AWS mode is double-gated and off by default. Production would need canaries, approval gates, and automated rollback — deliverables nine and ten on our checklist.
- **"What's the single most important result?"** — A 92.7% reduction in SLA violations on unseen traffic — nine breaches versus the baseline's 124 — at lower cost and equal throughput.
- **"How did you arrive at these settings?"** — A six-round, ~90-configuration search over learning rate, discount, exploration schedule, episodes, and reward weights. The decisive lever was raising the exploration floor so the agent learns robust policies for rare high-load states. Crucially, we selected on a separate validation set and reported the test numbers only afterward, and confirmed the gain on a third independent robustness set — so the improvement generalizes and isn't fitted to the test seeds. Full methodology is in `outputs/tuning-report.md`.

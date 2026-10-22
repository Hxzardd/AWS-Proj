# Presentation guide

Open **http://localhost:3000/dashboard/lab**. No AWS credentials are needed. The lab runs the actual TypeScript Q-learning engine in your browser; it does not make AWS calls or alter the policy stored in MySQL.

## Three-minute demonstration

1. Choose **Business day**, seed **20260922**, and **Demo** speed.
2. Click **Train from scratch**. The table starts empty. In about 20 seconds, the engine performs 1,000 episodes / 288,000 Bellman updates. Exploration decays from 1 to 0.05.
3. Point to **Learning evidence**: after each batch, a frozen copy of the current behavior is evaluated on the same unseen day. Higher reward is better, including when both numbers are negative. Early checkpoints may get worse; the chart preserves that honestly.
4. Compare the **Untrained**, **Current**, and **Baseline** columns. This separates actual learning from the benefit of routing, caching, and safety rules that already exist before training.
5. Click **Replay learned policy**. Shared demand and both controllers' latency update live. Explain the selected action, Q-value, instance count, routing split, and cache TTL beneath the charts. This replay does not learn.
6. Pause, then click **Continue learning live**. Each interval now updates a Q-value; the learning-update counter increases. This is adaptation, not a held-out score.
7. Download **learning evidence**, **traffic CSV**, and **simulated CloudWatch JSON** for the examiner.

Choose **Custom traffic** to paste `examples/traffic/payday.csv`. Each row sets a rate until the next row. A complete trace has up to 288 intervals of five simulated minutes. This example jumps from 1,400 to 6,500 requests/second, recovers, then has another peak. To replay a generated scenario exactly, paste one of the full CSVs in `outputs/demo/`.

Changing the scenario or evaluation seed resets the lab experiment. Pausing retains it. Reloading or navigating away loses browser lab state; download evidence first. The separate Control loop page persists its runs and Q-values in MySQL.

## Repeatable commands

```powershell
npm run demo
```

This starts local MySQL/Redis, applies migrations, seeds missing settings/policy, and starts the dashboard. It stops only the Compose app container to free port 3000. Real AWS is disabled for this demo. If a separate Node server already owns port 3000, use that server or stop it first.

```powershell
npm test
npm run test:storage
npm run lint
npm run typecheck
npm run build
npm run test:e2e
npm run demo:backtest
npm run backtest -- --duration-seconds=300 --interval-ms=2500 --seed=20260922
```

`test:storage` needs the seeded local services; it creates temporary comparison runs and removes only those runs. `test:e2e` uses an existing server on port 3000, or starts development mode. Install its browser once with `npx playwright install chromium`. The timed backtest persists a completed run and leaves earlier runs intact.

## Evidence and scope

- `outputs/demo/report.md`: seven scenarios × five holdout seeds, four training checkpoints.
- `outputs/demo/evidence.json`: every checkpoint's scores plus the final Q-table.
- `outputs/demo/traffic-*.csv`: reproducible request-rate traces.
- `outputs/demo/cloudwatch-*.json`: **synthetic**, CloudWatch-shaped metrics. RequestCount is a 300-second sum; TargetResponseTime p95 is in seconds. These are not downloaded AWS data.
- `outputs/backtest-latest.md`: the timed, database-backed evaluation.
- `playwright-report/index.html`: browser test results after running the suite.

The reported latency is mean simulated interval P95, not the P95 of raw request samples. Cost values are simulator assumptions, not AWS billing estimates. Training, validation and the synthetic traffic are reproducible; real infrastructure failures, payment correctness and production performance are not certified by these tests.

## Implementation checklist

For the college demonstration, these eight deliverables are implemented: (1) seeded simulator, (2) Q-learning training, (3) baseline comparison, (4) live visualization, (5) persisted control runs and action history, (6) custom traffic plus AWS-shaped exports, (7) repeatable backtests and regression tests, (8) presentation workflow and evidence downloads.

Two production deliverables remain: (9) collecting real CloudWatch observations and calibrating the simulator against them, and (10) a background controller with durable action reconciliation, canaries, rollback, multi-user authorization and validation in a real AWS sandbox. Thus the implementation exceeds 60% **against this explicit 10-deliverable checklist**, not a claim that it is 80% production-safe. AWS SDK action adapters exist, but credentials alone do not complete these two deliverables.

The ordinary control loop still advances from browser polling. The lab is intentionally local and separate from the database policy. The static baseline only scales; the agent also has routing, caching and operational constraints, so the full advantage cannot be attributed to Q-learning alone.

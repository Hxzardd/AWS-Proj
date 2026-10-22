import { Prisma, PrismaClient } from "@prisma/client";
import { qLearningConfigFromEnv } from "../lib/rl/qlearning";
import { rewardWeightsFromEnv } from "../lib/rl/reward";
import type { QTable, RewardWeights, RlAction } from "../lib/rl/types";
import { runBaselineStep, runRlStep } from "../lib/simulation/engine";
import {
  INITIAL_CONTROL_STATE,
  type ControlState,
} from "../lib/simulation/generator";

const prisma = new PrismaClient();

type Source = "rl" | "baseline";
type Metric = ReturnType<typeof runRlStep>["metrics"];
type Sample = Metric & { step: number; reward: number; action: RlAction };

function argument(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
  const parsed = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
}

const durationSeconds = argument("duration-seconds", 300);
const intervalMs = argument("interval-ms", 2_500);
const seed = Math.floor(argument("seed", 20_260_805));
const snapshotOnly = process.argv.includes("--snapshot-only");

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function percentageDelta(reference: number, candidate: number, lowerIsBetter: boolean) {
  if (reference === 0) return 0;
  const raw = lowerIsBetter
    ? ((reference - candidate) / reference) * 100
    : ((candidate - reference) / reference) * 100;
  return round(raw);
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function actionCounts(samples: Sample[]) {
  return samples.reduce<Record<string, number>>((counts, sample) => {
    counts[sample.action] = (counts[sample.action] ?? 0) + 1;
    return counts;
  }, {});
}

function summarize(samples: Sample[]) {
  const requestTotal = samples.reduce((sum, sample) => sum + sample.requestRate, 0);
  const throughputTotal = samples.reduce((sum, sample) => sum + sample.throughput, 0);
  const violations = samples.filter((sample) => sample.slaViolation).length;
  const rewards = samples.map((sample) => sample.reward);
  const quarterSize = Math.max(1, Math.floor(samples.length / 4));

  return {
    observations: samples.length,
    averageLatencyMs: round(average(samples.map((sample) => sample.latencyMs))),
    averageP95LatencyMs: round(average(samples.map((sample) => sample.p95LatencyMs))),
    runP95LatencyMs: round(percentile(samples.map((sample) => sample.p95LatencyMs), 0.95)),
    averageThroughputRps: round(average(samples.map((sample) => sample.throughput))),
    throughputEfficiencyPct: round((throughputTotal / Math.max(requestTotal, 1)) * 100),
    slaViolations: violations,
    slaViolationRatePct: round((violations / Math.max(samples.length, 1)) * 100),
    averageCostPerThousandUsd: round(
      average(samples.map((sample) => sample.costPerThousandUsd)),
      7,
    ),
    averageCpuPct: round(average(samples.map((sample) => sample.cpuPct))),
    averageCacheHitRatioPct: round(
      average(samples.map((sample) => sample.cacheHitRatio)) * 100,
    ),
    cumulativeReward: round(rewards.reduce((sum, reward) => sum + reward, 0), 4),
    averageReward: round(average(rewards), 4),
    firstQuarterAverageReward: round(average(rewards.slice(0, quarterSize)), 4),
    lastQuarterAverageReward: round(average(rewards.slice(-quarterSize)), 4),
    actions: actionCounts(samples),
  };
}

async function settings() {
  const rows = await prisma.appSetting.findMany();
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const environmentWeights = rewardWeightsFromEnv();
  const weights: RewardWeights = {
    latency: Number(values.get("rewardWeightLatency") ?? environmentWeights.latency),
    sla: Number(values.get("rewardWeightSla") ?? environmentWeights.sla),
    throughput: Number(values.get("rewardWeightThroughput") ?? environmentWeights.throughput),
    cost: Number(values.get("rewardWeightCost") ?? environmentWeights.cost),
  };

  return {
    weights,
    intensity: Number(values.get("simulatorIntensity") ?? 1),
    epsilonStart: Number(values.get("epsilonStart") ?? process.env.RL_EPSILON_START ?? 1),
  };
}

async function loadQTable() {
  const entries = await prisma.qTableEntry.findMany();
  const table = entries.reduce<QTable>((current, entry) => {
    current[entry.stateKey] = {
      ...current[entry.stateKey],
      [entry.action as RlAction]: entry.qValue,
    };
    return current;
  }, {});
  return { table, entries };
}

async function latestPersistedSnapshot() {
  const [run, counts] = await Promise.all([
    prisma.simulationRun.findFirst({
      orderBy: { startedAt: "desc" },
      include: {
        metrics: { orderBy: { timestamp: "desc" }, take: 2 },
        actions: { orderBy: { timestamp: "desc" }, take: 2 },
      },
    }),
    Promise.all([
      prisma.simulationRun.count(),
      prisma.metricSnapshot.count(),
      prisma.agentAction.count(),
      prisma.qTableEntry.count(),
    ]),
  ]);

  return {
    recordedAt: new Date().toISOString(),
    counts: {
      runs: counts[0],
      metrics: counts[1],
      actions: counts[2],
      qTableEntries: counts[3],
    },
    latestRun: run
      ? {
          id: run.id,
          seed: run.seed,
          mode: run.mode,
          status: run.status,
          step: run.step,
          startedAt: run.startedAt.toISOString(),
          endedAt: run.endedAt?.toISOString() ?? null,
          metrics: run.metrics.map((metric) => ({
            timestamp: metric.timestamp.toISOString(),
            step: metric.step,
            source: metric.source,
            latencyMs: metric.latencyMs,
            p95LatencyMs: metric.p95LatencyMs,
            throughput: metric.throughput,
            cpuPct: metric.cpuPct,
            requestRate: metric.requestRate,
            cacheHitRatio: metric.cacheHitRatio,
            slaViolation: metric.slaViolation,
            costPerThousandUsd: metric.costPerThousandUsd,
          })),
          actions: run.actions.map((action) => ({
            timestamp: action.timestamp.toISOString(),
            step: action.step,
            source: action.source,
            action: action.action,
            reward: action.rewardResult,
            stateKey: action.stateKey,
          })),
        }
      : null,
  };
}

async function persistStep(input: {
  runId: string;
  step: number;
  source: Source;
  result: ReturnType<typeof runRlStep> | ReturnType<typeof runBaselineStep>;
}) {
  const { runId, step, source, result } = input;
  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.metricSnapshot.create({
      data: { runId, step, source, ...result.metrics },
    }),
    prisma.agentAction.create({
      data: {
        runId,
        step,
        source,
        stateBucket: result.state as Prisma.InputJsonValue,
        stateKey: result.stateKey,
        action: result.action,
        reason: result.reason,
        rewardResult: result.reward,
        effect: result.control as Prisma.InputJsonValue,
        infrastructure: {
          provider: "simulator",
          operation: `Backtest ${source} ${result.action}`,
          completed: true,
        },
      },
    }),
  ];

  if (source === "rl" && "learned" in result && result.learned) {
    operations.push(
      prisma.qTableEntry.upsert({
        where: { stateKey_action: { stateKey: result.stateKey, action: result.action } },
        update: { qValue: result.qValue, visits: { increment: 1 } },
        create: {
          stateKey: result.stateKey,
          action: result.action,
          qValue: result.qValue,
          visits: 1,
        },
      }),
    );
  }

  await prisma.$transaction(operations);
}

function formatSnapshot(snapshot: Awaited<ReturnType<typeof latestPersistedSnapshot>>) {
  if (!snapshot.latestRun) return "No earlier simulation run was present.";
  const latestMetrics = snapshot.latestRun.metrics
    .map(
      (metric) =>
        `- ${metric.source.toUpperCase()}: p95 ${metric.p95LatencyMs} ms, throughput ${metric.throughput} req/s, SLA ${metric.slaViolation ? "violated" : "met"}, cost $${metric.costPerThousandUsd.toFixed(7)}/1k`,
    )
    .join("\n");
  return `Run \`${snapshot.latestRun.id}\`, ${snapshot.latestRun.mode}, seed ${snapshot.latestRun.seed}, status ${snapshot.latestRun.status}, step ${snapshot.latestRun.step}.\n${latestMetrics}`;
}

function reportMarkdown(result: Record<string, unknown> & {
  previousSnapshot: Awaited<ReturnType<typeof latestPersistedSnapshot>>;
  summary: { rl: ReturnType<typeof summarize>; baseline: ReturnType<typeof summarize> };
  deltas: Record<string, number>;
  verdict: { status: string; explanation: string };
}) {
  const { summary, deltas, verdict } = result;
  return `# Five-minute RL backtest report

Generated: ${new Date().toISOString()}

## Pre-test snapshot

${formatSnapshot(result.previousSnapshot)}

No previous snapshots, actions, runs, or Q-table entries were deleted.

## Method

- Same deterministic traffic seed for both controllers
- RL and static-threshold baseline evaluated at every step
- Duration: ${result.durationSeconds} seconds
- Poll-equivalent interval: ${result.intervalMs} ms
- Observations per controller: ${summary.rl.observations}
- RL Q-table: pretrained and frozen for evaluation (no learning or random exploration)

## Results

| Metric | RL | Baseline | RL delta |
|---|---:|---:|---:|
| Average p95 latency | ${summary.rl.averageP95LatencyMs} ms | ${summary.baseline.averageP95LatencyMs} ms | ${deltas.averageP95LatencyImprovementPct}% |
| Run p95 latency | ${summary.rl.runP95LatencyMs} ms | ${summary.baseline.runP95LatencyMs} ms | ${deltas.runP95LatencyImprovementPct}% |
| Average throughput | ${summary.rl.averageThroughputRps} req/s | ${summary.baseline.averageThroughputRps} req/s | ${deltas.throughputImprovementPct}% |
| Throughput efficiency | ${summary.rl.throughputEfficiencyPct}% | ${summary.baseline.throughputEfficiencyPct}% | ${deltas.throughputEfficiencyImprovementPct}% |
| SLA violations | ${summary.rl.slaViolations} (${summary.rl.slaViolationRatePct}%) | ${summary.baseline.slaViolations} (${summary.baseline.slaViolationRatePct}%) | ${deltas.slaViolationReductionPct}% |
| Cost per 1,000 requests | $${summary.rl.averageCostPerThousandUsd.toFixed(7)} | $${summary.baseline.averageCostPerThousandUsd.toFixed(7)} | ${deltas.costReductionPct}% |
| Cumulative reward | ${summary.rl.cumulativeReward} | ${summary.baseline.cumulativeReward} | ${deltas.rewardImprovementPct}% |

## Learning indicators

- Epsilon: ${result.epsilonStart} -> ${result.epsilonEnd}
- Q-table entries: ${result.qTableEntriesBefore} -> ${result.qTableEntriesAfter}
- RL first-quarter average reward: ${summary.rl.firstQuarterAverageReward}
- RL last-quarter average reward: ${summary.rl.lastQuarterAverageReward}
- RL action distribution: ${JSON.stringify(summary.rl.actions)}
- Final RL control: ${JSON.stringify(result.finalRlControl)}
- Final baseline control: ${JSON.stringify(result.finalBaselineControl)}

## Verdict

**${verdict.status}** — ${verdict.explanation}

This is simulated evidence, not a production AWS benchmark. The seeded workload makes the comparison reproducible, while the shared traffic profile makes it fair.
`;
}

async function main() {
  const previousSnapshot = await latestPersistedSnapshot();
  console.log("PRE_TEST_SNAPSHOT");
  console.log(JSON.stringify(previousSnapshot, null, 2));
  if (snapshotOnly) return;

  const runtime = await settings();
  const qLearningConfig = qLearningConfigFromEnv();
  const loaded = await loadQTable();
  const qTable = loaded.table;
  const qTableEntriesBefore = loaded.entries.length;
  let epsilon = 0;
  let rlControl: ControlState = { ...INITIAL_CONTROL_STATE };
  let baselineControl: ControlState = { ...INITIAL_CONTROL_STATE };
  const samples: Record<Source, Sample[]> = { rl: [], baseline: [] };

  const run = await prisma.simulationRun.create({
    data: {
      seed,
      mode: "compare",
      epsilon,
      rlControlState: rlControl as Prisma.InputJsonValue,
      baseControlState: baselineControl as Prisma.InputJsonValue,
    },
  });

  console.log(`BACKTEST_STARTED run=${run.id} seed=${seed} duration=${durationSeconds}s interval=${intervalMs}ms`);
  const startedAt = Date.now();
  const targetSteps = Math.max(1, Math.floor((durationSeconds * 1_000) / intervalMs));

  try {
    for (let step = 1; step <= targetSteps; step += 1) {
      const targetTime = startedAt + step * intervalMs;
      await sleep(Math.max(0, targetTime - Date.now()));

      const rl = runRlStep({
        seed,
        step,
        control: rlControl,
        qTable,
        epsilon,
        intensity: runtime.intensity,
        weights: runtime.weights,
        config: qLearningConfig,
        learn: false,
      });
      const baseline = runBaselineStep({
        seed,
        step,
        control: baselineControl,
        intensity: runtime.intensity,
        weights: runtime.weights,
      });

      rlControl = rl.control;
      baselineControl = baseline.control;
      epsilon = rl.epsilon;
      samples.rl.push({ ...rl.metrics, step, reward: rl.reward, action: rl.action });
      samples.baseline.push({
        ...baseline.metrics,
        step,
        reward: baseline.reward,
        action: baseline.action,
      });

      await persistStep({ runId: run.id, step, source: "rl", result: rl });
      await persistStep({ runId: run.id, step, source: "baseline", result: baseline });
      await prisma.simulationRun.update({
        where: { id: run.id },
        data: {
          step,
          episode: step,
          epsilon,
          rlControlState: rlControl as Prisma.InputJsonValue,
          baseControlState: baselineControl as Prisma.InputJsonValue,
        },
      });

      if (step % 20 === 0 || step === targetSteps) {
        console.log(`PROGRESS ${step}/${targetSteps} elapsed=${round((Date.now() - startedAt) / 1_000, 1)}s`);
      }
    }

    await prisma.simulationRun.update({
      where: { id: run.id },
      data: { status: "completed", endedAt: new Date() },
    });
  } catch (error) {
    await prisma.simulationRun.update({
      where: { id: run.id },
      data: { status: "stopped", endedAt: new Date() },
    });
    throw error;
  }

  const summary = {
    rl: summarize(samples.rl),
    baseline: summarize(samples.baseline),
  };
  const qTableEntriesAfter = await prisma.qTableEntry.count();
  const deltas = {
    averageP95LatencyImprovementPct: percentageDelta(
      summary.baseline.averageP95LatencyMs,
      summary.rl.averageP95LatencyMs,
      true,
    ),
    runP95LatencyImprovementPct: percentageDelta(
      summary.baseline.runP95LatencyMs,
      summary.rl.runP95LatencyMs,
      true,
    ),
    throughputImprovementPct: percentageDelta(
      summary.baseline.averageThroughputRps,
      summary.rl.averageThroughputRps,
      false,
    ),
    throughputEfficiencyImprovementPct: round(
      summary.rl.throughputEfficiencyPct - summary.baseline.throughputEfficiencyPct,
    ),
    slaViolationReductionPct: percentageDelta(
      summary.baseline.slaViolationRatePct,
      summary.rl.slaViolationRatePct,
      true,
    ),
    costReductionPct: percentageDelta(
      summary.baseline.averageCostPerThousandUsd,
      summary.rl.averageCostPerThousandUsd,
      true,
    ),
    rewardImprovementPct: percentageDelta(
      Math.abs(summary.baseline.cumulativeReward),
      Math.abs(summary.rl.cumulativeReward),
      true,
    ),
  };

  const isDecent =
    deltas.averageP95LatencyImprovementPct > 0 &&
    deltas.runP95LatencyImprovementPct > 0 &&
    summary.rl.slaViolationRatePct <= summary.baseline.slaViolationRatePct &&
    deltas.throughputImprovementPct >= -1 &&
    deltas.costReductionPct >= 0;
  const verdict = isDecent
    ? {
        status: "Presentation-worthy simulated result",
        explanation:
          "The frozen RL policy improved average and tail p95 latency, reduced SLA violations and cost, and preserved throughput on the matched holdout workload.",
      }
    : {
        status: "Not yet strong enough to claim superiority",
        explanation:
          "The RL controller did not beat the static baseline across the minimum latency, SLA, and throughput checks. Present this as an honest diagnostic result and tune or train further before claiming improvement.",
      };

  const result = {
    runId: run.id,
    seed,
    durationSeconds,
    intervalMs,
    completedAt: new Date().toISOString(),
    previousSnapshot,
    rewardWeights: runtime.weights,
    simulatorIntensity: runtime.intensity,
    epsilonStart: 0,
    epsilonEnd: round(epsilon, 6),
    qTableEntriesBefore,
    qTableEntriesAfter,
    finalRlControl: rlControl,
    finalBaselineControl: baselineControl,
    summary,
    deltas,
    verdict,
  };

  const { mkdir, writeFile } = await import("node:fs/promises");
  const { copyFile } = await import("node:fs/promises");
  await mkdir("outputs", { recursive: true });
  try {
    await copyFile("outputs/backtest-latest.json", "outputs/backtest-previous.json");
    await copyFile("outputs/backtest-latest.md", "outputs/backtest-previous.md");
  } catch {
    // The first backtest has no earlier report to archive.
  }
  await writeFile("outputs/backtest-latest.json", `${JSON.stringify(result, null, 2)}\n`);
  await writeFile("outputs/backtest-latest.md", reportMarkdown(result));
  console.log("BACKTEST_COMPLETE");
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

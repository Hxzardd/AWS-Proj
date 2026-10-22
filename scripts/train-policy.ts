import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import { qLearningConfigFromEnv } from "../lib/rl/qlearning";
import { rewardWeightsFromEnv } from "../lib/rl/reward";
import { trainPolicy } from "../lib/rl/training";
import type { QTable, RewardWeights, RlAction } from "../lib/rl/types";
import { runBaselineStep, runRlStep } from "../lib/simulation/engine";
import { INITIAL_CONTROL_STATE } from "../lib/simulation/generator";

const prisma = new PrismaClient();

function numericArgument(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive.`);
  return value;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function loadRuntimeSettings() {
  const settings = new Map(
    (await prisma.appSetting.findMany()).map((setting) => [setting.key, setting.value]),
  );
  const environment = rewardWeightsFromEnv();
  const weights: RewardWeights = {
    latency: Number(settings.get("rewardWeightLatency") ?? environment.latency),
    sla: Number(settings.get("rewardWeightSla") ?? environment.sla),
    throughput: Number(settings.get("rewardWeightThroughput") ?? environment.throughput),
    cost: Number(settings.get("rewardWeightCost") ?? environment.cost),
  };
  return { weights };
}

async function loadPersistedTable() {
  const entries = await prisma.qTableEntry.findMany();
  const qTable = entries.reduce<QTable>((table, entry) => {
    table[entry.stateKey] = {
      ...table[entry.stateKey],
      [entry.action as RlAction]: entry.qValue,
    };
    return table;
  }, {});
  return { entries, qTable };
}

function evaluate(qTable: QTable, weights: RewardWeights) {
  const seeds = [83_711, 194_117, 502_409, 777_731, 991_027, 1_337_039];
  const intensities = [0.8, 1, 1.15, 1.35, 1.55, 1.8];
  const config = qLearningConfigFromEnv();
  const metrics = {
    rl: [] as ReturnType<typeof runRlStep>[],
    baseline: [] as ReturnType<typeof runBaselineStep>[],
  };

  for (let episode = 0; episode < seeds.length; episode += 1) {
    let rlControl = { ...INITIAL_CONTROL_STATE };
    let baselineControl = { ...INITIAL_CONTROL_STATE };
    for (let step = 1; step <= 288; step += 1) {
      const common = {
        seed: seeds[episode] ?? 1,
        step,
        intensity: intensities[episode] ?? 1,
        weights,
      };
      const rl = runRlStep({
        ...common,
        control: rlControl,
        qTable,
        epsilon: 0,
        config,
        learn: false,
      });
      const baseline = runBaselineStep({ ...common, control: baselineControl });
      rlControl = rl.control;
      baselineControl = baseline.control;
      metrics.rl.push(rl);
      metrics.baseline.push(baseline);
    }
  }

  function summary(source: "rl" | "baseline") {
    const rows = metrics[source];
    const observations = rows.map((row) => row.metrics);
    const violations = observations.filter((metric) => metric.slaViolation).length;
    return {
      averageP95LatencyMs: round(average(observations.map((metric) => metric.p95LatencyMs))),
      averageThroughputRps: round(average(observations.map((metric) => metric.throughput))),
      slaViolationRatePct: round((violations / observations.length) * 100),
      averageCostPerThousandUsd: round(
        average(observations.map((metric) => metric.costPerThousandUsd)),
        7,
      ),
      averageReward: round(average(rows.map((row) => row.reward)), 5),
    };
  }

  const rl = summary("rl");
  const baseline = summary("baseline");
  return {
    holdoutSeeds: seeds,
    observationsPerController: metrics.rl.length,
    rl,
    baseline,
    deltas: {
      p95LatencyImprovementPct: round(
        ((baseline.averageP95LatencyMs - rl.averageP95LatencyMs) /
          baseline.averageP95LatencyMs) *
          100,
      ),
      throughputImprovementPct: round(
        ((rl.averageThroughputRps - baseline.averageThroughputRps) /
          baseline.averageThroughputRps) *
          100,
      ),
      slaViolationReductionPct: round(
        ((baseline.slaViolationRatePct - rl.slaViolationRatePct) /
          Math.max(baseline.slaViolationRatePct, 0.001)) *
          100,
      ),
      costReductionPct: round(
        ((baseline.averageCostPerThousandUsd - rl.averageCostPerThousandUsd) /
          baseline.averageCostPerThousandUsd) *
          100,
      ),
    },
  };
}

async function main() {
  const episodes = Math.floor(numericArgument("episodes", 400));
  const fresh = process.argv.includes("--fresh");
  const persist = process.argv.includes("--persist");
  const runtime = await loadRuntimeSettings();
  const existing = await loadPersistedTable();
  const config = qLearningConfigFromEnv();
  const initialTable = fresh ? {} : structuredClone(existing.qTable);
  const training = trainPolicy({
    qTable: initialTable,
    episodes,
    seedBase: 42_424,
    epsilon: 1,
    weights: runtime.weights,
    config,
  });
  const evaluation = evaluate(training.qTable, runtime.weights);
  const result = {
    generatedAt: new Date().toISOString(),
    freshTraining: fresh,
    persisted: persist,
    previousEntries: existing.entries.length,
    training: training.summary,
    evaluation,
  };

  await mkdir("outputs", { recursive: true });
  await writeFile(
    "outputs/qtable-before-training.json",
    `${JSON.stringify(existing.entries, null, 2)}\n`,
  );
  await writeFile("outputs/policy-training-latest.json", `${JSON.stringify(result, null, 2)}\n`);

  if (persist) {
    const rows = Object.entries(training.qTable).flatMap(([stateKey, actions]) =>
      Object.entries(actions).map(([action, qValue]) => ({
        stateKey,
        action,
        qValue: qValue ?? 0,
        visits: training.visits[stateKey]?.[action as RlAction] ?? 1,
      })),
    );
    await prisma.$transaction(async (transaction) => {
      await transaction.qTableEntry.deleteMany();
      await transaction.qTableEntry.createMany({ data: rows });
    });
  }

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

/**
 * Iterative hyperparameter / reward-weight tuner for the Q-learning policy.
 *
 * Pure and deterministic: no Prisma, no I/O beyond reading a candidate list and
 * writing a results file. Each candidate trains a FRESH policy, then is scored
 * on a held-out VALIDATION seed set that is disjoint from both the training
 * seeds and the original TEST seeds used in outputs/final-evaluation.md.
 *
 * Ranking is done on VALIDATION only. TEST metrics are reported for the record
 * but never used for selection, so the final numbers stay honest.
 *
 * Usage:
 *   tsx --env-file=.env scripts/tune.ts --candidates=work/tune/candidates.json --round=r1
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { qLearningConfigFromEnv, type QLearningConfig } from "../lib/rl/qlearning";
import { trainPolicy } from "../lib/rl/training";
import type { QTable, RewardWeights } from "../lib/rl/types";
import { runBaselineStep, runRlStep } from "../lib/simulation/engine";
import { INITIAL_CONTROL_STATE } from "../lib/simulation/generator";

type Candidate = {
  id: string;
  learningRate?: number;
  discountFactor?: number;
  epsilonMin?: number;
  epsilonDecay?: number;
  epsilonStart?: number;
  episodes?: number;
  stepsPerEpisode?: number;
  seedBase?: number;
  intensities?: number[]; // training intensities
  weights?: Partial<RewardWeights>;
};

const DEFAULT_WEIGHTS: RewardWeights = { latency: 0.4, sla: 0.3, throughput: 0.2, cost: 0.1 };

// Held-out sets. Seeds are disjoint from training and from each other.
// VALIDATION (12 seeds) concentrates in the policy-sensitive load regime
// (intensities 1.0-2.2, load near capacity) so SLA violations genuinely depend
// on the policy and the objective can discriminate on the headline metric.
const VALIDATION = {
  seeds: [
    314_159, 271_828, 161_803, 141_421, 577_215, 999_983, 223_607, 161_051, 120_121, 808_017,
    132_471, 662_607,
  ],
  intensities: [1.0, 1.3, 1.5, 1.7, 1.9, 2.1, 1.4, 1.6, 1.8, 2.0, 1.2, 2.2],
};
const TEST = {
  seeds: [83_711, 194_117, 502_409, 777_731, 991_027, 1_337_039],
  intensities: [0.8, 1, 1.15, 1.35, 1.55, 1.8],
};
// A third independent set, reported for generalization confidence only. Never
// used for selection (that stays on VALIDATION) and never mixed into TEST.
const ROBUST = {
  seeds: [246_913, 357_951, 468_012, 579_246, 680_133, 791_357, 802_468, 913_579],
  intensities: [1.1, 1.3, 1.5, 1.7, 1.9, 2.1, 1.4, 1.8],
};

function argValue(name: string, fallback: string) {
  const prefix = `--${name}=`;
  return process.argv.find((v) => v.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function average(values: number[]) {
  return values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1);
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function evaluate(
  qTable: QTable,
  weights: RewardWeights,
  set: { seeds: number[]; intensities: number[] },
  config: QLearningConfig,
) {
  const rl: ReturnType<typeof runRlStep>[] = [];
  const baseline: ReturnType<typeof runBaselineStep>[] = [];

  for (let episode = 0; episode < set.seeds.length; episode += 1) {
    let rlControl = { ...INITIAL_CONTROL_STATE };
    let baselineControl = { ...INITIAL_CONTROL_STATE };
    for (let step = 1; step <= 288; step += 1) {
      const common = {
        seed: set.seeds[episode] ?? 1,
        step,
        intensity: set.intensities[episode] ?? 1,
        weights,
      };
      const r = runRlStep({ ...common, control: rlControl, qTable, epsilon: 0, config, learn: false });
      const b = runBaselineStep({ ...common, control: baselineControl });
      rlControl = r.control;
      baselineControl = b.control;
      rl.push(r);
      baseline.push(b);
    }
  }

  function summary(rows: { metrics: import("../lib/rl/types").Observation; reward: number }[]) {
    const obs = rows.map((row) => row.metrics);
    const violations = obs.filter((m) => m.slaViolation).length;
    return {
      averageP95LatencyMs: round(average(obs.map((m) => m.p95LatencyMs))),
      averageThroughputRps: round(average(obs.map((m) => m.throughput))),
      slaViolationRatePct: round((violations / obs.length) * 100, 4),
      slaViolations: violations,
      averageCostPerThousandUsd: round(average(obs.map((m) => m.costPerThousandUsd)), 7),
      averageReward: round(average(rows.map((row) => row.reward)), 5),
    };
  }

  const rlSummary = summary(rl);
  const baselineSummary = summary(baseline);
  const deltas = {
    p95LatencyImprovementPct: round(
      ((baselineSummary.averageP95LatencyMs - rlSummary.averageP95LatencyMs) /
        baselineSummary.averageP95LatencyMs) *
        100,
    ),
    throughputImprovementPct: round(
      ((rlSummary.averageThroughputRps - baselineSummary.averageThroughputRps) /
        baselineSummary.averageThroughputRps) *
        100,
    ),
    slaViolationReductionPct: round(
      ((baselineSummary.slaViolationRatePct - rlSummary.slaViolationRatePct) /
        Math.max(baselineSummary.slaViolationRatePct, 0.0001)) *
        100,
    ),
    slaPointReduction: round(baselineSummary.slaViolationRatePct - rlSummary.slaViolationRatePct, 4),
    costReductionPct: round(
      ((baselineSummary.averageCostPerThousandUsd - rlSummary.averageCostPerThousandUsd) /
        baselineSummary.averageCostPerThousandUsd) *
        100,
    ),
  };
  return { observationsPerController: rl.length, rl: rlSummary, baseline: baselineSummary, deltas };
}

/**
 * Selection objective (validation only), ordered by the pitch's real priorities:
 * SLA violations first, then latency, then cost. The dominant term is a heavy
 * penalty on the RL policy's ABSOLUTE SLA violation rate so the search keeps
 * pushing violations toward zero instead of stalling once it beats the baseline.
 * Latency improvement is next; cost improvement is a lighter tiebreaker so the
 * search does not chase cost-aggressive policies that inflate tail latency.
 * Throughput must not regress or the candidate is rejected outright.
 */
function objective(evalResult: ReturnType<typeof evaluate>) {
  const { deltas, rl, baseline } = evalResult;
  if (rl.averageThroughputRps < baseline.averageThroughputRps * 0.999) return -1000;
  return round(
    deltas.p95LatencyImprovementPct - 8 * rl.slaViolationRatePct + 0.4 * deltas.costReductionPct,
    4,
  );
}

async function main() {
  const candidatesPath = argValue("candidates", "work/tune/candidates.json");
  const roundLabel = argValue("round", "adhoc");
  const envConfig = qLearningConfigFromEnv();
  const candidates: Candidate[] = JSON.parse(await readFile(candidatesPath, "utf8"));

  const results = [];
  for (const candidate of candidates) {
    const started = Date.now();
    const config: QLearningConfig = {
      learningRate: candidate.learningRate ?? envConfig.learningRate,
      discountFactor: candidate.discountFactor ?? envConfig.discountFactor,
      epsilonMin: candidate.epsilonMin ?? envConfig.epsilonMin,
      epsilonDecay: candidate.epsilonDecay ?? envConfig.epsilonDecay,
    };
    const weights: RewardWeights = { ...DEFAULT_WEIGHTS, ...candidate.weights };
    const episodes = candidate.episodes ?? 1000;
    const training = trainPolicy({
      qTable: {},
      episodes,
      stepsPerEpisode: candidate.stepsPerEpisode ?? 288,
      seedBase: candidate.seedBase ?? 42_424,
      epsilon: candidate.epsilonStart ?? 1,
      intensities: candidate.intensities,
      weights,
      config,
    });
    const validation = evaluate(training.qTable, weights, VALIDATION, config);
    const robust = evaluate(training.qTable, weights, ROBUST, config);
    const test = evaluate(training.qTable, weights, TEST, config);
    const score = objective(validation);
    results.push({
      id: candidate.id,
      config,
      weights,
      episodes,
      intensities: candidate.intensities ?? "default",
      score,
      qTableEntries: training.summary.qTableEntries,
      trainingAverageReward: round(training.summary.averageReward, 5),
      validation,
      robust,
      test,
      elapsedMs: Date.now() - started,
    });
    const v = validation.deltas;
    const r = robust.deltas;
    const t = test.deltas;
    console.log(
      `${candidate.id.padEnd(24)} score=${String(score).padStart(8)}  ` +
        `VAL lat+${v.p95LatencyImprovementPct}% sla${validation.rl.slaViolations}v cost+${v.costReductionPct}%  |  ` +
        `ROB lat+${r.p95LatencyImprovementPct}% sla${robust.rl.slaViolations}v cost+${r.costReductionPct}%  |  ` +
        `TEST lat+${t.p95LatencyImprovementPct}% sla${test.rl.slaViolations}v cost+${t.costReductionPct}%  ` +
        `(${(results[results.length - 1]!.elapsedMs / 1000).toFixed(1)}s)`,
    );
  }

  results.sort((a, b) => b.score - a.score);

  await mkdir("work/tune", { recursive: true });
  const outPath = `work/tune/results-${roundLabel}.json`;
  await writeFile(outPath, `${JSON.stringify({ round: roundLabel, generatedAt: new Date().toISOString(), ranked: results }, null, 2)}\n`);
  await writeFile("work/tune/best.json", `${JSON.stringify(results[0], null, 2)}\n`);

  console.log(`\nRound "${roundLabel}" ranked ${results.length} candidates. Best: ${results[0]?.id} (score ${results[0]?.score}).`);
  console.log(`Wrote ${outPath} and work/tune/best.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

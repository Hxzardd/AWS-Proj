import { INITIAL_CONTROL_STATE, type ControlState } from "./generator";
import { runBaselineStep, runRlStep } from "./engine";
import { scenarioDemand, type Scenario, type TrafficPoint } from "./scenarios";
import { trainPolicy } from "../rl/training";
import { DEFAULT_REWARD_WEIGHTS } from "../rl/reward";
import type { QTable, Observation } from "../rl/types";

// Identical configuration in the browser and CLI; independent of server secrets.
export const EXPERIMENT_CONFIG = { learningRate: 0.18, discountFactor: 0.9, epsilonMin: 0.05, epsilonDecay: 0.995 };
export const TRAINING_SEED = 42_424;
export const HOLDOUT_SEEDS = [20260922, 20260923, 20260924, 20260925, 20260926];
export function isTrainingSeed(seed: number) {
  const episode = (seed - TRAINING_SEED) / 7919;
  return Number.isInteger(episode) && episode >= 0 && episode < 1000;
}
export type ExperimentInput = { scenario: Scenario; seed: number; custom?: TrafficPoint[] };
export type ReplayPoint = {
  step: number; demand: number; rl: ReturnType<typeof runRlStep>; baseline: ReturnType<typeof runBaselineStep>;
};
export function replayStep(input: ExperimentInput & {
  step: number; table: QTable; rlControl: ControlState; baseControl: ControlState; learn?: boolean; epsilon?: number;
}): ReplayPoint {
  const common = { seed: input.seed, step: input.step, intensity: 1, weights: DEFAULT_REWARD_WEIGHTS,
    requestRateOverride: scenarioDemand(input.scenario, input.seed, input.step, input.custom) };
  return {
    step: input.step, demand: common.requestRateOverride,
    rl: runRlStep({ ...common, control: input.rlControl, qTable: input.table, epsilon: input.epsilon ?? 0, config: EXPERIMENT_CONFIG, learn: input.learn ?? false }),
    baseline: runBaselineStep({ ...common, control: input.baseControl }),
  };
}
export function evaluatePolicy(table: QTable, input: ExperimentInput, steps = 288) {
  let rlControl = { ...INITIAL_CONTROL_STATE }, baseControl = { ...INITIAL_CONTROL_STATE };
  const points: ReplayPoint[] = [];
  for (let step = 1; step <= steps; step++) {
    const point = replayStep({ ...input, step, table, rlControl, baseControl });
    rlControl = point.rl.control; baseControl = point.baseline.control; points.push(point);
  }
  return { points, rl: summarize(points.map((point) => point.rl)), baseline: summarize(points.map((point) => point.baseline)) };
}
export function summarize(results: Array<{ metrics: Observation; reward: number }>) {
  const count = results.length;
  if (!count) throw new Error("Cannot summarize an empty experiment.");
  const sum = (value: (row: (typeof results)[number]) => number) => results.reduce((total, row) => total + value(row), 0);
  return {
    count, meanP95Ms: sum((row) => row.metrics.p95LatencyMs) / count,
    slaViolationPct: 100 * sum((row) => Number(row.metrics.slaViolation)) / count,
    meanReward: sum((row) => row.reward) / count,
    // Total cost / total completed requests for equal-duration intervals.
    costPerThousandUsd: sum((row) => row.metrics.costPerThousandUsd * row.metrics.throughput) / Math.max(sum((row) => row.metrics.throughput), 1),
    throughputPct: 100 * sum((row) => row.metrics.throughput) / Math.max(sum((row) => row.metrics.requestRate), 1),
  };
}
export function trainBatch(table: QTable, completedEpisodes: number, episodes: number, epsilon: number) {
  return trainPolicy({ qTable: table, episodes, seedBase: TRAINING_SEED + completedEpisodes * 7919,
    epsilon, weights: DEFAULT_REWARD_WEIGHTS, config: EXPERIMENT_CONFIG });
}

/** Synthetic CloudWatch-shaped data, never sent to AWS. RequestCount uses a 300s Sum; latency is seconds. */
export function cloudWatchFixture(points: ReplayPoint[]) {
  return {
    simulated: true, source: "VectorPay deterministic simulator", periodSeconds: 300,
    note: "Synthetic interval p95 values, not raw request samples or downloaded AWS data.",
    namespace: "VectorPay/Simulation",
    intervals: points.map((point) => ({
      step: point.step, timestamp: new Date(Date.UTC(2026, 8, 22) + (point.step - 1) * 300_000).toISOString(),
      metrics: [
        { namespace: "AWS/ApplicationELB", name: "RequestCount", unit: "Count", statistic: "Sum", value: Math.round(point.demand * 300) },
        { namespace: "AWS/ApplicationELB", name: "TargetResponseTime", unit: "Seconds", statistic: "p95", value: point.rl.metrics.p95LatencyMs / 1000 },
        { namespace: "AWS/EC2", name: "CPUUtilization", unit: "Percent", statistic: "Average", value: point.rl.metrics.cpuPct },
        { namespace: "AWS/AutoScaling", name: "GroupInServiceInstances", unit: "Count", statistic: "Average", value: point.rl.control.instances },
      ],
    })),
  };
}
export function trafficCsv(points: ReplayPoint[]) {
  return "step,rps\n" + points.map((point) => `${point.step},${point.demand.toFixed(2)}`).join("\n") + "\n";
}

import { clamp } from "@/lib/utils";
import type { Observation, RewardWeights } from "./types";

export const DEFAULT_REWARD_WEIGHTS: RewardWeights = {
  latency: 0.4,
  sla: 0.3,
  throughput: 0.2,
  cost: 0.1,
};

export const REWARD_FORMULA =
  "-w1 * normalizedLatency - w2 * slaViolationPenalty + w3 * normalizedThroughput - w4 * normalizedCostPerRequest";

export function calculateReward(
  observation: Observation,
  weights: RewardWeights = DEFAULT_REWARD_WEIGHTS,
  slaTargetMs = Number(process.env.SLA_TARGET_LATENCY_MS ?? 200),
) {
  const normalizedLatency = clamp(observation.p95LatencyMs / slaTargetMs, 0, 4);
  const slaViolationPenalty = observation.slaViolation
    ? 1 + clamp((observation.p95LatencyMs - slaTargetMs) / slaTargetMs, 0, 3)
    : 0;
  const normalizedThroughput = clamp(
    observation.throughput / Math.max(observation.requestRate, 1),
    0,
    1,
  );
  const normalizedCostPerRequest = clamp(
    observation.costPerThousandUsd /
      Number(process.env.RL_COST_REFERENCE_PER_THOUSAND_USD ?? 0.00004),
    0,
    4,
  );

  return (
    -weights.latency * normalizedLatency -
    weights.sla * slaViolationPenalty +
    weights.throughput * normalizedThroughput -
    weights.cost * normalizedCostPerRequest
  );
}

export function rewardWeightsFromEnv(): RewardWeights {
  return {
    latency: Number(process.env.RL_REWARD_WEIGHT_LATENCY ?? 0.4),
    sla: Number(process.env.RL_REWARD_WEIGHT_SLA ?? 0.3),
    throughput: Number(process.env.RL_REWARD_WEIGHT_THROUGHPUT ?? 0.2),
    cost: Number(process.env.RL_REWARD_WEIGHT_COST ?? 0.1),
  };
}

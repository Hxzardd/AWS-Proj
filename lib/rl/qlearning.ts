import { clamp } from "@/lib/utils";
import {
  RL_ACTIONS,
  type DiscreteState,
  type Observation,
  type QTable,
  type RlAction,
} from "./types";

export type QLearningConfig = {
  learningRate: number;
  discountFactor: number;
  epsilonMin: number;
  epsilonDecay: number;
};

function bucket(value: number, lowMax: number, mediumMax: number) {
  if (value < lowMax) return "low" as const;
  if (value <= mediumMax) return "medium" as const;
  return "high" as const;
}

export function discretizeState(observation: Observation): DiscreteState {
  return {
    latencyBucket: bucket(observation.p95LatencyMs, 140, 220),
    cpuBucket: bucket(observation.cpuPct, 45, 72),
    requestRateBucket: bucket(observation.requestRate, 1_200, 3_000),
    cacheHitBucket: bucket(observation.cacheHitRatio, 0.55, 0.78),
  };
}

export function stateToKey(state: DiscreteState) {
  return [
    `latency:${state.latencyBucket}`,
    `cpu:${state.cpuBucket}`,
    `request:${state.requestRateBucket}`,
    `cache:${state.cacheHitBucket}`,
  ].join("|");
}

export function getQValue(table: QTable, stateKey: string, action: RlAction) {
  return table[stateKey]?.[action] ?? 0;
}

export function chooseAction(
  table: QTable,
  stateKey: string,
  epsilon: number,
  random: () => number = Math.random,
  candidates: readonly RlAction[] = RL_ACTIONS,
): { action: RlAction; explored: boolean } {
  const actions = candidates.length > 0 ? candidates : (["NO_OP"] as const);
  if (random() < clamp(epsilon, 0, 1)) {
    return {
      action: actions[Math.floor(random() * actions.length)] ?? "NO_OP",
      explored: true,
    };
  }

  const scored = actions.map((action) => ({
    action,
    value: getQValue(table, stateKey, action),
  }));
  const max = Math.max(...scored.map(({ value }) => value));
  const best = scored.filter(({ value }) => value === max);

  return {
    action: best[Math.floor(random() * best.length)]?.action ?? "NO_OP",
    explored: false,
  };
}

export function updateQValue(input: {
  table: QTable;
  stateKey: string;
  action: RlAction;
  reward: number;
  nextStateKey: string;
  config: QLearningConfig;
  nextActions?: readonly RlAction[];
}) {
  const { table, stateKey, action, reward, nextStateKey, config } = input;
  const nextActions = input.nextActions?.length ? input.nextActions : RL_ACTIONS;
  const current = getQValue(table, stateKey, action);
  const nextBest = Math.max(
    ...nextActions.map((candidate) => getQValue(table, nextStateKey, candidate)),
  );
  const updated =
    current +
    config.learningRate *
      (reward + config.discountFactor * nextBest - current);

  table[stateKey] = { ...table[stateKey], [action]: updated };
  return updated;
}

export function decayEpsilon(epsilon: number, config: QLearningConfig) {
  return Math.max(config.epsilonMin, epsilon * config.epsilonDecay);
}

export function epsilonAfterUpdates(
  epsilonStart: number,
  updates: number,
  config: QLearningConfig,
) {
  return Math.max(
    config.epsilonMin,
    clamp(epsilonStart, 0, 1) * config.epsilonDecay ** Math.max(0, updates),
  );
}

export function qLearningConfigFromEnv(): QLearningConfig {
  return {
    learningRate: Number(process.env.RL_LEARNING_RATE ?? 0.18),
    discountFactor: Number(process.env.RL_DISCOUNT_FACTOR ?? 0.9),
    epsilonMin: Number(process.env.RL_EPSILON_MIN ?? 0.05),
    epsilonDecay: Number(process.env.RL_EPSILON_DECAY ?? 0.995),
  };
}

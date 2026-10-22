import {
  chooseAction,
  decayEpsilon,
  discretizeState,
  getQValue,
  stateToKey,
  updateQValue,
  type QLearningConfig,
} from "@/lib/rl/qlearning";
import { constrainActions } from "@/lib/rl/safety";
import { calculateReward } from "@/lib/rl/reward";
import type { Observation, QTable, RewardWeights, RlAction } from "@/lib/rl/types";
import { chooseBaselineAction, explainBaselineAction } from "./baseline";
import {
  applyAction,
  createStepRandom,
  describeAction,
  simulateObservation,
  type ControlState,
} from "./generator";

export function runRlStep(input: {
  seed: number;
  step: number;
  control: ControlState;
  qTable: QTable;
  epsilon: number;
  intensity: number;
  requestRateOverride?: number;
  weights: RewardWeights;
  config: QLearningConfig;
  learn?: boolean;
}) {
  const beforeMetrics = simulateObservation(input);
  const state = discretizeState(beforeMetrics);
  const stateKey = stateToKey(state);
  const constraints = constrainActions(beforeMetrics, input.control);
  const decision = chooseAction(
    input.qTable,
    stateKey,
    input.epsilon,
    createStepRandom(input.seed + 91_919, input.step),
    constraints.allowed,
  );
  const control = applyAction(input.control, decision.action);
  const metrics = simulateObservation({ ...input, control });
  const nextState = discretizeState(metrics);
  const nextStateKey = stateToKey(nextState);
  const nextConstraints = constrainActions(metrics, control);
  const reward = calculateReward(metrics, input.weights);
  const learn = input.learn ?? true;
  const qValue = learn
    ? updateQValue({
        table: input.qTable,
        stateKey,
        action: decision.action,
        reward,
        nextStateKey,
        config: input.config,
        nextActions: nextConstraints.allowed,
      })
    : getQValue(input.qTable, stateKey, decision.action);

  return {
    metrics,
    control,
    state,
    stateKey,
    action: decision.action,
    reward,
    qValue,
    epsilon: learn ? decayEpsilon(input.epsilon, input.config) : input.epsilon,
    learned: learn,
    constraints,
    reason: `${decision.explored ? "Exploration" : "Exploitation"} selected ${decision.action} for ${stateKey} from ${constraints.allowed.length} safe actions. ${describeAction(decision.action, input.control, control)}.`,
  };
}

/**
 * One control step against a real, already-observed environment. Unlike
 * {@link runRlStep}, reality cannot be re-simulated after acting, so learning is
 * temporal-difference across ticks: the reward computed from this tick's
 * observation updates the Q-value of the *previous* tick's state-action
 * (`pending`). The chosen action's state-action is returned as the next
 * `pending`. Decision, safety, reward and epsilon decay reuse the same functions
 * as the simulator, so the agent behaves identically — only the metric source
 * and the learning timing differ.
 */
export function runRealRlStep(input: {
  observation: Observation;
  control: ControlState;
  qTable: QTable;
  epsilon: number;
  weights: RewardWeights;
  config: QLearningConfig;
  pending?: { stateKey: string; action: RlAction } | null;
  learn?: boolean;
}) {
  const metrics = input.observation;
  const reward = calculateReward(metrics, input.weights);
  const state = discretizeState(metrics);
  const stateKey = stateToKey(state);
  const constraints = constrainActions(metrics, input.control);
  const learn = (input.learn ?? true) && Boolean(input.pending);

  const learnedQValue = learn
    ? updateQValue({
        table: input.qTable,
        stateKey: input.pending!.stateKey,
        action: input.pending!.action,
        reward,
        nextStateKey: stateKey,
        config: input.config,
        nextActions: constraints.allowed,
      })
    : undefined;

  const decision = chooseAction(
    input.qTable,
    stateKey,
    input.epsilon,
    Math.random,
    constraints.allowed,
  );
  const control = applyAction(input.control, decision.action);

  return {
    metrics,
    control,
    state,
    stateKey,
    action: decision.action,
    reward,
    learned: learn,
    // Q-value of the transition we just learned, else the current best estimate.
    qValue: learnedQValue ?? getQValue(input.qTable, stateKey, decision.action),
    epsilon: learn ? decayEpsilon(input.epsilon, input.config) : input.epsilon,
    pending: { stateKey, action: decision.action },
    constraints,
    reason: `${decision.explored ? "Exploration" : "Exploitation"} selected ${decision.action} for ${stateKey} on live AWS metrics from ${constraints.allowed.length} safe actions. ${describeAction(decision.action, input.control, control)}.`,
  };
}

export function runBaselineStep(input: {
  seed: number;
  step: number;
  control: ControlState;
  intensity: number;
  requestRateOverride?: number;
  weights: RewardWeights;
}) {
  const beforeMetrics = simulateObservation(input);
  const state = discretizeState(beforeMetrics);
  const stateKey = stateToKey(state);
  const action = chooseBaselineAction(beforeMetrics);
  const control = applyAction(input.control, action);
  const metrics = simulateObservation({ ...input, control });
  const reward = calculateReward(metrics, input.weights);

  return {
    metrics,
    control,
    state,
    stateKey,
    action,
    reward,
    reason: `${explainBaselineAction(beforeMetrics, action)}. ${describeAction(action, input.control, control)}.`,
  };
}

import type { QLearningConfig } from "./qlearning";
import type { QTable, RewardWeights } from "./types";
import { runRlStep } from "../simulation/engine";
import { INITIAL_CONTROL_STATE } from "../simulation/generator";

export type TrainingSummary = {
  episodes: number;
  updates: number;
  epsilonStart: number;
  epsilonEnd: number;
  averageReward: number;
  qTableEntries: number;
};

/** Trains entirely through the public control-step interface with no I/O. */
export function trainPolicy(input: {
  qTable?: QTable;
  episodes: number;
  stepsPerEpisode?: number;
  seedBase: number;
  epsilon: number;
  intensities?: readonly number[];
  weights: RewardWeights;
  config: QLearningConfig;
}): {
  qTable: QTable;
  visits: Record<string, Partial<Record<import("./types").RlAction, number>>>;
  epsilon: number;
  summary: TrainingSummary;
} {
  const qTable = input.qTable ?? {};
  const visits: Record<string, Partial<Record<import("./types").RlAction, number>>> = {};
  const stepsPerEpisode = input.stepsPerEpisode ?? 288;
  const intensities = input.intensities?.length
    ? input.intensities
    : [0.75, 1, 1.25, 1.5, 1.8];
  let epsilon = input.epsilon;
  let cumulativeReward = 0;
  let updates = 0;

  for (let episode = 0; episode < input.episodes; episode += 1) {
    let control = { ...INITIAL_CONTROL_STATE };
    const seed = input.seedBase + episode * 7_919;
    const intensity = intensities[episode % intensities.length] ?? 1;

    for (let step = 1; step <= stepsPerEpisode; step += 1) {
      const result = runRlStep({
        seed,
        step,
        control,
        qTable,
        epsilon,
        intensity,
        weights: input.weights,
        config: input.config,
        learn: true,
      });
      control = result.control;
      visits[result.stateKey] = {
        ...visits[result.stateKey],
        [result.action]: (visits[result.stateKey]?.[result.action] ?? 0) + 1,
      };
      epsilon = result.epsilon;
      cumulativeReward += result.reward;
      updates += 1;
    }
  }

  return {
    qTable,
    visits,
    epsilon,
    summary: {
      episodes: input.episodes,
      updates,
      epsilonStart: input.epsilon,
      epsilonEnd: epsilon,
      averageReward: cumulativeReward / Math.max(updates, 1),
      qTableEntries: Object.values(qTable).reduce(
        (count, actions) => count + Object.keys(actions).length,
        0,
      ),
    },
  };
}

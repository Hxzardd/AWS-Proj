import { describe, expect, it } from "vitest";
import { chooseAction, decayEpsilon, epsilonAfterUpdates, updateQValue } from "@/lib/rl/qlearning";
import type { QTable } from "@/lib/rl/types";

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

describe("tabular Q-learning", () => {
  it("converges on the action with the highest reward in a stable state", () => {
    const table: QTable = {};
    const stateKey = "latency:high|cpu:high|request:high|cache:low";
    const random = seededRandom(42);
    const config = { learningRate: 0.2, discountFactor: 0.9, epsilonMin: 0.01, epsilonDecay: 0.995 };
    let epsilon = 1;

    for (let episode = 0; episode < 4_000; episode += 1) {
      const { action } = chooseAction(table, stateKey, epsilon, random);
      const reward = action === "SCALE_UP" ? 1 : -0.25;
      updateQValue({ table, stateKey, action, reward, nextStateKey: stateKey, config });
      epsilon = decayEpsilon(epsilon, config);
    }

    const decision = chooseAction(table, stateKey, 0, () => 0.1);
    expect(decision.action).toBe("SCALE_UP");
    expect(table[stateKey]?.SCALE_UP).toBeGreaterThan(table[stateKey]?.NO_OP ?? 0);
    expect(epsilon).toBe(config.epsilonMin);
  });

  it("applies the Bellman update instead of replacing a Q-value", () => {
    const table: QTable = { state: { NO_OP: 0.5 }, next: { SCALE_UP: 0.8 } };
    const updated = updateQValue({
      table,
      stateKey: "state",
      action: "NO_OP",
      reward: 1,
      nextStateKey: "next",
      config: { learningRate: 0.2, discountFactor: 0.9, epsilonMin: 0.05, epsilonDecay: 0.99 },
    });
    expect(updated).toBeCloseTo(0.744, 6);
  });

  it("continues epsilon decay from persisted visit counts", () => {
    const config = { learningRate: 0.2, discountFactor: 0.9, epsilonMin: 0.05, epsilonDecay: 0.995 };
    expect(epsilonAfterUpdates(1, 0, config)).toBe(1);
    expect(epsilonAfterUpdates(1, 10_000, config)).toBe(config.epsilonMin);
  });

  it("selects only from actions permitted by operational constraints", () => {
    const decision = chooseAction({}, "state", 1, () => 0.99, ["NO_OP"]);
    expect(decision.action).toBe("NO_OP");
  });
});

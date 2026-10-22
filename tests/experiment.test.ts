import { describe, expect, it } from "vitest";
import { cloudWatchFixture, evaluatePolicy, HOLDOUT_SEEDS, isTrainingSeed, replayStep, trainBatch, trafficCsv } from "@/lib/simulation/experiment";
import { DEFAULT_CUSTOM_TRAFFIC, parseTrafficCsv, scenarioDemand, SCENARIOS, type Scenario } from "@/lib/simulation/scenarios";
import { INITIAL_CONTROL_STATE, simulateObservation } from "@/lib/simulation/generator";

describe("custom traffic and experiment integrity", () => {
  it("keeps every scored seed out of the training set", () => {
    expect(HOLDOUT_SEEDS.some(isTrainingSeed)).toBe(false);
    expect(isTrainingSeed(42424)).toBe(true);
    expect(isTrainingSeed(42424 + 999 * 7919)).toBe(true);
    expect(isTrainingSeed(42424 + 1000 * 7919)).toBe(false);
  });
  it.each(["", "step,rps", "2,100", "1,-1", "1,Infinity", "1,100001", "1,", "1,2,3", "1,100\n1,200", "1,100\n289,200"])("rejects malformed trace %j", (csv) => {
    expect(() => parseTrafficCsv(csv)).toThrow();
  });
  it("holds custom rates across phase boundaries including no traffic", () => {
    const custom = parseTrafficCsv("step,rps\n1,0\n20,7000\n40,900");
    expect([1,19,20,39,40].map((step) => scenarioDemand("custom", 1, step, custom))).toEqual([0,0,7000,7000,900]);
  });
  it("feeds identical custom demand to both controllers", () => {
    const result = evaluatePolicy({}, { scenario: "custom", seed: 2026, custom: parseTrafficCsv(DEFAULT_CUSTOM_TRAFFIC) });
    for (const point of result.points) expect(point.rl.metrics.requestRate).toBe(point.baseline.metrics.requestRate);
    expect(result.points[71].demand).toBe(6500);
    expect(result.points[107].demand).toBe(1800);
  });
  it("freezes policy and is reproducible during evaluation", () => {
    const { qTable } = trainBatch({}, 0, 10, 1);
    const original = structuredClone(qTable);
    const input = { scenario: "normal" as const, seed: HOLDOUT_SEEDS[0] };
    expect(evaluatePolicy(qTable, input)).toEqual(evaluatePolicy(qTable, input));
    expect(qTable).toEqual(original);
  });
  it("continues a batched training run identically to uninterrupted training", () => {
    const first = trainBatch({}, 0, 10, 1);
    const continued = trainBatch(first.qTable, 10, 10, first.epsilon);
    expect(continued.qTable).toEqual(trainBatch({}, 0, 20, 1).qTable);
  });
  it("updates Q-values in online learning mode", () => {
    const table = {};
    const point = replayStep({ scenario: "normal", seed: 2026, step: 1, table, rlControl: INITIAL_CONTROL_STATE, baseControl: INITIAL_CONTROL_STATE, learn: true, epsilon: 1 });
    expect(point.rl.learned).toBe(true); expect(Object.keys(table)).toHaveLength(1); expect(point.rl.epsilon).toBeLessThan(1);
  });
  it("exports correct synthetic CloudWatch units and a re-importable traffic CSV", () => {
    const points = evaluatePolicy({}, { scenario: "normal", seed: 2026 }).points;
    const fixture = cloudWatchFixture(points);
    expect(fixture.simulated).toBe(true);
    expect(fixture.intervals[0].metrics[0].value).toBe(Math.round(points[0].demand * 300));
    expect(fixture.intervals[0].metrics[1].value).toBe(points[0].rl.metrics.p95LatencyMs / 1000);
    expect(parseTrafficCsv(trafficCsv(points))).toHaveLength(288);
  });
  it("keeps metrics finite and controls bounded across every stress scenario", () => {
    for (const scenario of Object.keys(SCENARIOS) as Scenario[]) {
      const result = evaluatePolicy({}, { scenario, seed: 20260922, custom: parseTrafficCsv(DEFAULT_CUSTOM_TRAFFIC) });
      for (const point of result.points) {
        for (const value of Object.values(point.rl.metrics)) if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
        expect(point.rl.control.instances).toBeGreaterThanOrEqual(2); expect(point.rl.control.instances).toBeLessThanOrEqual(12);
        expect(point.rl.control.cacheTtlSec).toBeGreaterThanOrEqual(30); expect(point.rl.control.cacheTtlSec).toBeLessThanOrEqual(300);
        expect(point.rl.constraints.allowed).toContain(point.rl.action);
      }
    }
  });
  it.each([-1, NaN, Infinity])("rejects invalid demand overrides %s", (requestRateOverride) => {
    expect(() => simulateObservation({ seed: 1, step: 1, control: INITIAL_CONTROL_STATE, requestRateOverride })).toThrow();
  });
  it("improves aggregate unseen-day reward after training, without promising monotonic improvement", () => {
    const trained = trainBatch({}, 0, 1000, 1);
    let coldReward = 0, trainedReward = 0, baselineReward = 0;
    for (const seed of HOLDOUT_SEEDS) {
      const input = { scenario: "normal" as const, seed };
      coldReward += evaluatePolicy({}, input).rl.meanReward;
      const result = evaluatePolicy(trained.qTable, input);
      trainedReward += result.rl.meanReward; baselineReward += result.baseline.meanReward;
    }
    expect(trainedReward).toBeGreaterThan(coldReward); expect(trainedReward).toBeGreaterThan(baselineReward);
  });
});

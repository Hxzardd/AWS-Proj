import { describe, expect, it } from "vitest";
import { calculateReward } from "@/lib/rl/reward";
import type { Observation } from "@/lib/rl/types";

const observation: Observation = {
  latencyMs: 140,
  p95LatencyMs: 200,
  throughput: 800,
  cpuPct: 60,
  memPct: 58,
  requestRate: 1_000,
  networkLatencyMs: 28,
  cacheHitRatio: 0.7,
  slaViolation: false,
  costPerThousandUsd: 0.00002,
};

describe("calculateReward", () => {
  it("implements the documented weighted reward equation", () => {
    const reward = calculateReward(observation, {
      latency: 0.4,
      sla: 0.3,
      throughput: 0.2,
      cost: 0.1,
    }, 200);
    expect(reward).toBeCloseTo(-0.29, 8);
  });

  it("penalizes an SLA violation more than a compliant observation", () => {
    const compliant = calculateReward(observation);
    const violating = calculateReward({ ...observation, p95LatencyMs: 320, slaViolation: true });
    expect(violating).toBeLessThan(compliant);
  });

  it("rewards higher completed throughput when other metrics are equal", () => {
    const low = calculateReward({ ...observation, throughput: 500 });
    const high = calculateReward({ ...observation, throughput: 950 });
    expect(high).toBeGreaterThan(low);
  });
});

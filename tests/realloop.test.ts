import { afterEach, describe, expect, it, vi } from "vitest";
import { observeLiveGateway } from "@/lib/aws/observe";
import { runRealRlStep } from "@/lib/simulation/engine";
import { INITIAL_CONTROL_STATE } from "@/lib/simulation/generator";
import { DEFAULT_REWARD_WEIGHTS } from "@/lib/rl/reward";
import type { AwsEnv } from "@/lib/config";
import type { Observation, QTable } from "@/lib/rl/types";

const aws = {
  AWS_REGION: "ap-south-1",
  AWS_ALB_DNS: "alb.test",
  AWS_CACHE_TTL_PARAM: "/optimizer/cacheTtlSec",
} as unknown as AwsEnv;

const config = { learningRate: 0.5, discountFactor: 0.9, epsilonMin: 0.05, epsilonDecay: 0.99 };

function fleetResponse(body: Record<string, number>) {
  return { ok: true, json: async () => body } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("observeLiveGateway", () => {
  it("maps the fleet aggregate into an Observation and flags SLA breaches", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fleetResponse({
      p95LatencyMs: 320, requestRate: 2_600, throughput: 2_400, cpuPct: 88, memPct: 61, cacheHitRatio: 0.62,
    })));
    const observation = await observeLiveGateway(aws, 2);
    expect(observation.p95LatencyMs).toBe(320);
    expect(observation.cpuPct).toBe(88);
    expect(observation.requestRate).toBe(2_600);
    expect(observation.slaViolation).toBe(true); // 320 > SLA_TARGET_LATENCY_MS default 200
    expect(observation.costPerThousandUsd).toBeGreaterThan(0);
  });

  it("throws when the gateway fleet endpoint is unhealthy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 }) as unknown as Response));
    await expect(observeLiveGateway(aws, 1)).rejects.toThrow("503");
  });
});

const highLoad: Observation = {
  latencyMs: 260, p95LatencyMs: 330, throughput: 1_800, cpuPct: 90, memPct: 70,
  requestRate: 3_200, networkLatencyMs: 40, cacheHitRatio: 0.5, slaViolation: true, costPerThousandUsd: 0.00005,
};
const lowLoad: Observation = {
  latencyMs: 90, p95LatencyMs: 120, throughput: 2_000, cpuPct: 30, memPct: 45,
  requestRate: 900, networkLatencyMs: 18, cacheHitRatio: 0.8, slaViolation: false, costPerThousandUsd: 0.00003,
};

describe("runRealRlStep temporal-difference learning", () => {
  it("does not learn on the first tick but returns a pending transition", () => {
    const qTable: QTable = {};
    const result = runRealRlStep({
      observation: highLoad, control: INITIAL_CONTROL_STATE, qTable,
      epsilon: 0, weights: DEFAULT_REWARD_WEIGHTS, config, pending: null,
    });
    expect(result.learned).toBe(false);
    expect(result.pending.action).toBe(result.action);
    expect(Object.keys(qTable)).toHaveLength(0);
  });

  it("updates the previous state-action once the next observation arrives", () => {
    const qTable: QTable = {};
    const first = runRealRlStep({
      observation: highLoad, control: INITIAL_CONTROL_STATE, qTable,
      epsilon: 0, weights: DEFAULT_REWARD_WEIGHTS, config, pending: null,
    });
    const second = runRealRlStep({
      observation: lowLoad, control: INITIAL_CONTROL_STATE, qTable,
      epsilon: 0, weights: DEFAULT_REWARD_WEIGHTS, config, pending: first.pending,
    });
    expect(second.learned).toBe(true);
    expect(qTable[first.pending.stateKey]?.[first.pending.action]).toBeTypeOf("number");
  });
});

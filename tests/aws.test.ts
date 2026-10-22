import { afterEach, describe, expect, it, vi } from "vitest";
import { executeInfrastructureAction } from "@/lib/aws/actions";
import { getAwsEnv } from "@/lib/config";
import { INITIAL_CONTROL_STATE, simulateObservation } from "@/lib/simulation/generator";
import { RL_ACTIONS } from "@/lib/rl/types";

const sends = vi.hoisted(() => ({ auto: vi.fn(), alb: vi.fn(), cloud: vi.fn(), ssm: vi.fn() }));
vi.mock("@aws-sdk/client-auto-scaling", () => ({
  AutoScalingClient: class { send = sends.auto; },
  SetDesiredCapacityCommand: class { constructor(public input: unknown) {} },
}));
vi.mock("@aws-sdk/client-elastic-load-balancing-v2", () => ({
  ElasticLoadBalancingV2Client: class { send = sends.alb; },
  ModifyRuleCommand: class { constructor(public input: unknown) {} },
}));
vi.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: class { send = sends.cloud; },
  PutMetricDataCommand: class { constructor(public input: unknown) {} },
}));
vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: class { send = sends.ssm; },
  PutParameterCommand: class { constructor(public input: unknown) {} },
  GetParameterCommand: class { constructor(public input: unknown) {} },
}));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
function enableMockAws() {
  for (const [key, value] of Object.entries({ DATABASE_URL: "mysql://test", REDIS_URL: "redis://test", ADMIN_PASSWORD: "test",
    SESSION_SECRET: "x".repeat(32), USE_REAL_AWS: "true", AWS_REGION: "ap-south-1", AWS_AUTO_SCALING_GROUP_NAME: "test-asg",
    AWS_ALB_TARGET_GROUP_ARN: "test-primary", AWS_ALB_SECONDARY_TARGET_GROUP_ARN: "test-secondary", AWS_ALB_LISTENER_RULE_ARN: "test-rule",
    AWS_CLOUDWATCH_NAMESPACE: "VectorPay/Test", AWS_ALB_DNS: "alb.test", AWS_CACHE_TTL_PARAM: "/optimizer/cacheTtlSec" })) vi.stubEnv(key, value);
}
describe("AWS credential-free boundary", () => {
  it.each(RL_ACTIONS)("simulates %s without credentials or storage configuration", async (action) => {
    vi.stubEnv("USE_REAL_AWS", "false");
    const result = await executeInfrastructureAction({ action, control: INITIAL_CONTROL_STATE,
      metrics: simulateObservation({ seed: 1, step: 1, control: INITIAL_CONTROL_STATE }), useRealAws: false });
    expect(result).toEqual({ provider: "simulator", operation: `Simulated ${action}`, completed: true });
    expect(sends.auto).not.toHaveBeenCalled(); expect(sends.alb).not.toHaveBeenCalled(); expect(sends.cloud).not.toHaveBeenCalled();
  });
  it("requires both server and persisted opt-in", () => {
    vi.stubEnv("DATABASE_URL", "mysql://test"); vi.stubEnv("REDIS_URL", "redis://test");
    vi.stubEnv("ADMIN_PASSWORD", "test"); vi.stubEnv("SESSION_SECRET", "x".repeat(32)); vi.stubEnv("USE_REAL_AWS", "false");
    expect(() => getAwsEnv(true)).toThrow("USE_REAL_AWS=true");
  });
  it("constructs AWS scale and telemetry commands with the actual reward (mock transport)", async () => {
    enableMockAws();
    const metrics = simulateObservation({ seed: 1, step: 1, control: INITIAL_CONTROL_STATE });
    await executeInfrastructureAction({ action: "SCALE_UP", control: { ...INITIAL_CONTROL_STATE, instances: 5 }, metrics, reward: -0.25, useRealAws: true });
    expect(sends.auto.mock.calls[0][0].input).toMatchObject({ AutoScalingGroupName: "test-asg", DesiredCapacity: 5, HonorCooldown: true });
    expect(sends.cloud.mock.calls[0][0].input.MetricData).toContainEqual({ MetricName: "OptimizerReward", Unit: "None", Value: -0.25 });
  });
  it("preserves a total routing weight of 100 (mock transport)", async () => {
    enableMockAws();
    await executeInfrastructureAction({ action: "REROUTE_SHIFT", control: { ...INITIAL_CONTROL_STATE, primaryRoutePct: 60 },
      metrics: simulateObservation({ seed: 1, step: 1, control: INITIAL_CONTROL_STATE }), useRealAws: true });
    expect(sends.alb.mock.calls[0][0].input.Actions[0].ForwardConfig.TargetGroups).toEqual([
      { TargetGroupArn: "test-primary", Weight: 60 }, { TargetGroupArn: "test-secondary", Weight: 40 },
    ]);
  });
  it("writes the new cache TTL to SSM for cache actions (mock transport)", async () => {
    enableMockAws();
    await executeInfrastructureAction({ action: "CACHE_TTL_UP", control: { ...INITIAL_CONTROL_STATE, cacheTtlSec: 90 },
      metrics: simulateObservation({ seed: 1, step: 1, control: INITIAL_CONTROL_STATE }), useRealAws: true });
    expect(sends.ssm.mock.calls[0][0].input).toMatchObject({ Name: "/optimizer/cacheTtlSec", Value: "90", Overwrite: true });
    expect(sends.auto).not.toHaveBeenCalled(); expect(sends.alb).not.toHaveBeenCalled();
  });
  it("surfaces provider failures rather than logging success (mock transport)", async () => {
    enableMockAws(); sends.auto.mockRejectedValueOnce(new Error("Provider unavailable"));
    await expect(executeInfrastructureAction({ action: "SCALE_UP", control: INITIAL_CONTROL_STATE,
      metrics: simulateObservation({ seed: 1, step: 1, control: INITIAL_CONTROL_STATE }), useRealAws: true })).rejects.toThrow("Provider unavailable");
    expect(sends.cloud).not.toHaveBeenCalled();
  });
});

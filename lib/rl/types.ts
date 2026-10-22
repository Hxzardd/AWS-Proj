export const RL_ACTIONS = [
  "SCALE_UP",
  "SCALE_DOWN",
  "REROUTE_SHIFT",
  "CACHE_TTL_UP",
  "CACHE_TTL_DOWN",
  "NO_OP",
] as const;

export type RlAction = (typeof RL_ACTIONS)[number];
export type Bucket = "low" | "medium" | "high";

export type DiscreteState = {
  latencyBucket: Bucket;
  cpuBucket: Bucket;
  requestRateBucket: Bucket;
  cacheHitBucket: Bucket;
};

export type Observation = {
  latencyMs: number;
  p95LatencyMs: number;
  throughput: number;
  cpuPct: number;
  memPct: number;
  requestRate: number;
  networkLatencyMs: number;
  cacheHitRatio: number;
  slaViolation: boolean;
  costPerThousandUsd: number;
};

export type QTable = Record<string, Partial<Record<RlAction, number>>>;

export type RewardWeights = {
  latency: number;
  sla: number;
  throughput: number;
  cost: number;
};

export const STATE_BUCKET_DEFINITION = {
  latencyMs: { low: "< 140", medium: "140-220", high: "> 220" },
  cpuPct: { low: "< 45", medium: "45-72", high: "> 72" },
  requestRate: { low: "< 1,200", medium: "1,200-3,000", high: "> 3,000" },
  cacheHitRatio: { low: "< 0.55", medium: "0.55-0.78", high: "> 0.78" },
} as const;

export const ACTION_DEFINITION: Record<RlAction, string> = {
  SCALE_UP: "Add one instance, capped at MAX_INSTANCES",
  SCALE_DOWN: "Remove one instance, floored at MIN_INSTANCES",
  REROUTE_SHIFT: "Shift 10% toward the least-loaded pool",
  CACHE_TTL_UP: "Increase Redis TTL by 30 seconds",
  CACHE_TTL_DOWN: "Decrease Redis TTL by 30 seconds",
  NO_OP: "Keep the current infrastructure policy",
};

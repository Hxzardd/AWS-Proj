import type { DiscreteState, RlAction } from "@/lib/rl/types";
import type { ControlState } from "@/lib/simulation/generator";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: "VALIDATION" | "CONFIG" | "AUTH" | "NOT_FOUND" | "STORAGE" };

export type MetricPoint = {
  id: string;
  timestamp: string;
  step: number;
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
  source: "rl" | "baseline";
};

export type ActionLog = {
  id: string;
  timestamp: string;
  step: number;
  state: DiscreteState;
  stateKey: string;
  action: RlAction;
  reason: string;
  reward: number;
  source: "rl" | "baseline";
  effect: ControlState;
  infrastructure: {
    provider: "simulator" | "aws";
    operation: string;
    completed: boolean;
  } | null;
};

export type SimulationView = {
  run: {
    id: string;
    seed: number;
    mode: "rl" | "baseline" | "compare";
    status: "running" | "stopped" | "completed";
    step: number;
    episode: number;
    epsilon: number;
    startedAt: string;
    endedAt: string | null;
  };
  controls: {
    rl: ControlState;
    baseline: ControlState;
  };
  metrics: MetricPoint[];
  actions: ActionLog[];
  learningCurve: Array<{ step: number; cumulativeReward: number; meanReward: number }>;
  cache: { ttlSec: number; key: string };
};

export type QTableSnapshot = {
  totalEntries: number;
  stateCount: number;
  entries: Array<{
    stateKey: string;
    action: RlAction;
    qValue: number;
    visits: number;
    updatedAt: string;
  }>;
};

export type SettingsSnapshot = {
  rewardWeights: {
    latency: number;
    sla: number;
    throughput: number;
    cost: number;
  };
  epsilonStart: number;
  simulatorSeed: number;
  simulatorIntensity: number;
  useRealAws: boolean;
};

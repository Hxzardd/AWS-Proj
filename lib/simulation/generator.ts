import { clamp, round } from "@/lib/utils";
import type { Observation, RlAction } from "@/lib/rl/types";

export type ControlState = {
  instances: number;
  primaryRoutePct: number;
  cacheTtlSec: number;
  scaleCooldownSteps: number;
  lastAction: RlAction;
};

export const INITIAL_CONTROL_STATE: ControlState = {
  instances: 4,
  primaryRoutePct: 70,
  cacheTtlSec: 60,
  scaleCooldownSteps: 0,
  lastAction: "NO_OP",
};

export function randomAt(seed: number, step: number, salt = 0) {
  let value = (seed ^ Math.imul(step + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4_294_967_296;
}

export function createStepRandom(seed: number, step: number) {
  let salt = 0;
  return () => randomAt(seed, step, salt++);
}

export function trafficDemand(seed: number, step: number, intensity = 1) {
  const slot = step % 288;
  const day = Math.floor(step / 288);
  const hour = slot / 12;
  const businessWave = Math.max(0, Math.sin(((hour - 6) / 15) * Math.PI));
  const microWave = 0.5 + 0.5 * Math.sin(step * 0.43 + seed * 0.001);
  const spikeCenter = 72 + Math.floor(randomAt(seed, day, 3) * 150);
  const spikeWidth = 4 + Math.floor(randomAt(seed, day, 4) * 11);
  const spikeDistance = Math.abs(slot - spikeCenter);
  const spike =
    spikeDistance <= spikeWidth
      ? (1 - spikeDistance / (spikeWidth + 1)) *
        (1_500 + randomAt(seed, day, 5) * 2_100)
      : 0;
  const jitter = (randomAt(seed, step, 7) - 0.5) * 220;

  return Math.max(
    220,
    (520 + businessWave * 2_150 + microWave * 340 + spike + jitter) * intensity,
  );
}

export function applyAction(
  control: ControlState,
  action: RlAction,
  limits = {
    min: Number(process.env.MIN_INSTANCES ?? 2),
    max: Number(process.env.MAX_INSTANCES ?? 12),
  },
): ControlState {
  const next = {
    ...control,
    scaleCooldownSteps: Math.max(0, control.scaleCooldownSteps - 1),
    lastAction: action,
  };
  if (action === "SCALE_UP") {
    next.instances = Math.min(limits.max, next.instances + 1);
    next.scaleCooldownSteps = 3;
  }
  if (action === "SCALE_DOWN") {
    next.instances = Math.max(limits.min, next.instances - 1);
    next.scaleCooldownSteps = 3;
  }
  if (action === "REROUTE_SHIFT") {
    next.primaryRoutePct += next.primaryRoutePct > 50 ? -10 : 10;
    next.primaryRoutePct = clamp(next.primaryRoutePct, 30, 70);
  }
  if (action === "CACHE_TTL_UP") next.cacheTtlSec = Math.min(300, next.cacheTtlSec + 30);
  if (action === "CACHE_TTL_DOWN") next.cacheTtlSec = Math.max(30, next.cacheTtlSec - 30);
  return next;
}

export function simulateObservation(input: {
  seed: number;
  step: number;
  control: ControlState;
  intensity?: number;
  requestRateOverride?: number;
}): Observation {
  const { seed, step, control, intensity = 1 } = input;
  const requestRate = input.requestRateOverride ?? trafficDemand(seed, step, intensity);
  if (!Number.isFinite(requestRate) || requestRate < 0) {
    throw new Error("Request rate must be a finite, non-negative number.");
  }
  const burstiness = randomAt(seed, step, 11);
  const repeatTraffic = 0.35 + 0.25 * Math.max(0, Math.sin(step * 0.17));
  const cacheHitRatio = clamp(
    repeatTraffic + Math.log2(control.cacheTtlSec / 30) * 0.1 + (randomAt(seed, step, 12) - 0.5) * 0.04,
    0.28,
    0.93,
  );
  const routeImbalance = Math.abs(control.primaryRoutePct - 50) / 50;
  const routeEfficiency = 1 - routeImbalance * 0.2;
  const cacheRelief = 1 - cacheHitRatio * 0.31;
  const effectiveDemand = requestRate * cacheRelief;
  const capacity = control.instances * 690 * routeEfficiency;
  const load = effectiveDemand / Math.max(capacity, 1);
  const networkLatencyMs =
    17 + routeImbalance * 24 + burstiness * 12 + Math.max(0, load - 0.92) * 65;
  const overloadPenalty = load > 1 ? 430 * (load - 1) ** 2 : 0;
  const latencyMs =
    48 + networkLatencyMs + 92 * load ** 1.65 + overloadPenalty + (1 - cacheHitRatio) * 24;
  const p95LatencyMs = latencyMs * (1.27 + burstiness * 0.24);
  const cpuPct = clamp(17 + load * 69 + burstiness * 4, 8, 100);
  const memPct = clamp(32 + control.instances * 1.4 + load * 33 + cacheHitRatio * 7, 20, 96);
  const maxThroughput = capacity / Math.max(cacheRelief, 0.2);
  const throughput = Math.min(requestRate, maxThroughput) * (0.992 - burstiness * 0.008);
  const hourlyInfrastructureCost = control.instances * 0.085 + 0.018 + cacheHitRatio * 0.006;
  const costPerThousandUsd =
    (hourlyInfrastructureCost / Math.max(throughput * 3_600, 1)) * 1_000;
  const slaTarget = Number(process.env.SLA_TARGET_LATENCY_MS ?? 200);

  return {
    latencyMs: round(latencyMs),
    p95LatencyMs: round(p95LatencyMs),
    throughput: round(throughput),
    cpuPct: round(cpuPct),
    memPct: round(memPct),
    requestRate: round(requestRate),
    networkLatencyMs: round(networkLatencyMs),
    cacheHitRatio: round(cacheHitRatio, 4),
    slaViolation: p95LatencyMs > slaTarget,
    costPerThousandUsd: round(costPerThousandUsd, 7),
  };
}

export function describeAction(action: RlAction, before: ControlState, after: ControlState) {
  switch (action) {
    case "SCALE_UP":
    case "SCALE_DOWN":
      return `${before.instances} to ${after.instances} instances`;
    case "REROUTE_SHIFT":
      return `${before.primaryRoutePct}/${100 - before.primaryRoutePct} to ${after.primaryRoutePct}/${100 - after.primaryRoutePct} routing`;
    case "CACHE_TTL_UP":
    case "CACHE_TTL_DOWN":
      return `${before.cacheTtlSec}s to ${after.cacheTtlSec}s cache TTL`;
    default:
      return "Infrastructure policy unchanged";
  }
}

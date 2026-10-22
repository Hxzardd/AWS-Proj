import type { Observation, RlAction } from "./types";
import { RL_ACTIONS } from "./types";
import type { ControlState } from "../simulation/generator";

export type ActionConstraints = {
  allowed: RlAction[];
  blocked: Partial<Record<RlAction, string>>;
};

/**
 * Operational constraints around the learned policy. They do not select an
 * action or assign a reward; they only prevent no-effect and unsafe actions.
 */
export function constrainActions(
  observation: Observation,
  control: ControlState,
  limits = {
    minInstances: Number(process.env.MIN_INSTANCES ?? 2),
    maxInstances: Number(process.env.MAX_INSTANCES ?? 12),
    slaTargetMs: Number(process.env.SLA_TARGET_LATENCY_MS ?? 200),
  },
): ActionConstraints {
  const blocked: Partial<Record<RlAction, string>> = {};

  if (control.instances >= limits.maxInstances) {
    blocked.SCALE_UP = "maximum instance limit reached";
  }

  const routeImbalance = Math.abs(control.primaryRoutePct - 50) / 50;
  const routeEfficiency = 1 - routeImbalance * 0.2;
  const effectiveDemand = observation.requestRate * (1 - observation.cacheHitRatio * 0.31);
  const currentCapacity = control.instances * 690 * routeEfficiency;
  const currentLoad = effectiveDemand / Math.max(currentCapacity, 1);
  const projectedScaleDownCapacity =
    Math.max(control.instances - 1, limits.minInstances) * 690 * routeEfficiency;
  const projectedScaleDownLoad = effectiveDemand / Math.max(projectedScaleDownCapacity, 1);
  const scaleDownUnsafe =
    control.instances <= limits.minInstances ||
    projectedScaleDownLoad > 0.82 ||
    observation.cpuPct >= 65 ||
    observation.p95LatencyMs >= limits.slaTargetMs * 0.9;

  if (scaleDownUnsafe) {
    blocked.SCALE_DOWN =
      control.instances <= limits.minInstances
        ? "minimum instance limit reached"
        : "projected capacity guard rejected scale-down";
  }

  const urgentScaleUp =
    observation.slaViolation ||
    observation.cpuPct >= 85 ||
    observation.p95LatencyMs >= limits.slaTargetMs * 1.05;
  if (
    !blocked.SCALE_UP &&
    !urgentScaleUp &&
    (control.scaleCooldownSteps > 0 ||
      (currentLoad < 0.55 && observation.cpuPct < 45 && observation.p95LatencyMs < 140))
  ) {
    blocked.SCALE_UP =
      control.scaleCooldownSteps > 0
        ? "scaling cooldown is active"
        : "capacity budget guard rejected unnecessary scale-up";
  }
  if (control.scaleCooldownSteps > 0 && !urgentScaleUp) {
    blocked.SCALE_DOWN ??= "scaling cooldown is active";
  }

  if (control.primaryRoutePct === 50) {
    blocked.REROUTE_SHIFT = "traffic pools are already balanced";
  }
  if (control.cacheTtlSec >= 300) {
    blocked.CACHE_TTL_UP = "maximum cache TTL reached";
  }
  if (control.cacheTtlSec <= 30) {
    blocked.CACHE_TTL_DOWN = "minimum cache TTL reached";
  } else if (observation.slaViolation || observation.cpuPct >= 85) {
    blocked.CACHE_TTL_DOWN = "cache relief retained during SLA or CPU stress";
  }

  return {
    allowed: RL_ACTIONS.filter((action) => blocked[action] === undefined),
    blocked,
  };
}

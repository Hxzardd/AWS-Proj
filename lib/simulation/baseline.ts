import type { Observation, RlAction } from "@/lib/rl/types";

export function chooseBaselineAction(observation: Observation): RlAction {
  if (observation.p95LatencyMs > 220 || observation.cpuPct > 72) return "SCALE_UP";
  if (observation.p95LatencyMs < 125 && observation.cpuPct < 38) return "SCALE_DOWN";
  return "NO_OP";
}

export function explainBaselineAction(observation: Observation, action: RlAction) {
  if (action === "SCALE_UP") {
    return `Static threshold crossed: p95 ${Math.round(observation.p95LatencyMs)} ms or CPU ${Math.round(observation.cpuPct)}%`;
  }
  if (action === "SCALE_DOWN") {
    return `Static low-utilization threshold crossed: p95 ${Math.round(observation.p95LatencyMs)} ms and CPU ${Math.round(observation.cpuPct)}%`;
  }
  return "No static scaling threshold crossed";
}

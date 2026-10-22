import { describe, expect, it } from "vitest";
import { applyAction, INITIAL_CONTROL_STATE, simulateObservation, trafficDemand } from "@/lib/simulation/generator";
import { constrainActions } from "@/lib/rl/safety";

describe("seeded traffic simulator", () => {
  it("reproduces the same burst waveform for the same seed", () => {
    const first = Array.from({ length: 40 }, (_, step) => trafficDemand(2026, step));
    const second = Array.from({ length: 40 }, (_, step) => trafficDemand(2026, step));
    const different = Array.from({ length: 40 }, (_, step) => trafficDemand(77, step));
    expect(first).toEqual(second);
    expect(first).not.toEqual(different);
  });

  it("makes scale actions visibly reduce load-induced latency", () => {
    const constrained = { ...INITIAL_CONTROL_STATE, instances: 2, primaryRoutePct: 70 };
    const scaled = { ...constrained, instances: 8 };
    const before = simulateObservation({ seed: 2026, step: 126, control: constrained, intensity: 1.8 });
    const after = simulateObservation({ seed: 2026, step: 126, control: scaled, intensity: 1.8 });
    expect(after.p95LatencyMs).toBeLessThan(before.p95LatencyMs);
    expect(after.cpuPct).toBeLessThan(before.cpuPct);
    expect(after.throughput).toBeGreaterThanOrEqual(before.throughput);
  });

  it("caps scaling and cache actions at the configured boundaries", () => {
    let control = { ...INITIAL_CONTROL_STATE, instances: 12, cacheTtlSec: 300 };
    control = applyAction(control, "SCALE_UP", { min: 2, max: 12 });
    control = applyAction(control, "CACHE_TTL_UP", { min: 2, max: 12 });
    expect(control.instances).toBe(12);
    expect(control.cacheTtlSec).toBe(300);
  });

  it("blocks scale-down when projected capacity would be unsafe", () => {
    const control = { ...INITIAL_CONTROL_STATE, instances: 3 };
    const observation = simulateObservation({ seed: 2026, step: 140, control, intensity: 1.8 });
    const constraints = constrainActions(observation, control);
    expect(constraints.allowed).not.toContain("SCALE_DOWN");
    expect(constraints.allowed).toContain("SCALE_UP");
  });

  it("prevents immediate scaling reversal while allowing emergency scale-up", () => {
    const scaled = applyAction(INITIAL_CONTROL_STATE, "SCALE_DOWN");
    const healthy = simulateObservation({ seed: 2026, step: 20, control: scaled });
    expect(constrainActions(healthy, scaled).allowed).not.toContain("SCALE_UP");

    const overloaded = {
      ...healthy,
      cpuPct: 96,
      p95LatencyMs: 320,
      slaViolation: true,
    };
    expect(constrainActions(overloaded, scaled).allowed).toContain("SCALE_UP");
  });
});

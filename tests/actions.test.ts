import { describe, expect, it } from "vitest";
import { startSimulation, getLatestMetrics, getAgentActionHistory, updateRewardWeights, updateSimulationDefaults, toggleRealAws } from "@/app/actions";

describe("server action input validation", () => {
  it.each([0, -1, 1.5, 2147483648, "not-a-seed"])("rejects invalid seed %s before storage", async (seed) => {
    expect(await startSimulation("rl", seed)).toMatchObject({ ok: false, code: "VALIDATION" });
  });
  it("rejects invalid modes and run IDs", async () => {
    expect(await startSimulation("unknown", 1)).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await getLatestMetrics("")).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await getAgentActionHistory("id", -1)).toMatchObject({ ok: false, code: "VALIDATION" });
  });
  it("rejects reward totals, intensity and AWS mode with the wrong type", async () => {
    expect(await updateRewardWeights({ latency: 1, sla: 1, cost: 1, throughput: 1 })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await updateSimulationDefaults({ seed: 1, intensity: 100 })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await toggleRealAws("true")).toMatchObject({ ok: false, code: "VALIDATION" });
  });
});

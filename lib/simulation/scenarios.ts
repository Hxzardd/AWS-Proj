import { trafficDemand } from "./generator";

export const SCENARIOS = {
  normal: { name: "Business day", description: "A full day with natural demand and one seeded burst." },
  quiet: { name: "Overnight", description: "Half demand; watch the cost of keeping excess capacity." },
  peak: { name: "Payday peak", description: "Sustained 1.8× demand and a larger midday burst." },
  flash: { name: "Flash sale", description: "Demand jumps from 0.65× to 2.5× at step 72, then recovers at 108." },
  ramp: { name: "Growing demand", description: "Demand gradually rises from 0.5× to 2.5×." },
  oscillating: { name: "Repeated bursts", description: "Alternate 0.5× and 2.5× demand every 24 steps." },
  custom: { name: "Custom traffic", description: "Paste step,rps rows. Each rate lasts until the next row." },
} as const;
export type Scenario = keyof typeof SCENARIOS;
export type TrafficPoint = { step: number; rps: number };
export const DEFAULT_CUSTOM_TRAFFIC = "step,rps\n1,600\n48,1400\n72,6500\n108,1800\n168,4000\n216,800";

export function parseTrafficCsv(csv: string): TrafficPoint[] {
  const lines = csv.trim().split(/\r?\n/).filter((line) => line.trim());
  if (lines[0]?.trim().toLowerCase() === "step,rps") lines.shift();
  if (!lines.length || lines.length > 288) throw new Error("Provide 1–288 traffic rows.");
  const points = lines.map((line, index) => {
    const fields = line.split(",").map((field) => field.trim());
    const [step, rps] = fields.map(Number);
    if (fields.length !== 2 || fields.some((field) => !field) || !Number.isInteger(step) || step < 1 || step > 288 || !Number.isFinite(rps) || rps < 0 || rps > 100_000) {
      throw new Error(`Row ${index + 1}: use a step from 1–288 and a rate from 0–100,000 rps.`);
    }
    return { step, rps };
  });
  if (points[0].step !== 1 || points.some((point, index) => index > 0 && point.step <= points[index - 1].step)) {
    throw new Error("Start at step 1 and use strictly increasing steps.");
  }
  return points;
}

export function scenarioDemand(scenario: Scenario, seed: number, step: number, custom: TrafficPoint[] = []) {
  if (scenario === "custom") {
    if (!custom.length) throw new Error("Custom traffic requires at least one row.");
    return custom.findLast((point) => point.step <= step)?.rps ?? custom[0].rps;
  }
  const intensity = scenario === "quiet" ? 0.5 : scenario === "peak" ? 1.8
    : scenario === "flash" ? (step < 72 ? 0.65 : step < 108 ? 2.5 : 0.8)
    : scenario === "ramp" ? 0.5 + 2 * Math.min(step, 288) / 288
    : scenario === "oscillating" ? (Math.floor(step / 24) % 2 ? 2.5 : 0.5) : 1;
  return trafficDemand(seed, step, intensity);
}

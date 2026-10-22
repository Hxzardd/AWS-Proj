import { z } from "zod";
import { clamp, round } from "@/lib/utils";
import type { AwsEnv } from "@/lib/config";
import type { Observation } from "@/lib/rl/types";

// Shape returned by the gateway fleet aggregator (GET /fleet). Each instance
// writes its own rolling stats to a shared Redis; any instance answers with the
// fleet-wide aggregate, so the controller can scrape a single ALB URL.
const fleetSchema = z.object({
  p95LatencyMs: z.coerce.number().min(0),
  latencyMs: z.coerce.number().min(0).optional(),
  requestRate: z.coerce.number().min(0),
  throughput: z.coerce.number().min(0).optional(),
  cpuPct: z.coerce.number().min(0),
  memPct: z.coerce.number().min(0).optional(),
  cacheHitRatio: z.coerce.number().min(0).max(1),
  networkLatencyMs: z.coerce.number().min(0).optional(),
});

/**
 * Builds a real {@link Observation} from the live gateway fleet. Performance
 * fields come from the gateway's own metrics; cost and the SLA flag are derived
 * controller-side so the reward uses the same references as the simulator. The
 * cost model mirrors {@link file://lib/simulation/generator.ts} so real and
 * simulated rewards stay comparable.
 */
export async function observeLiveGateway(
  aws: AwsEnv,
  instanceCount: number,
): Promise<Observation> {
  const response = await fetch(`http://${aws.AWS_ALB_DNS}/fleet`, {
    cache: "no-store",
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) {
    throw new Error(`Gateway /fleet returned HTTP ${response.status}`);
  }
  const fleet = fleetSchema.parse(await response.json());

  const slaTargetMs = Number(process.env.SLA_TARGET_LATENCY_MS ?? 200);
  const throughput = fleet.throughput ?? fleet.requestRate;
  const hourlyInfrastructureCost =
    instanceCount * 0.085 + 0.018 + fleet.cacheHitRatio * 0.006;
  const costPerThousandUsd =
    (hourlyInfrastructureCost / Math.max(throughput * 3_600, 1)) * 1_000;

  return {
    latencyMs: round(fleet.latencyMs ?? fleet.p95LatencyMs / 1.3),
    p95LatencyMs: round(fleet.p95LatencyMs),
    throughput: round(throughput),
    cpuPct: round(clamp(fleet.cpuPct, 0, 100)),
    memPct: round(clamp(fleet.memPct ?? 0, 0, 100)),
    requestRate: round(fleet.requestRate),
    networkLatencyMs: round(fleet.networkLatencyMs ?? 20),
    cacheHitRatio: round(clamp(fleet.cacheHitRatio, 0, 1), 4),
    slaViolation: fleet.p95LatencyMs > slaTargetMs,
    costPerThousandUsd: round(costPerThousandUsd, 7),
  };
}

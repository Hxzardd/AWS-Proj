import { z } from "zod";
import { prisma } from "@/lib/db";
import { rewardWeightsFromEnv } from "@/lib/rl/reward";
import type { QTable, RlAction } from "@/lib/rl/types";
import type { SettingsSnapshot } from "@/lib/contracts";
import { INITIAL_CONTROL_STATE, type ControlState } from "./generator";

export function controlFromJson(value: unknown): ControlState {
  const parsed = z
    .object({
      instances: z.number(),
      primaryRoutePct: z.number(),
      cacheTtlSec: z.number(),
      scaleCooldownSteps: z.number().default(0),
      lastAction: z.enum([
        "SCALE_UP",
        "SCALE_DOWN",
        "REROUTE_SHIFT",
        "CACHE_TTL_UP",
        "CACHE_TTL_DOWN",
        "NO_OP",
      ]),
    })
    .safeParse(value);
  return parsed.success ? parsed.data : { ...INITIAL_CONTROL_STATE };
}

async function settingMap() {
  const rows = await prisma.appSetting.findMany();
  return new Map(rows.map((row) => [row.key, row.value]));
}

export async function runtimeSettings(): Promise<SettingsSnapshot> {
  const settings = await settingMap();
  const envWeights = rewardWeightsFromEnv();
  return {
    rewardWeights: {
      latency: Number(settings.get("rewardWeightLatency") ?? envWeights.latency),
      sla: Number(settings.get("rewardWeightSla") ?? envWeights.sla),
      throughput: Number(settings.get("rewardWeightThroughput") ?? envWeights.throughput),
      cost: Number(settings.get("rewardWeightCost") ?? envWeights.cost),
    },
    epsilonStart: Number(settings.get("epsilonStart") ?? process.env.RL_EPSILON_START ?? 1),
    simulatorSeed: Number(settings.get("simulatorSeed") ?? 2026),
    simulatorIntensity: Number(settings.get("simulatorIntensity") ?? 1),
    useRealAws: (settings.get("useRealAws") ?? process.env.USE_REAL_AWS ?? "false") === "true",
  };
}

export async function loadQTable(): Promise<QTable> {
  const entries = await prisma.qTableEntry.findMany();
  return entries.reduce<QTable>((table, entry) => {
    table[entry.stateKey] = {
      ...table[entry.stateKey],
      [entry.action as RlAction]: entry.qValue,
    };
    return table;
  }, {});
}

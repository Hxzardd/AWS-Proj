"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureRedis } from "@/lib/redis";
import { getAwsEnv, getServerEnv, safeActionError } from "@/lib/config";
import {
  createAdminSession,
  destroyAdminSession,
  requireAdminSession,
  verifyAdminPassword,
} from "@/lib/auth";
import { executeInfrastructureAction } from "@/lib/aws/actions";
import {
  epsilonAfterUpdates,
  qLearningConfigFromEnv,
  type QLearningConfig,
} from "@/lib/rl/qlearning";
import { DEFAULT_REWARD_WEIGHTS } from "@/lib/rl/reward";
import type { QTable, RewardWeights, RlAction } from "@/lib/rl/types";
import { runBaselineStep, runRlStep } from "@/lib/simulation/engine";
import { INITIAL_CONTROL_STATE } from "@/lib/simulation/generator";
import {
  controlFromJson,
  loadQTable,
  runtimeSettings,
} from "@/lib/simulation/runtime";
import { realTick } from "@/lib/simulation/realTick";
import type {
  ActionLog,
  ActionResult,
  MetricPoint,
  QTableSnapshot,
  SettingsSnapshot,
  SimulationView,
} from "@/lib/contracts";

const modeSchema = z.enum(["rl", "baseline", "compare"]);
const runIdSchema = z.string().min(1);
const pageSchema = z.coerce.number().int().min(1).default(1);
const seedSchema = z.coerce.number().int().min(1).max(2_147_483_647);
const weightsSchema = z
  .object({
    latency: z.coerce.number().min(0).max(1),
    sla: z.coerce.number().min(0).max(1),
    throughput: z.coerce.number().min(0).max(1),
    cost: z.coerce.number().min(0).max(1),
  })
  .refine(
    (weights) => Math.abs(weights.latency + weights.sla + weights.throughput + weights.cost - 1) < 0.001,
    "Reward weights must add up to 1.0",
  );

function fail<T>(
  error: string,
  code: "VALIDATION" | "CONFIG" | "AUTH" | "NOT_FOUND" | "STORAGE" = "STORAGE",
): ActionResult<T> {
  return { ok: false, error, code };
}

function metricToContract(metric: {
  id: string;
  timestamp: Date;
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
}): MetricPoint {
  return { ...metric, timestamp: metric.timestamp.toISOString() };
}

function actionToContract(action: {
  id: string;
  timestamp: Date;
  step: number;
  stateBucket: unknown;
  stateKey: string;
  action: string;
  reason: string;
  rewardResult: number;
  source: "rl" | "baseline";
  effect: unknown;
  infrastructure: unknown;
}): ActionLog {
  return {
    id: action.id,
    timestamp: action.timestamp.toISOString(),
    step: action.step,
    state: action.stateBucket as ActionLog["state"],
    stateKey: action.stateKey,
    action: action.action as RlAction,
    reason: action.reason,
    reward: action.rewardResult,
    source: action.source,
    effect: controlFromJson(action.effect),
    infrastructure: action.infrastructure as ActionLog["infrastructure"],
  };
}

async function buildSimulationView(runId: string): Promise<SimulationView> {
  const [run, rewardRows] = await Promise.all([
    prisma.simulationRun.findUnique({
      where: { id: runId },
      include: {
        metrics: { orderBy: [{ step: "desc" }, { source: "asc" }], take: 240 },
        actions: { orderBy: { timestamp: "desc" }, take: 30 },
      },
    }),
    prisma.agentAction.findMany({
      where: { runId, source: "rl" },
      orderBy: { step: "asc" },
      select: { step: true, rewardResult: true },
    }),
  ]);
  if (!run) throw new Error("RUN_NOT_FOUND");

  let cumulativeReward = 0;
  const learningCurve = rewardRows
    .map((action, index) => ({
      step: action.step,
      cumulativeReward: (cumulativeReward += action.rewardResult),
      meanReward: rewardRows.slice(Math.max(0, index - 19), index + 1)
        .reduce((total, row) => total + row.rewardResult, 0) / Math.min(index + 1, 20),
    }));
  const rlControl = controlFromJson(run.rlControlState);

  return {
    run: {
      id: run.id,
      seed: run.seed,
      mode: run.mode,
      status: run.status,
      step: run.step,
      episode: run.episode,
      epsilon: run.epsilon,
      startedAt: run.startedAt.toISOString(),
      endedAt: run.endedAt?.toISOString() ?? null,
    },
    controls: {
      rl: rlControl,
      baseline: controlFromJson(run.baseControlState),
    },
    metrics: run.metrics.reverse().map(metricToContract),
    actions: run.actions.map(actionToContract),
    learningCurve,
    cache: { ttlSec: rlControl.cacheTtlSec, key: `simulation:${run.id}:latest` },
  };
}

export async function getSimulationSnapshot(runIdInput: unknown): Promise<ActionResult<SimulationView>> {
  const runId = runIdSchema.safeParse(runIdInput);
  if (!runId.success) return fail("A valid run ID is required.", "VALIDATION");
  try {
    return { ok: true, data: await buildSimulationView(runId.data) };
  } catch (error) {
    if (error instanceof Error && error.message === "RUN_NOT_FOUND") return fail("Simulation run not found.", "NOT_FOUND");
    return fail(safeActionError(error));
  }
}

export async function startSimulation(
  modeInput: unknown,
  seedInput?: unknown,
): Promise<ActionResult<SimulationView>> {
  const mode = modeSchema.safeParse(modeInput);
  const seed = seedInput === undefined ? null : seedSchema.safeParse(seedInput);
  if (!mode.success || (seed && !seed.success)) {
    return fail("Choose a valid simulation mode and a positive integer seed.", "VALIDATION");
  }

  try {
    getServerEnv();
    await ensureRedis();
    const settings = await runtimeSettings();
    const config = qLearningConfigFromEnv();
    const learnedState = await prisma.qTableEntry.aggregate({
      _count: { id: true },
      _sum: { visits: true },
    });
    if (mode.data === "compare" && learnedState._count.id === 0) {
      return fail("The Q-table is empty. Run the database seed or train the agent before comparison.", "VALIDATION");
    }
    const epsilon =
      mode.data === "compare" || mode.data === "baseline"
        ? 0
        : epsilonAfterUpdates(
            settings.epsilonStart,
            learnedState._sum.visits ?? 0,
            config,
          );
    const run = await prisma.simulationRun.create({
      data: {
        seed: seed?.data ?? settings.simulatorSeed,
        mode: mode.data,
        epsilon,
        rlControlState: { ...INITIAL_CONTROL_STATE },
        baseControlState: { ...INITIAL_CONTROL_STATE },
        ...(mode.data === "compare" ? { policySnapshot: {
          qTable: await loadQTable(), weights: settings.rewardWeights,
          intensity: settings.simulatorIntensity, config,
        } } : {}),
      },
    });
    const view = await buildSimulationView(run.id);
    return { ok: true, data: view };
  } catch (error) {
    return fail(safeActionError(error), "STORAGE");
  }
}

export async function stopSimulation(runIdInput: unknown): Promise<ActionResult<SimulationView>> {
  const runId = runIdSchema.safeParse(runIdInput);
  if (!runId.success) return fail("A valid run ID is required.", "VALIDATION");
  try {
    await prisma.simulationRun.update({
      where: { id: runId.data },
      data: { status: "stopped", endedAt: new Date() },
    });
    return { ok: true, data: await buildSimulationView(runId.data) };
  } catch (error) {
    return fail(safeActionError(error));
  }
}

export async function getLatestMetrics(runIdInput: unknown): Promise<ActionResult<SimulationView>> {
  const runId = runIdSchema.safeParse(runIdInput);
  if (!runId.success) return fail("A valid run ID is required.", "VALIDATION");

  try {
    getServerEnv();
    const redis = await ensureRedis();

    // Real-AWS RL runs observe the live gateway and act on real infrastructure.
    // That path runs under its own lock inside realTick, so route it there before
    // acquiring the simulator tick-lock below (acquiring both would self-deadlock).
    const liveRun = await prisma.simulationRun.findUnique({ where: { id: runId.data } });
    if (!liveRun) return fail("Simulation run not found.", "NOT_FOUND");
    if (liveRun.status === "running" && liveRun.mode === "rl") {
      const liveSettings = await runtimeSettings();
      if (liveSettings.useRealAws) {
        await requireAdminSession();
        await realTick(runId.data);
        return { ok: true, data: await buildSimulationView(runId.data) };
      }
    }

    // The policy is shared between runs, so serialize ticks across clients.
    const lockKey = "optimizer:simulation:tick-lock";
    const lockToken = crypto.randomUUID();
    const acquired = await redis.set(lockKey, lockToken, "PX", 60_000, "NX");
    if (!acquired) return { ok: true, data: await buildSimulationView(runId.data) };
    try {
    const run = await prisma.simulationRun.findUnique({ where: { id: runId.data } });
    if (!run) return fail("Simulation run not found.", "NOT_FOUND");
    if (run.status !== "running") return { ok: true, data: await buildSimulationView(run.id) };

    const settings = await runtimeSettings();
    if (run.mode === "rl" && settings.useRealAws) await requireAdminSession();
    const frozen = run.mode === "compare" ? run.policySnapshot as unknown as {
      qTable: QTable; weights: RewardWeights; intensity: number; config: QLearningConfig;
    } | null : null;
    if (run.mode === "compare" && !frozen) return fail("Start a new comparison to capture a frozen policy.", "VALIDATION");
    const weights: RewardWeights = frozen?.weights ?? settings.rewardWeights ?? DEFAULT_REWARD_WEIGHTS;
    const config: QLearningConfig = frozen?.config ?? qLearningConfigFromEnv();
    const nextStep = run.step + 1;
    const qTable = frozen?.qTable ?? (run.mode === "baseline" ? {} : await loadQTable());
    const operations: Prisma.PrismaPromise<unknown>[] = [];
    let rlControl = controlFromJson(run.rlControlState);
    let baseControl = controlFromJson(run.baseControlState);
    let nextEpsilon = run.epsilon;

    if (run.mode === "rl" || run.mode === "compare") {
      const result = runRlStep({
        seed: run.seed,
        step: nextStep,
        control: rlControl,
        qTable,
        epsilon: run.epsilon,
        intensity: frozen?.intensity ?? settings.simulatorIntensity,
        weights,
        config,
        learn: run.mode === "rl",
      });
      rlControl = result.control;
      nextEpsilon = result.epsilon;
      const infrastructure = await executeInfrastructureAction({
        action: result.action,
        control: result.control,
        metrics: result.metrics,
        reward: result.reward,
        useRealAws: run.mode === "rl" && settings.useRealAws,
      });
      operations.push(
        prisma.metricSnapshot.create({
          data: { runId: run.id, step: nextStep, source: "rl", ...result.metrics },
        }),
        prisma.agentAction.create({
          data: {
            runId: run.id,
            step: nextStep,
            source: "rl",
            stateBucket: result.state,
            stateKey: result.stateKey,
            action: result.action,
            reason: result.reason,
            rewardResult: result.reward,
            effect: result.control,
            infrastructure,
          },
        }),
      );
      if (result.learned) {
        operations.push(
          prisma.qTableEntry.upsert({
            where: { stateKey_action: { stateKey: result.stateKey, action: result.action } },
            update: { qValue: result.qValue, visits: { increment: 1 } },
            create: { stateKey: result.stateKey, action: result.action, qValue: result.qValue, visits: 1 },
          }),
        );
      }
    }

    if (run.mode === "baseline" || run.mode === "compare") {
      const result = runBaselineStep({
        seed: run.seed,
        step: nextStep,
        control: baseControl,
        intensity: frozen?.intensity ?? settings.simulatorIntensity,
        weights,
      });
      baseControl = result.control;
      operations.push(
        prisma.metricSnapshot.create({
          data: { runId: run.id, step: nextStep, source: "baseline", ...result.metrics },
        }),
        prisma.agentAction.create({
          data: {
            runId: run.id,
            step: nextStep,
            source: "baseline",
            stateBucket: result.state,
            stateKey: result.stateKey,
            action: result.action,
            reason: result.reason,
            rewardResult: result.reward,
            effect: result.control,
            infrastructure: {
              provider: "simulator",
              operation: `Simulated baseline ${result.action}`,
              completed: true,
            },
          },
        }),
      );
    }

    operations.push(
      prisma.simulationRun.update({
        where: { id: run.id },
        data: {
          step: nextStep,
          episode: run.mode === "rl" ? { increment: 1 } : undefined,
          epsilon: nextEpsilon,
          rlControlState: rlControl,
          baseControlState: baseControl,
        },
      }),
    );
    await prisma.$transaction(operations);

    const view = await buildSimulationView(run.id);
    await redis.set(
      view.cache.key,
      JSON.stringify(view),
      "EX",
      Math.max(5, Math.min(view.cache.ttlSec, 300)),
    );
    return { ok: true, data: view };
    } finally {
      await redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1, lockKey, lockToken,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message === "RUN_NOT_FOUND") {
      return fail("Simulation run not found.", "NOT_FOUND");
    }
    return fail(safeActionError(error), "STORAGE");
  }
}

export async function getAgentActionHistory(
  runIdInput: unknown,
  pageInput: unknown = 1,
): Promise<ActionResult<{ items: ActionLog[]; page: number; pages: number; total: number }>> {
  const runId = runIdSchema.safeParse(runIdInput);
  const page = pageSchema.safeParse(pageInput);
  if (!runId.success || !page.success) return fail("Invalid history request.", "VALIDATION");
  try {
    const pageSize = 20;
    const [items, total] = await Promise.all([
      prisma.agentAction.findMany({
        where: { runId: runId.data },
        orderBy: { timestamp: "desc" },
        skip: (page.data - 1) * pageSize,
        take: pageSize,
      }),
      prisma.agentAction.count({ where: { runId: runId.data } }),
    ]);
    return {
      ok: true,
      data: {
        items: items.map(actionToContract),
        page: page.data,
        pages: Math.max(1, Math.ceil(total / pageSize)),
        total,
      },
    };
  } catch (error) {
    return fail(safeActionError(error));
  }
}

export async function getQTableSnapshot(): Promise<ActionResult<QTableSnapshot>> {
  try {
    const redis = await ensureRedis();
    const cached = await redis.get("optimizer:qtable:snapshot");
    if (cached) return { ok: true, data: JSON.parse(cached) as QTableSnapshot };
    const [entries, totalEntries, states] = await Promise.all([
      prisma.qTableEntry.findMany({ orderBy: { qValue: "desc" }, take: 80 }),
      prisma.qTableEntry.count(),
      prisma.qTableEntry.groupBy({ by: ["stateKey"] }),
    ]);
    const snapshot: QTableSnapshot = {
      totalEntries,
      stateCount: states.length,
      entries: entries.map((entry) => ({
        stateKey: entry.stateKey,
        action: entry.action as RlAction,
        qValue: entry.qValue,
        visits: entry.visits,
        updatedAt: entry.updatedAt.toISOString(),
      })),
    };
    await redis.set("optimizer:qtable:snapshot", JSON.stringify(snapshot), "EX", 5);
    return { ok: true, data: snapshot };
  } catch (error) {
    return fail(safeActionError(error));
  }
}

export async function updateRewardWeights(input: unknown): Promise<ActionResult<SettingsSnapshot>> {
  const weights = weightsSchema.safeParse(input);
  if (!weights.success) return fail(weights.error.issues[0]?.message ?? "Invalid weights.", "VALIDATION");
  try {
    await requireAdminSession();
    await prisma.$transaction(
      Object.entries(weights.data).map(([key, value]) =>
        prisma.appSetting.upsert({
          where: { key: `rewardWeight${key[0]?.toUpperCase()}${key.slice(1)}` },
          update: { value: String(value) },
          create: { key: `rewardWeight${key[0]?.toUpperCase()}${key.slice(1)}`, value: String(value) },
        }),
      ),
    );
    return { ok: true, data: await runtimeSettings() };
  } catch (error) {
    return fail(error instanceof Error && error.message.includes("authentication") ? error.message : safeActionError(error), "AUTH");
  }
}

export async function resetQTable(): Promise<ActionResult<{ deleted: number }>> {
  try {
    await requireAdminSession();
    const result = await prisma.qTableEntry.deleteMany();
    const redis = await ensureRedis();
    await redis.del("optimizer:qtable:snapshot");
    return { ok: true, data: { deleted: result.count } };
  } catch (error) {
    return fail(error instanceof Error && error.message.includes("authentication") ? error.message : safeActionError(error), "AUTH");
  }
}

export async function toggleRealAws(enabledInput: unknown): Promise<ActionResult<SettingsSnapshot>> {
  const enabled = z.boolean().safeParse(enabledInput);
  if (!enabled.success) return fail("AWS mode must be true or false.", "VALIDATION");
  try {
    await requireAdminSession();
    if (enabled.data) getAwsEnv(true);
    await prisma.appSetting.upsert({
      where: { key: "useRealAws" },
      update: { value: String(enabled.data) },
      create: { key: "useRealAws", value: String(enabled.data) },
    });
    return { ok: true, data: await runtimeSettings() };
  } catch (error) {
    return fail(error instanceof Error && error.message.includes("authentication") ? error.message : safeActionError(error), "AUTH");
  }
}

export async function getSettings(): Promise<ActionResult<SettingsSnapshot>> {
  try {
    return { ok: true, data: await runtimeSettings() };
  } catch (error) {
    return fail(safeActionError(error));
  }
}

export async function updateSimulationDefaults(input: unknown): Promise<ActionResult<SettingsSnapshot>> {
  const parsed = z.object({ seed: seedSchema, intensity: z.coerce.number().min(0.5).max(2.5) }).safeParse(input);
  if (!parsed.success) return fail("Seed or intensity is invalid.", "VALIDATION");
  try {
    await requireAdminSession();
    await prisma.$transaction([
      prisma.appSetting.upsert({
        where: { key: "simulatorSeed" },
        update: { value: String(parsed.data.seed) },
        create: { key: "simulatorSeed", value: String(parsed.data.seed) },
      }),
      prisma.appSetting.upsert({
        where: { key: "simulatorIntensity" },
        update: { value: String(parsed.data.intensity) },
        create: { key: "simulatorIntensity", value: String(parsed.data.intensity) },
      }),
    ]);
    return { ok: true, data: await runtimeSettings() };
  } catch (error) {
    return fail(error instanceof Error && error.message.includes("authentication") ? error.message : safeActionError(error), "AUTH");
  }
}

export async function getRecentRuns(): Promise<
  ActionResult<Array<{ id: string; seed: number; mode: "rl" | "baseline" | "compare"; status: string; step: number; startedAt: string }>>
> {
  try {
    const runs = await prisma.simulationRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 });
    return {
      ok: true,
      data: runs.map((run) => ({
        id: run.id,
        seed: run.seed,
        mode: run.mode,
        status: run.status,
        step: run.step,
        startedAt: run.startedAt.toISOString(),
      })),
    };
  } catch (error) {
    return fail(safeActionError(error));
  }
}

export async function loginAdmin(passwordInput: unknown): Promise<ActionResult<{ authenticated: true }>> {
  const password = z.string().min(1).safeParse(passwordInput);
  if (!password.success) return fail("Enter the admin password.", "VALIDATION");
  try {
    if (!(await verifyAdminPassword(password.data))) {
      return fail("Incorrect admin password. Use the value configured in ADMIN_PASSWORD.", "AUTH");
    }
    await createAdminSession();
    return { ok: true, data: { authenticated: true } };
  } catch (error) {
    return fail(safeActionError(error), "CONFIG");
  }
}

export async function logoutAdmin(): Promise<ActionResult<{ authenticated: false }>> {
  await destroyAdminSession();
  return { ok: true, data: { authenticated: false } };
}

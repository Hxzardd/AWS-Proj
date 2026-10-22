import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureRedis } from "@/lib/redis";
import { getAwsEnv } from "@/lib/config";
import { qLearningConfigFromEnv } from "@/lib/rl/qlearning";
import { DEFAULT_REWARD_WEIGHTS } from "@/lib/rl/reward";
import type { RlAction } from "@/lib/rl/types";
import { executeInfrastructureAction } from "@/lib/aws/actions";
import { observeLiveGateway } from "@/lib/aws/observe";
import { readRealControlState } from "@/lib/aws/controlState";
import { runRealRlStep } from "./engine";
import { loadQTable, runtimeSettings } from "./runtime";

export type RealTickOutcome =
  | { status: "ticked"; step: number; action: RlAction; reward: number }
  | { status: "skipped"; reason: string };

type PendingTransition = { stateKey: string; action: RlAction };

/**
 * One tick of the live control loop against real AWS: observe the gateway fleet,
 * decide, act on real infrastructure, learn across ticks, and persist the same
 * MetricSnapshot/AgentAction records the dashboard already renders. Self-contained
 * (its own tick-lock, run load and persistence) so both the admin-gated server
 * action and the headless `npm run controller` can drive it. The sim tick is left
 * untouched.
 */
export async function realTick(runId: string): Promise<RealTickOutcome> {
  const redis = await ensureRedis();
  const lockKey = "optimizer:simulation:tick-lock";
  const lockToken = crypto.randomUUID();
  const acquired = await redis.set(lockKey, lockToken, "PX", 60_000, "NX");
  if (!acquired) return { status: "skipped", reason: "tick-lock held" };

  try {
    const run = await prisma.simulationRun.findUnique({ where: { id: runId } });
    if (!run) return { status: "skipped", reason: "run not found" };
    if (run.status !== "running") return { status: "skipped", reason: `run ${run.status}` };
    if (run.mode !== "rl") return { status: "skipped", reason: "real tick requires rl mode" };

    const settings = await runtimeSettings();
    if (!settings.useRealAws) return { status: "skipped", reason: "real AWS mode is disabled" };

    const aws = getAwsEnv(true);
    if (!aws) return { status: "skipped", reason: "real AWS mode is disabled" };
    const weights = settings.rewardWeights ?? DEFAULT_REWARD_WEIGHTS;
    const config = qLearningConfigFromEnv();
    const qTable = await loadQTable();
    const nextStep = run.step + 1;

    const control = await readRealControlState(aws);
    const observation = await observeLiveGateway(aws, control.instances);

    const pendingKey = `optimizer:real:pending:${run.id}`;
    const pendingRaw = await redis.get(pendingKey);
    const pending = pendingRaw ? (JSON.parse(pendingRaw) as PendingTransition) : null;

    const result = runRealRlStep({
      observation,
      control,
      qTable,
      epsilon: run.epsilon,
      weights,
      config,
      pending,
    });

    const infrastructure = await executeInfrastructureAction({
      action: result.action,
      control: result.control,
      metrics: result.metrics,
      reward: result.reward,
      useRealAws: true,
    });

    await redis.set(pendingKey, JSON.stringify(result.pending), "EX", 3_600);

    const operations: Prisma.PrismaPromise<unknown>[] = [
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
      prisma.simulationRun.update({
        where: { id: run.id },
        data: {
          step: nextStep,
          episode: { increment: 1 },
          epsilon: result.epsilon,
          rlControlState: result.control,
        },
      }),
    ];
    if (result.learned && pending) {
      operations.push(
        prisma.qTableEntry.upsert({
          where: { stateKey_action: { stateKey: pending.stateKey, action: pending.action } },
          update: { qValue: result.qValue, visits: { increment: 1 } },
          create: {
            stateKey: pending.stateKey,
            action: pending.action,
            qValue: result.qValue,
            visits: 1,
          },
        }),
      );
    }
    await prisma.$transaction(operations);

    return { status: "ticked", step: nextStep, action: result.action, reward: result.reward };
  } finally {
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      lockKey,
      lockToken,
    );
  }
}

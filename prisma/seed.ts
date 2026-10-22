import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import { qLearningConfigFromEnv } from "../lib/rl/qlearning";
import { rewardWeightsFromEnv } from "../lib/rl/reward";
import { trainPolicy } from "../lib/rl/training";

if (existsSync(".env")) process.loadEnvFile(".env");

const prisma = new PrismaClient();

const defaults: Record<string, string> = {
  rewardWeightLatency: process.env.RL_REWARD_WEIGHT_LATENCY ?? "0.4",
  rewardWeightSla: process.env.RL_REWARD_WEIGHT_SLA ?? "0.3",
  rewardWeightThroughput: process.env.RL_REWARD_WEIGHT_THROUGHPUT ?? "0.2",
  rewardWeightCost: process.env.RL_REWARD_WEIGHT_COST ?? "0.1",
  epsilonStart: process.env.RL_EPSILON_START ?? "1.0",
  useRealAws: process.env.USE_REAL_AWS ?? "false",
  simulatorSeed: "2026",
  simulatorIntensity: "1.0",
};

async function main() {
  await Promise.all(
    Object.entries(defaults).map(([key, value]) =>
      prisma.appSetting.upsert({
        where: { key },
        update: {},
        create: { key, value },
      }),
    ),
  );

  if ((await prisma.qTableEntry.count()) === 0) {
    const training = trainPolicy({
      episodes: 1_000,
      seedBase: 42_424,
      epsilon: Number(process.env.RL_EPSILON_START ?? 1),
      weights: rewardWeightsFromEnv(),
      config: qLearningConfigFromEnv(),
    });
    const rows = Object.entries(training.qTable).flatMap(([stateKey, actions]) =>
      Object.entries(actions).map(([action, qValue]) => ({
        stateKey,
        action,
        qValue: qValue ?? 0,
        visits:
          training.visits[stateKey]?.[
            action as keyof (typeof training.visits)[string]
          ] ?? 1,
      })),
    );
    await prisma.qTableEntry.createMany({ data: rows });
    console.log(
      `Pretrained Q-learning policy: ${training.summary.updates} updates, ${rows.length} state-action entries.`,
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

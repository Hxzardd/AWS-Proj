import { prisma } from "../lib/db";
import { INITIAL_CONTROL_STATE } from "../lib/simulation/generator";

// Headless arm + start for the live AWS demo: enables the persisted real-AWS
// toggle and creates a running rl run for `npm run controller -- <runId>` to
// drive. Epsilon starts at the trained floor so the agent exploits its learned
// policy (decisive reactions to load) rather than exploring randomly on stage.
async function main() {
  await prisma.appSetting.upsert({
    where: { key: "useRealAws" },
    update: { value: "true" },
    create: { key: "useRealAws", value: "true" },
  });

  const epsilon = Number(process.env.RL_EPSILON_MIN ?? 0.15);
  const run = await prisma.simulationRun.create({
    data: {
      seed: Number(process.env.DEMO_SEED ?? 20260922),
      mode: "rl",
      status: "running",
      epsilon,
      rlControlState: { ...INITIAL_CONTROL_STATE },
      baseControlState: { ...INITIAL_CONTROL_STATE },
    },
  });

  console.log("useRealAws=true");
  console.log("RUN_ID=" + run.id);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

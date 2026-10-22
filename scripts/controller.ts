import { realTick } from "../lib/simulation/realTick";

// Headless live controller (deliverable #10): drives the real-AWS control loop on
// a fixed interval without a browser open. Run with:
//   npm run controller -- <runId>
// Requires USE_REAL_AWS=true, the persisted Settings toggle on, and the AWS_*
// variables configured in .env.
const runId = process.argv[2] ?? process.env.CONTROLLER_RUN_ID;
if (!runId) {
  console.error("Usage: npm run controller -- <runId>");
  process.exit(1);
}

const intervalMs = Number(process.env.REAL_TICK_MS ?? 5_000);
let stopping = false;
process.on("SIGINT", () => {
  console.log("\nStopping controller after the current tick...");
  stopping = true;
});

async function loop() {
  console.log(
    `Live AWS controller driving run ${runId} every ${intervalMs}ms. Press Ctrl+C to stop.`,
  );
  while (!stopping) {
    const startedAt = Date.now();
    try {
      const outcome = await realTick(runId!);
      console.log(new Date().toISOString(), JSON.stringify(outcome));
    } catch (error) {
      console.error(
        new Date().toISOString(),
        "tick failed:",
        error instanceof Error ? error.message : error,
      );
    }
    const elapsed = Date.now() - startedAt;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, intervalMs - elapsed)));
  }
  process.exit(0);
}

void loop();

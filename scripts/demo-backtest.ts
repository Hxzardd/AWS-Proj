import { mkdir, writeFile } from "node:fs/promises";
import { cloudWatchFixture, evaluatePolicy, HOLDOUT_SEEDS, trainBatch, trafficCsv } from "../lib/simulation/experiment";
import { SCENARIOS, DEFAULT_CUSTOM_TRAFFIC, parseTrafficCsv, type Scenario } from "../lib/simulation/scenarios";
import type { QTable } from "../lib/rl/types";

const output = "outputs/demo";
await mkdir(output, { recursive: true });
const scenarios = Object.keys(SCENARIOS) as Scenario[];
const custom = parseTrafficCsv(DEFAULT_CUSTOM_TRAFFIC);
let table: QTable = {}, epsilon = 1, completed = 0;
type Evaluation = { scenario: Scenario; seed: number; rl: ReturnType<typeof evaluatePolicy>["rl"]; baseline: ReturnType<typeof evaluatePolicy>["baseline"] };
const checkpoints: Array<{ episodes: number; updates: number; epsilon: number; evaluations: Evaluation[] }> = [];
for (const target of [0, 10, 100, 1000]) {
  if (target > completed) {
    const trained = trainBatch(table, completed, target - completed, epsilon);
    table = trained.qTable; epsilon = trained.epsilon; completed = target;
  }
  const evaluations = scenarios.flatMap((scenario) => HOLDOUT_SEEDS.map((seed) => {
    const result = evaluatePolicy(table, { scenario, seed, custom });
    return { scenario, seed, rl: result.rl, baseline: result.baseline };
  }));
  checkpoints.push({ episodes: target, updates: target * 288, epsilon, evaluations });
  console.log(`Evaluated ${target} training episodes on ${evaluations.length} unseen scenario/seed pairs.`);
}
const final = checkpoints.at(-1)!;
const summary = scenarios.map((scenario) => {
  const rows = final.evaluations.filter((row) => row.scenario === scenario);
  const cold = checkpoints[0].evaluations.filter((row) => row.scenario === scenario);
  const average = (values: number[]) => values.reduce((a,b) => a+b,0)/values.length;
  const rlP95 = average(rows.map((row) => row.rl.meanP95Ms));
  const baselineP95 = average(rows.map((row) => row.baseline.meanP95Ms));
  return { scenario, intervalsPerController: rows.length*288, rlP95, baselineP95, latencyImprovementPct: 100*(baselineP95-rlP95)/baselineP95,
    rlSlaPct: average(rows.map((row) => row.rl.slaViolationPct)), baselineSlaPct: average(rows.map((row) => row.baseline.slaViolationPct)),
    coldReward: average(cold.map((row) => row.rl.meanReward)), trainedReward: average(rows.map((row) => row.rl.meanReward)),
    rlThroughputPct: average(rows.map((row) => row.rl.throughputPct)), baselineThroughputPct: average(rows.map((row) => row.baseline.throughputPct)) };
});
for (const scenario of scenarios) {
  const replay = evaluatePolicy(table, { scenario, seed: HOLDOUT_SEEDS[0], custom });
  await writeFile(`${output}/traffic-${scenario}.csv`, trafficCsv(replay.points));
  await writeFile(`${output}/cloudwatch-${scenario}.json`, JSON.stringify(cloudWatchFixture(replay.points), null, 2));
}
await writeFile(`${output}/evidence.json`, JSON.stringify({ simulated: true, trainingSeedBase: 42424, evaluationSeeds: HOLDOUT_SEEDS, checkpoints, summary, qTable: table }, null, 2));
await writeFile(`${output}/report.md`, `# Reproducible simulation evidence\n\nGenerated ${new Date().toISOString()}. No AWS calls, credentials, database writes, or downloaded AWS traces.\n\n288,000 training updates; 35 holdout scenario/seed pairs; four checkpoints (0, 10, 100, 1,000 episodes). Training seeds do not overlap evaluation seeds. The Q-table is frozen during evaluation.\n\n| Scenario | Agent mean P95 ms | Baseline mean P95 ms | Latency improvement | Agent SLA % | Baseline SLA % | Untrained reward | Trained reward |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${summary.map((row) => `| ${row.scenario} | ${row.rlP95.toFixed(2)} | ${row.baselineP95.toFixed(2)} | ${row.latencyImprovementPct.toFixed(2)}% | ${row.rlSlaPct.toFixed(2)} | ${row.baselineSlaPct.toFixed(2)} | ${row.coldReward.toFixed(4)} | ${row.trainedReward.toFixed(4)} |`).join("\n")}\n\nP95 here means the average of simulated interval P95 values, not a percentile computed from raw requests. Negative improvements are retained. The baseline scales only; safety constraints, routing and caching also contribute to RL results. Learning is not monotonic. Custom traffic deliberately tests overload and recovery. Costs are model assumptions, not current AWS prices.\n\nEach traffic CSV can be pasted into Learning Lab > Custom traffic. CloudWatch JSON is clearly labeled synthetic and uses RequestCount Sum over 300 seconds and TargetResponseTime p95 in seconds.\n`);
console.table(summary);
console.log(`Evidence and traffic written to ${output}/`);

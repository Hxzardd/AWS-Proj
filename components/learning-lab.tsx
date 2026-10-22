"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, DownloadSimple, Play, Pause, Pulse, ShieldCheck } from "@phosphor-icons/react";
import { PageHeader } from "./page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { SeedField } from "./ui/seed-field";
import { FeedbackBanner } from "./ui/feedback-banner";
import { TelemetryTile } from "./ui/telemetry-tile";
import { LineSeriesChart } from "./charts/line-series-chart";
import { INITIAL_CONTROL_STATE, type ControlState } from "@/lib/simulation/generator";
import { SCENARIOS, DEFAULT_CUSTOM_TRAFFIC, parseTrafficCsv, type Scenario, type TrafficPoint } from "@/lib/simulation/scenarios";
import { cloudWatchFixture, evaluatePolicy, isTrainingSeed, replayStep, trafficCsv, trainBatch, type ReplayPoint } from "@/lib/simulation/experiment";
import type { QTable } from "@/lib/rl/types";

type Checkpoint = { step: number; reward: number; baselineReward: number; p95: number; baselineP95: number; sla: number; baselineSla: number };
type Session = {
  table: QTable; episodes: number; epsilon: number; custom: TrafficPoint[]; onlineUpdates: number;
  rlControl: ControlState; baseControl: ControlState; points: ReplayPoint[];
};
const initialSession = (custom: TrafficPoint[]): Session => ({ table: {}, episodes: 0, epsilon: 1, custom, onlineUpdates: 0,
  rlControl: { ...INITIAL_CONTROL_STATE }, baseControl: { ...INITIAL_CONTROL_STATE }, points: [] });
function download(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LearningLab() {
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [seed, setSeed] = useState(20260922);
  const [customCsv, setCustomCsv] = useState(DEFAULT_CUSTOM_TRAFFIC);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"training" | "replaying" | "learning">("training");
  const [error, setError] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState(0);
  const [epsilon, setEpsilon] = useState(1);
  const [entries, setEntries] = useState(0);
  const [onlineUpdates, setOnlineUpdates] = useState(0);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [points, setPoints] = useState<ReplayPoint[]>([]);
  const [speed, setSpeed] = useState(200);
  const session = useRef<Session | null>(null);

  function checkpoint(current: Session): Checkpoint {
    const result = evaluatePolicy(current.table, { scenario, seed, custom: current.custom });
    return { step: current.episodes, reward: result.rl.meanReward, baselineReward: result.baseline.meanReward,
      p95: result.rl.meanP95Ms, baselineP95: result.baseline.meanP95Ms,
      sla: result.rl.slaViolationPct, baselineSla: result.baseline.slaViolationPct };
  }
  function clear() {
    setRunning(false); session.current = null; setPoints([]); setCheckpoints([]); setEpisodes(0); setEntries(0); setEpsilon(1); setOnlineUpdates(0); setMode("training"); setError(null);
  }
  function start() {
    try {
      if (!Number.isInteger(seed) || seed < 1 || seed > 2147483647) throw new Error("Use an integer seed between 1 and 2147483647.");
      if (isTrainingSeed(seed)) throw new Error("That seed belongs to the training set. Choose another seed for unseen evaluation.");
      const custom = scenario === "custom" ? parseTrafficCsv(customCsv) : [];
      const current = initialSession(custom); session.current = current;
      setCheckpoints([checkpoint(current)]); setPoints([]); setEpisodes(0); setEntries(0); setEpsilon(1); setOnlineUpdates(0); setMode("training"); setError(null); setRunning(true);
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Could not start the experiment."); }
  }
  function replay(learn: boolean) {
    if (!session.current) return;
    session.current.points = [];
    session.current.rlControl = { ...INITIAL_CONTROL_STATE };
    session.current.baseControl = { ...INITIAL_CONTROL_STATE };
    setPoints([]); setMode(learn ? "learning" : "replaying"); setRunning(true);
  }

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      const current = session.current;
      if (!current) return;
      try {
        if (mode === "training") {
          const trained = trainBatch(current.table, current.episodes, 10, current.epsilon);
          current.episodes += 10; current.epsilon = trained.epsilon;
          setEpisodes(current.episodes); setEpsilon(current.epsilon); setEntries(trained.summary.qTableEntries);
          const result = evaluatePolicy(current.table, { scenario, seed, custom: current.custom });
          setCheckpoints((previous) => [...previous, { step: current.episodes, reward: result.rl.meanReward, baselineReward: result.baseline.meanReward,
            p95: result.rl.meanP95Ms, baselineP95: result.baseline.meanP95Ms, sla: result.rl.slaViolationPct, baselineSla: result.baseline.slaViolationPct }]);
          if (current.episodes >= 1000) setRunning(false);
        } else {
          const point = replayStep({ scenario, seed, custom: current.custom, step: current.points.length + 1, table: current.table,
            rlControl: current.rlControl, baseControl: current.baseControl, learn: mode === "learning", epsilon: mode === "learning" ? current.epsilon : 0 });
          current.rlControl = point.rl.control; current.baseControl = point.baseline.control;
          if (mode === "learning") {
            current.epsilon = point.rl.epsilon; current.onlineUpdates += 1;
            setOnlineUpdates(current.onlineUpdates); setEpsilon(current.epsilon);
            setEntries(Object.values(current.table).reduce((count, actions) => count + Object.keys(actions).length, 0));
          }
          current.points.push(point); setPoints([...current.points]);
          if (current.points.length >= 288) setRunning(false);
        }
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : "Experiment stopped unexpectedly."); setRunning(false);
      }
    }, speed);
    return () => window.clearInterval(timer);
  }, [running, mode, scenario, seed, speed]);

  function exportData(kind: "traffic" | "cloudwatch" | "evidence") {
    const current = session.current;
    if (!current) return;
    const result = evaluatePolicy(current.table, { scenario, seed, custom: current.custom });
    if (kind === "traffic") download(`traffic-${scenario}-${seed}.csv`, trafficCsv(result.points), "text/csv");
    else if (kind === "cloudwatch") download(`cloudwatch-simulated-${scenario}.json`, JSON.stringify(cloudWatchFixture(result.points), null, 2), "application/json");
    else download(`learning-evidence-${scenario}.json`, JSON.stringify({ simulated: true, scenario, seed, trainingEpisodes: current.episodes,
      checkpoints, replayMode: mode, liveLearningUpdates: current.onlineUpdates,
      evaluation: { rl: result.rl, baseline: result.baseline }, qTable: current.table, points: result.points }, null, 2), "application/json");
  }

  const latest = points.at(-1);
  const last = checkpoints.at(-1);
  const first = checkpoints[0];
  const learningUpdates = episodes * 288 + onlineUpdates;
  const replayData = points.slice(-120).map((point) => ({ step: point.step, demand: point.demand, rl: point.rl.metrics.p95LatencyMs,
    baseline: point.baseline.metrics.p95LatencyMs, instances: point.rl.control.instances, baseInstances: point.baseline.control.instances }));
  const complete = mode === "training" ? episodes >= 1000 : points.length >= 288;
  const selectClass = "min-h-11 w-full rounded-lg border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60";

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 md:px-8">
      <PageHeader badge="Demo / Learning Lab" title="See learning happen" description="Train a fresh agent, measure it on unseen traffic, then replay its decisions. Everything runs locally in this browser with the project’s Q-learning engine." />
      <FeedbackBanner tone="info" className="mt-5"><ShieldCheck size={20} className="shrink-0" /><span>Synthetic AWS-style workload · No credentials or services needed · Lab state is separate from your saved policy. Download evidence before leaving this page.</span></FeedbackBanner>
      {error && <FeedbackBanner tone="error" className="mt-4">{error}</FeedbackBanner>}
      <Card className="mt-5">
        <CardContent className="pt-5">
          <div className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-2 text-sm">Traffic scenario<select className={selectClass} value={scenario} disabled={running} onChange={(event) => { clear(); setScenario(event.target.value as Scenario); }}>{Object.entries(SCENARIOS).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}</select></label>
            <div className="grid gap-2 text-sm"><span>Evaluation seed</span><div className={running ? "pointer-events-none opacity-60" : ""}><SeedField disabled={running} value={seed} onChange={(value) => { if (!running) { clear(); setSeed(value); } }} /></div></div>
            <label className="grid gap-2 text-sm">Playback speed<select className={selectClass} value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={100}>Fast · 0.1 seconds / tick</option><option value={200}>Demo · 0.2 seconds / tick</option><option value={1000}>Explain · 1 second / tick</option></select></label>
            <div className="flex flex-wrap gap-2"><Button onClick={start} disabled={running}><Brain size={18} />Train from scratch</Button>{running ? <Button variant="outline" onClick={() => setRunning(false)}><Pause size={18} />Pause</Button> : checkpoints.length > 0 && !complete ? <Button variant="outline" onClick={() => setRunning(true)}><Play size={18} />Resume</Button> : null}</div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{SCENARIOS[scenario].description} One replay tick models a five-minute interval.</p>
          {scenario === "custom" && <label className="mt-4 grid gap-2 text-sm">Custom request rates (step,rps)<textarea aria-label="Custom request rates" className="min-h-40 rounded-lg border bg-background p-3 font-mono text-sm" value={customCsv} disabled={running} onChange={(event) => { clear(); setCustomCsv(event.target.value); }} /><span className="text-xs text-muted-foreground">Use step 1 first, then increasing steps up to 288. Zero traffic is supported. Maximum 100,000 requests/second.</span></label>}
        </CardContent>
      </Card>
      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <TelemetryTile icon={<Brain size={18} />} label="Learning updates" value={learningUpdates.toLocaleString()} detail={`${episodes} training episodes · 288 steps each`} />
        <TelemetryTile icon={<Pulse size={18} />} label="Learned preferences" value={entries} detail="Distinct state-action Q-values" />
        <TelemetryTile icon={<Brain size={18} />} label="Exploration" value={epsilon.toFixed(3)} detail="Decays from 1.000 to a 0.050 floor" />
        <TelemetryTile icon={<Play size={18} />} label="Experiment status" value={running ? mode === "training" ? "Training" : "Replaying" : complete ? "Complete" : episodes ? "Paused" : "Ready"} detail={mode === "training" ? "10 episodes per training tick" : `${points.length} / 288 replay intervals`} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Learning evidence</CardTitle><CardDescription>Mean reward on the same unseen day after each training batch. Higher is better; learning can temporarily regress. X-axis: training episodes.</CardDescription></CardHeader><CardContent><LineSeriesChart data={checkpoints} series={[{ key: "reward", label: "Learning agent", color: "var(--chart-1)" }, { key: "baselineReward", label: "Static baseline", color: "var(--chart-2)", dashed: true }]} valueFormatter={(value) => value.toFixed(3)} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Before and after training</CardTitle><CardDescription>Frozen evaluation: no exploration and no Q-table updates during measurement.</CardDescription></CardHeader><CardContent>
          {last && first ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-muted-foreground"><th className="pb-4">Metric</th><th>Untrained</th><th>Current</th><th>Baseline</th></tr></thead><tbody className="font-mono"><tr className="border-t"><th className="py-4 font-sans font-normal">Mean interval P95</th><td>{first.p95.toFixed(1)} ms</td><td>{last.p95.toFixed(1)} ms</td><td>{last.baselineP95.toFixed(1)} ms</td></tr><tr className="border-t"><th className="py-4 font-sans font-normal">SLA violations</th><td>{first.sla.toFixed(1)}%</td><td>{last.sla.toFixed(1)}%</td><td>{last.baselineSla.toFixed(1)}%</td></tr><tr className="border-t"><th className="py-4 font-sans font-normal">Mean reward</th><td>{first.reward.toFixed(3)}</td><td>{last.reward.toFixed(3)}</td><td>{last.baselineReward.toFixed(3)}</td></tr></tbody></table></div> : <p className="py-12 text-sm text-muted-foreground">Start training to measure the untrained policy and every subsequent checkpoint.</p>}
          <p className="mt-4 text-xs leading-5 text-muted-foreground">Training uses independent seeds and varied demand. Evaluation never trains the agent. The baseline only scales; routing, caching and safety rules also contribute to the agent’s advantage. This is a simulator experiment, not an AWS benchmark.</p>
        </CardContent></Card>
      </div>
      <Card className="mt-4"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Replay the traffic</CardTitle><CardDescription>Both controllers receive identical demand. Choose frozen comparison or continued online learning.</CardDescription></div><Badge>{mode === "learning" ? "Online learning" : "Frozen comparison"}</Badge></div></CardHeader><CardContent>
        <div className="mb-5 flex flex-wrap gap-2"><Button disabled={!episodes || running} onClick={() => replay(false)}><Play size={18} />Replay learned policy</Button><Button variant="outline" disabled={!episodes || running} onClick={() => replay(true)}>Continue learning live</Button></div>
        <div className="grid gap-4 xl:grid-cols-2"><LineSeriesChart data={replayData} series={[{ key: "rl", label: "Agent P95", color: "var(--chart-1)" }, { key: "baseline", label: "Baseline P95", color: "var(--chart-2)", dashed: true }]} valueFormatter={(value) => `${Math.round(value)} ms`} /><LineSeriesChart data={replayData} series={[{ key: "demand", label: "Shared request rate", color: "var(--chart-3)" }]} valueFormatter={(value) => `${Math.round(value)} rps`} /></div>
        {latest && <div className="mt-4 rounded-lg border p-4 text-sm" data-testid="latest-decision"><p className="font-mono text-primary">Step {latest.step} · {latest.rl.action} · reward {latest.rl.reward.toFixed(4)} · Q-value {latest.rl.qValue.toFixed(4)}</p><p className="mt-2 text-muted-foreground">{latest.rl.reason}</p><p className="mt-3">Agent: {latest.rl.control.instances} instances · route {latest.rl.control.primaryRoutePct}/{100-latest.rl.control.primaryRoutePct} · cache {latest.rl.control.cacheTtlSec}s. Baseline: {latest.baseline.control.instances} instances.</p></div>}
      </CardContent></Card>
      <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" disabled={!episodes || running} onClick={() => exportData("traffic")}><DownloadSimple size={18} />Download traffic CSV</Button><Button variant="outline" disabled={!episodes || running} onClick={() => exportData("cloudwatch")}>Download simulated CloudWatch JSON</Button><Button variant="outline" disabled={!episodes || running} onClick={() => exportData("evidence")}>Download learning evidence</Button></div>
    </div>
  );
}

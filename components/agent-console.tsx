"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowClockwise, Brain, ChartLineUp, Compass, GridFour } from "@phosphor-icons/react";
import { getQTableSnapshot, getRecentRuns, getSettings, getSimulationSnapshot } from "@/app/actions";
import { LineSeriesChart } from "@/components/charts/line-series-chart";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { TelemetryTile } from "@/components/ui/telemetry-tile";
import type { QTableSnapshot, SettingsSnapshot, SimulationView } from "@/lib/contracts";
import { ACTION_DEFINITION, RL_ACTIONS, STATE_BUCKET_DEFINITION } from "@/lib/rl/types";
import { REWARD_FORMULA } from "@/lib/rl/reward";

export function AgentConsole() {
  const [snapshot, setSnapshot] = useState<QTableSnapshot | null>(null);
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null);
  const [run, setRun] = useState<SimulationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [qResult, settingsResult, runsResult] = await Promise.all([
      getQTableSnapshot(),
      getSettings(),
      getRecentRuns(),
    ]);
    if (!qResult.ok) setError(qResult.error);
    else setSnapshot(qResult.data);
    if (settingsResult.ok) setSettings(settingsResult.data);
    if (runsResult.ok) {
      const learnedRun = runsResult.data.find((item) => item.mode === "rl") ?? runsResult.data.find((item) => item.mode === "compare");
      if (learnedRun) {
        const runResult = await getSimulationSnapshot(learnedRun.id);
        if (runResult.ok) setRun(runResult.data);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 5_000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const maxMagnitude = useMemo(
    () => Math.max(0.001, ...(snapshot?.entries.map((entry) => Math.abs(entry.qValue)) ?? [0.001])),
    [snapshot],
  );

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 md:px-8 md:py-10">
      <PageHeader badge="Model / Transparency" title="Inside the Q-learning agent" description="State buckets, action space, Q-values, exploration rate, and rewards are read from the same TypeScript modules used by the live controller." actions={<Button variant="outline" onClick={() => void refresh()} disabled={loading}><ArrowClockwise size={16} className={loading ? "animate-spin" : undefined} aria-hidden="true" />{loading ? "Refreshing…" : "Refresh snapshot"}</Button>} />
      {error && <FeedbackBanner tone="error" className="mt-6">{error}</FeedbackBanner>}

      <div className="page-enter mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4 [animation-delay:70ms]">
        <TelemetryTile icon={<Brain size={18} weight="duotone" />} label="Q-table entries" value={snapshot?.totalEntries ?? 0} detail="Learned state-action pairs" />
        <TelemetryTile icon={<GridFour size={18} weight="duotone" />} label="Observed states" value={snapshot?.stateCount ?? 0} detail="Discrete state buckets" />
        <TelemetryTile icon={<Compass size={18} weight="duotone" />} label="Exploration epsilon" value={run?.run.epsilon.toFixed(3) ?? settings?.epsilonStart.toFixed(3) ?? "1.000"} detail="Explore versus exploit" />
        <TelemetryTile icon={<ChartLineUp size={18} weight="duotone" />} label="Learning updates" value={run?.run.episode ?? 0} detail="Updates persisted" />
      </div>

      <div className="page-enter mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)] [animation-delay:120ms]">
        <Card>
          <CardHeader className="flex-row items-start justify-between"><div><CardTitle>Reward trend</CardTitle><CardDescription>Rolling mean over 20 intervals; higher is better. Changing traffic also affects reward. Use Learning Lab for a fixed holdout comparison.</CardDescription></div>{run && <Badge>{run.run.mode === "compare" ? "Frozen evaluation" : "Online learning"}</Badge>}</CardHeader>
          <CardContent><LineSeriesChart data={run?.learningCurve.map((point) => ({ ...point })) ?? []} series={[{ key: "meanReward", label: "Mean reward (20 intervals)", color: "var(--chart-1)" }]} valueFormatter={(value) => value.toFixed(2)} height={310} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Reward function</CardTitle><CardDescription>Pure function weights currently used by the controller</CardDescription></CardHeader>
          <CardContent>
            <code className="block rounded-[12px] border bg-background p-4 font-mono text-xs leading-6 text-secondary-foreground">{REWARD_FORMULA}</code>
            <dl className="mt-4 grid gap-2 text-sm">
              {Object.entries(settings?.rewardWeights ?? { latency: 0.4, sla: 0.3, throughput: 0.2, cost: 0.1 }).map(([key, value]) => <div key={key} className="flex items-center justify-between rounded-[10px] bg-muted px-3 py-2"><dt className="capitalize text-muted-foreground">{key}</dt><dd className="font-mono">{value.toFixed(2)}</dd></div>)}
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card className="page-enter mt-4 overflow-hidden [animation-delay:170ms]">
        <CardHeader><CardTitle>Top learned preferences</CardTitle><CardDescription>Higher-intensity cells have greater absolute Q-values. Values come directly from MySQL.</CardDescription></CardHeader>
        <CardContent>
          {snapshot?.entries.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs text-muted-foreground"><tr><th className="sticky top-0 bg-card pb-3 font-medium">State key</th><th className="sticky top-0 bg-card pb-3 font-medium">Preferred action</th><th className="sticky top-0 bg-card pb-3 text-right font-medium">Q-value</th><th className="sticky top-0 bg-card pb-3 text-right font-medium">Visits</th></tr></thead>
                <tbody>{snapshot.entries.slice(0, 24).map((entry) => { const alpha = 0.05 + (Math.abs(entry.qValue) / maxMagnitude) * 0.22; return <tr key={`${entry.stateKey}:${entry.action}`} className="table-row-hover border-t"><td className="py-3 pr-5 font-mono text-xs text-secondary-foreground">{entry.stateKey}</td><td className="py-3 pr-5"><span className="rounded-[7px] px-2 py-1 font-mono text-xs text-primary" style={{ backgroundColor: `rgb(var(--primary-rgb) / ${alpha})` }}>{entry.action}</span></td><td className="py-3 text-right font-mono">{entry.qValue.toFixed(5)}</td><td className="py-3 text-right font-mono text-muted-foreground">{entry.visits}</td></tr>; })}</tbody>
              </table>
            </div>
          ) : (
            <div className="metric-grid flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center"><Brain size={28} className="text-primary/55" /><p className="mt-4 text-sm font-medium">The Q-table is empty</p><p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">Run the live control loop to create real state-action updates.</p></div>
          )}
        </CardContent>
      </Card>

      <div className="page-enter mt-4 grid gap-4 xl:grid-cols-2 [animation-delay:220ms]">
        <Card><CardHeader><CardTitle>State discretization</CardTitle><CardDescription>Thresholds imported from lib/rl/types.ts</CardDescription></CardHeader><CardContent className="grid gap-3">{Object.entries(STATE_BUCKET_DEFINITION).map(([metric, buckets]) => <div key={metric} className="rounded-[12px] border p-4"><p className="font-mono text-xs text-primary">{metric}</p><div className="mt-3 grid grid-cols-3 gap-2 text-xs">{Object.entries(buckets).map(([bucket, range]) => <div key={bucket} className="rounded-[8px] bg-muted p-2"><span className="block capitalize text-muted-foreground">{bucket}</span><span className="mt-1 block font-mono">{range}</span></div>)}</div></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Discrete action space</CardTitle><CardDescription>Every selectable action from the real policy module</CardDescription></CardHeader><CardContent className="grid gap-2">{RL_ACTIONS.map((action) => <div key={action} className="grid gap-1 rounded-[10px] border px-3 py-2.5 sm:grid-cols-[160px_1fr]"><span className="font-mono text-xs text-primary">{action}</span><span className="text-xs leading-5 text-muted-foreground">{ACTION_DEFINITION[action]}</span></div>)}</CardContent></Card>
      </div>
    </div>
  );
}

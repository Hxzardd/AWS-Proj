"use client";

import { useMemo, useState } from "react";
import { ArrowClockwise, Pause, Play, Scales } from "@phosphor-icons/react";
import { useSimulation } from "@/hooks/use-simulation";
import { PageHeader } from "@/components/page-header";
import { LineSeriesChart } from "@/components/charts/line-series-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { SeedField } from "@/components/ui/seed-field";
import type { MetricPoint } from "@/lib/contracts";
import { cn, clockFromStep } from "@/lib/utils";

function average(points: MetricPoint[], key: keyof MetricPoint) {
  if (!points.length) return 0;
  return points.reduce((sum, point) => sum + Number(point[key]), 0) / points.length;
}

function ComparisonMetric({ label, rl, baseline, unit = "", higherIsBetter = false }: { label: string; rl: number; baseline: number; unit?: string; higherIsBetter?: boolean }) {
  const hasData = rl > 0 || baseline > 0;
  const delta = baseline === 0 ? 0 : ((rl - baseline) / baseline) * 100;
  const favorable = higherIsBetter ? delta >= 0 : delta <= 0;
  return (
    <Card className="transition-[border-color,transform] duration-200 hover:-translate-y-px hover:border-primary/25">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3"><p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p><span className={cn("rounded-md border px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.1em]", !hasData ? "border-border text-muted-foreground" : favorable ? "border-primary/25 bg-primary/10 text-primary" : "border-warning/25 bg-warning/10 text-warning")}>{!hasData ? "Waiting" : favorable ? "Favorable" : "Learning cost"}</span></div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div><p key={hasData ? rl : "empty-rl"} className="metric-value-enter font-mono text-xl text-primary">{hasData ? `${unit === "$" ? "$" : ""}${rl.toFixed(unit === "$" ? 6 : 1)}${unit === "$" ? "" : unit}` : "—"}</p><p className="mt-1 text-xs text-muted-foreground">RL agent</p></div>
          <div><p key={hasData ? baseline : "empty-baseline"} className="metric-value-enter font-mono text-xl text-warning">{hasData ? `${unit === "$" ? "$" : ""}${baseline.toFixed(unit === "$" ? 6 : 1)}${unit === "$" ? "" : unit}` : "—"}</p><p className="mt-1 text-xs text-muted-foreground">Baseline</p></div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">{!hasData ? "Run a matched seed to calculate the delta" : favorable ? `${Math.abs(delta).toFixed(1)}% favorable RL delta` : `${Math.abs(delta).toFixed(1)}% unfavorable RL delta`}</p>
      </CardContent>
    </Card>
  );
}

export function CompareConsole() {
  const [seed, setSeed] = useState(2026);
  const simulation = useSimulation("compare");
  const metrics = useMemo(() => simulation.view?.metrics ?? [], [simulation.view?.metrics]);
  const rl = metrics.filter((point) => point.source === "rl");
  const baseline = metrics.filter((point) => point.source === "baseline");
  const running = simulation.view?.run.status === "running";

  const chartData = useMemo(() => {
    const rows = new Map<number, Record<string, number>>();
    for (const point of metrics) {
      const row = rows.get(point.step) ?? { step: point.step };
      const prefix = point.source === "rl" ? "rl" : "base";
      row[`${prefix}Latency`] = point.p95LatencyMs;
      row[`${prefix}Throughput`] = point.throughput;
      row[`${prefix}Cost`] = point.costPerThousandUsd;
      rows.set(point.step, row);
    }
    return Array.from(rows.values()).slice(-72);
  }, [metrics]);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 md:px-8 md:py-10">
      <PageHeader
        badge="Evaluation / Matched Seed"
        title="RL agent vs static thresholds"
        description="The frozen learned policy and static baseline receive the identical seeded demand waveform. Evaluation uses no random exploration and every delta comes from persisted output."
        actions={
          <>
            <SeedField value={seed} onChange={setSeed} name="comparison-seed" ariaLabel="Comparison seed" />
            {!running ? <Button onClick={() => simulation.start(seed)} disabled={simulation.pending}><Play size={16} weight="fill" aria-hidden="true" />{simulation.pending ? "Starting…" : "Run comparison"}</Button> : <Button variant="outline" onClick={simulation.stop} disabled={simulation.pending}><Pause size={16} aria-hidden="true" />Stop</Button>}
            <Button variant="secondary" onClick={() => simulation.reset(seed)} disabled={simulation.pending}><ArrowClockwise size={16} aria-hidden="true" />Reset</Button>
          </>
        }
      />
      {simulation.error && <FeedbackBanner tone="error" className="mt-6">{simulation.error}</FeedbackBanner>}

      <div className="page-enter mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [animation-delay:70ms]">
        <ComparisonMetric label="Average P95 latency" rl={average(rl, "p95LatencyMs")} baseline={average(baseline, "p95LatencyMs")} unit=" ms" />
        <ComparisonMetric label="Average throughput" rl={average(rl, "throughput")} baseline={average(baseline, "throughput")} unit=" rps" higherIsBetter />
        <ComparisonMetric label="Cost per 1,000 requests" rl={average(rl, "costPerThousandUsd")} baseline={average(baseline, "costPerThousandUsd")} unit="$" />
        <Card className="transition-[border-color,transform] duration-200 hover:-translate-y-px hover:border-primary/25"><CardContent className="p-5"><p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">SLA violations</p><div className="mt-4 grid grid-cols-2 gap-4"><div><p key={rl.length ? rl.filter((point) => point.slaViolation).length : "empty-rl"} className="metric-value-enter font-mono text-xl text-primary">{rl.length ? rl.filter((point) => point.slaViolation).length : "—"}</p><p className="mt-1 text-xs text-muted-foreground">RL agent</p></div><div><p key={baseline.length ? baseline.filter((point) => point.slaViolation).length : "empty-baseline"} className="metric-value-enter font-mono text-xl text-warning">{baseline.length ? baseline.filter((point) => point.slaViolation).length : "—"}</p><p className="mt-1 text-xs text-muted-foreground">Baseline</p></div></div><p className="mt-4 text-xs text-muted-foreground">{rl.length && baseline.length ? `From ${Math.min(rl.length, baseline.length)} matched intervals` : "Awaiting matched intervals"}</p></CardContent></Card>
      </div>

      <div className="page-enter mt-4 grid gap-4 xl:grid-cols-2 [animation-delay:120ms]">
        <Card><CardHeader className="flex-row items-start justify-between"><div><CardTitle>P95 latency</CardTitle><CardDescription>Same traffic seed, different controllers</CardDescription></div><Badge className={!running ? "border-border bg-muted text-muted-foreground" : undefined}>{running && <span className="status-breathe size-1.5 rounded-full bg-primary" aria-hidden="true" />}{simulation.view ? `Seed ${simulation.view.run.seed}` : "Not started"}</Badge></CardHeader><CardContent><LineSeriesChart data={chartData} series={[{ key: "rlLatency", label: "RL", color: "var(--chart-1)" }, { key: "baseLatency", label: "Baseline", color: "var(--chart-2)", dashed: true }]} valueFormatter={(value) => `${Math.round(value)} ms`} height={300} reference={{ value: 200, label: "SLA 200 ms" }} xTickFormatter={clockFromStep} xLabelFormatter={clockFromStep} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Throughput</CardTitle><CardDescription>Completed requests per second</CardDescription></CardHeader><CardContent><LineSeriesChart data={chartData} series={[{ key: "rlThroughput", label: "RL", color: "var(--chart-1)" }, { key: "baseThroughput", label: "Baseline", color: "var(--chart-2)", dashed: true }]} valueFormatter={(value) => `${Math.round(value)} rps`} height={300} xTickFormatter={clockFromStep} xLabelFormatter={clockFromStep} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Estimated cost efficiency</CardTitle><CardDescription>Infrastructure cost per 1,000 completed requests</CardDescription></CardHeader><CardContent><LineSeriesChart data={chartData} series={[{ key: "rlCost", label: "RL", color: "var(--chart-1)" }, { key: "baseCost", label: "Baseline", color: "var(--chart-2)", dashed: true }]} valueFormatter={(value) => `$${value.toFixed(6)}`} height={300} xTickFormatter={clockFromStep} xLabelFormatter={clockFromStep} /></CardContent></Card>
        <Card>
          <CardHeader><CardTitle>Controller state</CardTitle><CardDescription>Actions diverge even though traffic does not</CardDescription></CardHeader>
          <CardContent>
            {simulation.view ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-primary/5 p-4 transition-colors duration-200 hover:border-primary/35"><p className="text-sm font-semibold text-primary">RL agent</p><dl className="mt-4 grid gap-2 text-xs text-muted-foreground"><div className="flex justify-between"><dt>Instances</dt><dd className="font-mono text-foreground">{simulation.view.controls.rl.instances}</dd></div><div className="flex justify-between"><dt>Routing</dt><dd className="font-mono text-foreground">{simulation.view.controls.rl.primaryRoutePct}/{100 - simulation.view.controls.rl.primaryRoutePct}</dd></div><div className="flex justify-between"><dt>Cache TTL</dt><dd className="font-mono text-foreground">{simulation.view.controls.rl.cacheTtlSec}s</dd></div></dl></div>
                <div className="rounded-xl border bg-warning/[0.025] p-4 transition-colors duration-200 hover:border-warning/25"><p className="text-sm font-semibold text-warning">Static baseline</p><dl className="mt-4 grid gap-2 text-xs text-muted-foreground"><div className="flex justify-between"><dt>Instances</dt><dd className="font-mono text-foreground">{simulation.view.controls.baseline.instances}</dd></div><div className="flex justify-between"><dt>Routing</dt><dd className="font-mono text-foreground">{simulation.view.controls.baseline.primaryRoutePct}/{100 - simulation.view.controls.baseline.primaryRoutePct}</dd></div><div className="flex justify-between"><dt>Cache TTL</dt><dd className="font-mono text-foreground">{simulation.view.controls.baseline.cacheTtlSec}s</dd></div></dl></div>
              </div>
            ) : (
              <div className="flex min-h-52 flex-col items-center justify-center rounded-[12px] border border-dashed p-6 text-center"><Scales size={28} className="text-muted-foreground" /><p className="mt-4 text-sm font-medium">No comparison yet</p><p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">Run a shared seed to produce both datasets.</p></div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

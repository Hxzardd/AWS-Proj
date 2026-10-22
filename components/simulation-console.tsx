"use client";

import { useMemo, useState } from "react";
import { ArrowClockwise, Brain, Clock, Cpu, Database, Gauge, GitBranch, Lightning, Pause, Play, Pulse, Stack } from "@phosphor-icons/react";
import { useSimulation } from "@/hooks/use-simulation";
import { PageHeader } from "@/components/page-header";
import { LineSeriesChart } from "@/components/charts/line-series-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { SeedField } from "@/components/ui/seed-field";
import { TelemetryTile } from "@/components/ui/telemetry-tile";
import type { MetricPoint } from "@/lib/contracts";
import { cn, clockFromStep } from "@/lib/utils";

function metricFormat(value: number, suffix = "") {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}${suffix}`;
}

function latestOf(metrics: MetricPoint[], source: MetricPoint["source"]) {
  return metrics.filter((point) => point.source === source).at(-1) ?? null;
}

export function SimulationConsole() {
  const [seed, setSeed] = useState(2026);
  const simulation = useSimulation("rl");
  const metrics = useMemo(
    () => simulation.view?.metrics.filter((point) => point.source === "rl") ?? [],
    [simulation.view?.metrics],
  );
  const latest = latestOf(metrics, "rl");
  const currentAction = simulation.view?.actions.find((action) => action.source === "rl") ?? null;
  const onRealAws = currentAction?.infrastructure?.provider === "aws";
  const chartData = useMemo(
    () => metrics.slice(-72).map((point) => ({
      step: point.step,
      p95LatencyMs: point.p95LatencyMs,
      networkLatencyMs: point.networkLatencyMs,
      requestRate: point.requestRate,
      throughput: point.throughput,
      cpuPct: point.cpuPct,
      memPct: point.memPct,
      cacheHitPct: point.cacheHitRatio * 100,
    })),
    [metrics],
  );
  const running = simulation.view?.run.status === "running";
  const spark = useMemo(() => {
    const window = metrics.slice(-24);
    return {
      latencyMs: window.map((point) => point.latencyMs),
      p95LatencyMs: window.map((point) => point.p95LatencyMs),
      requestRate: window.map((point) => point.requestRate),
      cpuPct: window.map((point) => point.cpuPct),
      memPct: window.map((point) => point.memPct),
      cacheHitPct: window.map((point) => point.cacheHitRatio * 100),
    };
  }, [metrics]);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 md:px-8 md:py-10">
      <PageHeader
        badge="Control / Live Loop"
        title="Watch the agent learn from traffic"
        description={onRealAws
          ? "Live on real AWS: each tick scrapes the gateway fleet, acts on a real Auto Scaling group, ALB, and SSM, and publishes optimizer telemetry to CloudWatch."
          : "Each 2.5-second tick represents a five-minute gateway interval. Decisions change the next simulated observation and are persisted."}
        actions={
          <>
            {onRealAws && (
              <Badge className="shrink-0 border-primary/40 bg-primary/10 text-primary">
                <span className="status-breathe size-1.5 rounded-full bg-primary" aria-hidden="true" />
                LIVE · Real AWS
              </Badge>
            )}
            <SeedField value={seed} onChange={setSeed} />
            {!running ? (
              <Button onClick={() => simulation.start(seed)} disabled={simulation.pending}><Play size={16} weight="fill" aria-hidden="true" />{simulation.pending ? "Starting…" : simulation.view ? "Start new run" : "Start simulation"}</Button>
            ) : (
              <Button variant="outline" onClick={simulation.stop} disabled={simulation.pending}><Pause size={16} aria-hidden="true" />Stop</Button>
            )}
            <Button variant="secondary" onClick={() => simulation.reset(seed)} disabled={simulation.pending}><ArrowClockwise size={16} aria-hidden="true" />Reset run</Button>
          </>
        }
      />

      {simulation.error && <FeedbackBanner tone="error" className="mt-6">{simulation.error}</FeedbackBanner>}

      <div className="page-enter mt-8 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6 [animation-delay:70ms]">
        <TelemetryTile icon={<Clock size={16} weight="duotone" />} label="Response time" value={latest ? metricFormat(latest.latencyMs, " ms") : "No data"} detail="Average per interval" history={spark.latencyMs} trendPolarity="down-good" />
        <TelemetryTile icon={<Gauge size={16} weight="duotone" />} label="P95 latency" value={latest ? metricFormat(latest.p95LatencyMs, " ms") : "No data"} detail={latest?.slaViolation ? "SLA threshold crossed" : "200 ms target"} tone={latest?.slaViolation ? "critical" : "default"} history={spark.p95LatencyMs} trendPolarity="down-good" />
        <TelemetryTile icon={<Pulse size={16} weight="duotone" />} label="Request rate" value={latest ? metricFormat(latest.requestRate, " rps") : "No data"} detail="Seeded burst demand" history={spark.requestRate} />
        <TelemetryTile icon={<Cpu size={16} weight="duotone" />} label="CPU" value={latest ? metricFormat(latest.cpuPct, "%") : "No data"} detail="Across active instances" history={spark.cpuPct} trendPolarity="down-good" />
        <TelemetryTile icon={<Stack size={16} weight="duotone" />} label="Memory" value={latest ? metricFormat(latest.memPct, "%") : "No data"} detail="Working set estimate" history={spark.memPct} trendPolarity="down-good" />
        <TelemetryTile icon={<Lightning size={16} weight="duotone" />} label="Cache hit ratio" value={latest ? metricFormat(latest.cacheHitRatio * 100, "%") : "No data"} detail="Affected by Redis TTL" history={spark.cacheHitPct} trendPolarity="up-good" />
      </div>

      <div className="page-enter mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.75fr)] [animation-delay:120ms]">
        <Card className={cn(latest?.slaViolation && "breach-pulse")}>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div><CardTitle>Latency and network</CardTitle><CardDescription>Response behavior after each action</CardDescription></div>
            <Badge className={cn("shrink-0", !running && "border-border bg-muted text-muted-foreground")}>{running && <span className="status-breathe size-1.5 rounded-full bg-primary" aria-hidden="true" />}{running ? "Running" : simulation.view ? "Stopped" : "Ready"}</Badge>
          </CardHeader>
          <CardContent>
            <LineSeriesChart data={chartData} series={[{ key: "p95LatencyMs", label: "P95 latency", color: "var(--chart-1)" }, { key: "networkLatencyMs", label: "Network latency", color: "var(--chart-2)", dashed: true }]} valueFormatter={(value) => `${Math.round(value)} ms`} height={310} reference={{ value: 200, label: "SLA 200 ms" }} xTickFormatter={clockFromStep} xLabelFormatter={clockFromStep} />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Current agent action</CardTitle><CardDescription>The last decision from the actual epsilon-greedy policy</CardDescription></CardHeader>
          <CardContent>
            {currentAction ? (
              <div key={`${currentAction.step}:${currentAction.action}`} className="page-enter">
                <div className="flex items-center gap-3 rounded-[12px] border bg-primary/5 p-4">
                  <span className="flex size-10 items-center justify-center rounded-[10px] bg-primary/10 text-primary"><Brain size={21} weight="duotone" /></span>
                  <div><p className="font-mono text-sm font-semibold text-primary">{currentAction.action}</p><p className="mt-1 text-xs text-muted-foreground">Reward {currentAction.reward.toFixed(4)}</p></div>
                </div>
                <p className="mt-4 text-sm leading-6 text-secondary-foreground">{currentAction.reason.replaceAll("|", " / ")}</p>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-[12px] bg-muted p-3"><span className="block text-xs text-muted-foreground">State</span><span className="mt-1 block font-mono text-xs">{currentAction.stateKey.replaceAll("|", " / ")}</span></div>
                  <div className="rounded-[12px] bg-muted p-3"><span className="block text-xs text-muted-foreground">Provider</span><span className="mt-1 block capitalize">{currentAction.infrastructure?.provider ?? "simulator"}</span></div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-[12px] border border-dashed p-6 text-center"><Brain size={28} className="text-muted-foreground" /><p className="mt-4 text-sm font-medium">No action yet</p><p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">Start a run. The first policy decision will appear after the initial observation.</p></div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="page-enter mt-4 grid gap-4 lg:grid-cols-2 [animation-delay:170ms]">
        <Card><CardHeader><CardTitle>Traffic and throughput</CardTitle><CardDescription>Demand compared with completed requests</CardDescription></CardHeader><CardContent><LineSeriesChart data={chartData} series={[{ key: "requestRate", label: "Request rate", color: "var(--chart-2)", dashed: true }, { key: "throughput", label: "Throughput", color: "var(--chart-1)" }]} valueFormatter={(value) => `${Math.round(value)} rps`} xTickFormatter={clockFromStep} xLabelFormatter={clockFromStep} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Compute utilization</CardTitle><CardDescription>CPU and memory respond to load and scale actions</CardDescription></CardHeader><CardContent><LineSeriesChart data={chartData} series={[{ key: "cpuPct", label: "CPU", color: "var(--chart-1)" }, { key: "memPct", label: "Memory", color: "var(--chart-2)", dashed: true }]} valueFormatter={(value) => `${Math.round(value)}%`} xTickFormatter={clockFromStep} xLabelFormatter={clockFromStep} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Adaptive cache</CardTitle><CardDescription>Simulated hit ratio plus the actual Redis cache TTL</CardDescription></CardHeader><CardContent><LineSeriesChart data={chartData} series={[{ key: "cacheHitPct", label: "Cache hit ratio", color: "var(--chart-1)" }]} valueFormatter={(value) => `${Math.round(value)}%`} xTickFormatter={clockFromStep} xLabelFormatter={clockFromStep} /></CardContent></Card>
        <Card>
          <CardHeader><CardTitle>Active policy state</CardTitle><CardDescription>Visible tally of the infrastructure controls</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border p-4 transition-colors duration-200 hover:border-primary/30 hover:bg-primary/[0.03]"><Stack size={20} className="text-primary" /><p className="mt-4 font-mono text-xl">{simulation.view?.controls.rl.instances ?? 4}</p><p className="mt-1 text-xs text-muted-foreground">Instances</p></div>
            <div className="rounded-xl border p-4 transition-colors duration-200 hover:border-primary/30 hover:bg-primary/[0.03]"><GitBranch size={20} className="text-primary" /><p className="mt-4 font-mono text-xl">{simulation.view?.controls.rl.primaryRoutePct ?? 70}/{100 - (simulation.view?.controls.rl.primaryRoutePct ?? 70)}</p><p className="mt-1 text-xs text-muted-foreground">Route weights</p></div>
            <div className="rounded-xl border p-4 transition-colors duration-200 hover:border-primary/30 hover:bg-primary/[0.03]"><Database size={20} className="text-primary" /><p className="mt-4 font-mono text-xl">{simulation.view?.controls.rl.cacheTtlSec ?? 60}s</p><p className="mt-1 text-xs text-muted-foreground">Cache TTL</p></div>
          </CardContent>
        </Card>
      </div>

      <FeedbackBanner tone="info" className="mt-4 text-xs"><Pulse size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />All values are generated by the seeded simulator. No production AWS resources are touched unless real AWS mode is explicitly enabled.</FeedbackBanner>
    </div>
  );
}

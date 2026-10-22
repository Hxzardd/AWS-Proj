import type { CSSProperties } from "react";
import { ArrowRight, ArrowsClockwise, Brain, ChartLineUp, Cloud, Database, Gauge, ShieldCheck } from "@phosphor-icons/react/dist/ssr";

const nodes = [
  { label: "Traffic simulator", detail: "Seeded burst profile", icon: Gauge },
  { label: "Metric observer", detail: "Latency, load, cache", icon: ChartLineUp },
  { label: "Q-learning agent", detail: "Explore, learn, decide", icon: Brain },
  { label: "Action adapter", detail: "Scale, route, cache", icon: Cloud },
];

export function ArchitectureDiagram() {
  return (
    <div className="metric-grid terminal-panel panel-surface relative overflow-hidden rounded-xl border bg-card/90 p-4 sm:p-5" role="img" aria-label="Closed-loop system architecture">
      <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-primary/[0.035] blur-3xl" aria-hidden="true" />
      <div className="relative mb-5 flex items-center justify-between border-b pb-4">
        <div><p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-primary">Runtime / Closed Loop</p><p className="mt-1 text-xs text-muted-foreground">Every action affects the next observation</p></div>
        <span className="flex size-9 items-center justify-center rounded-[10px] border border-primary/25 bg-primary/10 text-primary"><ArrowsClockwise className="architecture-signal" size={19} aria-hidden="true" /></span>
      </div>
      <div className="relative grid gap-2.5">
        {nodes.map((node, index) => {
          const Icon = node.icon;
          return (
            <div key={node.label} className="architecture-node relative flex items-center gap-3 rounded-[10px] border bg-background/88 p-3.5 transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-primary/30 hover:bg-background" style={{ "--node-index": index } as CSSProperties}>
              <span className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground" aria-hidden="true">0{index + 1}</span>
              <span className="flex size-10 items-center justify-center rounded-[10px] bg-primary/10 text-primary"><Icon size={20} weight="duotone" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{node.label}</span><span className="block text-xs text-muted-foreground">{node.detail}</span></span>
              {index < nodes.length - 1 && <ArrowRight size={16} className="architecture-signal text-primary/60" style={{ "--node-index": index } as CSSProperties} aria-hidden="true" />}
            </div>
          );
        })}
      </div>
      <div className="relative mt-3 grid grid-cols-[1.08fr_0.92fr] gap-2.5">
        <div className="rounded-xl border bg-background/88 p-3"><Database size={18} className="mb-2 text-primary" aria-hidden="true" /><p className="text-xs font-medium">MySQL + Redis</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">Runs, Q-values, logs, live cache</p></div>
        <div className="rounded-xl border bg-primary/[0.055] p-3"><Cloud size={18} className="mb-2 text-primary" aria-hidden="true" /><p className="text-xs font-medium">AWS seam</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">SDK v3 behind a flag</p></div>
      </div>
      <div className="relative mt-3 flex items-center justify-between gap-3 border-t pt-3 font-mono text-[9px] uppercase tracking-[0.11em] text-muted-foreground">
        <span className="flex items-center gap-2"><ShieldCheck size={15} className="text-primary" aria-hidden="true" />Simulation is the safe default</span>
        <span className="text-primary">Ready</span>
      </div>
    </div>
  );
}

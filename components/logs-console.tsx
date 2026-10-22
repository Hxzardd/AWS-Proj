"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowClockwise, ClockCounterClockwise, Database } from "@phosphor-icons/react";
import { getAgentActionHistory, getRecentRuns } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActionLog } from "@/lib/contracts";

type RunOption = { id: string; seed: number; mode: "rl" | "baseline" | "compare"; status: string; step: number; startedAt: string };

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function LogsConsole() {
  const [runs, setRuns] = useState<RunOption[]>([]);
  const [selectedRun, setSelectedRun] = useState("");
  const [items, setItems] = useState<ActionLog[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async (runId: string, nextPage: number) => {
    if (!runId) return;
    setLoading(true);
    const result = await getAgentActionHistory(runId, nextPage);
    if (result.ok) {
      setItems(result.data.items);
      setPage(result.data.page);
      setPages(result.data.pages);
      setTotal(result.data.total);
      setError(null);
    } else setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const result = await getRecentRuns();
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setRuns(result.data);
      const first = result.data[0]?.id ?? "";
      setSelectedRun(first);
      if (first) await loadHistory(first, 1);
      else setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [loadHistory]);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 md:px-8 md:py-10">
      <PageHeader badge="Audit / Persisted" title="Agent actions and metric history" description="Every state, decision, reward, control effect, and infrastructure provider is written to MySQL." actions={<Button variant="outline" onClick={() => void loadHistory(selectedRun, page)} disabled={!selectedRun || loading}><ArrowClockwise size={16} className={loading ? "animate-spin" : undefined} aria-hidden="true" />{loading ? "Refreshing…" : "Refresh"}</Button>} />
      {error && <FeedbackBanner tone="error" className="mt-6">{error}</FeedbackBanner>}

      <Card className="page-enter mt-8 [animation-delay:70ms]">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div><CardTitle>Decision log</CardTitle><CardDescription>{total} persisted actions for the selected run</CardDescription></div>
          <label className="grid gap-2 text-xs text-muted-foreground">
            Simulation run
            <select name="simulation-run" value={selectedRun} onChange={(event) => { const value = event.target.value; setSelectedRun(value); void loadHistory(value, 1); }} className="control-field h-10 min-w-[260px] cursor-pointer rounded-[9px] border bg-background px-3 text-sm text-foreground outline-none" aria-label="Select simulation run">
              {runs.map((run) => <option key={run.id} value={run.id}>{run.mode.toUpperCase()} | seed {run.seed} | {run.step} steps</option>)}
            </select>
          </label>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid gap-3" role="status" aria-label="Loading decision history">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}<span className="sr-only">Loading persisted decisions</span></div>
          ) : items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left text-sm">
                <thead className="text-xs text-muted-foreground"><tr><th className="pb-3 pr-4 font-medium">Time</th><th className="pb-3 pr-4 font-medium">Source</th><th className="min-w-80 pb-3 pr-6 font-medium">State</th><th className="min-w-32 pb-3 pl-2 pr-4 font-medium">Action</th><th className="min-w-24 pb-3 pr-4 text-right font-medium">Reward</th><th className="min-w-56 pb-3 pr-4 font-medium">Visible effect</th><th className="pb-3 font-medium">Provider</th></tr></thead>
                <tbody>{items.map((item) => <tr key={item.id} className="table-row-hover border-t align-top"><td className="py-3 pr-4 text-xs text-muted-foreground"><span className="block">Step {item.step}</span><span className="mt-1 block">{timeFormatter.format(new Date(item.timestamp))}</span></td><td className="py-3 pr-4"><Badge className={item.source === "baseline" ? "border-warning/25 bg-warning/10 text-warning" : undefined}>{item.source.toUpperCase()}</Badge></td><td className="max-w-[320px] py-3 pr-6 font-mono text-xs leading-5 text-secondary-foreground">{item.stateKey}</td><td className="whitespace-nowrap py-3 pl-2 pr-4 font-mono text-xs text-primary">{item.action}</td><td className="py-3 pr-4 text-right font-mono text-xs">{item.reward.toFixed(5)}</td><td className="py-3 pr-4 text-xs text-muted-foreground">{item.effect.instances} instances, {item.effect.primaryRoutePct}/{100 - item.effect.primaryRoutePct} route, {item.effect.cacheTtlSec}s TTL</td><td className="py-3 text-xs capitalize text-muted-foreground">{item.infrastructure?.provider ?? "simulator"}</td></tr>)}</tbody>
              </table>
            </div>
          ) : (
            <div className="metric-grid flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center"><Database size={30} className="text-primary/55" /><p className="mt-4 text-sm font-medium">No persisted decisions</p><p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">Start a dashboard run. Its action history will appear here after the first tick.</p></div>
          )}
          {items.length > 0 && <div className="mt-5 flex items-center justify-between border-t pt-4"><p className="text-xs text-muted-foreground">Page {page} of {pages}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => void loadHistory(selectedRun, page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= pages || loading} onClick={() => void loadHistory(selectedRun, page + 1)}>Next</Button></div></div>}
        </CardContent>
      </Card>
      <FeedbackBanner tone="info" className="mt-4 text-xs"><ClockCounterClockwise size={16} className="text-primary" aria-hidden="true" />Logs survive application restarts because they are stored through Prisma in MySQL.</FeedbackBanner>
    </div>
  );
}

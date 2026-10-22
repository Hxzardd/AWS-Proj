"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { getLatestMetrics, startSimulation, stopSimulation } from "@/app/actions";
import type { SimulationView } from "@/lib/contracts";

export function useSimulation(mode: "rl" | "baseline" | "compare") {
  const [view, setView] = useState<SimulationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const polling = useRef(false);
  const runId = view?.run.id;
  const runStatus = view?.run.status;

  const start = useCallback((seed: number) => {
    setError(null);
    startTransition(async () => {
      const result = await startSimulation(mode, seed);
      if (result.ok) setView(result.data);
      else setError(result.error);
    });
  }, [mode]);

  const stop = useCallback(() => {
    if (!view) return;
    setError(null);
    startTransition(async () => {
      const result = await stopSimulation(view.run.id);
      if (result.ok) setView(result.data);
      else setError(result.error);
    });
  }, [view]);

  const reset = useCallback((seed: number) => {
    setError(null);
    startTransition(async () => {
      if (view?.run.status === "running") await stopSimulation(view.run.id);
      const result = await startSimulation(mode, seed);
      if (result.ok) setView(result.data);
      else setError(result.error);
    });
  }, [mode, view]);

  useEffect(() => {
    if (!runId || runStatus !== "running") return;
    let cancelled = false;

    const poll = async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        const result = await getLatestMetrics(runId);
        if (cancelled) return;
        if (result.ok) { setView(result.data); setError(null); }
        else setError(result.error);
      } catch {
        if (!cancelled) setError("Connection interrupted. Retrying on the next tick.");
      } finally {
        polling.current = false;
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), 2_500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [runId, runStatus]);

  return { view, error, pending, start, stop, reset };
}

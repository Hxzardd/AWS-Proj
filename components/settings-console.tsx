"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CloudWarning, Database, LockKey, SignOut, SlidersHorizontal, Trash } from "@phosphor-icons/react";
import { getSettings, loginAdmin, logoutAdmin, resetQTable, toggleRealAws, updateRewardWeights, updateSimulationDefaults } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Switch } from "@/components/ui/switch";
import type { SettingsSnapshot } from "@/lib/contracts";
import { cn } from "@/lib/utils";

export function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="metric-grid mx-auto flex min-h-[calc(100dvh-72px)] max-w-none items-center justify-center px-4 py-12">
      <Card className="page-enter w-full max-w-lg">
        <CardHeader><span className="mb-3 flex size-11 items-center justify-center rounded-[12px] bg-primary/10 text-primary"><LockKey size={23} aria-hidden="true" /></span><h1 className="font-semibold tracking-[-0.025em]">Admin controls</h1><CardDescription>Enter the password from ADMIN_PASSWORD to change infrastructure and learning settings.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={(event) => { event.preventDefault(); startTransition(async () => { const result = await loginAdmin(password); if (result.ok) router.refresh(); else setError(result.error); }); }} className="grid gap-4">
            <label className="grid gap-2 text-sm"><span className="font-medium">Admin password</span><input name="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" aria-invalid={Boolean(error)} aria-describedby={error ? "admin-password-error" : undefined} className="control-field h-11 rounded-[9px] border bg-background px-3 text-foreground outline-none" /></label>
            {error && <p id="admin-password-error" role="alert" aria-live="polite" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={pending}>{pending ? "Verifying…" : "Unlock settings"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function SettingsConsole() {
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null);
  const [weights, setWeights] = useState({ latency: 0.4, sla: 0.3, throughput: 0.2, cost: 0.1 });
  const [seed, setSeed] = useState(2026);
  const [intensity, setIntensity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void getSettings().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setSettings(result.data);
        setWeights(result.data.rewardWeights);
        setSeed(result.data.simulatorSeed);
        setIntensity(result.data.simulatorIntensity);
      } else setError(result.error);
    });
    return () => { cancelled = true; };
  }, []);

  const run = (operation: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, success: string) => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await operation();
      if (result.ok) {
        if (typeof result.data === "object" && result.data && "rewardWeights" in result.data) setSettings(result.data as SettingsSnapshot);
        setMessage(success);
      } else setError(result.error);
    });
  };

  const weightTotal = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const weightsValid = Math.abs(weightTotal - 1) < 0.001;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 md:px-8 md:py-10">
      <PageHeader badge="Admin / Protected" title="Simulation and infrastructure settings" description="Changes are persisted in MySQL. Real AWS mode remains off unless the full credential and resource configuration validates." actions={<Button variant="outline" onClick={() => run(async () => { const result = await logoutAdmin(); if (result.ok) router.refresh(); return result; }, "Signed out")}><SignOut size={16} aria-hidden="true" />Sign out</Button>} />
      {error && <FeedbackBanner tone="error" className="mt-6">{error}</FeedbackBanner>}
      {message && <FeedbackBanner tone="success" className="mt-6">{message}</FeedbackBanner>}

      <div className="page-enter mt-8 grid gap-4 lg:grid-cols-2 [animation-delay:70ms]">
        <Card className="transition-colors duration-300 hover:border-primary/20">
          <CardHeader><span className="mb-2 text-primary"><SlidersHorizontal size={22} /></span><CardTitle>Reward weights</CardTitle><CardDescription>Weights must add up to 1.0. They feed the pure reward function on every update.</CardDescription></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {Object.entries(weights).map(([key, value]) => <label key={key} className="grid gap-2 text-sm"><span className="capitalize text-muted-foreground">{key}</span><input name={`reward-${key}`} type="number" inputMode="decimal" autoComplete="off" min="0" max="1" step="0.05" value={value} onChange={(event) => setWeights((current) => ({ ...current, [key]: Number(event.target.value) }))} className="control-field h-10 rounded-[9px] border bg-background px-3 font-mono tabular-nums outline-none" /></label>)}
            </div>
            <div className="mt-5 flex items-center justify-between border-t pt-4"><span className={cn("text-xs", weightsValid ? "text-muted-foreground" : "text-destructive")}>Total <strong className={cn("font-mono", weightsValid ? "text-foreground" : "text-destructive")}>{weightTotal.toFixed(2)}</strong>{!weightsValid && <span className="ml-2">Must equal 1.00</span>}</span><Button size="sm" disabled={pending || !weightsValid} onClick={() => run(() => updateRewardWeights(weights), "Reward weights updated")}>Save weights</Button></div>
          </CardContent>
        </Card>

        <Card className="transition-colors duration-300 hover:border-primary/20">
          <CardHeader><span className="mb-2 text-primary"><Database size={22} /></span><CardTitle>Traffic defaults</CardTitle><CardDescription>Seed controls reproducibility. Intensity scales the demand waveform without changing its shape.</CardDescription></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm"><span className="text-muted-foreground">Default seed</span><input name="default-seed" type="number" inputMode="numeric" autoComplete="off" min="1" value={seed} onChange={(event) => setSeed(Number(event.target.value))} className="control-field h-10 rounded-[9px] border bg-background px-3 font-mono tabular-nums outline-none" /></label><label className="grid gap-2 text-sm"><span className="text-muted-foreground">Traffic intensity</span><input name="traffic-intensity" type="number" inputMode="decimal" autoComplete="off" min="0.5" max="2.5" step="0.1" value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} className="control-field h-10 rounded-[9px] border bg-background px-3 font-mono tabular-nums outline-none" /></label></div>
            <div className="mt-5 flex justify-end border-t pt-4"><Button size="sm" disabled={pending} onClick={() => run(() => updateSimulationDefaults({ seed, intensity }), "Simulation defaults updated")}>Save defaults</Button></div>
          </CardContent>
        </Card>

        <Card className="transition-colors duration-300 hover:border-primary/20">
          <CardHeader><span className="mb-2 text-primary"><CloudWarning size={22} /></span><CardTitle>Real AWS integration</CardTitle><CardDescription>When enabled, scale and route actions call AWS SDK v3 clients and publish CloudWatch metrics.</CardDescription></CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-[12px] border p-4"><div><p className="text-sm font-medium">USE_REAL_AWS</p><p className="mt-1 text-xs text-muted-foreground">Current provider: {settings?.useRealAws ? "AWS" : "simulator"}</p></div><Switch checked={settings?.useRealAws ?? false} disabled={pending || !settings} onCheckedChange={(enabled) => { if (enabled && !window.confirm("Enable real AWS calls? Valid credentials may create cost.")) return; run(async () => { const result = await toggleRealAws(enabled); if (result.ok) setSettings(result.data); return result; }, enabled ? "Real AWS mode enabled" : "Simulation mode enabled"); }} aria-label="Toggle real AWS mode" /></div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">Enabling requires every AWS variable in .env. The action fails safely if the configuration is incomplete.</p>
          </CardContent>
        </Card>

        <Card className="transition-colors duration-300 hover:border-destructive/25">
          <CardHeader><span className="mb-2 text-destructive"><Trash size={22} /></span><CardTitle>Reset learned policy</CardTitle><CardDescription>Deletes all persisted Q-table entries. Simulation runs and action history remain intact.</CardDescription></CardHeader>
          <CardContent><div className="flex items-center justify-between rounded-[12px] border border-destructive/30 bg-destructive/5 p-4"><div><p className="text-sm font-medium">Q-table entries</p><p className="mt-1 text-xs text-muted-foreground">Cannot be undone</p></div><Button variant="destructive" size="sm" disabled={pending} onClick={() => { if (window.confirm("Delete the learned Q-table?")) run(resetQTable, "Q-table reset completed"); }}>Reset Q-table</Button></div></CardContent>
        </Card>
      </div>
    </div>
  );
}

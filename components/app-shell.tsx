"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, ChartLineUp, ClockCounterClockwise, Gauge, Gear, House, Scales, ShieldCheck } from "@phosphor-icons/react";
import { Brand } from "@/components/brand";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/dashboard/lab", label: "Learning lab", icon: ChartLineUp },
  { href: "/dashboard", label: "Control loop", icon: Gauge, exact: true },
  { href: "/dashboard/compare", label: "RL vs baseline", icon: Scales },
  { href: "/dashboard/agent", label: "Agent internals", icon: Brain },
  { href: "/dashboard/logs", label: "Action history", icon: ClockCounterClockwise },
  { href: "/settings", label: "Settings", icon: Gear },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-xl lg:h-[100dvh] lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col">
          <div className="flex h-[72px] items-center justify-between border-b border-border/60 px-4 lg:px-5">
            <Link href="/" className="rounded-[10px]" aria-label="VectorPay overview"><Brand /></Link>
            <Link href="/" className="rounded-[10px] p-2 text-muted-foreground transition-[background-color,color,transform] duration-200 hover:bg-accent hover:text-foreground active:scale-95 lg:hidden" aria-label="Overview"><House size={20} /></Link>
          </div>
          <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 py-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:py-5" aria-label="Dashboard navigation">
            {navigation.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className={cn("group relative flex min-w-max items-center gap-3 rounded-[9px] border border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition-[background-color,border-color,color,transform] duration-200 hover:border-border hover:bg-accent/75 hover:text-foreground active:scale-[0.98]", active && "border-primary/20 bg-primary/[0.075] text-primary")} aria-current={active ? "page" : undefined}>
                  <span className={cn("absolute inset-y-2 left-0 hidden w-0.5 origin-center rounded-full bg-primary transition-transform duration-200 lg:block", active ? "scale-y-100" : "scale-y-0")} aria-hidden="true" />
                  <Icon className="transition-transform duration-200 group-hover:scale-105" size={19} weight={active ? "fill" : "regular"} aria-hidden="true" />{item.label}
                </Link>
              );
            })}
          </nav>
          <div className="hidden border-t p-4 lg:block">
            <div className="metric-grid panel-surface rounded-xl border bg-card/62 p-3">
              <div className="flex items-center gap-3"><ChartLineUp size={20} className="text-primary" aria-hidden="true" /><div className="min-w-0"><p className="text-xs font-medium">Demo environment</p><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Simulator / local</p></div></div>
              <div className="mt-3 flex items-center gap-2 border-t pt-3 text-[10px] leading-4 text-muted-foreground"><ShieldCheck size={15} className="text-primary" aria-hidden="true" />Real AWS requires explicit opt-in</div>
            </div>
          </div>
        </div>
      </aside>
      <main id="main-content" className="relative min-w-0 overflow-hidden" tabIndex={-1}>{children}</main>
    </div>
  );
}

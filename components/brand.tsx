import { cn } from "@/lib/utils";

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("group flex items-center gap-3", className)}>
      <span className="flex size-9 items-center justify-center rounded-[9px] border border-primary/35 bg-primary/[0.08] font-mono text-[13px] font-semibold tracking-[-0.08em] text-primary shadow-[inset_0_1px_0_rgb(255_255_255_/_0.05)] transition-[background-color,border-color,transform] duration-200 ease-out group-hover:-translate-y-px group-hover:border-primary/55 group-hover:bg-primary/[0.12]" aria-hidden="true">
        &gt;_
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-sm font-semibold tracking-[-0.025em]">VectorPay</span>
          <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Control Plane</span>
        </span>
      )}
    </div>
  );
}

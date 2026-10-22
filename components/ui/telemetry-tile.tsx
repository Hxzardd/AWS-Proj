import type { ReactNode } from "react";
import { TrendDown, TrendUp, Minus } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type TelemetryTone = "default" | "warning" | "critical";
type TrendPolarity = "up-good" | "down-good" | "neutral";

const toneStroke: Record<TelemetryTone, string> = {
  default: "var(--chart-1)",
  warning: "var(--warning)",
  critical: "var(--destructive)",
};

function Sparkline({ values, stroke }: { values: number[]; stroke: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 100;
  const height = 28;
  const step = width / (values.length - 1);
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - ((value - min) / span) * (height - 4) - 2;
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const gradientId = `spark-${stroke.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-7 w-full" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function TelemetryTile({
  label,
  value,
  detail,
  icon,
  tone = "default",
  history,
  trendPolarity = "neutral",
  className,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ReactNode;
  tone?: TelemetryTone;
  history?: number[];
  trendPolarity?: TrendPolarity;
  className?: string;
}) {
  const trend = history && history.length >= 2
    ? history[history.length - 1]! - history[0]!
    : null;
  const trendPct = trend != null && history![0]
    ? (trend / Math.abs(history![0]!)) * 100
    : null;
  const rising = trend != null && trend > 0.0001;
  const falling = trend != null && trend < -0.0001;
  const TrendIcon = rising ? TrendUp : falling ? TrendDown : Minus;
  const good =
    trendPolarity === "neutral" || trend == null || (!rising && !falling)
      ? null
      : (rising && trendPolarity === "up-good") || (falling && trendPolarity === "down-good");
  const trendColor =
    good == null ? "var(--muted-foreground)" : good ? "var(--positive)" : "var(--destructive)";

  return (
    <Card
      className={cn(
        "group overflow-hidden bg-card/76 transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-primary/30 hover:bg-card",
        tone === "warning" && "border-warning/35 bg-warning/[0.035]",
        tone === "critical" && "border-destructive/45 bg-destructive/[0.045]",
        className,
      )}
    >
      <CardContent className="p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/[0.07] text-primary transition-transform duration-200 group-hover:-translate-y-px",
              tone === "warning" && "border-warning/25 bg-warning/10 text-warning",
              tone === "critical" && "border-destructive/25 bg-destructive/10 text-destructive",
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <p key={value} className="metric-value-enter font-mono text-2xl font-semibold tabular-nums tracking-[-0.045em]">
            {value}
          </p>
          {trendPct != null && Number.isFinite(trendPct) && (
            <span className="mb-1 inline-flex items-center gap-1 font-mono text-[11px] tabular-nums" style={{ color: trendColor }}>
              <TrendIcon size={12} weight="bold" aria-hidden="true" />
              {Math.abs(trendPct) < 0.1 ? "0" : `${trendPct > 0 ? "+" : ""}${trendPct.toFixed(0)}%`}
            </span>
          )}
        </div>
        {history && history.length >= 2 ? (
          <div className="mt-2.5">
            <Sparkline values={history} stroke={toneStroke[tone]} />
          </div>
        ) : null}
        <div className="mt-2 flex items-center gap-2">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full bg-primary/70",
              tone === "warning" && "bg-warning",
              tone === "critical" && "bg-destructive",
            )}
            aria-hidden="true"
          />
          <p className={cn("text-xs text-muted-foreground", tone === "critical" && "text-destructive")}>{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

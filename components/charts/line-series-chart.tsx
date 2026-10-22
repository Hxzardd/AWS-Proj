"use client";

import { useEffect, useId, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartLineUp } from "@phosphor-icons/react";

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
};

type ChartDatum = Record<string, string | number | null>;

function liveDotRenderer(color: string, lastIndex: number) {
  function LiveDot(props: { cx?: number; cy?: number; index?: number }) {
    const { cx, cy, index } = props;
    if (cx == null || cy == null || index !== lastIndex) return <g />;
    return (
      <g>
        <circle cx={cx} cy={cy} r={6} fill={color} opacity={0.22} className="status-breathe" style={{ transformOrigin: `${cx}px ${cy}px` }} />
        <circle cx={cx} cy={cy} r={3} fill={color} stroke="var(--background)" strokeWidth={1.5} />
      </g>
    );
  }
  return LiveDot;
}

function ChartTooltip({
  active,
  payload,
  label,
  series,
  valueFormatter,
  labelFormatter,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number | string | null }>;
  label?: string | number;
  series: ChartSeries[];
  valueFormatter: (value: number) => string;
  labelFormatter: (label: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[9rem] rounded-[10px] border border-border bg-popover/95 p-3 shadow-[var(--popover-shadow)] backdrop-blur-sm">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{labelFormatter(label ?? "")}</p>
      <div className="mt-2 flex flex-col gap-1.5">
        {series.map((item) => {
          const entry = payload.find((point) => point.dataKey === item.key);
          if (!entry || entry.value == null) return null;
          return (
            <div key={item.key} className="flex items-center justify-between gap-4 text-xs">
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
              <span className="font-mono font-medium text-foreground tabular-nums">{valueFormatter(Number(entry.value))}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LineSeriesChart({
  data,
  series,
  valueFormatter = (value) => String(value),
  height = 260,
  reference,
  xTickFormatter,
  xLabelFormatter,
}: {
  data: ChartDatum[];
  series: ChartSeries[];
  valueFormatter?: (value: number) => string;
  height?: number;
  reference?: { value: number; label?: string };
  xTickFormatter?: (value: string | number) => string;
  xLabelFormatter?: (value: string | number) => string;
}) {
  const gradientId = useId().replace(/:/g, "");

  // Animate the draw-in only on the first data render of each run — not on every poll tick.
  const hasData = data.length > 0;
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const animateFirstLoad = hasData && !firstLoadDone;
  useEffect(() => {
    if (!hasData || firstLoadDone) return;
    const timer = setTimeout(() => setFirstLoadDone(true), 700);
    return () => clearTimeout(timer);
  }, [hasData, firstLoadDone]);

  if (data.length === 0) {
    return (
      <div style={{ height }} className="metric-grid flex items-center justify-center rounded-xl border border-dashed text-center text-sm text-muted-foreground">
        <div><ChartLineUp size={24} className="mx-auto mb-3 text-primary/55" aria-hidden="true" /><p>Start a run to populate this chart.</p></div>
      </div>
    );
  }

  const labelFormatter = xLabelFormatter ?? ((label: string | number) => `Step ${label}`);
  const lastIndex = data.length - 1;

  // When a reference (e.g. SLA) is set, keep it in view and shade the breach zone above it.
  const dataMax = Math.max(
    ...data.flatMap((row) => series.map((item) => Number(row[item.key])).filter(Number.isFinite)),
  );
  const yTop = reference ? Math.max(dataMax, reference.value) * 1.06 : undefined;
  const yDomain: [string | number, string | number] = reference ? ["auto", yTop!] : ["auto", "auto"];

  return (
    <div className="w-full" role="img" aria-label={`${series.map((item) => item.label).join(" and ")} time series`}>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground" aria-hidden="true">
        {series.map((item) => <span key={item.key} className="inline-flex items-center gap-2"><span className="w-5 border-t-2" style={{ borderTopColor: item.color, borderTopStyle: item.dashed ? "dashed" : "solid" }} />{item.label}</span>)}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <defs>
              {series.map((item) => (
                <linearGradient key={item.key} id={`${gradientId}-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={item.color} stopOpacity={item.dashed ? 0.04 : 0.26} />
                  <stop offset="78%" stopColor={item.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} strokeOpacity={0.5} />
            {reference && yTop != null && (
              <ReferenceArea y1={reference.value} y2={yTop} fill="var(--destructive)" fillOpacity={0.055} stroke="none" ifOverflow="hidden" />
            )}
            <XAxis dataKey="step" stroke="var(--muted-foreground)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} minTickGap={24} tickFormatter={xTickFormatter} />
            <YAxis stroke="var(--muted-foreground)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={82} tickFormatter={(value) => valueFormatter(Number(value))} domain={yDomain} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 5", strokeOpacity: 0.45 }}
              content={<ChartTooltip series={series} valueFormatter={valueFormatter} labelFormatter={labelFormatter} />}
            />
            {series.map((item) => (
              <Area
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.label}
                stroke={item.color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeDasharray={item.dashed ? "6 5" : undefined}
                fill={`url(#${gradientId}-${item.key})`}
                dot={item.dashed ? false : liveDotRenderer(item.color, lastIndex)}
                activeDot={{ r: 4, strokeWidth: 2, fill: "var(--background)" }}
                connectNulls
                isAnimationActive={animateFirstLoad}
                animationDuration={650}
                animationEasing="ease-out"
              />
            ))}
            {reference && (
              <ReferenceLine
                y={reference.value}
                stroke="var(--destructive)"
                strokeDasharray="5 5"
                strokeOpacity={0.7}
                label={reference.label ? { value: reference.label, position: "insideTopRight", fill: "var(--destructive)", fontSize: 10, fontWeight: 600 } : undefined}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

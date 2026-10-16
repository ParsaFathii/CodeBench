// CodeBench — custom SVG charts (instrument aesthetic, no chart library)
// All charts render from the data actually stored for the selected runs.
"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

export interface SeriesPoint {
  x: number;
  y: number;
}

export interface ChartSeries {
  label: string;
  color: string;
  points: SeriesPoint[];
  dashed?: boolean;
}

function niceLogTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  const startExp = Math.floor(Math.log10(min));
  const endExp = Math.ceil(Math.log10(max));
  for (let e = startExp; e <= endExp; e++) {
    const v = 10 ** e;
    if (v >= min * 0.999 && v <= max * 1.001) ticks.push(v);
  }
  return ticks.length > 0 ? ticks : [min, max];
}

function formatTick(v: number): string {
  if (v >= 1e6) return `${v / 1e6}M`;
  if (v >= 1e3) return `${v / 1e3}k`;
  return `${v}`;
}

/** log–log runtime-vs-input-size scaling curves */
export function ScalingChart({
  series,
  xLabel,
  yLabel,
  height = 260,
  yFormatter = (v: number) => (v < 1e6 ? `${(v / 1e3).toFixed(0)}µs` : `${(v / 1e6).toFixed(0)}ms`),
  className,
}: {
  series: ChartSeries[];
  xLabel: string;
  yLabel: string;
  height?: number;
  yFormatter?: (v: number) => string;
  className?: string;
}) {
  const W = 640;
  const H = height;
  const M = { l: 56, r: 14, t: 14, b: 34 };
  const valid = series.flatMap((s) => s.points).filter((p) => p.x > 0 && p.y > 0 && isFinite(p.y));
  if (valid.length === 0) return null;
  const xs = valid.map((p) => p.x);
  const ys = valid.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const yPad = yMax * 1.25;
  const sx = (v: number) =>
    M.l + ((Math.log10(v) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin) || 1)) * (W - M.l - M.r);
  const sy = (v: number) =>
    H - M.b - ((Math.log10(v) - Math.log10(yMin)) / (Math.log10(yPad) - Math.log10(yMin) || 1)) * (H - M.t - M.b);
  const xTicks = niceLogTicks(xMin, xMax);
  const yTicks = niceLogTicks(yMin, yPad);

  return (
    <div className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${yLabel} by ${xLabel}`}>
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" strokeWidth="1" />
            <text x={M.l - 6} y={sy(t) + 3} textAnchor="end" fontSize="9" fill="var(--muted-foreground)" fontFamily="var(--font-geist-mono), monospace">
              {yFormatter(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line x1={sx(t)} x2={sx(t)} y1={M.t} y2={H - M.b} stroke="var(--grid)" strokeWidth="1" />
            <text x={sx(t)} y={H - M.b + 13} textAnchor="middle" fontSize="9" fill="var(--muted-foreground)" fontFamily="var(--font-geist-mono), monospace">
              {formatTick(t)}
            </text>
          </g>
        ))}
        <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--border)" />
        <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} stroke="var(--border)" />
        <text x={W - M.r} y={H - 4} textAnchor="end" fontSize="9" fill="var(--muted-foreground)" fontFamily="var(--font-geist-mono), monospace">
          {xLabel}
        </text>
        <text x={4} y={M.t + 2} fontSize="9" fill="var(--muted-foreground)" fontFamily="var(--font-geist-mono), monospace">
          {yLabel}
        </text>
        {series.map((s) => {
          const pts = s.points.filter((p) => p.x > 0 && p.y > 0).sort((a, b) => a.x - b.x);
          if (pts.length === 0) return null;
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
          return (
            <g key={s.label}>
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinecap="round" strokeLinejoin="round" />
              {pts.map((p) => (
                <circle key={`${s.label}-${p.x}`} cx={sx(p.x)} cy={sy(p.y)} r="3" fill="#111310" stroke={s.color} strokeWidth="1.6" />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-2">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
            <span className="inline-block h-[3px] w-4 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** grouped horizontal bars with error whiskers (median + CI or stddev) */
export function ComparisonBars({
  bars,
  unitFormatter,
  className,
}: {
  bars: Array<{ label: string; value: number; error?: number; color: string; sub?: string }>;
  unitFormatter: (v: number) => string;
  className?: string;
}) {
  const max = Math.max(...bars.map((b) => b.value + (b.error ?? 0)), 1);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {bars.map((b) => {
        const wPct = (b.value / max) * 100;
        const errPct = b.error ? (b.error / max) * 100 : 0;
        return (
          <div key={b.label} className="group grid grid-cols-[130px_1fr_auto] items-center gap-3">
            <div className="truncate font-mono text-[11px] text-foreground/85" title={b.label}>
              {b.label}
            </div>
            <div className="relative h-5">
              <div
                className="absolute inset-y-[3px] left-0 rounded-[2px] transition-all"
                style={{ width: `${wPct}%`, backgroundColor: b.color, opacity: 0.85 }}
              />
              {b.error != null && b.error > 0 && (
                <div
                  className="absolute top-1/2 h-[9px] w-[9px] -translate-y-1/2 border-x-2 border-l border-zinc-200/70"
                  style={{ left: `calc(${Math.max(0, wPct - errPct)}% )`, borderLeftWidth: 2, borderColor: "rgba(228,228,231,0.65)", borderRightWidth: 2, background: "transparent" }}
                />
              )}
              {b.error != null && b.error > 0 && (
                <div
                  className="absolute top-1/2 h-0 border-t-2"
                  style={{ left: `${Math.max(0, wPct - errPct)}%`, width: `${Math.min(100, 2 * errPct)}%`, borderColor: "rgba(228,228,231,0.65)" }}
                />
              )}
            </div>
            <div className="w-20 text-right font-mono text-[11px] tabular text-foreground/90">
              {unitFormatter(b.value)}
              {b.sub ? <span className="ml-1 text-muted-foreground">{b.sub}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** observation distribution: strip + box (min–max whiskers, IQR box, median notch) */
export function DistributionStrip({
  values,
  color,
  height = 44,
  formatter,
  className,
}: {
  values: number[];
  color: string;
  height?: number;
  formatter: (v: number) => string;
  className?: string;
}) {
  const stats = useMemo(() => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const q = (p: number) => {
      const idx = (p / 100) * (sorted.length - 1);
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
    };
    return { min: sorted[0], max: sorted[sorted.length - 1], q1: q(25), med: q(50), q3: q(75), sorted };
  }, [values]);
  if (!stats) return null;
  const W = 320;
  const pad = 6;
  const sx = (v: number) => pad + ((Math.log10(v) - Math.log10(stats.min)) / (Math.log10(stats.max) - Math.log10(stats.min) || 1)) * (W - 2 * pad);
  return (
    <div className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="observation distribution">
        <line x1={sx(stats.min)} x2={sx(stats.max)} y1={height / 2} y2={height / 2} stroke={color} strokeWidth="1" opacity="0.5" />
        {stats.sorted.map((v, i) => (
          <circle key={i} cx={sx(v)} cy={height / 2 + ((i % 3) - 1) * 5} r="1.7" fill={color} opacity="0.75" />
        ))}
        <rect x={sx(stats.q1)} width={Math.max(2, sx(stats.q3) - sx(stats.q1))} y={height / 2 - 8} height={16} rx="2" fill={color} opacity="0.22" stroke={color} strokeWidth="1.2" />
        <line x1={sx(stats.med)} x2={sx(stats.med)} y1={height / 2 - 8} y2={height / 2 + 8} stroke={color} strokeWidth="2.4" />
      </svg>
      <div className="flex justify-between font-mono text-[9px] text-muted-foreground">
        <span>min {formatter(stats.min)}</span>
        <span>med {formatter(stats.med)}</span>
        <span>max {formatter(stats.max)}</span>
      </div>
    </div>
  );
}

export function Sparkline({ values, color = "var(--signal)", width = 90, height = 22 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return <div className="font-mono text-[10px] text-muted-foreground">—</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const sx = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const sy = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} className="overflow-visible" role="img" aria-label="trend">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={sx(values.length - 1)} cy={sy(values[values.length - 1])} r="2" fill={color} />
    </svg>
  );
}

// CodeBench — shared formatting + small presentational primitives (client-safe)
"use client";

import { cn } from "@/lib/utils";
import type { Language } from "@/lib/bench/spec";

export function formatNs(ns: number | null | undefined): string {
  if (ns == null || !isFinite(ns)) return "—";
  if (ns < 1_000) return `${ns.toFixed(0)} ns`;
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(2)} µs`;
  if (ns < 1e9) return `${(ns / 1e6).toFixed(2)} ms`;
  return `${(ns / 1e9).toFixed(2)} s`;
}

export function formatBytes(b: number | null | undefined): string {
  if (b == null || !isFinite(b)) return "—";
  if (b < 1024) return `${b.toFixed(0)} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KiB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MiB`;
  return `${(b / 1024 ** 3).toFixed(1)} GiB`;
}

export function formatPct(x: number | null | undefined, digits = 1): string {
  if (x == null || !isFinite(x)) return "—";
  return `${x >= 0 ? "+" : ""}${x.toFixed(digits)}%`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { hour12: false });
}

export const LANG_META: Record<Language, { label: string; color: string; dim: string }> = {
  cpp: { label: "C++", color: "#f5a623", dim: "rgba(245,166,35,0.14)" },
  java: { label: "Java", color: "#f0576b", dim: "rgba(240,87,107,0.14)" },
  python: { label: "Python", color: "#2fbf71", dim: "rgba(47,191,113,0.14)" },
};

export function LangTag({ language, className }: { language: Language; className?: string }) {
  const meta = LANG_META[language];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-medium", className)}
      style={{ color: meta.color, backgroundColor: meta.dim }}
    >
      <span className="h-1.5 w-1.5 rounded-[2px]" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  QUEUED: "text-zinc-400 border-zinc-600 bg-zinc-800/40",
  PREPARING: "text-sky-300 border-sky-700 bg-sky-900/20",
  RUNNING: "text-amber-300 border-amber-600 bg-amber-900/20",
  VERIFYING: "text-violet-300 border-violet-700 bg-violet-900/20",
  ANALYZING: "text-violet-300 border-violet-700 bg-violet-900/20",
  COMPLETED: "text-emerald-300 border-emerald-700 bg-emerald-900/20",
  FAILED: "text-red-300 border-red-700 bg-red-900/20",
  CANCELLED: "text-zinc-400 border-zinc-600 bg-zinc-800/40",
  PASSED: "text-emerald-300 border-emerald-700 bg-emerald-900/20",
  TIMEOUT: "text-orange-300 border-orange-700 bg-orange-900/20",
  REGRESSION: "text-red-300 border-red-700 bg-red-900/30",
  IMPROVEMENT: "text-emerald-300 border-emerald-700 bg-emerald-900/30",
  INCONCLUSIVE: "text-zinc-300 border-zinc-600 bg-zinc-800/40",
  "NO-DATA": "text-zinc-500 border-zinc-700 bg-zinc-800/30",
  "NOT-COMPARABLE": "text-orange-300 border-orange-700 bg-orange-900/20",
  PENDING: "text-zinc-400 border-zinc-600 bg-zinc-800/40",
  SKIPPED: "text-zinc-500 border-zinc-700 bg-zinc-800/30",
  stable: "text-emerald-300 border-emerald-700 bg-emerald-900/20",
  moderate: "text-amber-300 border-amber-600 bg-amber-900/20",
  unstable: "text-red-300 border-red-700 bg-red-900/20",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-wider",
        STATUS_STYLES[status] ?? "text-zinc-400 border-zinc-600 bg-zinc-800/40",
        className
      )}
    >
      {status}
    </span>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  const std = category === "standard-library";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-wider",
        std
          ? "border-dashed border-zinc-500 text-zinc-400"
          : "border-amber-700/60 text-amber-300/90 bg-amber-950/20"
      )}
      title={
        std
          ? "Standard-library implementation: reflects library engineering as well as the language runtime"
          : "Hand-written equivalent implementation in every language"
      }
    >
      {std ? "STDLIB" : "HAND-WRITTEN"}
    </span>
  );
}

export function BenchPanel({
  title,
  right,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-md border border-border bg-panel overflow-hidden", className)}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div className="bench-label">{title}</div>
          {right}
        </header>
      )}
      <div className={cn("p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-panel/40 p-8 text-center">
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <div className="font-mono text-sm text-foreground/90">{title}</div>
      {hint && <div className="max-w-md text-xs leading-relaxed text-muted-foreground">{hint}</div>}
      {action}
    </div>
  );
}

export function KeyValue({ k, v, mono = true }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/50 py-1.5 last:border-0">
      <span className="bench-label shrink-0">{k}</span>
      <span className={cn("text-right text-xs text-foreground/90", mono && "font-mono tabular")}>{v}</span>
    </div>
  );
}

/** segmented progress made of one cell per job — real progress, no smooth animation */
export function SegmentedProgress({
  completed,
  total,
  failed,
  className,
}: {
  completed: number;
  total: number;
  failed: number;
  className?: string;
}) {
  const cells = Math.max(1, Math.min(total, 120));
  const doneCells = total > 0 ? Math.round((completed / total) * cells) : 0;
  const failedCells = total > 0 ? Math.round((failed / total) * cells) : 0;
  return (
    <div className={cn("flex h-2 gap-[2px] overflow-hidden rounded-sm", className)} role="progressbar" aria-valuenow={total ? Math.round((completed / total) * 100) : 0} aria-valuemin={0} aria-valuemax={100}>
      {Array.from({ length: cells }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-full flex-1 rounded-[1px]",
            i < doneCells ? (i >= doneCells - failedCells ? "bg-red-500/80" : "bg-[var(--signal)]") : "bg-zinc-800"
          )}
        />
      ))}
    </div>
  );
}

export function StatChip({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className="rounded-sm border border-border bg-panel-2 px-2.5 py-1.5">
      <div className="bench-label text-[9px]">{label}</div>
      <div
        className={cn(
          "font-mono text-sm tabular",
          tone === "ok" && "text-emerald-300",
          tone === "warn" && "text-amber-300",
          tone === "bad" && "text-red-300"
        )}
      >
        {value}
      </div>
    </div>
  );
}

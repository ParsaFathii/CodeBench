// CodeBench — Language Comparison: scaling curves, relative bars, variability
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useBenchStore } from "../store";
import { BenchPanel, EmptyState, LangTag, StatusBadge, formatNs, formatPct } from "../ui-kit";
import { ComparisonBars, ScalingChart, type ChartSeries } from "../charts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GitCompareArrows, Info } from "lucide-react";
import type { Language } from "@/lib/bench/spec";

const LANG_COLOR: Record<Language, string> = {
  cpp: "#f5a623",
  java: "#f0576b",
  python: "#2fbf71",
};

export function CompareView() {
  const { watchRunId, selectedExperimentId } = useBenchStore();
  const runsQuery = useQuery({ queryKey: ["runs"], queryFn: api.runs });

  const completedRuns = useMemo(
    () => (runsQuery.data?.runs ?? []).filter((r) => r.resultCount > 0 && ["COMPLETED", "FAILED"].includes(r.status)),
    [runsQuery.data]
  );

  const [runId, setRunId] = useState<string | null>(null);
  const effectiveRunId = useMemo(() => {
    if (runId && completedRuns.some((r) => r.id === runId)) return runId;
    if (watchRunId && completedRuns.some((r) => r.id === watchRunId)) return watchRunId;
    return completedRuns[0]?.id ?? null;
  }, [runId, watchRunId, completedRuns]);

  const runQuery = useQuery({
    queryKey: ["run", effectiveRunId],
    queryFn: () => api.run(effectiveRunId!),
    enabled: Boolean(effectiveRunId),
  });

  const results = useMemo(() => (runQuery.data?.results ?? []).filter((r) => r.status === "COMPLETED" && r.stats), [runQuery.data]);

  // variant picker
  const variantKeys = useMemo(() => Array.from(new Set(results.map((r) => r.variantKey))).sort(), [results]);
  const [variantKey, setVariantKey] = useState<string | null>(null);
  const effectiveVariant = variantKey && variantKeys.includes(variantKey) ? variantKey : variantKeys[0] ?? null;

  const variantResults = useMemo(
    () => results.filter((r) => r.variantKey === effectiveVariant),
    [results, effectiveVariant]
  );

  // scaling series: one per language
  const scalingSeries = useMemo<ChartSeries[]>(() => {
    const byLang = new Map<Language, typeof variantResults>();
    for (const r of variantResults) {
      const list = byLang.get(r.language) ?? [];
      list.push(r);
      byLang.set(r.language, list);
    }
    return Array.from(byLang.entries()).map(([lang, list]) => ({
      label: lang.toUpperCase(),
      color: LANG_COLOR[lang],
      points: list.map((r) => ({ x: r.inputSize, y: r.stats!.median })),
    }));
  }, [variantResults]);

  // bars at the largest common size
  const barData = useMemo(() => {
    if (variantResults.length === 0) return [];
    const maxSize = Math.max(...variantResults.map((r) => r.inputSize));
    return variantResults
      .filter((r) => r.inputSize === maxSize)
      .map((r) => ({
        label: r.language.toUpperCase(),
        value: r.stats!.median,
        error: r.stats!.ci95 ? (r.stats!.ci95[1] - r.stats!.ci95[0]) / 2 : r.stats!.stddev,
        color: LANG_COLOR[r.language],
        sub: r.stats ? `${(r.stats.cv * 100).toFixed(1)}% cv` : undefined,
      }));
  }, [variantResults]);

  // relative table: normalize by slowest at each size
  const relTable = useMemo(() => {
    const bySize = new Map<number, typeof variantResults>();
    for (const r of variantResults) {
      const list = bySize.get(r.inputSize) ?? [];
      list.push(r);
      bySize.set(r.inputSize, list);
    }
    return Array.from(bySize.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([size, list]) => {
        const slowest = Math.max(...list.map((r) => r.stats!.median));
        return {
          size,
          rows: list
            .sort((a, b) => a.stats!.median - b.stats!.median)
            .map((r) => ({
              language: r.language,
              median: r.stats!.median,
              rel: slowest > 0 ? r.stats!.median / slowest : 0,
              speedup: r.stats!.median > 0 ? slowest / r.stats!.median : 0,
              cv: r.stats!.cv,
              stability: r.stats!.stability,
              verification: r.verificationStatus,
              crossLang: r.crossLangMatch,
            })),
        };
      });
  }, [variantResults]);

  if (completedRuns.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<GitCompareArrows className="h-8 w-8" />}
          title="Nothing to compare yet"
          hint="Run an experiment with at least two languages selected. Comparisons render exclusively from stored measurements — no data, no chart."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[1400px] gap-4">
      <BenchPanel
        title={
          <span className="inline-flex items-center gap-2">
            <GitCompareArrows className="h-3.5 w-3.5 text-[var(--signal)]" /> Language Comparison
          </span>
        }
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={effectiveRunId ?? ""} onValueChange={setRunId}>
              <SelectTrigger className="h-7 w-[230px] bg-panel-2 font-mono text-[11px]" aria-label="run">
                <SelectValue placeholder="run" />
              </SelectTrigger>
              <SelectContent>
                {completedRuns.map((r) => (
                  <SelectItem key={r.id} value={r.id} className="font-mono text-xs">
                    {r.experimentName} · {r.id.slice(-6)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={effectiveVariant ?? ""} onValueChange={setVariantKey}>
              <SelectTrigger className="h-7 w-[200px] bg-panel-2 font-mono text-[11px]" aria-label="variant">
                <SelectValue placeholder="variant" />
              </SelectTrigger>
              <SelectContent>
                {variantKeys.map((v) => (
                  <SelectItem key={v} value={v} className="font-mono text-xs">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
          <span className="font-mono">{runQuery.data?.experimentName}</span>
          <span className="font-mono">dataset: {runQuery.data?.config.datasetType}</span>
          <span className="font-mono">seed: {runQuery.data?.config.seed}</span>
          <span className="font-mono">reps: {runQuery.data?.config.repetitions}</span>
          <span className="inline-flex items-center gap-1"><Info className="h-3 w-3" /> ns/op, median of stored observations · log–log axes</span>
        </div>
      </BenchPanel>

      {!effectiveVariant ? (
        <EmptyState title="No completed results in this run" hint="Only verified completions appear in comparisons." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <BenchPanel title={`Runtime scaling · ${effectiveVariant}`} right={<span className="font-mono text-[10px] text-muted-foreground">median ns/op vs input size</span>}>
            {scalingSeries.length > 0 ? (
              <ScalingChart series={scalingSeries} xLabel="input size (n)" yLabel="median time" />
            ) : (
              <EmptyState title="insufficient data for scaling curves" hint="Run the variant at two or more input sizes to plot a curve." />
            )}
          </BenchPanel>

          <BenchPanel title={`Head-to-head · ${effectiveVariant}`} right={<span className="font-mono text-[10px] text-muted-foreground">median ± 95% CI</span>}>
            {barData.length > 0 ? (
              <div className="grid gap-4">
                <ComparisonBars bars={barData} unitFormatter={formatNs} />
                <div className="rounded-sm border border-border bg-panel-2/40 p-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {barData.length > 1 && (
                    <>
                      fastest → slowest:{" "}
                      {barData
                        .slice()
                        .sort((a, b) => a.value - b.value)
                        .map((b, i) => (
                          <span key={b.label}>
                            {i > 0 && <span className="text-zinc-600"> → </span>}
                            <span style={{ color: b.color }}>{b.label}</span>
                            <span className="text-zinc-500"> ({(b.value / Math.min(...barData.map((x) => x.value))).toFixed(1)}×)</span>
                          </span>
                        ))}
                      <div className="mt-1.5 text-[9px]">
                        A speedup here describes THIS machine, THIS input distribution and THIS implementation — not a universal language ranking.
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState title="no common size to compare" />
            )}
          </BenchPanel>

          <BenchPanel title="Relative performance table" bodyClassName="p-0" className="xl:col-span-2">
            <ScrollArea className="max-h-[420px]">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="border-b border-border bg-panel-2/50">
                    <th className="bench-label px-3 py-2 text-left">n</th>
                    <th className="bench-label px-3 py-2 text-left">rank</th>
                    <th className="bench-label px-3 py-2 text-left">language</th>
                    <th className="bench-label px-3 py-2 text-right">median</th>
                    <th className="bench-label px-3 py-2 text-right">rel. to slowest</th>
                    <th className="bench-label px-3 py-2 text-right">speed-up</th>
                    <th className="bench-label px-3 py-2 text-right">cv</th>
                    <th className="bench-label px-3 py-2 text-left">stability</th>
                    <th className="bench-label px-3 py-2 text-left">verification</th>
                  </tr>
                </thead>
                <tbody>
                  {relTable.map(({ size, rows }) =>
                    rows.map((r, i) => (
                      <tr key={`${size}-${r.language}`} className="border-b border-border/40">
                        <td className="px-3 py-2 font-mono text-[11px] tabular">{i === 0 ? size.toLocaleString() : ""}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">#{i + 1}</td>
                        <td className="px-3 py-2"><LangTag language={r.language} /></td>
                        <td className="px-3 py-2 text-right font-mono text-[11px] tabular text-[var(--signal)]">{formatNs(r.median)}</td>
                        <td className="px-3 py-2 text-right font-mono text-[11px] tabular">{r.rel.toFixed(3)}×</td>
                        <td className="px-3 py-2 text-right font-mono text-[11px] tabular">{r.speedup.toFixed(2)}×</td>
                        <td className="px-3 py-2 text-right font-mono text-[11px] tabular">{formatPct(r.cv * 100)}</td>
                        <td className="px-3 py-2"><StatusBadge status={r.stability} /></td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <StatusBadge status={r.verification} />
                            {r.crossLang && <span className="rounded-sm border border-emerald-800/70 px-1 font-mono text-[9px] text-emerald-300">×lang</span>}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </BenchPanel>
        </div>
      )}
    </div>
  );
}

// CodeBench — Performance Regression Analysis: baseline vs candidate
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useBenchStore } from "../store";
import { BenchPanel, EmptyState, LangTag, StatusBadge, formatNs, formatPct } from "../ui-kit";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingDown, AlertTriangle, Info } from "lucide-react";

export function RegressionView() {
  const { compareBaseline, compareCandidate, setComparison } = useBenchStore();
  const runsQuery = useQuery({ queryKey: ["runs"], queryFn: api.runs });
  const completedRuns = useMemo(
    () => (runsQuery.data?.runs ?? []).filter((r) => r.resultCount > 0),
    [runsQuery.data]
  );

  const [baseline, setBaseline] = useState<string | null>(compareBaseline);
  const [candidate, setCandidate] = useState<string | null>(compareCandidate);

  const effectiveBaseline = baseline && completedRuns.some((r) => r.id === baseline) ? baseline : null;
  const effectiveCandidate = candidate && completedRuns.some((r) => r.id === candidate) ? candidate : null;

  const comparisonQuery = useQuery({
    queryKey: ["comparison", effectiveBaseline, effectiveCandidate],
    queryFn: () => api.comparison(effectiveBaseline!, effectiveCandidate!),
    enabled: Boolean(effectiveBaseline && effectiveCandidate && effectiveBaseline !== effectiveCandidate),
  });

  if (completedRuns.length < 2) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<TrendingDown className="h-8 w-8" />}
          title="Need two runs to compare"
          hint="Run the same experiment twice (e.g. after changing code or configuration) and select the runs here. Workload equivalence and environment differences are checked before any verdict is shown."
        />
      </div>
    );
  }

  const report = comparisonQuery.data;

  return (
    <div className="mx-auto grid max-w-[1400px] gap-4">
      <BenchPanel
        title={
          <span className="inline-flex items-center gap-2">
            <TrendingDown className="h-3.5 w-3.5 text-[var(--signal)]" /> Regression Analysis
          </span>
        }
        right={<span className="font-mono text-[10px] text-muted-foreground">practical threshold ±{report?.regressionThresholdPct ?? 10}% (Settings)</span>}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <Select value={effectiveBaseline ?? ""} onValueChange={(v) => { setBaseline(v); setComparison(v, effectiveCandidate); }}>
            <SelectTrigger className="h-8 bg-panel-2 font-mono text-[11px]" aria-label="baseline run">
              <SelectValue placeholder="baseline run" />
            </SelectTrigger>
            <SelectContent>
              {completedRuns.filter((r) => r.id !== effectiveCandidate).map((r) => (
                <SelectItem key={r.id} value={r.id} className="font-mono text-xs">
                  {r.experimentName} · {r.id.slice(-6)} · {new Date(r.createdAt).toLocaleDateString("en-GB")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-center font-mono text-[10px] text-muted-foreground">vs</span>
          <Select value={effectiveCandidate ?? ""} onValueChange={(v) => { setCandidate(v); setComparison(effectiveBaseline, v); }}>
            <SelectTrigger className="h-8 bg-panel-2 font-mono text-[11px]" aria-label="candidate run">
              <SelectValue placeholder="candidate run" />
            </SelectTrigger>
            <SelectContent>
              {completedRuns.filter((r) => r.id !== effectiveBaseline).map((r) => (
                <SelectItem key={r.id} value={r.id} className="font-mono text-xs">
                  {r.experimentName} · {r.id.slice(-6)} · {new Date(r.createdAt).toLocaleDateString("en-GB")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {report && report.comparabilityNotes.length > 0 && (
          <div className="mt-3 grid gap-1.5">
            {report.comparabilityNotes.map((n, i) => (
              <div key={i} className="flex items-start gap-2 rounded-sm border border-amber-900/60 bg-amber-950/20 px-2.5 py-1.5 font-mono text-[10px] text-amber-300">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {n}
              </div>
            ))}
          </div>
        )}
      </BenchPanel>

      {comparisonQuery.isLoading && <div className="p-6 text-center font-mono text-xs text-muted-foreground">comparing runs…</div>}
      {comparisonQuery.error && (
        <EmptyState title="Comparison failed" hint={(comparisonQuery.error as Error).message} />
      )}

      {report && (
        <BenchPanel
          title="Verdicts"
          right={<span className="font-mono text-[10px] text-muted-foreground">{report.rows.length} comparisons · {report.comparability}</span>}
          bodyClassName="p-0"
        >
          <ScrollArea className="max-h-[560px]">
            <table className="w-full min-w-[880px] border-collapse">
              <thead>
                <tr className="border-b border-border bg-panel-2/50">
                  <th className="bench-label px-3 py-2 text-left">variant</th>
                  <th className="bench-label px-3 py-2 text-left">lang</th>
                  <th className="bench-label px-3 py-2 text-right">n</th>
                  <th className="bench-label px-3 py-2 text-right">baseline</th>
                  <th className="bench-label px-3 py-2 text-right">candidate</th>
                  <th className="bench-label px-3 py-2 text-right">Δ median</th>
                  <th className="bench-label px-3 py-2 text-right">ratio</th>
                  <th className="bench-label px-3 py-2 text-right">noise</th>
                  <th className="bench-label px-3 py-2 text-left">verdict</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={`${row.variantKey}-${row.language}-${row.inputSize}`} className="border-b border-border/40">
                    <td className="px-3 py-2 font-mono text-[11px]">{row.variantKey}</td>
                    <td className="px-3 py-2"><LangTag language={row.language} /></td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] tabular">{row.inputSize.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] tabular">{formatNs(row.baselineMedian)}</td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] tabular">{formatNs(row.candidateMedian)}</td>
                    <td className={`px-3 py-2 text-right font-mono text-[11px] tabular ${row.deltaPct != null ? (row.deltaPct > 0 ? "text-red-400" : "text-emerald-400") : ""}`}>
                      {formatPct(row.deltaPct)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] tabular">{row.ratio != null ? `${row.ratio.toFixed(3)}×` : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-[10px] tabular text-muted-foreground">
                      {row.combinedCV != null ? `±${(row.combinedCV * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        <StatusBadge status={row.verdict} />
                        {row.note && <span className="font-mono text-[9px] text-muted-foreground">{row.note}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
          <div className="flex items-start gap-2 border-t border-border p-3 text-[10px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            A difference is only called a regression when it exceeds the practical threshold AND the combined run-to-run
            variation (pooled CV of both runs). Everything else is explicitly inconclusive — silence beats a fabricated verdict.
          </div>
        </BenchPanel>
      )}
    </div>
  );
}

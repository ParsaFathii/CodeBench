// CodeBench — Results Explorer: measured results with filters + raw inspection
"use client";

import { useMemo, useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ResultDto } from "../api";
import { useBenchStore } from "../store";
import { BenchPanel, CategoryBadge, EmptyState, LangTag, StatusBadge, formatNs, formatPct, formatTime } from "../ui-kit";
import { DistributionStrip } from "../charts";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LANGUAGES, type Language } from "@/lib/bench/spec";
import { TableProperties, ChevronDown, FileSearch, Download } from "lucide-react";

type SortKey = "median" | "mean" | "cv" | "size" | "time";

export function ResultsView() {
  const { selectedExperimentId, watchRunId } = useBenchStore();
  const [language, setLanguage] = useState<Language | "all">("all");
  const [variantFilter, setVariantFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("median");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rawFor, setRawFor] = useState<ResultDto | null>(null);

  const experimentsQuery = useQuery({ queryKey: ["experiments"], queryFn: api.experiments });
  const runsQuery = useQuery({ queryKey: ["runs"], queryFn: api.runs });

  // pick experiment: selected → experiment of watched run → first with results
  const experimentId = useMemo(() => {
    if (selectedExperimentId) return selectedExperimentId;
    if (watchRunId) {
      const r = runsQuery.data?.runs.find((x) => x.id === watchRunId);
      if (r) return r.experimentId;
    }
    const withResults = runsQuery.data?.runs.find((r) => r.resultCount > 0);
    return withResults?.experimentId ?? experimentsQuery.data?.experiments[0]?.id ?? null;
  }, [selectedExperimentId, watchRunId, runsQuery.data, experimentsQuery.data]);

  const resultsQuery = useQuery({
    queryKey: ["experiment-results", experimentId],
    queryFn: () => api.experimentResults(experimentId!),
    enabled: Boolean(experimentId),
  });

  const results = useMemo(() => {
    let list = resultsQuery.data?.results ?? [];
    if (language !== "all") list = list.filter((r) => r.language === language);
    if (variantFilter !== "all") list = list.filter((r) => r.variantKey === variantFilter);
    const sorted = [...list].sort((a, b) => {
      switch (sortKey) {
        case "median":
          return (a.stats?.median ?? Infinity) - (b.stats?.median ?? Infinity);
        case "mean":
          return (a.stats?.mean ?? Infinity) - (b.stats?.mean ?? Infinity);
        case "cv":
          return (b.stats?.cv ?? -1) - (a.stats?.cv ?? -1);
        case "size":
          return b.inputSize - a.inputSize;
        case "time":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
    return sorted;
  }, [resultsQuery.data, language, variantFilter, sortKey]);

  const variantOptions = useMemo(() => {
    const set = new Set((resultsQuery.data?.results ?? []).map((r) => r.variantKey));
    return Array.from(set).sort();
  }, [resultsQuery.data]);

  const completedCount = (resultsQuery.data?.results ?? []).filter((r) => r.status === "COMPLETED").length;
  const failedCount = (resultsQuery.data?.results ?? []).filter((r) => r.status !== "COMPLETED").length;

  if (!experimentsQuery.data?.experiments.length) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState icon={<TableProperties className="h-8 w-8" />} title="No results yet" hint="Results appear here once you run an experiment. Every number comes from a real measurement stored with its raw observations." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <BenchPanel
        title={
          <span className="inline-flex items-center gap-2">
            <TableProperties className="h-3.5 w-3.5 text-[var(--signal)]" /> Results Explorer
          </span>
        }
        right={<span className="font-mono text-[10px] text-muted-foreground">{completedCount} measured · {failedCount} failed</span>}
        bodyClassName="p-0"
      >
        {/* filter bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Select value={experimentId ?? ""} onValueChange={(v) => useBenchStore.getState().selectExperiment(v)}>
            <SelectTrigger className="h-8 w-[240px] bg-panel-2 font-mono text-[11px]" aria-label="experiment">
              <SelectValue placeholder="experiment" />
            </SelectTrigger>
            <SelectContent>
              {(experimentsQuery.data?.experiments ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id} className="font-mono text-xs">
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={language} onValueChange={(v) => setLanguage(v as Language | "all")}>
            <SelectTrigger className="h-8 w-[110px] bg-panel-2 font-mono text-[11px]" aria-label="language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-mono text-xs">all languages</SelectItem>
              {LANGUAGES.map((l) => (
                <SelectItem key={l} value={l} className="font-mono text-xs">{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={variantFilter} onValueChange={setVariantFilter}>
            <SelectTrigger className="h-8 w-[210px] bg-panel-2 font-mono text-[11px]" aria-label="variant">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-mono text-xs">all variants</SelectItem>
              {variantOptions.map((v) => (
                <SelectItem key={v} value={v} className="font-mono text-xs">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="h-8 w-[150px] bg-panel-2 font-mono text-[11px]" aria-label="sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="median" className="font-mono text-xs">sort: median</SelectItem>
              <SelectItem value="mean" className="font-mono text-xs">sort: mean</SelectItem>
              <SelectItem value="cv" className="font-mono text-xs">sort: variation</SelectItem>
              <SelectItem value="size" className="font-mono text-xs">sort: size</SelectItem>
              <SelectItem value="time" className="font-mono text-xs">sort: newest</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* table */}
        {resultsQuery.isLoading ? (
          <div className="p-6 text-center font-mono text-xs text-muted-foreground">loading results…</div>
        ) : results.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No results match the filters" hint="This experiment may not have been executed yet, or the filters exclude everything. Run it from the Workbench." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="border-b border-border bg-panel-2/50">
                  <th className="bench-label px-3 py-2 text-left">variant</th>
                  <th className="bench-label px-3 py-2 text-left">lang</th>
                  <th className="bench-label px-3 py-2 text-right">n</th>
                  <th className="bench-label px-3 py-2 text-right">median</th>
                  <th className="bench-label px-3 py-2 text-right">mean ± σ</th>
                  <th className="bench-label px-3 py-2 text-right">min…max</th>
                  <th className="bench-label px-3 py-2 text-right">cv</th>
                  <th className="bench-label px-3 py-2 text-right">p95</th>
                  <th className="bench-label px-3 py-2 text-left">verify</th>
                  <th className="bench-label px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const isExpanded = expanded === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        key={r.id}
                        className={cn(
                          "cursor-pointer border-b border-border/50 transition-colors hover:bg-secondary/40",
                          r.status !== "COMPLETED" && "opacity-60",
                          isExpanded && "bg-accent/20"
                        )}
                        onClick={() => setExpanded(isExpanded ? null : r.id)}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11px]">{r.variantName}</span>
                            <CategoryBadge category={r.category} />
                          </div>
                          <span className="font-mono text-[9px] text-muted-foreground">{r.harness}{r.harnessVersion ? ` ${r.harnessVersion}` : ""}</span>
                        </td>
                        <td className="px-3 py-2"><LangTag language={r.language} /></td>
                        <td className="px-3 py-2 text-right font-mono text-[11px] tabular">{r.inputSize.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-mono text-[11px] tabular text-[var(--signal)]">{formatNs(r.stats?.median ?? null)}</td>
                        <td className="px-3 py-2 text-right font-mono text-[11px] tabular">{r.stats ? `${formatNs(r.stats.mean)} ± ${formatNs(r.stats.stddev)}` : "—"}</td>
                        <td className="px-3 py-2 text-right font-mono text-[10px] tabular text-muted-foreground">{r.stats ? `${formatNs(r.stats.min)}…${formatNs(r.stats.max)}` : "—"}</td>
                        <td className={cn("px-3 py-2 text-right font-mono text-[11px] tabular", r.stats?.cv != null && r.stats.cv > 0.1 ? "text-red-400" : r.stats?.cv != null && r.stats.cv > 0.03 ? "text-amber-400" : "text-emerald-400")}>
                          {r.stats ? formatPct(r.stats.cv * 100) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[11px] tabular">{r.stats ? formatNs(r.stats.p95) : "—"}</td>
                        <td className="px-3 py-2">
                          {r.status !== "COMPLETED" ? (
                            <StatusBadge status={r.status} />
                          ) : (
                            <div className="flex items-center gap-1">
                              <StatusBadge status={r.verificationStatus} />
                              {r.crossLangMatch && <span className="rounded-sm border border-emerald-800/70 px-1 font-mono text-[9px] text-emerald-300" title="input/output checksums match across languages">×lang</span>}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-border/50 bg-[#0c0e0b]">
                          <td colSpan={10} className="px-3 py-3">
                            {r.status !== "COMPLETED" ? (
                              <div className="rounded-sm border border-red-900/60 bg-red-950/20 px-3 py-2 font-mono text-[11px] text-red-300">
                                {r.error ?? "job failed"}
                              </div>
                            ) : (
                              <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
                                <div className="grid gap-2">
                                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    <Detail k="observations" v={`${r.observations.length} raw`} />
                                    <Detail k="harness" v={`${r.harness}${r.harnessVersion ? ` ${r.harnessVersion}` : ""}`} />
                                    <Detail k="duration" v={r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : "—"} />
                                    <Detail k="measured at" v={formatTime(r.createdAt)} />
                                  </div>
                                  <div className="rounded-sm border border-border bg-panel/60 p-2.5">
                                    <div className="bench-label mb-1 text-[9px]">observation distribution (log scale)</div>
                                    <DistributionStrip values={r.observations} color={r.language === "cpp" ? "#f5a623" : r.language === "java" ? "#f0576b" : "#2fbf71"} formatter={formatNs} />
                                  </div>
                                  <div className="rounded-sm border border-border bg-panel/60 p-2.5">
                                    <div className="bench-label mb-1 text-[9px]">raw observations (ns/op)</div>
                                    <div className="scroll-thin max-h-24 overflow-y-auto font-mono text-[10px] leading-relaxed text-foreground/80">
                                      [{r.observations.map((o) => Math.round(o)).join(", ")}]
                                    </div>
                                  </div>
                                  {r.warnings && (
                                    <div className="rounded-sm border border-amber-900/60 bg-amber-950/20 px-2.5 py-1.5 font-mono text-[10px] text-amber-300">{r.warnings}</div>
                                  )}
                                  {r.extraMetrics && (
                                    <div className="rounded-sm border border-border bg-panel/60 p-2.5 font-mono text-[10px] text-muted-foreground">
                                      {Object.entries(r.extraMetrics).map(([k, v]) => (
                                        <div key={k} className="flex justify-between">
                                          <span>{k}</span>
                                          <span className="tabular text-foreground/85">{typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 1 }) : String(v)}</span>
                                        </div>
                                      ))}
                                      <div className="mt-1 text-[9px]">Java-only metric via JMH gc profiler — not comparable across languages (method-labelled).</div>
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col gap-2">
                                  <div className="rounded-sm border border-border bg-panel/60 p-2.5">
                                    <div className="bench-label mb-1 text-[9px]">runtime</div>
                                    <div className="font-mono text-[10px] leading-relaxed text-foreground/80">
                                      {r.env?.runtime ?? "—"}
                                      {r.env?.runtimeDetail && <div className="text-muted-foreground">{r.env.runtimeDetail}</div>}
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 font-mono text-[10px]"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRawFor(r);
                                    }}
                                  >
                                    <FileSearch className="h-3 w-3" /> Raw harness output
                                  </Button>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </BenchPanel>

      {rawFor && <RawOutputDialog result={rawFor} runId={rawFor.runId} onClose={() => setRawFor(null)} />}
    </div>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-sm border border-border bg-panel/60 px-2 py-1.5">
      <div className="bench-label text-[9px]">{k}</div>
      <div className="font-mono text-[10px] tabular text-foreground/85">{v}</div>
    </div>
  );
}

function RawOutputDialog({ result, runId, onClose }: { result: ResultDto; runId: string; onClose: () => void }) {
  const rawQuery = useQuery({
    queryKey: ["raw", runId, result.id],
    queryFn: () => api.rawResult(runId, result.id),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="raw harness output">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-md border border-border bg-panel" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <div>
            <div className="bench-label">raw harness output</div>
            <div className="font-mono text-xs">{result.variantKey} · {result.language} · n={result.inputSize.toLocaleString()}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 font-mono text-[10px]"
              onClick={() => {
                const content = rawQuery.data?.rawOutput ?? "";
                const blob = new Blob([content], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `raw-${result.variantKey.replace(".", "-")}-${result.language}-${result.inputSize}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="h-3 w-3" /> Download
            </Button>
            <Button size="sm" variant="ghost" className="h-7 font-mono text-[10px]" onClick={onClose}>Close</Button>
          </div>
        </header>
        <ScrollArea className="flex-1">
          <pre className="console scroll-thin whitespace-pre-wrap break-all p-4 text-[10px] leading-relaxed text-foreground/80">
            {rawQuery.isLoading ? "loading raw output…" : rawQuery.data?.rawOutput ?? "raw output unavailable"}
          </pre>
        </ScrollArea>
        <footer className="border-t border-border px-4 py-2 font-mono text-[10px] text-muted-foreground">
          preserved verbatim from {result.harness} — normalization happens on top of this, never instead of it
        </footer>
      </div>
    </div>
  );
}

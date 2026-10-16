// CodeBench — Run History: reproducible experiment runs + report exports
"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useBenchStore } from "../store";
import { BenchPanel, EmptyState, SegmentedProgress, StatusBadge, formatDuration, formatTime } from "../ui-kit";
import { Sparkline } from "../charts";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, Play, FileDown, Loader2, Copy, FileJson, FileText, Sheet } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function HistoryView() {
  const { watchRun, setView, setComparison } = useBenchStore();
  const queryClient = useQueryClient();
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const runsQuery = useQuery({ queryKey: ["runs"], queryFn: api.runs, refetchInterval: 15_000 });
  const runDetailQuery = useQuery({
    queryKey: ["run", expandedRun],
    queryFn: () => api.run(expandedRun!),
    enabled: Boolean(expandedRun),
  });
  const reportsQuery = useQuery({
    queryKey: ["reports", expandedRun],
    queryFn: () => api.reports(expandedRun!),
    enabled: Boolean(expandedRun),
  });

  const generateReport = useMutation({
    mutationFn: ({ runId, format }: { runId: string; format: string }) => api.generateReport(runId, format),
    onSuccess: (r) => {
      toast({ title: "Report generated", description: r.filename });
      queryClient.invalidateQueries({ queryKey: ["reports", expandedRun] });
    },
    onError: (e: Error) => toast({ title: "Report generation failed", description: e.message, variant: "destructive" }),
  });

  const runs = runsQuery.data?.runs ?? [];

  // sparkline series: median times of completed results for a run (via detail of expanded only)
  const sparkValues = useMemo(() => {
    const results = runDetailQuery.data?.results ?? [];
    return results.filter((r) => r.status === "COMPLETED" && r.stats).map((r) => r.stats!.median);
  }, [runDetailQuery.data]);

  if (runs.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState icon={<History className="h-8 w-8" />} title="No runs recorded" hint="Every execution lands here with its full configuration, environment snapshot and raw observations — the ingredients for reproducibility." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1300px]">
      <BenchPanel
        title={
          <span className="inline-flex items-center gap-2">
            <History className="h-3.5 w-3.5 text-[var(--signal)]" /> Run History
          </span>
        }
        right={<span className="font-mono text-[10px] text-muted-foreground">{runs.length} runs</span>}
        bodyClassName="p-0"
      >
        <ScrollArea className="max-h-[720px]">
          <div className="divide-y divide-border/60">
            {runs.map((run) => {
              const isExpanded = expandedRun === run.id;
              const isActive = ["QUEUED", "PREPARING", "RUNNING", "VERIFYING", "ANALYZING"].includes(run.status);
              return (
                <div key={run.id} className={cn("transition-colors", isExpanded && "bg-accent/10")}>
                  <button
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/30 sm:grid-cols-[minmax(0,1fr)_130px_90px_110px_auto]"
                    onClick={() => setExpandedRun(isExpanded ? null : run.id)}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[12px] text-foreground">{run.experimentName}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {run.id.slice(-8)} · {run.config.variants.length}v × {run.config.languages.join("/")} × {run.config.inputSizes.length} sizes · {run.config.datasetType} · seed {run.config.seed}
                      </div>
                    </div>
                    <div className="hidden font-mono text-[10px] text-muted-foreground sm:block">{formatTime(run.createdAt)}</div>
                    <div className="hidden font-mono text-[10px] tabular text-muted-foreground sm:block">
                      {run.startedAt && run.finishedAt
                        ? formatDuration(new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime())
                        : run.startedAt
                          ? "running…"
                          : "—"}
                    </div>
                    <div className="hidden sm:block">
                      {isActive ? (
                        <div className="w-[100px]">
                          <SegmentedProgress completed={run.completedJobs} total={run.totalJobs} failed={run.failedJobs} />
                        </div>
                      ) : (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {run.completedJobs}/{run.totalJobs} jobs{run.failedJobs > 0 ? ` · ${run.failedJobs} failed` : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isActive && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--signal)]" />}
                      <StatusBadge status={run.status} />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border/50 bg-[#0c0e0b] px-3 py-3">
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="grid gap-2">
                          {runDetailQuery.data ? (
                            <>
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <KV k="commit" v={runDetailQuery.data.commitSha?.slice(0, 10) ?? "—"} />
                                <KV k="warmup/reps" v={`${runDetailQuery.data.config.warmup} / ${runDetailQuery.data.config.repetitions}`} />
                                <KV k="variants" v={runDetailQuery.data.config.variants.join(", ").slice(0, 60) || "—"} />
                                <KV k="verification" v={`${runDetailQuery.data.results.filter((r) => r.verificationStatus === "PASSED").length}/${runDetailQuery.data.results.length} passed`} />
                              </div>
                              {sparkValues.length > 1 && (
                                <div className="rounded-sm border border-border bg-panel/60 p-2.5">
                                  <div className="bench-label mb-1 text-[9px]">median times across results (execution order)</div>
                                  <Sparkline values={sparkValues} width={520} height={40} />
                                </div>
                              )}
                              {runDetailQuery.data.error && (
                                <div className="rounded-sm border border-red-900/60 bg-red-950/20 px-2.5 py-1.5 font-mono text-[10px] text-red-300">
                                  {runDetailQuery.data.error}
                                </div>
                              )}
                              <div className="scroll-thin max-h-40 overflow-y-auto rounded-sm border border-border bg-panel/60 p-2.5">
                                <div className="bench-label mb-1 text-[9px]">execution log (last lines)</div>
                                {runDetailQuery.data.logs.slice(-14).map((l) => (
                                  <div key={l.id} className="font-mono text-[10px] leading-relaxed">
                                    <span className="text-zinc-600">{new Date(l.ts).toLocaleTimeString("en-GB", { hour12: false })} </span>
                                    <span className={cn(l.level === "error" && "text-red-400", l.level === "warn" && "text-amber-400", l.level === "success" && "text-emerald-400", l.level === "info" && "text-zinc-400")}>{l.message}</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="p-3 text-center font-mono text-[11px] text-muted-foreground">loading run detail…</div>
                          )}
                        </div>

                        <div className="grid content-start gap-2">
                          <div className="bench-label text-[9px]">actions</div>
                          <div className="grid grid-cols-2 gap-2">
                            <Button size="sm" className="h-7 bg-[var(--signal)] font-mono text-[10px] text-[#111310] hover:bg-[var(--signal)]/90" onClick={() => { watchRun(run.id); setView("runner"); }}>
                              <Play className="h-3 w-3" /> Inspect
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 font-mono text-[10px]" onClick={async () => {
                              try {
                                await api.runExperiment(run.experimentId);
                                toast({ title: "Re-run started" });
                                watchRun(null);
                                await queryClient.invalidateQueries({ queryKey: ["runs"] });
                              } catch (e) {
                                toast({ title: "Could not re-run", description: (e as Error).message, variant: "destructive" });
                              }
                            }}>
                              <Play className="h-3 w-3" /> Re-run
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 font-mono text-[10px]" onClick={async () => {
                              const { id } = await api.cloneExperiment(run.experimentId);
                              toast({ title: "Experiment cloned", description: `Loaded clone ${id.slice(-6)} in Workbench` });
                              const detail = await api.experiment(id);
                              useBenchStore.getState().loadDraft(detail.config, detail.name, detail.description ?? "");
                              await queryClient.invalidateQueries({ queryKey: ["experiments"] });
                              setView("workbench");
                            }}>
                              <Copy className="h-3 w-3" /> Clone
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 font-mono text-[10px]" disabled={generateReport.isPending} onClick={() => generateReport.mutate({ runId: run.id, format: "markdown" })}>
                              {generateReport.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />} Report .md
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 font-mono text-[10px]" disabled={generateReport.isPending} onClick={() => generateReport.mutate({ runId: run.id, format: "json" })}>
                              <FileJson className="h-3 w-3" /> Report .json
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 font-mono text-[10px]" disabled={generateReport.isPending} onClick={() => generateReport.mutate({ runId: run.id, format: "csv" })}>
                              <Sheet className="h-3 w-3" /> Report .csv
                            </Button>
                          </div>

                          {(reportsQuery.data?.reports ?? []).length > 0 && (
                            <div className="grid gap-1">
                              <div className="bench-label mt-1 text-[9px]">generated reports</div>
                              {reportsQuery.data?.reports.map((rep) => (
                                <button
                                  key={rep.id}
                                  className="flex items-center justify-between gap-2 rounded-sm border border-border px-2 py-1.5 font-mono text-[10px] hover:border-[var(--signal)]/50"
                                  onClick={() => api.downloadReport(run.id, rep.id)}
                                >
                                  <span className="truncate">{rep.filename}</span>
                                  <FileDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="bench-label mt-1 text-[9px]">use as regression baseline</div>
                          <Button size="sm" variant="outline" className="h-7 font-mono text-[10px]" onClick={() => { setComparison(run.id, null); setView("regression"); toast({ title: "Baseline selected", description: "Now pick the candidate run in Regression." }); }}>
                            <History className="h-3 w-3" /> Set as baseline
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </BenchPanel>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-sm border border-border bg-panel/60 px-2 py-1.5">
      <div className="bench-label text-[9px]">{k}</div>
      <div className="truncate font-mono text-[10px] tabular text-foreground/85" title={v}>{v}</div>
    </div>
  );
}

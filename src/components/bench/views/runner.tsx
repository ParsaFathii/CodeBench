// CodeBench — Benchmark Runner view: live execution, real progress, console
"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useBenchStore } from "../store";
import { BenchPanel, EmptyState, SegmentedProgress, StatusBadge, formatDuration, formatNs, formatTime } from "../ui-kit";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { RUN_STATUS_ORDER } from "@/lib/bench/spec";
import { Cpu, Ban, Loader2, CheckCircle2, XCircle, Terminal, ChevronRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const ACTIVE_STATUSES = ["QUEUED", "PREPARING", "RUNNING", "VERIFYING", "ANALYZING"];

export function RunnerView() {
  const { watchRunId, setView } = useBenchStore();
  const queryClient = useQueryClient();
  const consoleRef = useRef<HTMLDivElement>(null);

  const runsQuery = useQuery({ queryKey: ["runs"], queryFn: api.runs, refetchInterval: (q) => (q.state.data?.activeRunId ? 1500 : 8000) });
  const activeRunId = watchRunId ?? runsQuery.data?.activeRunId ?? null;

  const runQuery = useQuery({
    queryKey: ["run", activeRunId],
    queryFn: () => api.run(activeRunId!),
    enabled: Boolean(activeRunId),
    refetchInterval: (q) => (q.state.data && ACTIVE_STATUSES.includes(q.state.data.status) ? 1500 : false),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelExperiment(runQuery.data!.experimentId),
    onSuccess: () => {
      toast({ title: "Cancellation requested", description: "The run stops after the current job is terminated." });
      queryClient.invalidateQueries({ queryKey: ["run", activeRunId] });
    },
    onError: (e: Error) => toast({ title: "Cancel failed", description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [runQuery.data?.logs.length]);

  const run = runQuery.data;
  const isActive = run ? ACTIVE_STATUSES.includes(run.status) : false;

  const completedResults = useMemo(() => (run?.results ?? []).filter((r) => r.status === "COMPLETED"), [run]);

  if (!activeRunId) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<Cpu className="h-8 w-8" />}
          title="No run is executing"
          hint="Launch an experiment from the Workbench, or pick a finished run from History to inspect its execution log."
          action={
            <div className="flex gap-2">
              <Button size="sm" className="bg-[var(--signal)] font-mono text-[11px] text-[#111310] hover:bg-[var(--signal)]/90" onClick={() => setView("workbench")}>
                <ChevronRight className="h-3.5 w-3.5" /> Open Workbench
              </Button>
              <Button size="sm" variant="outline" className="font-mono text-[11px]" onClick={() => setView("history")}>
                Run history
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  if (runQuery.isLoading || !run) {
    return <div className="p-8 text-center font-mono text-xs text-muted-foreground">loading run…</div>;
  }

  return (
    <div className="mx-auto grid max-w-[1500px] gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-w-0 flex-col gap-4">
        {/* status pipeline */}
        <BenchPanel
          title={
            <span className="inline-flex items-center gap-2">
              <Cpu className="h-3.5 w-3.5 text-[var(--signal)]" /> Run {run.id.slice(-8)} · {run.experimentName}
            </span>
          }
          right={
            isActive ? (
              <Button size="sm" variant="destructive" className="h-6 font-mono text-[10px]" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                {cancelMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />} Cancel
              </Button>
            ) : (
              <StatusBadge status={run.status} />
            )
          }
        >
          <div className="grid gap-3">
            {/* pipeline stations */}
            <div className="flex flex-wrap items-center gap-1.5">
              {RUN_STATUS_ORDER.map((s, i) => {
                const idx = RUN_STATUS_ORDER.indexOf(run.status as (typeof RUN_STATUS_ORDER)[number]);
                const terminal = ["FAILED", "CANCELLED"].includes(run.status);
                const done = terminal ? i <= idx : i < idx;
                const current = i === idx;
                return (
                  <div key={s} className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[10px] tracking-wider",
                        current && !terminal
                          ? "border-[var(--signal)] bg-accent/40 text-accent-foreground"
                          : done
                            ? "border-emerald-800/70 bg-emerald-950/30 text-emerald-300"
                            : "border-border text-muted-foreground"
                      )}
                    >
                      {done ? <CheckCircle2 className="h-3 w-3" /> : current && !terminal ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="h-3 w-3 text-center leading-3">·</span>}
                      {s}
                    </span>
                    {i < RUN_STATUS_ORDER.length - 1 && <span className={cn("h-px w-3", done ? "bg-emerald-800" : "bg-border")} />}
                  </div>
                );
              })}
              {["FAILED", "CANCELLED"].includes(run.status) && (
                <span className="flex items-center gap-1.5 rounded-sm border border-red-800 bg-red-950/30 px-2 py-1 font-mono text-[10px] tracking-wider text-red-300">
                  <XCircle className="h-3 w-3" /> {run.status}
                </span>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                <span>
                  {run.completedJobs}/{run.totalJobs} jobs · {run.failedJobs} failed
                  {run.currentJob && <span className="ml-2 text-[var(--signal)]">▶ {run.currentJob}</span>}
                </span>
                <span className="tabular">{run.progress}%</span>
              </div>
              <SegmentedProgress completed={run.completedJobs} total={run.totalJobs} failed={run.failedJobs} />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Meta k="started" v={formatTime(run.startedAt)} />
              <Meta k="elapsed" v={run.finishedAt && run.startedAt ? formatDuration(new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) : run.startedAt ? formatDuration(Date.now() - new Date(run.startedAt).getTime()) : "—"} />
              <Meta k="commit" v={run.commitSha ? run.commitSha.slice(0, 8) : "—"} />
              <Meta k="seed" v={String(run.config.seed)} />
            </div>

            {run.error && (
              <div className="rounded-sm border border-red-900/60 bg-red-950/30 px-3 py-2 font-mono text-[11px] text-red-300">
                {run.error}
              </div>
            )}

            {!isActive && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="font-mono text-[11px]" onClick={() => setView("results")}>
                  Inspect results
                </Button>
                <Button size="sm" variant="outline" className="font-mono text-[11px]" onClick={() => setView("compare")}>
                  Compare languages
                </Button>
                <Button size="sm" variant="outline" className="font-mono text-[11px]" onClick={() => setView("ai")}>
                  AI insights
                </Button>
              </div>
            )}
          </div>
        </BenchPanel>

        {/* live console */}
        <BenchPanel
          title={
            <span className="inline-flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-[var(--signal)]" /> Execution console
            </span>
          }
          right={<span className="font-mono text-[10px] text-muted-foreground">{run.logs.length} lines</span>}
          bodyClassName="p-0"
        >
          <div ref={consoleRef} className="console scroll-thin max-h-[380px] overflow-y-auto bg-[#0c0e0b] p-3">
            {run.logs.length === 0 ? (
              <div className="text-muted-foreground">waiting for output<span className="console-cursor" /></div>
            ) : (
              run.logs.map((l) => (
                <div key={l.id} className="flex gap-2.5 whitespace-pre-wrap break-all">
                  <span className="shrink-0 text-zinc-600">{new Date(l.ts).toLocaleTimeString("en-GB", { hour12: false })}</span>
                  <span
                    className={cn(
                      "shrink-0 w-12",
                      l.level === "success" && "text-emerald-400",
                      l.level === "error" && "text-red-400",
                      l.level === "warn" && "text-amber-400",
                      (l.level === "info" || l.level === "debug") && "text-zinc-500"
                    )}
                  >
                    {l.level.toUpperCase()}
                  </span>
                  <span className={cn(l.level === "error" && "text-red-300", l.level === "warn" && "text-amber-200")}>{l.message}</span>
                </div>
              ))
            )}
            {isActive && <div className="text-[var(--signal)] console-cursor" />}
          </div>
        </BenchPanel>
      </div>

      {/* results so far */}
      <BenchPanel
        title="Measurements so far"
        right={<span className="font-mono text-[10px] text-muted-foreground">{completedResults.length} results</span>}
        bodyClassName="p-0"
      >
        <ScrollArea className="max-h-[640px]">
          {completedResults.length === 0 ? (
            <div className="p-4 font-mono text-[11px] text-muted-foreground">no completed jobs yet…</div>
          ) : (
            <div className="divide-y divide-border/60">
              {completedResults.map((r) => (
                <div key={r.id} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px]">{r.variantKey} <span className="text-muted-foreground">n={r.inputSize.toLocaleString()}</span></span>
                    <StatusBadge status={r.verificationStatus} />
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[10px] text-muted-foreground">
                    <span>{r.language} · {r.harness}</span>
                    <span className="tabular text-foreground/85">
                      {formatNs(r.stats?.median ?? null)} med · σ={formatNs(r.stats?.stddev ?? null)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </BenchPanel>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-sm border border-border bg-panel-2/50 px-2.5 py-1.5">
      <div className="bench-label text-[9px]">{k}</div>
      <div className="font-mono text-[11px] tabular text-foreground/90">{v}</div>
    </div>
  );
}

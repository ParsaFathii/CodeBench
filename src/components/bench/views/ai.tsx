// CodeBench — AI Insights: optional, evidence-grounded interpretation
"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useBenchStore } from "../store";
import { BenchPanel, EmptyState, StatusBadge, formatTime } from "../ui-kit";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, ShieldAlert, Brain, ListChecks, Lightbulb, FlaskConical, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export function AiView() {
  const { watchRunId } = useBenchStore();
  const queryClient = useQueryClient();

  const statusQuery = useQuery({ queryKey: ["ai-status"], queryFn: api.aiStatus, refetchInterval: 30_000 });
  const runsQuery = useQuery({ queryKey: ["runs"], queryFn: api.runs });
  const completedRuns = useMemo(
    () => (runsQuery.data?.runs ?? []).filter((r) => ["COMPLETED", "FAILED"].includes(r.status)),
    [runsQuery.data]
  );

  const fallbackRunId = watchRunId && completedRuns.some((r) => r.id === watchRunId) ? watchRunId : completedRuns[0]?.id ?? null;
  const [runId, setRunId] = useState<string | null>(fallbackRunId);

  const analysesQuery = useQuery({
    queryKey: ["ai-analyses", runId],
    queryFn: () => api.aiAnalyses(runId!),
    enabled: Boolean(runId),
  });

  const analyze = useMutation({
    mutationFn: () => api.runAiAnalysis(runId!),
    onSuccess: async ({ analysisId }) => {
      toast({ title: "AI analysis complete", description: `Analysis ${analysisId.slice(-6)} stored with its evidence payload.` });
      await queryClient.invalidateQueries({ queryKey: ["ai-analyses", runId] });
    },
    onError: (e: Error) => toast({ title: "AI analysis failed", description: e.message, variant: "destructive" }),
  });

  const aiAvailable = statusQuery.data?.available ?? false;
  const analyses = analysesQuery.data?.analyses ?? [];
  const latest = analyses[0] ?? null;

  if (completedRuns.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState icon={<Sparkles className="h-8 w-8" />} title="Nothing to interpret yet" hint="AI insights explain measured runs. Execute an experiment first — the model only ever sees data that actually exists in the database." />
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[1300px] gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* provider column */}
      <div className="flex flex-col gap-4">
        <BenchPanel
          title={
            <span className="inline-flex items-center gap-2">
              <Brain className="h-3.5 w-3.5 text-[var(--signal)]" /> AI provider
            </span>
          }
        >
          <div className="grid gap-0.5">
            <div className="flex items-center justify-between border-b border-border/50 py-1.5">
              <span className="bench-label">configured</span>
              <span className="font-mono text-xs">{statusQuery.data?.configured ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between border-b border-border/50 py-1.5">
              <span className="bench-label">status</span>
              <StatusBadge status={aiAvailable ? "PASSED" : "FAILED"} />
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="bench-label">model</span>
              <span className="max-w-[150px] truncate font-mono text-xs">{statusQuery.data?.model ?? "—"}</span>
            </div>
          </div>
          <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">{statusQuery.data?.detail ?? "probing…"}</p>
        </BenchPanel>

        <BenchPanel title="Run under analysis">
          <Select value={runId ?? ""} onValueChange={setRunId}>
            <SelectTrigger className="h-8 bg-panel-2 font-mono text-[11px]" aria-label="run to analyze">
              <SelectValue placeholder="select run" />
            </SelectTrigger>
            <SelectContent>
              {completedRuns.map((r) => (
                <SelectItem key={r.id} value={r.id} className="font-mono text-xs">
                  {r.experimentName} · {r.id.slice(-6)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="mt-3 w-full bg-[var(--signal)] font-mono text-[11px] text-[#111310] hover:bg-[var(--signal)]/90"
            disabled={!aiAvailable || analyze.isPending || !runId}
            onClick={() => analyze.mutate()}
          >
            {analyze.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {analyze.isPending ? "Analyzing measured evidence…" : "Analyze this run"}
          </Button>
          {!aiAvailable && (
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-amber-300">
              Provider unavailable — the rest of CodeBench works without AI. Configure a provider in Settings.
            </p>
          )}
        </BenchPanel>

        <BenchPanel title="Boundaries">
          <ul className="grid gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
            <li className="flex gap-2"><ShieldAlert className="mt-0.5 h-3 w-3 shrink-0 text-[var(--signal)]" /> Receives only stored results and environment metadata for the selected run.</li>
            <li className="flex gap-2"><ShieldAlert className="mt-0.5 h-3 w-3 shrink-0 text-[var(--signal)]" /> Structured output is schema-validated; ungrounded claims (unknown variants, foreign run ids) are rejected.</li>
            <li className="flex gap-2"><ShieldAlert className="mt-0.5 h-3 w-3 shrink-0 text-[var(--signal)]" /> Can never create or modify benchmark records — measurements stay authoritative.</li>
            <li className="flex gap-2"><ShieldAlert className="mt-0.5 h-3 w-3 shrink-0 text-[var(--signal)]" /> Analysis is stored separately and clearly labelled as interpretation.</li>
          </ul>
        </BenchPanel>
      </div>

      {/* analysis column */}
      <div className="flex min-w-0 flex-col gap-4">
        {!latest ? (
          <EmptyState
            icon={<Sparkles className="h-8 w-8" />}
            title="No analysis for this run yet"
            hint="Press “Analyze this run”. The model will explain what was actually measured — and explicitly say when evidence is insufficient."
          />
        ) : latest.status === "FAILED" ? (
          <BenchPanel title="Latest analysis — rejected">
            <div className="flex items-start gap-2 rounded-sm border border-red-900/60 bg-red-950/30 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {latest.error ?? "analysis failed"}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Malformed or ungrounded model output is rejected rather than trusted. Nothing was written to benchmark data.
            </p>
          </BenchPanel>
        ) : (
          <BenchPanel
            title={
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-[var(--signal)]" /> Interpretation · {latest.provider}{latest.model ? ` (${latest.model})` : ""}
              </span>
            }
            right={
              <div className="flex items-center gap-2">
                <span className={cn(
                  "rounded-sm border px-1.5 py-0.5 font-mono text-[10px]",
                  latest.output?.confidence === "high" && "border-emerald-700 text-emerald-300",
                  latest.output?.confidence === "medium" && "border-amber-700 text-amber-300",
                  latest.output?.confidence === "low" && "border-red-800 text-red-300"
                )}>
                  confidence: {latest.output?.confidence ?? "—"}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">{formatTime(latest.createdAt)}</span>
              </div>
            }
          >
            <div className="grid gap-4">
              <div>
                <div className="bench-label mb-1">summary</div>
                <p className="text-[12px] leading-relaxed text-foreground/90">{latest.output?.summary}</p>
              </div>

              <AnalysisSection icon={<ListChecks className="h-3.5 w-3.5" />} title="observed findings" items={latest.output?.observed_findings} mono />
              <AnalysisSection icon={<span className="font-mono text-[10px] font-bold">σ</span>} title="statistical evidence" items={latest.output?.statistical_evidence} mono />
              <AnalysisSection icon={<Lightbulb className="h-3.5 w-3.5" />} title="possible explanations (hypotheses)" items={latest.output?.possible_explanations} />
              <AnalysisSection icon={<FlaskConical className="h-3.5 w-3.5" />} title="recommended follow-up experiments" items={latest.output?.recommended_experiments} />
              <AnalysisSection icon={<AlertTriangle className="h-3.5 w-3.5" />} title="limitations" items={latest.output?.limitations} warn />

              <div className="rounded-sm border border-border bg-panel-2/40 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                supporting run ids: {latest.output?.supporting_run_ids?.join(", ") || "—"} · AI output is interpretation,
                not measurement: every number above was computed by CodeBench from raw observations, never by the model.
              </div>
            </div>
          </BenchPanel>
        )}

        {analyses.length > 1 && (
          <BenchPanel title="Earlier analyses" bodyClassName="p-0">
            <ScrollArea className="max-h-56">
              <div className="divide-y divide-border/60">
                {analyses.slice(1).map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 font-mono text-[10px]">
                    <span className="truncate text-muted-foreground">{a.output?.summary?.slice(0, 90) ?? a.error?.slice(0, 90) ?? "—"}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={a.status === "COMPLETED" ? "PASSED" : "FAILED"} />
                      {formatTime(a.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </BenchPanel>
        )}
      </div>
    </div>
  );
}

function AnalysisSection({
  icon,
  title,
  items,
  mono,
  warn,
}: {
  icon: React.ReactNode;
  title: string;
  items?: string[];
  mono?: boolean;
  warn?: boolean;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="bench-label mb-1.5 flex items-center gap-1.5">
        <span className="text-[var(--signal)]">{icon}</span> {title}
      </div>
      <ul className="grid gap-1.5">
        {items.map((item, i) => (
          <li
            key={i}
            className={cn(
              "rounded-sm border px-2.5 py-1.5 text-[11px] leading-relaxed",
              warn ? "border-amber-900/50 bg-amber-950/15 text-amber-200/90" : "border-border bg-panel-2/30 text-foreground/85",
              mono && "font-mono text-[10.5px]"
            )}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

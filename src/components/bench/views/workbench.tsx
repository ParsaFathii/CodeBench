// CodeBench — Experiment Workbench view
"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useBenchStore } from "../store";
import { BenchPanel, CategoryBadge, EmptyState, LangTag, StatusBadge, formatTime } from "../ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ALGORITHMS } from "@/lib/bench/registry";
import { DATASET_LABELS, LANGUAGES, type DatasetType, type Language } from "@/lib/bench/spec";
import { Play, Save, Copy, Loader2, ChevronRight, Plus, X, FlaskConical, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const SIZE_PRESETS = [256, 1024, 4096, 10000, 50000, 100000, 131072, 1000000];

export function WorkbenchView() {
  const { draft, setDraft, draftName, draftDescription, setDraftMeta, setView, watchRun, selectExperiment } = useBenchStore();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);

  const enginesQuery = useQuery({ queryKey: ["languages"], queryFn: api.languages, staleTime: 30_000 });
  const experimentsQuery = useQuery({ queryKey: ["experiments"], queryFn: api.experiments });

  const engineByLang = useMemo(() => {
    const m = new Map<Language, boolean>();
    for (const e of enginesQuery.data?.engines ?? []) m.set(e.language, e.available);
    return m;
  }, [enginesQuery.data]);

  // ---- local validation mirroring the server ----
  const validation = useMemo(() => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const applicable = draft.variants.filter((key) => {
      const [algoId] = key.split(".");
      const algo = ALGORITHMS.find((a) => a.id === algoId);
      return algo && algo.variants.some((v) => `${algoId}.${v.id}` === key && v.languages.some((l) => draft.languages.includes(l)));
    });
    if (!draft.variants.length) errors.push("Select at least one algorithm variant.");
    if (!draft.languages.length) errors.push("Select at least one language.");
    if (!draft.inputSizes.length) errors.push("Add at least one input size.");
    if (draft.repetitions < 2) errors.push("At least 2 measured repetitions are required.");
    if (draft.warmup < 0) errors.push("Warm-up must be zero or more.");
    for (const key of draft.variants) {
      const [algoId, variantId] = key.split(".");
      const algo = ALGORITHMS.find((a) => a.id === algoId);
      const variant = algo?.variants.find((v) => v.id === variantId);
      if (!algo || !variant) {
        errors.push(`Unknown variant "${key}".`);
        continue;
      }
      if (!algo.datasets.includes(draft.datasetType)) {
        errors.push(`${algo.name} does not support dataset "${draft.datasetType}".`);
      }
      if (variant.maxSize && draft.inputSizes.some((s) => s > variant.maxSize)) {
        errors.push(`${variant.name} supports sizes up to ${variant.maxSize}.`);
      }
      if (!variant.languages.some((l) => draft.languages.includes(l))) {
        warnings.push(`${variant.name} is unavailable in the selected languages — it will be skipped.`);
      }
    }
    for (const l of draft.languages) {
      if (engineByLang.get(l) === false) {
        warnings.push(`${l.toUpperCase()} engine is not available on this host — its jobs will fail.`);
      }
    }
    const totalJobs = applicable.length * draft.languages.length * draft.inputSizes.length;
    if (totalJobs > 90) warnings.push(`${totalJobs} jobs will run serially — this may take a while.`);
    return { errors, warnings, totalJobs };
  }, [draft, engineByLang]);

  const createAndRun = useMutation({
    mutationFn: async (run: boolean) => {
      const name = draftName.trim() || `Experiment ${new Date().toLocaleString("en-GB", { hour12: false })}`;
      const { id } = await api.createExperiment(name, draftDescription.trim() || null, draft);
      if (run) {
        const { runId } = await api.runExperiment(id);
        return { experimentId: id, runId, ran: true };
      }
      return { experimentId: id, runId: null, ran: false };
    },
    onSuccess: async ({ experimentId, runId, ran }) => {
      toast({ title: ran ? "Experiment launched" : "Experiment saved", description: ran ? `Run ${runId!.slice(-8)} is now queued.` : "Run it from the list whenever you are ready." });
      await queryClient.invalidateQueries({ queryKey: ["experiments"] });
      if (ran) {
        watchRun(runId!);
        setView("runner");
      } else {
        selectExperiment(experimentId);
      }
      setRunning(false);
    },
    onError: (e: Error) => {
      toast({ title: "Could not create experiment", description: e.message, variant: "destructive" });
      setRunning(false);
    },
  });

  const launch = (run: boolean) => {
    if (validation.errors.length > 0) {
      toast({ title: "Configuration is invalid", description: validation.errors[0], variant: "destructive" });
      return;
    }
    setRunning(true);
    createAndRun.mutate(run);
  };

  const toggleVariant = (key: string) => {
    setDraft({ variants: draft.variants.includes(key) ? draft.variants.filter((v) => v !== key) : [...draft.variants, key] });
  };

  const toggleLanguage = (l: Language) => {
    setDraft({ languages: draft.languages.includes(l) ? draft.languages.filter((x) => x !== l) : [...draft.languages, l] });
  };

  const addSize = (s: number) => {
    if (!draft.inputSizes.includes(s) && Number.isInteger(s) && s >= 8 && s <= 2_000_000) {
      setDraft({ inputSizes: [...draft.inputSizes, s].sort((a, b) => a - b) });
    }
  };

  return (
    <div className="mx-auto grid max-w-[1500px] gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* ---------------- builder column ---------------- */}
      <div className="flex min-w-0 flex-col gap-4">
        <BenchPanel
          title={
            <span className="inline-flex items-center gap-2">
              <FlaskConical className="h-3.5 w-3.5 text-[var(--signal)]" /> Experiment Workbench
            </span>
          }
          right={<span className="font-mono text-[10px] text-muted-foreground">workload spec v1.0</span>}
          bodyClassName="p-0"
        >
          <div className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <Label htmlFor="exp-name" className="bench-label">Experiment name</Label>
              <Input
                id="exp-name"
                value={draftName}
                onChange={(e) => setDraftMeta(e.target.value, draftDescription)}
                placeholder="e.g. Sorting cross-language — random ints"
                className="bg-panel-2 font-mono text-xs"
                maxLength={120}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="exp-desc" className="bench-label">Description (optional)</Label>
              <Input
                id="exp-desc"
                value={draftDescription}
                onChange={(e) => setDraftMeta(draftName, e.target.value)}
                placeholder="What is this experiment trying to establish?"
                className="bg-panel-2 text-xs"
                maxLength={300}
              />
            </div>
          </div>
        </BenchPanel>

        {/* algorithm + variant selection */}
        <BenchPanel
          title="01 · Algorithms & variants"
          right={<span className="font-mono text-[10px] text-muted-foreground">{draft.variants.length} selected</span>}
          bodyClassName="p-0"
        >
          <ScrollArea className="max-h-[420px]">
            <div className="grid gap-3 p-3">
              {ALGORITHMS.map((algo) => {
                const datasetOk = algo.datasets.includes(draft.datasetType);
                return (
                  <div key={algo.id} className={cn("rounded-md border border-border/70", !datasetOk && "opacity-45")}>
                    <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-panel-2/60 px-3 py-2">
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-semibold text-foreground">{algo.name}</span>
                        <span className="ml-2 font-mono text-[10px] text-muted-foreground">{algo.variants.length} variants</span>
                      </div>
                      {!datasetOk && (
                        <span className="font-mono text-[10px] text-amber-400">needs {algo.datasets[0]}</span>
                      )}
                    </div>
                    <div className="grid gap-1 p-2 sm:grid-cols-2">
                      {algo.variants.map((v) => {
                        const key = `${algo.id}.${v.id}`;
                        const checked = draft.variants.includes(key);
                        const langOk = v.languages.some((l) => draft.languages.includes(l));
                        return (
                          <button
                            key={key}
                            onClick={() => datasetOk && toggleVariant(key)}
                            disabled={!datasetOk}
                            className={cn(
                              "flex items-start gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors",
                              checked ? "border-[var(--signal)]/60 bg-accent/40" : "border-transparent hover:bg-secondary/60",
                              !langOk && checked && "border-amber-700/50"
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                                checked ? "border-[var(--signal)] bg-[var(--signal)] text-[#111310]" : "border-zinc-600"
                              )}
                            >
                              {checked && <CheckCircle2 className="h-3 w-3" />}
                            </span>
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="font-mono text-[11px] text-foreground">{v.name}</span>
                                <CategoryBadge category={v.category} />
                              </span>
                              <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                                {v.complexity} · {v.languages.join(" / ")}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </BenchPanel>

        {/* dataset */}
        <BenchPanel title="02 · Dataset" bodyClassName="p-3">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(DATASET_LABELS) as DatasetType[]).map((ds) => (
              <button
                key={ds}
                onClick={() => setDraft({ datasetType: ds })}
                className={cn(
                  "rounded-sm border px-2.5 py-1 font-mono text-[11px] transition-colors",
                  draft.datasetType === ds
                    ? "border-[var(--signal)]/70 bg-accent/50 text-accent-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
                title={DATASET_LABELS[ds]}
              >
                {ds}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {DATASET_LABELS[draft.datasetType]} — inputs are generated deterministically (SplitMix64, seed {draft.seed}) and are bit-identical in every language; FNV-1a checksums prove it before results count.
          </p>
        </BenchPanel>

        {/* input sizes */}
        <BenchPanel title="03 · Input sizes" right={<span className="font-mono text-[10px] text-muted-foreground">{draft.inputSizes.length} sizes</span>} bodyClassName="p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {draft.inputSizes.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-sm border border-[var(--signal)]/50 bg-accent/30 px-2 py-0.5 font-mono text-[11px]">
                {s.toLocaleString()}
                <button onClick={() => setDraft({ inputSizes: draft.inputSizes.filter((x) => x !== s) })} aria-label={`remove size ${s}`}>
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              </span>
            ))}
            <SizeInput onAdd={addSize} />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1">
            {SIZE_PRESETS.filter((s) => !draft.inputSizes.includes(s)).map((s) => (
              <button
                key={s}
                onClick={() => addSize(s)}
                className="inline-flex items-center gap-1 rounded-sm border border-dashed border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:border-[var(--signal)]/50 hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                {s.toLocaleString()}
              </button>
            ))}
          </div>
        </BenchPanel>

        {/* languages */}
        <BenchPanel title="04 · Languages" bodyClassName="p-3">
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) => {
              const meta = enginesQuery.data?.languages.find((x) => x.id === l);
              const available = engineByLang.get(l) !== false;
              const active = draft.languages.includes(l);
              return (
                <button
                  key={l}
                  onClick={() => toggleLanguage(l)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition-colors",
                    active ? "border-[var(--signal)]/60 bg-accent/40" : "border-border hover:bg-secondary/50",
                    !available && "opacity-60"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <LangTag language={l} />
                    <span className="font-mono text-[10px] text-muted-foreground">{meta?.harness}</span>
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {meta?.standard} {available ? "" : "· engine unavailable"}
                  </span>
                </button>
              );
            })}
          </div>
        </BenchPanel>

        {/* measurement policy */}
        <BenchPanel title="05 · Measurement policy" bodyClassName="p-4">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label className="bench-label">Warm-up units</Label>
                <span className="font-mono text-xs tabular text-[var(--signal)]">{draft.warmup}</span>
              </div>
              <Slider
                value={[draft.warmup]}
                min={0}
                max={10}
                step={1}
                onValueChange={([v]) => setDraft({ warmup: v })}
                aria-label="warm-up"
              />
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Explicit untimed executions before measurement (JMH warm-up iterations, pyperf warm-up values, C++ warm-up passes).
              </p>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label className="bench-label">Measured repetitions</Label>
                <span className="font-mono text-xs tabular text-[var(--signal)]">{draft.repetitions}</span>
              </div>
              <Slider
                value={[draft.repetitions]}
                min={2}
                max={15}
                step={1}
                onValueChange={([v]) => setDraft({ repetitions: v })}
                aria-label="repetitions"
              />
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Every repetition is stored as a raw observation; statistics derive from them. More reps = tighter confidence intervals.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="seed" className="bench-label">Reproducibility seed</Label>
              <Input
                id="seed"
                type="number"
                value={draft.seed}
                onChange={(e) => setDraft({ seed: Math.trunc(Number(e.target.value) || 0) })}
                className="bg-panel-2 font-mono text-xs tabular"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="timeout" className="bench-label">Per-job timeout (seconds)</Label>
              <Input
                id="timeout"
                type="number"
                min={10}
                value={Math.round(draft.timeoutMs / 1000)}
                onChange={(e) => setDraft({ timeoutMs: Math.max(10, Math.trunc(Number(e.target.value) || 10)) * 1000 })}
                className="bg-panel-2 font-mono text-xs tabular"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-panel-2/50 px-3 py-2.5 md:col-span-2">
              <div>
                <Label htmlFor="cont-err" className="text-xs">Continue on job failure</Label>
                <p className="text-[10px] text-muted-foreground">A failed benchmark is recorded as failed; the run continues with the remaining jobs.</p>
              </div>
              <Switch id="cont-err" checked={draft.continueOnError} onCheckedChange={(v) => setDraft({ continueOnError: v })} />
            </div>
          </div>
        </BenchPanel>
      </div>

      {/* ---------------- sheet column ---------------- */}
      <div className="flex flex-col gap-4">
        <BenchPanel title="Experiment sheet" right={<span className="font-mono text-[10px] text-muted-foreground">{validation.totalJobs} jobs</span>}>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
              <SheetCell k="variants" v={String(draft.variants.length)} />
              <SheetCell k="languages" v={draft.languages.join(" · ") || "—"} />
              <SheetCell k="dataset" v={draft.datasetType} />
              <SheetCell k="sizes" v={draft.inputSizes.map((s) => s.toLocaleString()).join(", ") || "—"} />
              <SheetCell k="seed" v={String(draft.seed)} />
              <SheetCell k="warmup/reps" v={`${draft.warmup} / ${draft.repetitions}`} />
            </div>

            {(validation.errors.length > 0 || validation.warnings.length > 0) && (
              <div className="grid gap-1.5">
                {validation.errors.map((e, i) => (
                  <div key={`e${i}`} className="flex items-start gap-2 rounded-sm border border-red-900/60 bg-red-950/30 px-2.5 py-1.5 text-[11px] text-red-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {e}
                  </div>
                ))}
                {validation.warnings.map((w, i) => (
                  <div key={`w${i}`} className="flex items-start gap-2 rounded-sm border border-amber-900/60 bg-amber-950/20 px-2.5 py-1.5 text-[11px] text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => launch(false)}
                disabled={createAndRun.isPending || validation.errors.length > 0}
                className="font-mono text-[11px]"
              >
                <Save className="h-3.5 w-3.5" /> Save
              </Button>
              <Button
                size="sm"
                onClick={() => launch(true)}
                disabled={createAndRun.isPending || validation.errors.length > 0}
                className="bg-[var(--signal)] font-mono text-[11px] text-[#111310] hover:bg-[var(--signal)]/90"
              >
                {createAndRun.isPending && running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Run now
              </Button>
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Jobs execute serially, one isolated OS process each. Progress reflects real completions — never an estimate.
            </p>
          </div>
        </BenchPanel>

        <BenchPanel title="Saved experiments" right={<span className="font-mono text-[10px] text-muted-foreground">{experimentsQuery.data?.experiments.length ?? 0}</span>} bodyClassName="p-0">
          <ScrollArea className="max-h-[430px]">
            {experimentsQuery.isLoading ? (
              <div className="p-4 text-center font-mono text-[11px] text-muted-foreground">loading…</div>
            ) : (experimentsQuery.data?.experiments ?? []).length === 0 ? (
              <EmptyState title="No experiments yet" hint="Configure a workload on the left and press Save or Run now." />
            ) : (
              <div className="divide-y divide-border/60">
                {(experimentsQuery.data?.experiments ?? []).map((exp) => (
                  <div key={exp.id} className="group px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          useBenchStore.getState().loadDraft(exp.config, exp.name, exp.description ?? "");
                          selectExperiment(exp.id);
                        }}
                        title="Load into workbench"
                      >
                        <div className="truncate font-mono text-[11px] text-foreground group-hover:text-accent-foreground">{exp.name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {exp.config.variants.length} variants · {exp.config.languages.join("/")} · {exp.runCount} run{exp.runCount === 1 ? "" : "s"}
                        </div>
                      </button>
                      <div className="flex items-center gap-1">
                        {exp.lastRun && <StatusBadge status={exp.lastRun.status} />}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={async () => {
                            try {
                              const { id } = await api.cloneExperiment(exp.id);
                              toast({ title: "Experiment cloned" });
                              await queryClient.invalidateQueries({ queryKey: ["experiments"] });
                              const detail = await api.experiment(id);
                              useBenchStore.getState().loadDraft(detail.config, detail.name, detail.description ?? "");
                            } catch (e) {
                              toast({ title: "Clone failed", description: (e as Error).message, variant: "destructive" });
                            }
                          }}
                          title="Clone experiment"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          className="h-6 w-6 bg-[var(--signal)] text-[#111310] hover:bg-[var(--signal)]/90"
                          onClick={async () => {
                            try {
                              const { runId } = await api.runExperiment(exp.id);
                              watchRun(runId);
                              setView("runner");
                            } catch (e) {
                              toast({ title: "Could not start run", description: (e as Error).message, variant: "destructive" });
                            }
                          }}
                          title="Run experiment"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {exp.lastRun && (
                      <div className="mt-1 font-mono text-[9px] text-muted-foreground">last run {formatTime(exp.lastRun.createdAt)}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </BenchPanel>

        <BenchPanel title="How comparison stays fair">
          <ul className="grid gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <li className="flex gap-2"><ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-[var(--signal)]" /> Identical inputs across languages (deterministic SplitMix64 streams, checksum-verified).</li>
            <li className="flex gap-2"><ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-[var(--signal)]" /> Hand-written and standard-library variants are labelled separately — never silently mixed.</li>
            <li className="flex gap-2"><ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-[var(--signal)]" /> Each language keeps its professional harness: Google Benchmark, JMH, pyperf.</li>
            <li className="flex gap-2"><ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-[var(--signal)]" /> Raw observations are preserved; outliers are flagged, never deleted.</li>
          </ul>
        </BenchPanel>
      </div>
    </div>
  );
}

function SheetCell({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-sm border border-border bg-panel-2/60 px-2.5 py-1.5">
      <div className="bench-label text-[9px]">{k}</div>
      <div className="truncate text-[11px] text-foreground/90" title={v}>{v}</div>
    </div>
  );
}

function SizeInput({ onAdd }: { onAdd: (s: number) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="inline-flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Math.trunc(Number(value));
        if (n) onAdd(n);
        setValue("");
      }}
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="custom n"
        className="h-7 w-24 border-dashed bg-transparent font-mono text-[11px]"
        inputMode="numeric"
        aria-label="custom input size"
      />
      <Button type="submit" variant="ghost" size="icon" className="h-6 w-6" aria-label="add size">
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </form>
  );
}

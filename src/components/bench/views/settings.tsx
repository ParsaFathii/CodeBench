// CodeBench — Settings: defaults, AI provider, thresholds
"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type SettingsDto } from "../api";
import { BenchPanel } from "../ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings2, Save, Loader2, DatabaseZap, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function SettingsView() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  // initialize the editable draft from the first loaded settings (derived, not effected)
  const [draftOverride, setDraft] = useState<SettingsDto | null>(null);
  const draft = draftOverride ?? settingsQuery.data?.settings ?? null;

  const save = useMutation({
    mutationFn: (s: Partial<SettingsDto>) => api.saveSettings(s),
    onSuccess: async ({ settings }) => {
      setDraft(settings);
      toast({ title: "Settings saved" });
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      await queryClient.invalidateQueries({ queryKey: ["ai-status"] });
    },
    onError: (e: Error) => toast({ title: "Could not save settings", description: e.message, variant: "destructive" }),
  });

  if (!draft) {
    return <div className="p-8 text-center font-mono text-xs text-muted-foreground">loading settings…</div>;
  }

  return (
    <div className="mx-auto grid max-w-[1100px] gap-4 lg:grid-cols-2">
      <BenchPanel
        title={
          <span className="inline-flex items-center gap-2">
            <Settings2 className="h-3.5 w-3.5 text-[var(--signal)]" /> Measurement defaults
          </span>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label className="bench-label">Default warm-up units</Label>
              <span className="font-mono text-xs tabular text-[var(--signal)]">{draft.defaults.warmup}</span>
            </div>
            <Slider value={[draft.defaults.warmup]} min={0} max={10} step={1} onValueChange={([v]) => setDraft({ ...draft, defaults: { ...draft.defaults, warmup: v } })} />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label className="bench-label">Default measured repetitions</Label>
              <span className="font-mono text-xs tabular text-[var(--signal)]">{draft.defaults.repetitions}</span>
            </div>
            <Slider value={[draft.defaults.repetitions]} min={2} max={15} step={1} onValueChange={([v]) => setDraft({ ...draft, defaults: { ...draft.defaults, repetitions: v } })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="s-timeout" className="bench-label">Default timeout (s)</Label>
              <Input
                id="s-timeout"
                type="number"
                min={10}
                value={Math.round(draft.defaults.timeoutMs / 1000)}
                onChange={(e) => setDraft({ ...draft, defaults: { ...draft.defaults, timeoutMs: Math.max(10, Number(e.target.value) || 10) * 1000 } })}
                className="bg-panel-2 font-mono text-xs tabular"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-seed" className="bench-label">Default seed</Label>
              <Input
                id="s-seed"
                type="number"
                value={draft.defaults.seed}
                onChange={(e) => setDraft({ ...draft, defaults: { ...draft.defaults, seed: Math.trunc(Number(e.target.value) || 0) } })}
                className="bg-panel-2 font-mono text-xs tabular"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label className="bench-label">Regression practical threshold</Label>
              <span className="font-mono text-xs tabular text-[var(--signal)]">±{draft.regressionThresholdPct}%</span>
            </div>
            <Slider value={[draft.regressionThresholdPct]} min={2} max={40} step={1} onValueChange={([v]) => setDraft({ ...draft, regressionThresholdPct: v })} />
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Differences below this threshold are reported as INCONCLUSIVE rather than regressions. Combined run-to-run
              variation is checked in addition to this threshold.
            </p>
          </div>
        </div>
      </BenchPanel>

      <BenchPanel
        title={
          <span className="inline-flex items-center gap-2">
            <DatabaseZap className="h-3.5 w-3.5 text-[var(--signal)]" /> AI provider
          </span>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label className="bench-label">Provider</Label>
            <Select value={draft.ai.provider} onValueChange={(v) => setDraft({ ...draft, ai: { ...draft.ai, provider: v as SettingsDto["ai"]["provider"] } })}>
              <SelectTrigger className="h-8 bg-panel-2 font-mono text-xs" aria-label="AI provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zai" className="font-mono text-xs">z-ai (built-in server-side SDK)</SelectItem>
                <SelectItem value="ollama" className="font-mono text-xs">Ollama (local models)</SelectItem>
                <SelectItem value="disabled" className="font-mono text-xs">Disabled</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              With <span className="font-mono">disabled</span>, every benchmark feature keeps working — AI is strictly optional.
              Ollama keeps analysis fully on your machine.
            </p>
          </div>

          {draft.ai.provider === "ollama" && (
            <div className="grid gap-1.5">
              <Label htmlFor="s-ollama" className="bench-label">Ollama base URL</Label>
              <Input
                id="s-ollama"
                value={draft.ai.ollamaUrl ?? ""}
                onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, ollamaUrl: e.target.value } })}
                placeholder="http://localhost:11434"
                className="bg-panel-2 font-mono text-xs"
              />
              <Label htmlFor="s-model" className="bench-label mt-1">Model (optional)</Label>
              <Input
                id="s-model"
                value={draft.ai.model ?? ""}
                onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, model: e.target.value || null } })}
                placeholder="e.g. llama3.1:8b — empty = first installed"
                className="bg-panel-2 font-mono text-xs"
              />
            </div>
          )}

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label className="bench-label">Temperature</Label>
              <span className="font-mono text-xs tabular text-[var(--signal)]">{draft.ai.temperature.toFixed(2)}</span>
            </div>
            <Slider
              value={[draft.ai.temperature]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={([v]) => setDraft({ ...draft, ai: { ...draft.ai, temperature: v } })}
            />
            <p className="text-[10px] text-muted-foreground">Low temperature keeps interpretations close to the evidence.</p>
          </div>

          <div className="flex items-start gap-2 rounded-sm border border-border bg-panel-2/40 p-2.5 text-[10px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--signal)]" />
            The provider receives the selected run’s stored results, statistics and environment summary — nothing else.
            Structured output is validated and grounded; rejected analyses never touch benchmark data.
          </div>
        </div>
      </BenchPanel>

      <div className="lg:col-span-2">
        <Button
          className={cn("bg-[var(--signal)] font-mono text-xs text-[#111310] hover:bg-[var(--signal)]/90")}
          onClick={() => save.mutate({
            defaults: draft.defaults,
            ai: draft.ai,
            regressionThresholdPct: draft.regressionThresholdPct,
          })}
          disabled={save.isPending}
        >
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save settings
        </Button>
      </div>
    </div>
  );
}

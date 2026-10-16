// CodeBench — client state store (draft config, watched run, navigation)
"use client";

import { create } from "zustand";
import type { ExperimentConfig } from "@/lib/bench/spec";
import { DEFAULT_CONFIG } from "@/lib/bench/spec";
import type { ViewId } from "./shell";

interface BenchStore {
  view: ViewId;
  draft: ExperimentConfig;
  draftName: string;
  draftDescription: string;
  watchRunId: string | null;
  selectedExperimentId: string | null;
  compareBaseline: string | null;
  compareCandidate: string | null;
  shellEnv: ShellEnv | null;
  setView: (v: ViewId) => void;
  setDraft: (patch: Partial<ExperimentConfig>) => void;
  setDraftMeta: (name: string, description: string) => void;
  loadDraft: (config: ExperimentConfig, name: string, description: string) => void;
  resetDraft: () => void;
  watchRun: (runId: string | null) => void;
  selectExperiment: (id: string | null) => void;
  setComparison: (baseline: string | null, candidate: string | null) => void;
  setShellEnv: (env: ShellEnv | null) => void;
}

export interface ShellEnv {
  cpuCores: number | null;
  cpuModel: string | null;
  os: string;
  enginesAvailable: number;
  enginesTotal: number;
  activeRun: { id: string; progress: number; status: string } | null;
}

function viewFromHash(): ViewId {
  if (typeof window === "undefined") return "workbench";
  const h = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  const valid: ViewId[] = [
    "workbench", "catalog", "runner", "results", "compare", "regression",
    "history", "environment", "ai", "settings",
  ];
  return (valid.includes(h as ViewId) ? h : "workbench") as ViewId;
}

export const useBenchStore = create<BenchStore>()((set) => ({
  view: viewFromHash(),
  draft: { ...DEFAULT_CONFIG },
  draftName: "",
  draftDescription: "",
  watchRunId: null,
  selectedExperimentId: null,
  compareBaseline: null,
  compareCandidate: null,
  shellEnv: null,
  setView: (v) => {
    if (typeof window !== "undefined") window.location.hash = `#/${v}`;
    set({ view: v });
  },
  setDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  setDraftMeta: (name, description) => set({ draftName: name, draftDescription: description }),
  loadDraft: (config, name, description) =>
    set({ draft: { ...config }, draftName: name, draftDescription: description }),
  resetDraft: () => set({ draft: { ...DEFAULT_CONFIG }, draftName: "", draftDescription: "" }),
  watchRun: (runId) => set({ watchRunId: runId }),
  selectExperiment: (id) => set({ selectedExperimentId: id }),
  setComparison: (baseline, candidate) => set({ compareBaseline: baseline, compareCandidate: candidate }),
  setShellEnv: (env) => set({ shellEnv: env }),
}));

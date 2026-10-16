// CodeBench — Cross-Language Algorithm Benchmarking and Performance Analysis
// Single-route workbench SPA. Views switch client-side; the API lives under /api/v1.
"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell, type ShellEnvInfo } from "@/components/bench/shell";
import { useBenchStore } from "@/components/bench/store";
import { api } from "@/components/bench/api";
import { WorkbenchView } from "@/components/bench/views/workbench";
import { CatalogView } from "@/components/bench/views/catalog";
import { RunnerView } from "@/components/bench/views/runner";
import { ResultsView } from "@/components/bench/views/results";
import { CompareView } from "@/components/bench/views/compare";
import { RegressionView } from "@/components/bench/views/regression";
import { HistoryView } from "@/components/bench/views/history";
import { EnvironmentView } from "@/components/bench/views/environment";
import { AiView } from "@/components/bench/views/ai";
import { SettingsView } from "@/components/bench/views/settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: false },
  },
});

const VIEW_IDS = [
  "workbench", "catalog", "runner", "results", "compare", "regression",
  "history", "environment", "ai", "settings",
] as const;

function ShellEnvBridge() {
  const envQuery = useQuery({ queryKey: ["environment"], queryFn: api.environment, staleTime: 60_000 });
  const runsQuery = useQuery({ queryKey: ["runs"], queryFn: api.runs, refetchInterval: 5_000 });
  const setEnv = useBenchStore((s) => s.setShellEnv);

  useEffect(() => {
    const env = envQuery.data;
    if (!env) return;
    const activeRunId = runsQuery.data?.activeRunId ?? null;
    const active = activeRunId ? runsQuery.data?.runs.find((r) => r.id === activeRunId) : null;
    setEnv({
      cpuCores: env.environment.cpuCores,
      cpuModel: env.environment.cpuModel,
      os: env.environment.osPlatform,
      enginesAvailable: env.engines.filter((e) => e.available).length,
      enginesTotal: env.engines.length,
      activeRun: active ? { id: active.id, progress: active.progress, status: active.status } : null,
    });
  }, [envQuery.data, runsQuery.data, setEnv]);

  return null;
}

function CurrentView() {
  const view = useBenchStore((s) => s.view);

  // keep the store in sync with hash navigation (back/forward buttons)
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace(/^#\/?/, "").split("?")[0];
      if ((VIEW_IDS as readonly string[]).includes(h)) {
        useBenchStore.setState({ view: h as (typeof VIEW_IDS)[number] });
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  switch (view) {
    case "catalog":
      return <CatalogView />;
    case "runner":
      return <RunnerView />;
    case "results":
      return <ResultsView />;
    case "compare":
      return <CompareView />;
    case "regression":
      return <RegressionView />;
    case "history":
      return <HistoryView />;
    case "environment":
      return <EnvironmentView />;
    case "ai":
      return <AiView />;
    case "settings":
      return <SettingsView />;
    default:
      return <WorkbenchView />;
  }
}

export default function Home() {
  const view = useBenchStore((s) => s.view);
  const setView = useBenchStore((s) => s.setView);
  const envInfo = useBenchStore((s) => s.shellEnv);

  return (
    <QueryClientProvider client={queryClient}>
      <ShellEnvBridge />
      <AppShell view={view} onNavigate={setView} envInfo={envInfo}>
        <CurrentView />
      </AppShell>
    </QueryClientProvider>
  );
}

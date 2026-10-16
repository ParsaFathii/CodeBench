// CodeBench — application shell: instrument rail, status strip, sticky footer
"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FlaskConical,
  Library,
  Cpu,
  TableProperties,
  GitCompareArrows,
  TrendingDown,
  History,
  Server,
  Sparkles,
  Settings2,
  Activity,
} from "lucide-react";

export type ViewId =
  | "workbench"
  | "catalog"
  | "runner"
  | "results"
  | "compare"
  | "regression"
  | "history"
  | "environment"
  | "ai"
  | "settings";

export const NAV_ITEMS: Array<{ id: ViewId; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }> = [
  { id: "workbench", label: "Workbench", icon: FlaskConical, hint: "Configure and launch experiments" },
  { id: "catalog", label: "Catalog", icon: Library, hint: "Verified algorithm catalog" },
  { id: "runner", label: "Runner", icon: Cpu, hint: "Live execution console" },
  { id: "results", label: "Results", icon: TableProperties, hint: "Measured results explorer" },
  { id: "compare", label: "Compare", icon: GitCompareArrows, hint: "Cross-language comparison" },
  { id: "regression", label: "Regression", icon: TrendingDown, hint: "Baseline vs candidate analysis" },
  { id: "history", label: "History", icon: History, hint: "Run history and exports" },
  { id: "environment", label: "Environment", icon: Server, hint: "Host, runtimes and engines" },
  { id: "ai", label: "AI Insights", icon: Sparkles, hint: "Evidence-grounded interpretation (optional)" },
  { id: "settings", label: "Settings", icon: Settings2, hint: "Defaults and AI provider" },
];

export interface ShellEnvInfo {
  cpuCores: number | null;
  cpuModel: string | null;
  os: string;
  enginesAvailable: number;
  enginesTotal: number;
  activeRun: { id: string; progress: number; status: string } | null;
}

export function AppShell({
  view,
  onNavigate,
  envInfo,
  children,
}: {
  view: ViewId;
  onNavigate: (v: ViewId) => void;
  envInfo: ShellEnvInfo | null;
  children: React.ReactNode;
}) {
  const [clock, setClock] = useState<string>("");
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-GB", { hour12: false }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 flex-col md:flex-row">
        {/* ---- instrument rail ---- */}
        <TooltipProvider delayDuration={120}>
          <nav
            aria-label="CodeBench sections"
            className="sticky top-0 z-40 flex shrink-0 flex-row items-center gap-1 border-b border-border bg-panel px-2 py-1.5 md:h-screen md:w-[60px] md:flex-col md:gap-1.5 md:border-b-0 md:border-r md:px-0 md:py-3"
          >
            <div className="mr-2 hidden md:mb-3 md:mr-0 md:flex" aria-hidden>
              <svg viewBox="0 0 64 64" className="h-8 w-8">
                <rect x="4" y="4" width="56" height="56" rx="10" fill="none" stroke="#f5a623" strokeWidth="3.5" />
                <polyline points="12,40 20,40 25,20 32,48 38,28 44,36 52,36" fill="none" stroke="#f5a623" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="52" cy="36" r="4" fill="#2fbf71" />
                <circle cx="12" cy="40" r="4" fill="#f0576b" />
              </svg>
            </div>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onNavigate(item.id)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex h-9 w-9 items-center justify-center rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                      {active && (
                        <span className="absolute -left-[9px] hidden h-5 w-[3px] rounded-full bg-[var(--signal)] md:block" />
                      )}
                      {item.id === "runner" && envInfo?.activeRun && (
                        <span className="absolute right-0.5 top-0.5 h-2 w-2 animate-pulse rounded-full bg-[var(--signal)]" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-mono text-xs">
                    <span className="text-accent-foreground">{item.label}</span>
                    <span className="block text-muted-foreground">{item.hint}</span>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </nav>
        </TooltipProvider>

        {/* ---- main column ---- */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* status strip */}
          <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-panel/95 px-4 py-2 backdrop-blur">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-sm font-semibold tracking-[0.18em] text-foreground">
                CODE<span className="text-[var(--signal)]">_</span>BENCH
              </span>
              <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">v1.0.0</span>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground">
              {envInfo && (
                <>
                  <span className="hidden items-center gap-1.5 rounded-sm border border-border px-1.5 py-0.5 sm:inline-flex" title={envInfo.cpuModel ?? "CPU model unavailable"}>
                    <Server className="h-3 w-3" />
                    {envInfo.cpuCores ?? "?"}× CPU · {envInfo.os}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5",
                      envInfo.enginesAvailable === envInfo.enginesTotal
                        ? "border-emerald-800 text-emerald-300"
                        : "border-amber-800 text-amber-300"
                    )}
                    title="benchmark engines available"
                  >
                    <Activity className="h-3 w-3" />
                    engines {envInfo.enginesAvailable}/{envInfo.enginesTotal}
                  </span>
                  {envInfo.activeRun && (
                    <span className="inline-flex items-center gap-1.5 rounded-sm border border-[var(--signal)]/50 px-1.5 py-0.5 text-[var(--signal)]">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--signal)]" />
                      run {envInfo.activeRun.status} · {envInfo.activeRun.progress}%
                    </span>
                  )}
                </>
              )}
              <span className="hidden tabular md:inline">{clock}</span>
            </div>
          </header>

          <main className="min-w-0 flex-1 p-4 md:p-5">{children}</main>

          {/* sticky footer */}
          <footer className="mt-auto border-t border-border bg-panel/80 px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-muted-foreground">
              <span>
                CodeBench — Cross-Language Algorithm Benchmarking and Performance Analysis
              </span>
              <span>
                Copyright © 2026 Parsa Fathi · Apache-2.0 · measurements are environment-specific
              </span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

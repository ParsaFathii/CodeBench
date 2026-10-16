// CodeBench — Environment view: host, runtimes, engines, isolation policy
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useBenchStore } from "../store";
import { BenchPanel, EmptyState, KeyValue, StatusBadge, formatBytes, formatTime } from "../ui-kit";
import { Server, Cpu, ShieldCheck, Info } from "lucide-react";

export function EnvironmentView() {
  const { setView } = useBenchStore();
  const envQuery = useQuery({ queryKey: ["environment"], queryFn: api.environment, refetchInterval: 60_000 });
  const runsQuery = useQuery({ queryKey: ["runs"], queryFn: api.runs });

  const env = envQuery.data?.environment;
  const engines = envQuery.data?.engines ?? [];

  if (envQuery.isLoading) {
    return <div className="p-8 text-center font-mono text-xs text-muted-foreground">probing environment…</div>;
  }
  if (!env) {
    return <EmptyState icon={<Server className="h-8 w-8" />} title="Environment unavailable" hint="The API did not return environment metadata." />;
  }

  return (
    <div className="mx-auto grid max-w-[1300px] gap-4 lg:grid-cols-2">
      <BenchPanel
        title={
          <span className="inline-flex items-center gap-2">
            <Server className="h-3.5 w-3.5 text-[var(--signal)]" /> Host
          </span>
        }
        right={<span className="font-mono text-[10px] text-muted-foreground">captured {formatTime(env.capturedAt)}</span>}
      >
        <div className="grid gap-0.5">
          <KeyValue k="operating system" v={`${env.osPlatform} ${env.osVersion}`} />
          <KeyValue k="architecture" v={env.arch} />
          <KeyValue k="cpu model" v={env.cpuModel ?? "unavailable"} />
          <KeyValue k="logical cores" v={env.cpuCores != null ? String(env.cpuCores) : "unavailable"} />
          <KeyValue k="total memory" v={formatBytes(env.totalMemBytes ? Number(env.totalMemBytes) : null)} />
          <KeyValue k="host runtime" v={env.hostRuntime ?? "unavailable"} />
          <KeyValue k="load average (1m)" v={env.metadata.loadavg ? env.metadata.loadavg.join(" ") : "unavailable"} />
          <KeyValue k="project commit" v={env.commitSha?.slice(0, 12) ?? "unavailable (no git metadata)"} />
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-sm border border-border bg-panel-2/40 p-2.5 text-[10px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Metadata is read from the operating system at run time. Anything the host does not expose is reported as
          unavailable — never invented. Cloud/virtualized CPUs make absolute timings machine-specific.
        </div>
      </BenchPanel>

      <BenchPanel
        title={
          <span className="inline-flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5 text-[var(--signal)]" /> Benchmark engines
          </span>
        }
        right={<span className="font-mono text-[10px] text-muted-foreground">{engines.filter((e) => e.available).length}/{engines.length} available</span>}
        bodyClassName="p-0"
      >
        <div className="divide-y divide-border/60">
          {engines.map((e) => (
            <div key={e.language} className="px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[12px] text-foreground">{e.language.toUpperCase()}</span>
                <StatusBadge status={e.available ? "PASSED" : "FAILED"} />
              </div>
              <div className="mt-1 grid gap-0.5">
                <KeyValue k="harness" v={`${e.harness}${e.harnessVersion ? ` ${e.harnessVersion}` : ""}`} />
                <KeyValue k="runtime" v={e.runtime ?? "unavailable"} />
                <KeyValue k="status" v={e.detail} />
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
          C++: g++ -std=c++20 -O2 linked against Google Benchmark (static) · Java: javac -proc:full with the JMH
          annotation processor, single forked JVM (-Xms256m -Xmx1024m, gc profiler) · Python: CPython with pyperf
          worker-process isolation.
        </div>
      </BenchPanel>

      <BenchPanel
        title={
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--signal)]" /> Isolation & fairness policy
          </span>
        }
      >
        <ul className="grid gap-2 text-[11px] leading-relaxed text-muted-foreground">
          <li className="flex gap-2"><span className="text-[var(--signal)]">▸</span> Benchmark jobs execute strictly serially — one operating-system process at a time — so measurements never compete with each other for CPU.</li>
          <li className="flex gap-2"><span className="text-[var(--signal)]">▸</span> Each language keeps its professional harness (Google Benchmark, JMH, pyperf) with harness-appropriate warm-up and repetition handling.</li>
          <li className="flex gap-2"><span className="text-[var(--signal)]">▸</span> Inputs are generated deterministically per (dataset, size, seed) with a shared SplitMix64 — bit-identical across languages, proven by FNV-1a checksums before results count.</li>
          <li className="flex gap-2"><span className="text-[var(--signal)]">▸</span> Destructive algorithms (sorting) include the defensive input copy in the measured operation in every language — the same work is always timed.</li>
          <li className="flex gap-2"><span className="text-[var(--signal)]">▸</span> Hand-written vs standard-library variants are labelled categories; standard-library results reflect library engineering too.</li>
          <li className="flex gap-2"><span className="text-[var(--signal)]">▸</span> The coordinator host also serves this web app; for canonical publication-grade numbers use a dedicated quiet machine.</li>
        </ul>
      </BenchPanel>

      <BenchPanel title="Environment snapshots used by runs">
        {(runsQuery.data?.runs ?? []).length === 0 ? (
          <EmptyState title="No runs yet" hint="Each run pins the environment snapshot it measured under." action={<button className="font-mono text-[11px] text-[var(--signal)] underline" onClick={() => setView("workbench")}>Open Workbench</button>} />
        ) : (
          <div className="grid gap-1.5">
            {(runsQuery.data?.runs ?? []).slice(0, 6).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-sm border border-border bg-panel-2/40 px-2.5 py-1.5 font-mono text-[10px]">
                <span className="truncate">{r.id.slice(-8)} · {r.experimentName}</span>
                <span className="shrink-0 text-muted-foreground">{r.commitSha?.slice(0, 8) ?? "no commit"} · {formatTime(r.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </BenchPanel>
    </div>
  );
}

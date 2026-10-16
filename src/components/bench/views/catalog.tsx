// CodeBench — Algorithm Catalog view: the verified workload catalog
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useBenchStore } from "../store";
import { BenchPanel, CategoryBadge, EmptyState, LangTag } from "../ui-kit";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ALGORITHMS, buildCatalog } from "@/lib/bench/registry";
import { DATASET_LABELS } from "@/lib/bench/spec";
import { Library, Search, Play, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

const GROUPS = Array.from(new Set(ALGORITHMS.map((a) => a.categoryGroup)));

export function CatalogView() {
  const { setDraft, setDraftMeta, setView } = useBenchStore();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("all");

  const catalog = useMemo(() => buildCatalog(), []);
  const enginesQuery = useQuery({ queryKey: ["languages"], queryFn: api.languages, staleTime: 30_000 });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((c) => {
      if (group !== "all" && c.categoryGroup !== group) return false;
      if (!q) return true;
      return (
        c.variantName.toLowerCase().includes(q) ||
        c.variantKey.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.complexity.toLowerCase().includes(q)
      );
    });
  }, [catalog, query, group]);

  return (
    <div className="mx-auto max-w-[1400px]">
      <BenchPanel
        title={
          <span className="inline-flex items-center gap-2">
            <Library className="h-3.5 w-3.5 text-[var(--signal)]" /> Algorithm Catalog
          </span>
        }
        right={<span className="font-mono text-[10px] text-muted-foreground">{filtered.length} of {catalog.length} variants · every entry has working, verified implementations</span>}
        bodyClassName="p-0"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search variants, complexity, descriptions…"
              className="h-8 bg-panel-2 pl-8 font-mono text-xs"
              aria-label="search catalog"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {["all", ...GROUPS].map((g) => (
              <button
                key={g}
                onClick={() => setGroup(g)}
                className={cn(
                  "rounded-sm border px-2 py-1 font-mono text-[10px] transition-colors",
                  group === g ? "border-[var(--signal)]/70 bg-accent/50 text-accent-foreground" : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </BenchPanel>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((c) => (
          <article key={c.variantKey} className="flex flex-col rounded-md border border-border bg-panel p-3.5 transition-colors hover:border-[var(--signal)]/40">
            <header className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="font-mono text-[13px] font-semibold text-foreground">{c.variantName}</h3>
                  <CategoryBadge category={c.category} />
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{c.variantKey} · {c.categoryGroup}</div>
              </div>
              <span className="shrink-0 rounded-sm border border-border bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-[var(--signal)]">{c.complexity}</span>
            </header>

            <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">{c.description}</p>

            <div className="mt-2.5 rounded-sm border border-border/70 bg-panel-2/40 p-2">
              <div className="bench-label text-[9px]">measured operation</div>
              <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-foreground/80">{c.measuredOp}</p>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {c.languages.map((l) => (
                <LangTag key={l} language={l} />
              ))}
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                n ∈ {c.defaultSizes.map((s) => s.toLocaleString()).join(", ")}
                {c.maxSize ? ` (≤ ${c.maxSize.toLocaleString()})` : ""}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              {c.datasets.map((d) => (
                <span key={d} className="rounded-sm border border-dashed border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground" title={DATASET_LABELS[d as keyof typeof DATASET_LABELS] ?? d}>
                  {d}
                </span>
              ))}
            </div>

            {c.notes && <p className="mt-2 border-l-2 border-amber-700/60 pl-2 text-[10px] leading-relaxed text-amber-200/70">{c.notes}</p>}

            <footer className="mt-auto flex items-center gap-2 pt-3">
              <Button
                size="sm"
                variant="outline"
                className="h-7 font-mono text-[10px]"
                onClick={() => {
                  setDraft({
                    variants: [c.variantKey],
                    languages: [...c.languages],
                    datasetType: c.defaultDataset,
                    inputSizes: [...c.defaultSizes.filter((s) => !c.maxSize || s <= c.maxSize)],
                  });
                  setDraftMeta(`${c.variantName} — ${c.defaultDataset}`, `Single-variant experiment for ${c.variantKey}.`);
                  setView("workbench");
                }}
              >
                <Play className="h-3 w-3" /> Bench this
              </Button>
              <details className="ml-auto">
                <summary className="cursor-pointer list-none font-mono text-[10px] text-muted-foreground hover:text-foreground">
                  <FileText className="mr-1 inline h-3 w-3" />output contract
                </summary>
                <p className="mt-1 max-w-xs text-[10px] leading-relaxed text-muted-foreground">{c.outputContract}</p>
              </details>
            </footer>
          </article>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="mt-4">
          <EmptyState icon={<Library className="h-8 w-8" />} title="No matching variants" hint="Try a different search term or group filter." />
        </div>
      )}

      <p className="mt-4 text-center font-mono text-[10px] text-muted-foreground">
        engines: {enginesQuery.data?.engines.filter((e) => e.available).length ?? "?"}/{enginesQuery.data?.engines.length ?? "?"} available on this host — see Environment view for details
      </p>
    </div>
  );
}

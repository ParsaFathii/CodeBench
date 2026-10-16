# Changelog

All notable changes to CodeBench are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-10-16

First stable release.

### Benchmark platform
- 20 verified algorithm variants across 6 families (sorting, search, data structures, graphs, strings, matrix), each implemented in C++ (C++20), Java (21) and Python (3.12), plus a TypeScript reference implementation used as the correctness oracle.
- Real harnesses: Google Benchmark 1.9.4, JMH 1.37 (single fork + gc profiler), pyperf 2.10 (worker-process isolation).
- Deterministic, bit-identical inputs across languages via shared SplitMix64 generators; 9 dataset generators with documented value ranges.
- Correctness gate: FNV-1a 64 checksums over canonical inputs/outputs; fixed verify cases per family; cross-language equality enforced before results count (`scripts/verify-crosslang.ts` — 20/20 variants, 120 checksum comparisons).
- Experiment coordinator: serial queue, detached process groups with hard timeout kills, real per-job progress, cancellation, stale-run repair after server restarts.
- Statistics computed deterministically from raw observations: mean, median, sample stddev, p5/p25/p75/p95/p99, IQR, MAD, CV, 95 % t-interval; IQR outliers flagged and retained; stability classification (stable / moderate / unstable).
- Regression analysis with practical-significance threshold (default ±10 %) *and* pooled run-to-run variation; explicit INCONCLUSIVE verdicts.
- Reports: JSON, CSV, Markdown — including configuration, environment, methodology and limitations; raw harness output preserved per result.

### Web application
- Single-route instrument-bench UI (Next.js 16, React 19, TypeScript) with 10 views: Workbench, Catalog, Runner, Results, Compare, Regression, History, Environment, AI Insights, Settings.
- Hand-built SVG charts: log–log scaling curves, comparison bars with 95 % CI whiskers, observation distribution strips, sparklines.
- Distinct visual identity: dark lab-equipment theme, amber signal accent, per-language colors (C++ amber, Java rose, Python emerald), monospace data typography, sticky footer.

### API
- REST `/api/v1`: health, algorithms, languages, experiments (+ run/cancel/results/clone), runs (+ detail/raw), comparisons, reports, ai (status/analysis), environment, settings.

### AI assistant (optional)
- Provider abstraction: z-ai SDK, Ollama (local), or disabled.
- Evidence-grounded analysis: the model receives only stored results and environment metadata; structured output validated with zod; analyses referencing unknown variants or foreign run ids are rejected; AI output stored separately and can never modify measurements.

### Automation & docs
- GitHub Actions: ci (lint, build, cross-language gate, python checks), benchmark-smoke (launch/verify per engine — not for timing), security (CodeQL + dependency review), release (tag-driven with SHA256SUMS).
- Dependabot (npm + actions), CODEOWNERS, issue/PR templates.
- Documentation in English and Persian; original SVG architecture diagrams; real screenshots and GIF recordings of the working application.

### Known limitations
- Canonical demo runs were measured on a shared virtualized 2-core machine while the web app was running; treat them as methodology demonstrations, not publication-grade data.
- Java hash workloads box Long keys (idiomatic cost, labelled); CPython runs with PYTHONHASHSEED=0.
- GitHub Actions workflows have not yet executed on the remote (they will on first push).

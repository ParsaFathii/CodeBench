# Contributing to CodeBench

Thank you for considering a contribution. CodeBench's value rests on measurement integrity, so the contribution rules protect it.

## Ground rules

1. **Correctness before speed.** Every algorithm change must keep the cross-language verification gate green:
   ```bash
   bun scripts/verify-crosslang.ts
   # expected: 20/20 variants consistent across languages, 120 checksum comparisons
   ```
   A benchmark that measures the wrong thing is worse than no benchmark.

2. **No silent measurement-semantics changes.** If you change what a measured operation includes (copy costs, resets, allocation), update:
   - the measured-op contract in `src/lib/bench/registry.ts`,
   - **all three language engines + the TypeScript reference** identically,
   - `docs/BENCHMARK_METHODOLOGY.md` and `docs/fa/BENCHMARK_METHODOLOGY_FA.md`.

3. **Never fabricate data.** Do not add seed/demo values, do not "fix" failing measurements by deleting observations, do not mark failed verifications as passed. Empty states and failures are honest states.

4. **Schema changes are versioned.** Bump `WORKLOAD_SPEC_VERSION` / `RESULT_SCHEMA_VERSION` when semantics change; old results must not silently change meaning.

## Development setup

```bash
bun install
bun run db:push
bun run dev            # http://localhost:3000
bun run lint
```

Engine prerequisites and one-time toolchain setup (Temurin JDK 21, pyperf, cmake + Google Benchmark build) are described in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Adding an algorithm variant — checklist

1. Implement the algorithm **identically** in:
   - `engines/cpp/codebench.cpp`
   - `engines/java/src/codebench/Algorithms.java` (+ a `@Benchmark` method in `Benchmarks.java`, + verify branch)
   - `engines/python/codebench_algorithms.py` (+ op in `codebench_bench.py`)
2. Implement the **reference** in `src/lib/bench/reference.ts` (`runReference` switch).
3. Register the variant in `src/lib/bench/registry.ts` with category, complexity, measured-op contract and language notes.
4. Add/extend the fixed verify case set if the family is new (`verifyCasesFor` + the engine-side case lists).
5. Run the gate: `bun scripts/verify-crosslang.ts` — it must pass in **all** languages.
6. Update `docs/ALGORITHMS.md` and `docs/fa/ALGORITHMS_FA.md`.

## Adding a dataset generator

Datasets must be derived from SplitMix64 with a documented, identical consumption order in every language, and must be added to the canonical input encoding (`canonicalInputFor` in all four implementations).

## Pull requests

- Keep PRs focused; describe *what* and *why*.
- Confirm the PR template checklist (gate passed, docs updated, semantics documented).
- Screenshots/GIFs for UI changes are appreciated — real ones only.

## Reporting bugs

Use the bug report template. Include the run id, the Runner console excerpt, the Environment view output, and whether verification passed — those four pieces reproduce most issues.

## Copyright

By contributing you agree that your contributions are licensed under Apache-2.0, with the project's original materials copyrighted by Parsa Fathi.

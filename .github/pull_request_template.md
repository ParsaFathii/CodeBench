## Summary

<!-- What does this PR change and why? If it touches measurement semantics in
     any way, explain exactly what changed and why the numbers remain
     comparable (or why they intentionally do not). -->

## Checklist

<!-- The cross-language correctness gate is the primary test of this
     repository — run it before requesting review
     (docs/DEVELOPMENT.md, "The cross-language correctness gate"). -->

- [ ] Correctness gate passed locally: `bun scripts/verify-crosslang.ts`
      (expected: `20/20 variants consistent across languages, 120 checksum comparisons`)
- [ ] No changes to raw measurement semantics (measured-op contracts, warm-up mapping, dataset generation, verification cases) — or `docs/BENCHMARK_METHODOLOGY.md` and `docs/fa/BENCHMARK_METHODOLOGY_FA.md` were updated to match
- [ ] Schema changes versioned — persisted shapes (Prisma schema, result / workload spec versions in `src/lib/bench/spec.ts`) were bumped if incompatible
- [ ] English docs (`docs/`) and Persian docs (`docs/fa/`) updated for any user-facing or feature change
- [ ] New algorithm variants followed the full checklist in `docs/DEVELOPMENT.md` (all four implementations + registry + gate list) — skip if not applicable

## Testing

<!-- How you verified the change: gate output, a smoke experiment through the
     public API (`scripts/seed-demo-data.sh`), curl against /api/v1, UI checks. -->

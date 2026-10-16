// CodeBench — deterministic PRNG and checksumming (shared contract)
//
// SplitMix64 and FNV-1a 64 are implemented bit-identically in:
//   TypeScript (this file, the reference implementation)
//   C++        engines/cpp/codebench.cpp
//   Java       engines/java/src/codebench/Algorithms.java
//   Python     engines/python/codebench_algorithms.py
//
// All benchmark inputs are derived from these generators, which is what makes
// cross-language inputs logically identical for the same (dataset, size, seed).
//
// Seed policy: the experiment seed is hashed once through splitmix64 before
// use, so sequential experiment seeds do not produce correlated streams.

const MASK64 = (1n << 64n) - 1n;
const GOLDEN = 0x9e3779b97f4a7c15n;

export class SplitMix64 {
  private state: bigint;

  constructor(seed: number | bigint) {
    // hash the seed once so nearby seeds decorrelate
    let s = (BigInt(seed) & MASK64) + GOLDEN;
    s = mix(s);
    this.state = s & MASK64;
  }

  /** next raw 64-bit value (unsigned) */
  next(): bigint {
    this.state = (this.state + GOLDEN) & MASK64;
    return mix(this.state);
  }

  /** uniform integer in [lo, hi] (inclusive). Modulo bias is documented:
   * identical in every language, so datasets remain bit-identical. */
  randInt(lo: number, hi: number): number {
    const range = BigInt(hi - lo + 1);
    return lo + Number(this.next() % range);
  }
}

function mix(z0: bigint): bigint {
  let z = z0 & MASK64;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
  return (z ^ (z >> 31n)) & MASK64;
}

// ---------------------------------------------------------------------------
// FNV-1a 64 over UTF-8 text — canonical checksum for all verification
// ---------------------------------------------------------------------------

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

export function fnv1a64(input: string): string {
  let hash = FNV_OFFSET;
  // Text is ASCII (decimal digits, commas, letters) in all canonical encodings;
  // a defensive UTF-8 encoder is kept for correctness on non-ASCII input.
  const bytes = Buffer.from(input, "utf8");
  for (const b of bytes) {
    hash ^= BigInt(b);
    hash = (hash * FNV_PRIME) & MASK64;
  }
  return hash.toString(16).padStart(16, "0");
}

/** canonical encoding of an integer array: "v1,v2,...,vn" */
export function encodeInts(values: ArrayLike<number>): string {
  const parts: string[] = [];
  for (let i = 0; i < values.length; i++) parts.push(String(values[i]));
  return parts.join(",");
}

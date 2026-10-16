// CodeBench — algorithm catalog / benchmark registry
//
// Every entry below corresponds to a real, verified implementation in
// engines/cpp, engines/java and engines/python. Variant ids are canonical and
// shared by all language runners and the TypeScript reference implementation
// (src/lib/bench/reference.ts) used for correctness verification.

import type { DatasetType, ImplementationCategory, Language } from "./spec";

export interface VariantSpec {
  id: string; // e.g. "merge_sort"
  name: string; // e.g. "Merge sort"
  category: ImplementationCategory;
  languages: Language[];
  complexity: string; // e.g. "O(n log n)"
  description: string;
  /** what exactly one measured operation performs */
  measuredOp: string;
  notes?: string;
  maxSize?: number; // hard cap for configurable input size
}

export interface AlgorithmSpec {
  id: string; // e.g. "sorting"
  name: string; // e.g. "Sorting"
  categoryGroup: string;
  description: string;
  datasets: DatasetType[];
  defaultSizes: number[];
  defaultDataset: DatasetType;
  /** canonical output contract for verification */
  outputContract: string;
  variants: VariantSpec[];
}

export const ALGORITHMS: AlgorithmSpec[] = [
  {
    id: "sorting",
    name: "Sorting",
    categoryGroup: "Sorting",
    description:
      "Comparison sorts over signed 32-bit integer arrays. All hand-written variants implement the same algorithmic structure in each language; the standard-library variant is labelled separately and must not be read as an algorithm-only comparison.",
    datasets: ["random_int", "sorted", "reverse_sorted", "nearly_sorted", "duplicate_heavy"],
    defaultDataset: "random_int",
    defaultSizes: [10000, 100000],
    outputContract:
      "Array sorted in non-decreasing order. Canonical form: comma-joined decimal values of the sorted array.",
    variants: [
      {
        id: "merge_sort",
        name: "Merge sort",
        category: "hand-written",
        languages: ["cpp", "java", "python"],
        complexity: "O(n log n)",
        description:
          "Top-down merge sort with an auxiliary buffer allocated once per operation. The merge step is the classic two-run merge.",
        measuredOp: "Copy the pristine input array and sort the copy in place (copy is part of the measured op because the algorithm is destructive).",
        notes: "Measured op includes the defensive input copy so every repetition sees identical input.",
      },
      {
        id: "quick_sort",
        name: "Quicksort",
        category: "hand-written",
        languages: ["cpp", "java", "python"],
        complexity: "O(n log n) avg",
        description:
          "Quicksort with median-of-three pivot selection and insertion-sort cutoff for sub-ranges of 16 elements or fewer.",
        measuredOp: "Copy the pristine input array and sort the copy in place (copy is part of the measured op).",
      },
      {
        id: "heap_sort",
        name: "Heap sort",
        category: "hand-written",
        languages: ["cpp", "java", "python"],
        complexity: "O(n log n)",
        description:
          "In-place heap sort: max-heapify phase followed by repeated root extraction with sift-down.",
        measuredOp: "Copy the pristine input array and sort the copy in place (copy is part of the measured op).",
      },
      {
        id: "insertion_sort",
        name: "Insertion sort",
        category: "hand-written",
        languages: ["cpp", "java", "python"],
        complexity: "O(n²)",
        description:
          "Textbook insertion sort. Included because quadratic behaviour on small or nearly-sorted inputs is a genuinely useful comparison point, not a pathology to hide.",
        measuredOp: "Copy the pristine input array and sort the copy in place (copy is part of the measured op).",
        maxSize: 4096,
      },
      {
        id: "std_sort",
        name: "Standard-library sort",
        category: "standard-library",
        languages: ["cpp", "java", "python"],
        complexity: "O(n log n)",
        description:
          "std::sort (C++), Arrays.sort for int[] (Java, dual-pivot quicksort), list.sort (CPython, Timsort). This variant compares language standard libraries, not equivalent hand-written algorithms.",
        measuredOp: "Copy the pristine input array and sort the copy with the standard-library routine (copy included).",
        notes: "Category: standard-library — differences vs hand-written variants reflect library engineering as well as language runtime.",
      },
    ],
  },
  {
    id: "search",
    name: "Search",
    categoryGroup: "Search",
    description:
      "Lookup workloads over a sorted array of n distinct even integers with a deterministic mixed hit/miss query set of n queries (even indices are hits, odd indices are misses).",
    datasets: ["search_mixed"],
    defaultDataset: "search_mixed",
    defaultSizes: [16384, 131072],
    outputContract:
      "Canonical form: comma-joined per-query results over the full query set (index of the key, or -1 on miss).",
    variants: [
      {
        id: "linear_search",
        name: "Linear search",
        category: "hand-written",
        languages: ["cpp", "java", "python"],
        complexity: "O(n) per query",
        description: "Sequential scan comparing signed 64-bit keys.",
        measuredOp: "One query against the n-element array (queries cycle through the deterministic query set).",
      },
      {
        id: "binary_search",
        name: "Binary search",
        category: "hand-written",
        languages: ["cpp", "java", "python"],
        complexity: "O(log n) per query",
        description: "Classic half-interval search over the sorted array with the same hit/miss query set.",
        measuredOp: "One query against the n-element array (queries cycle through the deterministic query set).",
      },
      {
        id: "hash_lookup",
        name: "Hash-table lookup",
        category: "standard-library",
        languages: ["cpp", "java", "python"],
        complexity: "O(1) avg per query",
        description:
          "std::unordered_map<long,long> (C++), HashMap<Long,Long> boxed (Java), dict (CPython open addressing). Table construction is untimed setup; only lookups are measured.",
        measuredOp: "One lookup in a pre-built table of n entries (queries cycle through the deterministic query set).",
        notes: "Category: standard-library — the Java variant boxes Long keys, which is part of the idiomatic cost being measured.",
      },
    ],
  },
  {
    id: "datastructures",
    name: "Data structures",
    categoryGroup: "Data structures",
    description:
      "Whole-structure operation cycles over element streams of signed 32-bit integers. One operation always means one full cycle so that per-op times scale with the input size.",
    datasets: ["random_int"],
    defaultDataset: "random_int",
    defaultSizes: [16384, 131072],
    outputContract:
      "Canonical form depends on the variant: drained element order (queue / priority queue), final array contents (dynamic array), or lookup results plus final size (hash map).",
    variants: [
      {
        id: "dynamic_array",
        name: "Dynamic array build",
        category: "hand-written",
        languages: ["cpp", "java", "python"],
        complexity: "O(n) amortized",
        description:
          "Append n elements into a growable array starting from empty. C++ uses std::vector growth policy, Java ArrayList, CPython list — the amortized growth behaviour of each runtime is the subject of the measurement.",
        measuredOp: "Build a fresh dynamic array by appending all n elements of the pristine stream.",
        notes: "Uses each language's native growable array; growth policy differences are part of the measured behaviour and are documented per language.",
      },
      {
        id: "queue_ops",
        name: "Queue cycle",
        category: "hand-written",
        languages: ["cpp", "java", "python"],
        complexity: "O(n)",
        description:
          "Enqueue n elements into a FIFO queue and dequeue all of them. C++ std::deque, Java ArrayDeque, CPython collections.deque.",
        measuredOp: "One full enqueue-all + dequeue-all cycle on a fresh queue.",
      },
      {
        id: "priority_queue_ops",
        name: "Priority queue cycle (hand-written heap)",
        category: "hand-written",
        languages: ["cpp", "java", "python"],
        complexity: "O(n log n)",
        description:
          "Push n elements into a hand-written binary min-heap, then pop all of them. The heap implementation (sift-up/sift-down) is written by hand in all three languages.",
        measuredOp: "One full push-all + pop-all cycle on a fresh hand-written binary heap.",
      },
      {
        id: "pq_std",
        name: "Priority queue cycle (standard library)",
        category: "standard-library",
        languages: ["cpp", "java", "python"],
        complexity: "O(n log n)",
        description:
          "std::priority_queue with std::greater (C++), java.util.PriorityQueue (Java), heapq (CPython). Labelled separately from the hand-written heap.",
        measuredOp: "One full push-all + pop-all cycle on a fresh standard-library priority queue.",
      },
      {
        id: "hash_map_ops",
        name: "Hash-map cycle",
        category: "standard-library",
        languages: ["cpp", "java", "python"],
        complexity: "O(n) avg",
        description:
          "Insert n (key,value) pairs, look up all n keys, then delete all n keys. std::unordered_map (C++), HashMap<Long,Long> (Java), dict (CPython).",
        measuredOp: "One full insert-all + lookup-all + delete-all cycle on a fresh map.",
      },
    ],
  },
  {
    id: "graphs",
    name: "Graph traversal",
    categoryGroup: "Graphs",
    description:
      "Traversals over a sparse directed graph with n nodes and 6n edges (weights in [1, 1000]) generated deterministically. The traversal algorithms are hand-written in every language; container types (deque / array list) are the language's standard ones and this is documented.",
    datasets: ["graph_sparse"],
    defaultDataset: "graph_sparse",
    defaultSizes: [1024, 4096],
    outputContract:
      "BFS/DFS: comma-joined visit order. Dijkstra: comma-joined shortest distances from the source (-1 for unreachable).",
    variants: [
      {
        id: "bfs",
        name: "Breadth-first search",
        category: "hand-written",
        languages: ["cpp", "java", "python"],
        complexity: "O(V + E)",
        description: "BFS from node 0 with a visited flag array and a FIFO queue.",
        measuredOp: "One full traversal from source 0 (includes clearing the visited array for this repetition).",
      },
      {
        id: "dfs",
        name: "Depth-first search",
        category: "hand-written",
        languages: ["cpp", "java", "python"],
        complexity: "O(V + E)",
        description: "Iterative DFS from node 0 using an explicit stack.",
        measuredOp: "One full traversal from source 0 (includes clearing the visited array for this repetition).",
      },
      {
        id: "dijkstra",
        name: "Dijkstra shortest path",
        category: "hand-written",
        languages: ["cpp", "java", "python"],
        complexity: "O((V + E) log V)",
        description:
          "Dijkstra from node 0 with a distance array and a binary min-heap priority queue (hand-written in C++ and Python via a shared sift logic, java.util.PriorityQueue in Java — noted per language).",
        measuredOp: "One full single-source shortest-path run from source 0.",
        notes: "C++/Python use a hand-written indexed binary heap; Java uses java.util.PriorityQueue with lazy deletion. The distance array initialization is part of the measured op.",
      },
    ],
  },
  {
    id: "strings",
    name: "String matching",
    categoryGroup: "Strings",
    description:
      "Substring search of a fixed 32-character pattern over an A/C/G/T corpus of length n. The pattern is also inserted once at a deterministic position so at least one match exists.",
    datasets: ["text_corpus"],
    defaultDataset: "text_corpus",
    defaultSizes: [100000, 1000000],
    outputContract: "Canonical form: match count, then comma-joined match offsets.",
    variants: [
      {
        id: "naive_search",
        name: "Naive substring search",
        category: "hand-written",
        languages: ["cpp", "java", "python"],
        complexity: "O(n·m)",
        description: "Sliding-window comparison of the pattern against every corpus position.",
        measuredOp: "One full scan of the corpus for the fixed pattern.",
      },
      {
        id: "kmp",
        name: "Knuth–Morris–Pratt",
        category: "hand-written",
        languages: ["cpp", "java", "python"],
        complexity: "O(n + m)",
        description: "KMP with a failure function computed once per operation over the pattern.",
        measuredOp: "One full scan of the corpus for the fixed pattern (failure-table construction included).",
      },
    ],
  },
  {
    id: "matrix",
    name: "Matrix multiplication",
    categoryGroup: "Matrix operations",
    description:
      "C = A × B over n×n matrices of signed 32-bit integers in [-100, 100]. The result matrix is pre-allocated outside the measured op and reset to zero at the start of every operation (identical contract in all languages).",
    datasets: ["bounded_matrix"],
    defaultDataset: "bounded_matrix",
    defaultSizes: [64, 128],
    outputContract: "Canonical form: comma-joined row-major values of the product matrix.",
    variants: [
      {
        id: "matmul_naive",
        name: "Naive row-major (i-j-k)",
        category: "hand-written",
        languages: ["cpp", "java", "python"],
        complexity: "O(n³)",
        description: "Triple loop in i-j-k order with row-major accumulation into C.",
        measuredOp: "One full C = A × B multiplication.",
      },
      {
        id: "matmul_ikj",
        name: "Loop-order variant (i-k-j)",
        category: "hand-written",
        languages: ["cpp", "java", "python"],
        complexity: "O(n³)",
        description:
          "Same arithmetic, i-k-j loop order. Improves locality and removes the inner-loop dot-product dependency chain; the effect differs per language and is exactly what this variant exists to show.",
        measuredOp: "One full C = A × B multiplication.",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

export function findAlgorithm(id: string): AlgorithmSpec | undefined {
  return ALGORITHMS.find((a) => a.id === id);
}

export function findVariant(variantKey: string): { algorithm: AlgorithmSpec; variant: VariantSpec } | undefined {
  const [algoId, variantId] = variantKey.split(".");
  const algorithm = findAlgorithm(algoId);
  const variant = algorithm?.variants.find((v) => v.id === variantId);
  if (!algorithm || !variant) return undefined;
  return { algorithm, variant };
}

export interface CatalogEntry {
  variantKey: string;
  algorithmId: string;
  algorithmName: string;
  variantId: string;
  variantName: string;
  category: ImplementationCategory;
  categoryGroup: string;
  languages: Language[];
  complexity: string;
  description: string;
  measuredOp: string;
  notes?: string;
  datasets: DatasetType[];
  defaultDataset: DatasetType;
  defaultSizes: number[];
  maxSize?: number;
  outputContract: string;
}

export function buildCatalog(): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const algo of ALGORITHMS) {
    for (const v of algo.variants) {
      entries.push({
        variantKey: `${algo.id}.${v.id}`,
        algorithmId: algo.id,
        algorithmName: algo.name,
        variantId: v.id,
        variantName: v.name,
        category: v.category,
        categoryGroup: algo.categoryGroup,
        languages: v.languages,
        complexity: v.complexity,
        description: v.description,
        measuredOp: v.measuredOp,
        notes: v.notes,
        datasets: algo.datasets,
        defaultDataset: algo.defaultDataset,
        defaultSizes: algo.defaultSizes,
        maxSize: v.maxSize,
        outputContract: algo.outputContract,
      });
    }
  }
  return entries;
}

/** All dataset types actually referenced by the catalog (for validation). */
export const USED_DATASETS: DatasetType[] = Array.from(
  new Set(ALGORITHMS.flatMap((a) => a.datasets))
) as DatasetType[];

export const WORKLOAD_SPEC_VERSION = "1.0.0";

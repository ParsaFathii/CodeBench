#!/usr/bin/env bash
# Seed remaining CodeBench demo experiments — foreground runner (one experiment
# per invocation; the coordinator executes runs serially anyway).
# Usage: bash scripts/seed-one.sh <index>
set -e
BASE="http://localhost:3000/api/v1"
IDX="$1"

wait_run() {
  local run_id="$1" name="$2"
  for i in $(seq 1 110); do
    status=$(curl -s "$BASE/runs/$run_id" | python3 -c "import json,sys; print(json.load(sys.stdin)['status'])" 2>/dev/null || echo "POLL-ERROR")
    if [ "$status" = "COMPLETED" ] || [ "$status" = "FAILED" ] || [ "$status" = "CANCELLED" ]; then
      echo "[seed] $name finished: $status"
      if [ "$status" != "COMPLETED" ]; then
        curl -s "$BASE/runs/$run_id" | python3 -c "import json,sys; d=json.load(sys.stdin); print('error:', d.get('error')); [print(' fail:', r.get('error','')[:120]) for r in d.get('results',[]) if r.get('status')!='COMPLETED']"
      fi
      return 0
    fi
    sleep 5
  done
  echo "[seed] WARNING: $name still running after ~9 min"
}

launch() {
  local name="$1" description="$2" config="$3"
  local exp_id run_id
  exp_id=$(curl -s -X POST "$BASE/experiments" -H "Content-Type: application/json" \
    -d "{\"name\": \"$name\", \"description\": \"$description\", \"config\": $config}" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
  echo "[seed] experiment $name -> $exp_id"
  run_id=$(curl -s -X POST "$BASE/experiments/$exp_id/run" | python3 -c "import json,sys; print(json.load(sys.stdin)['runId'])")
  echo "[seed] run -> $run_id"
  wait_run "$run_id" "$name"
}

case "$IDX" in
  2)
    launch "Search workloads — hit/miss query set" \
      "Linear, binary and hash lookup over a sorted array with a deterministic mixed hit/miss query set. Hash-table lookup uses each language's standard map (boxed Long keys in Java — idiomatic cost, documented)." \
      '{"variants": ["search.linear_search", "search.binary_search", "search.hash_lookup"], "languages": ["cpp", "java", "python"], "datasetType": "search_mixed", "inputSizes": [16384], "seed": 20261016, "warmup": 2, "repetitions": 5, "timeoutMs": 240000, "benchmarkMode": "avgt", "continueOnError": true}'
    launch "Data-structure operation cycles" \
      "Dynamic-array build, queue cycle, priority-queue cycles (hand-written binary heap vs standard library) and hash-map insert/lookup/delete cycles over random integer streams." \
      '{"variants": ["datastructures.dynamic_array", "datastructures.queue_ops", "datastructures.priority_queue_ops", "datastructures.pq_std", "datastructures.hash_map_ops"], "languages": ["cpp", "java", "python"], "datasetType": "random_int", "inputSizes": [16384], "seed": 20261016, "warmup": 2, "repetitions": 5, "timeoutMs": 240000, "benchmarkMode": "avgt", "continueOnError": true}'
    ;;
  3)
    launch "Graph traversal on sparse graphs" \
      "BFS, iterative DFS and Dijkstra (binary heap) over sparse directed graphs with 6 edges per node." \
      '{"variants": ["graphs.bfs", "graphs.dfs", "graphs.dijkstra"], "languages": ["cpp", "java", "python"], "datasetType": "graph_sparse", "inputSizes": [1024, 4096], "seed": 20261016, "warmup": 2, "repetitions": 5, "timeoutMs": 240000, "benchmarkMode": "avgt", "continueOnError": true}'
    ;;
  4)
    launch "String matching over a genetic corpus" \
      "Naive substring search vs KMP over an A/C/G/T corpus of 100k characters with a fixed 32-character pattern." \
      '{"variants": ["strings.naive_search", "strings.kmp"], "languages": ["cpp", "java", "python"], "datasetType": "text_corpus", "inputSizes": [100000, 1000000], "seed": 20261016, "warmup": 2, "repetitions": 5, "timeoutMs": 240000, "benchmarkMode": "avgt", "continueOnError": true}'
    ;;
  5)
    launch "Matrix multiplication loop order" \
      "Naive i-j-k vs locality-optimized i-k-j loop order over bounded integer matrices." \
      '{"variants": ["matrix.matmul_naive", "matrix.matmul_ikj"], "languages": ["cpp", "java", "python"], "datasetType": "bounded_matrix", "inputSizes": [64, 128], "seed": 20261016, "warmup": 2, "repetitions": 3, "timeoutMs": 300000, "benchmarkMode": "avgt", "continueOnError": true}'
    ;;
  6)
    launch "Sorting across C++ / Java / Python" \
      "Merge, quick, heap and standard-library sorts over random integers at two input sizes — the flagship cross-language comparison with scaling curves." \
      '{"variants": ["sorting.merge_sort", "sorting.quick_sort", "sorting.heap_sort", "sorting.std_sort"], "languages": ["cpp", "java", "python"], "datasetType": "random_int", "inputSizes": [10000, 100000], "seed": 20261016, "warmup": 2, "repetitions": 5, "timeoutMs": 240000, "benchmarkMode": "avgt", "continueOnError": true}'
    ;;
  7)
    launch "Nearly-sorted insertion behaviour" \
      "Insertion sort vs quicksort and the standard library on nearly-sorted inputs — where quadratic algorithms stop being a pathology." \
      '{"variants": ["sorting.insertion_sort", "sorting.quick_sort", "sorting.std_sort"], "languages": ["cpp", "java", "python"], "datasetType": "nearly_sorted", "inputSizes": [1024, 4096], "seed": 20261016, "warmup": 2, "repetitions": 5, "timeoutMs": 240000, "benchmarkMode": "avgt", "continueOnError": true}'
    ;;
  *)
    echo "unknown experiment index: $IDX (2-7)"; exit 1;;
esac

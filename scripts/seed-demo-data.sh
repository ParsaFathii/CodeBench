#!/usr/bin/env bash
# Seed CodeBench with REAL demo experiments (executed through the public API,
# exactly like a user would). These runs produce the genuine measurements that
# populate Results / Compare / Regression / AI views.
set -e
BASE="http://localhost:3000/api/v1"

run_experiment() {
  local name="$1" description="$2" config="$3"
  local exp_id run_id
  exp_id=$(curl -s -X POST "$BASE/experiments" -H "Content-Type: application/json" \
    -d "{\"name\": \"$name\", \"description\": \"$description\", \"config\": $config}" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
  echo "[seed] experiment $name -> $exp_id"
  run_id=$(curl -s -X POST "$BASE/experiments/$exp_id/run" | python3 -c "import json,sys; print(json.load(sys.stdin)['runId'])")
  echo "[seed] run -> $run_id"
  # wait for completion (poll every 5s, up to 20 min)
  for i in $(seq 1 240); do
    status=$(curl -s "$BASE/runs/$run_id" | python3 -c "import json,sys; print(json.load(sys.stdin)['status'])")
    if [ "$status" = "COMPLETED" ] || [ "$status" = "FAILED" ] || [ "$status" = "CANCELLED" ]; then
      echo "[seed] $name finished: $status"
      [ "$status" = "FAILED" ] && curl -s "$BASE/runs/$run_id" | python3 -c "import json,sys; print(json.load(sys.stdin).get('error'))"
      return 0
    fi
    sleep 5
  done
  echo "[seed] WARNING: $name still running after 20 min"
}

echo "=== [1/5] Cross-language sorting (scaling curves) ==="
run_experiment "Sorting across C++ / Java / Python" \
  "Merge, quick, heap and standard-library sorts over random integers at two input sizes — the flagship cross-language comparison with scaling curves." \
  '{"variants": ["sorting.merge_sort", "sorting.quick_sort", "sorting.heap_sort", "sorting.std_sort"], "languages": ["cpp", "java", "python"], "datasetType": "random_int", "inputSizes": [10000, 100000], "seed": 20261016, "warmup": 2, "repetitions": 5, "timeoutMs": 240000, "benchmarkMode": "avgt", "continueOnError": true}'

echo "=== [2/5] Search & data structures ==="
run_experiment "Search and data-structure workloads" \
  "Linear/binary search and hash lookup over a mixed hit-miss query set, plus dynamic-array, queue, priority-queue (hand-written vs stdlib) and hash-map cycles." \
  '{"variants": ["search.linear_search", "search.binary_search", "search.hash_lookup", "datastructures.dynamic_array", "datastructures.queue_ops", "datastructures.priority_queue_ops", "datastructures.pq_std", "datastructures.hash_map_ops"], "languages": ["cpp", "java", "python"], "datasetType": "search_mixed", "inputSizes": [16384], "seed": 20261016, "warmup": 2, "repetitions": 5, "timeoutMs": 240000, "benchmarkMode": "avgt", "continueOnError": true}'

echo "=== [3/5] Graph traversal ==="
run_experiment "Graph traversal on sparse graphs" \
  "BFS, iterative DFS and Dijkstra (binary heap) over sparse directed graphs with 6 edges per node." \
  '{"variants": ["graphs.bfs", "graphs.dfs", "graphs.dijkstra"], "languages": ["cpp", "java", "python"], "datasetType": "graph_sparse", "inputSizes": [1024, 4096], "seed": 20261016, "warmup": 2, "repetitions": 5, "timeoutMs": 240000, "benchmarkMode": "avgt", "continueOnError": true}'

echo "=== [4/5] String matching + matrix ==="
run_experiment "String matching and matrix multiplication" \
  "Naive substring search vs KMP over an A/C/G/T corpus, plus naive vs i-k-j loop-order matrix multiplication." \
  '{"variants": ["strings.naive_search", "strings.kmp", "matrix.matmul_naive", "matrix.matmul_ikj"], "languages": ["cpp", "java", "python"], "datasetType": "text_corpus", "inputSizes": [100000], "seed": 20261016, "warmup": 2, "repetitions": 5, "timeoutMs": 240000, "benchmarkMode": "avgt", "continueOnError": true}'

run_experiment "Matrix multiplication loop order" \
  "Naive i-j-k vs locality-optimized i-k-j loop order over bounded integer matrices." \
  '{"variants": ["matrix.matmul_naive", "matrix.matmul_ikj"], "languages": ["cpp", "java", "python"], "datasetType": "bounded_matrix", "inputSizes": [64, 128], "seed": 20261016, "warmup": 2, "repetitions": 3, "timeoutMs": 300000, "benchmarkMode": "avgt", "continueOnError": true}'

echo "=== [5/5] Sorting re-run (regression baseline vs candidate) ==="
run_experiment "Sorting across C++ / Java / Python" \
  "Merge, quick, heap and standard-library sorts over random integers at two input sizes — the flagship cross-language comparison with scaling curves." \
  '{"variants": ["sorting.merge_sort", "sorting.quick_sort", "sorting.heap_sort", "sorting.std_sort"], "languages": ["cpp", "java", "python"], "datasetType": "random_int", "inputSizes": [10000, 100000], "seed": 20261016, "warmup": 2, "repetitions": 5, "timeoutMs": 240000, "benchmarkMode": "avgt", "continueOnError": true}'

echo "[seed] all demo experiments done"

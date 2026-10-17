#!/usr/bin/env bash
# CodeBench — provision local benchmark toolchains
#
# Installs/compiles everything the engine layer probes for:
#   * Python: pyperf (harness)
#   * C++:    Google Benchmark (source build, static lib)
#   * Java:   JDK installation path hint (JMH jars are committed in engines/java/lib)
#
# Everything lives under .cache/ (gitignored). Safe to re-run; existing
# artifacts are kept unless REBUILD=1 is set.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_DIR="$PROJECT_ROOT/.cache"
GB_DIR="$CACHE_DIR/benchdeps/benchmark"
GB_VERSION="1.9.4"

log() { printf '\033[1;32m[setup-toolchain]\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------- Python
PY="${CODEBENCH_PYTHON:-python3}"
if "$PY" -c "import pyperf" >/dev/null 2>&1; then
  log "Python: pyperf already installed ($("$PY" -c 'import pyperf; print(pyperf.__version__)'))"
else
  log "Python: installing pyperf…"
  if "$PY" -m pip install pyperf >/dev/null 2>&1; then
    log "Python: pyperf installed"
  elif "$PY" -m pip install --break-system-packages pyperf >/dev/null 2>&1; then
    log "Python: pyperf installed (PEP 668 override)"
  else
    log "Python: WARNING — could not install pyperf automatically; run: $PY -m pip install pyperf"
  fi
fi

# ---------------------------------------------------------------- C++ (Google Benchmark)
GB_LIB="$GB_DIR/build/src/libbenchmark.a"
if [[ -f "$GB_LIB" && "${REBUILD:-0}" != "1" ]]; then
  log "C++: Google Benchmark already built at $GB_LIB"
else
  log "C++: building Google Benchmark v$GB_VERSION (needs cmake + g++)…"
  mkdir -p "$GB_DIR"
  TMP_SRC="$(mktemp -d)"
  trap 'rm -rf "$TMP_SRC"' EXIT
  if ! command -v cmake >/dev/null 2>&1; then
    log "C++: WARNING — cmake not found; install cmake and re-run this script"
  else
    curl -fsSL "https://github.com/google/benchmark/archive/refs/tags/v$GB_VERSION.tar.gz" \
      | tar -xz -C "$TMP_SRC" --strip-components=1
    cmake -S "$TMP_SRC" -B "$GB_DIR/build" \
      -DBENCHMARK_ENABLE_GTEST_TESTS=OFF -DBENCHMARK_ENABLE_TESTING=OFF \
      -DCMAKE_BUILD_TYPE=Release >/dev/null
    cmake --build "$GB_DIR/build" -j "$(nproc)" >/dev/null
    cp -r "$TMP_SRC/include" "$GB_DIR/include"
    log "C++: Google Benchmark built at $GB_LIB"
  fi
fi

# ---------------------------------------------------------------- Java
JDK_HOME="${CODEBENCH_JDK_HOME:-/home/z/.jdk}"
if [[ -x "$JDK_HOME/bin/javac" ]]; then
  log "Java: JDK found at $JDK_HOME"
else
  log "Java: no JDK at $JDK_HOME — install one (e.g. temurin) and set CODEBENCH_JDK_HOME, or:"
  log "      sudo apt-get install -y openjdk-21-jdk && export CODEBENCH_JDK_HOME=/usr/lib/jvm/java-21-openjdk-amd64"
fi

log "Done. Re-check availability at GET /api/v1/environment (probe cache refreshes every 30 s)."

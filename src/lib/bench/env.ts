// CodeBench — environment metadata capture
//
// Captures what is actually available on the host. Unavailable metadata is
// reported as null — never fabricated.

import { execFile } from "child_process";
import os from "os";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface EnvironmentSnapshot {
  osPlatform: string;
  osVersion: string;
  arch: string;
  cpuModel: string | null;
  cpuCores: number | null;
  totalMemBytes: string | null;
  hostRuntime: string | null;
  commitSha: string | null;
  capturedAt: string;
  metadata: {
    nodeVersion: string | null;
    loadavg: number[] | null;
    freeMemBytes: number | null;
    uptimeSec: number | null;
    isolationPolicy: string;
    notes: string[];
  };
}

export async function captureEnvironment(commitSha: string | null): Promise<EnvironmentSnapshot> {
  const cpus = os.cpus();
  let commit: string | null = commitSha ?? null;
  if (!commit) {
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
        cwd: process.cwd(),
        timeout: 5000,
      });
      commit = stdout.trim() || null;
    } catch {
      commit = null; // git unavailable — reported as unavailable, not invented
    }
  }
  return {
    osPlatform: os.platform(),
    osVersion: os.release(),
    arch: os.arch(),
    cpuModel: cpus.length > 0 ? cpus[0].model : null,
    cpuCores: cpus.length > 0 ? cpus.length : null,
    totalMemBytes: String(os.totalmem()),
    hostRuntime: `Node ${process.version}`,
    commitSha: commit,
    capturedAt: new Date().toISOString(),
    metadata: {
      nodeVersion: process.version,
      loadavg: os.loadavg().map((x) => Number(x.toFixed(2))),
      freeMemBytes: os.freemem(),
      uptimeSec: Math.round(os.uptime()),
      isolationPolicy:
        "Benchmark jobs execute serially, one operating-system process at a time, on the coordinator host.",
      notes: [
        "CPU model is taken from the OS-reported CPU table and may be virtualized on cloud runners.",
        "Timings from shared or virtualized machines must not be treated as canonical performance data.",
      ],
    },
  };
}

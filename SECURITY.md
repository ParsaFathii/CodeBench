# Security Policy

CodeBench executes compiled and interpreted benchmark code on the machine it runs on and optionally sends measurement summaries to an AI provider. This policy describes the boundaries that keep both activities safe.

## Supported versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | yes       |

## Trust model

- **Local, single-user tool.** CodeBench is designed to run on a developer machine. The API performs no authentication; do not expose it to untrusted networks.
- **Benchmark jobs are first-party code.** The engines under `engines/` are part of this repository. CodeBench does not accept arbitrary user source code for execution.
- **Experiment descriptions are data, not instructions.** They are stored, displayed and (if you enable AI) sent as quoted evidence — the AI layer is instructed to treat them as untrusted content and its output is validated against stored run data.

## AI boundaries

- The provider receives only the selected run's stored results, statistics and an environment summary — no source code, no filesystem contents, no credentials.
- With the provider set to `disabled`, no data leaves the machine and all benchmark features keep working.
- With `ollama`, analysis stays entirely on your machine.
- Model output is schema-validated (zod) and grounding-checked; analyses referencing variants or run ids that do not exist are rejected and stored as failed.
- AI output can never create, modify or delete benchmark records.

## Execution safety

- Each benchmark job runs in a detached process group that is **SIGKILLed on timeout** — a hanging engine cannot wedge the coordinator.
- The coordinator executes jobs serially, so a runaway job cannot fork-bomb the host.
- Environment metadata capture reads only OS-level information (CPU model, core count, memory, load average) and reports unavailable data as unavailable — it never collects personal information.

## Reporting a vulnerability

Please report vulnerabilities privately to the repository owner (Parsa Fathi, https://github.com/ParsaFathii) via GitHub security advisories or the contact listed on the profile. Include:

- the component and file involved,
- a minimal reproduction,
- the impact you believe it has.

Please do not open public issues for exploitable vulnerabilities. Reports are acknowledged as quickly as possible; fixes ship in patch releases with credit (unless you prefer otherwise).

## Known limitations

- No API authentication (single-user local tool by design).
- The web app and benchmark coordinator share one machine; on shared hosts this affects measurement quality (documented in the methodology), not security.

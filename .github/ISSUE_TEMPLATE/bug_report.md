---
name: Bug report
about: Something in CodeBench behaved incorrectly or unexpectedly
title: ""
labels: ["bug"]
assignees: []
---

## What happened

<!-- A clear, concise description of the problem. -->

## Run ID

<!-- The run id shown in the Runner or History view (e.g. cmxxxxxxxxxxxx).
     If the problem happened outside a run (setup, UI, API), write "n/a"
     and describe where it happened. -->

- Run ID:
- Experiment name (if applicable):

## Did verification pass?

<!-- From the Results view / run detail: was verificationStatus PASSED, FAILED
     or SKIPPED for the affected jobs? Was the cross-language (×lang) badge
     green for the run? -->

- Verification status:
- Cross-language checksums matched (yes/no/unknown):

## Environment view output

<!-- Paste the output of the Environment view, or of
     `curl -s http://localhost:3000/api/v1/languages` — which engines were
     available, runtimes and harness versions matter a lot here. -->

```
(paste here)
```

## Engine status

<!-- Which engines were involved and did the Environment view report all of
     them as available? Include CODEBENCH_JDK_HOME if the Java engine was
     unavailable. -->

- Engines involved (cpp / java / python):
- All engines reported available (yes/no/unknown):

## Steps to reproduce

1.
2.

## Expected behavior

<!-- What you expected to happen instead. -->

## Additional context

<!-- Version / commit SHA, OS, CPU, anything unusual about the machine, and
     relevant lines from the Runner console or run logs. -->

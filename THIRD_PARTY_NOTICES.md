# Third-Party Notices

CodeBench — Copyright © 2026 Parsa Fathi — Apache-2.0.
This file acknowledges the third-party components this project depends on and preserves their required notices. It is not legal advice; consult the linked licenses.

## Benchmark harnesses (executed as separate processes)

| Component | Version | Purpose | Source | License |
|---|---|---|---|---|
| Google Benchmark | 1.9.4 | C++ benchmark harness | https://github.com/google/benchmark | Apache-2.0 |
| JMH (Java Microbenchmark Harness) | 1.37 | Java benchmark harness | https://github.com/openjdk/jmh | GPLv2 w/ Classpath Exception |
| jopt-simple | 5.0.4 | JMH CLI dependency | https://pholser.github.io/jopt-simple | MIT |
| Commons Math | 3.6.1 | JMH statistics dependency | https://commons.apache.org/proper/commons-math/ | Apache-2.0 |
| pyperf | 2.10.0 | Python benchmark harness | https://github.com/psf/pyperf | MIT |

JMH jars and their dependencies are committed under `engines/java/lib/` so the Java engine is reproducible without a build tool. Their original copyright and license notices are contained in the jar manifests (`META-INF/`, `META-INF/LICENSE.txt` etc.).

## Web application

| Component | Purpose | License |
|---|---|---|
| Next.js (16) | web framework | MIT |
| React (19) / React DOM | UI runtime | MIT |
| TypeScript | language | Apache-2.0 |
| Tailwind CSS (4) + tw-animate-css | styling | MIT |
| shadcn/ui (component patterns) | UI primitives scaffolded into `src/components/ui/` | MIT |
| Radix UI primitives | accessible components | MIT |
| Lucide React | icons | ISC |
| Prisma | ORM | Apache-2.0 |
| TanStack Query | server-state | MIT |
| Zustand | client state | MIT |
| zod | schema validation | MIT |
| class-variance-authority, clsx, tailwind-merge | styling utilities | Apache-2.0 / MIT / MIT |
| date-fns | date formatting | MIT |
| framer-motion | animation | MIT |
| sonner / radix toast | notifications | MIT |
| z-ai-web-dev-sdk | optional AI provider (server-side only) | — |

## Fonts

Geist and Geist Mono are loaded via `next/font/google` (Vercel's open font family, SIL Open Font License 1.1).

## Notices

- Apache-2.0 components: licensed under the Apache License, Version 2.0 — http://www.apache.org/licenses/LICENSE-2.0. Redistributions must retain the NOTICE file if one is provided.
- MIT components: permission is granted free of charge to deal in the software without restriction, subject to inclusion of the copyright notice and permission notice in all copies or substantial portions.
- JMH is licensed under GPLv2 with the Classpath Exception, which permits linking and redistribution in independent works under the terms of your choice. The jars are used unmodified; the Classpath Exception notice is contained within the jar.
- This project's own original materials (source code, documentation, diagrams, UI design) are Copyright © 2026 Parsa Fathi under Apache-2.0, except for the third-party components listed above, which remain the property of their respective copyright holders.

If you believe a notice is missing or incorrect, please open an issue so it can be corrected.

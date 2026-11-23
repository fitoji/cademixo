# Implementation Plans

Generated from the read-only Electro-Simulador audit on 2026-11-21. Execute in order; each plan is scoped to the existing React/Vite app and should stop rather than broaden scope.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | Add browser smoke coverage for critical editor flows | P1 | M | — | DONE |
| 002 | Preserve dirty documents when opening a file | P1 | S | 001 | DONE |
| 003 | Measure cable-drag preview cost before optimizing | P2 | M | 001 | TODO |
| 004 | Detect CADe-style short circuits and earth leakage | P1 | M | — | DONE |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) | REJECTED (with one-line rationale).

## Dependency notes

- 002 uses the browser harness from 001 to prove the user-visible no-data-loss behavior in both picker paths.
- 003 uses the browser harness from 001 to measure preview latency on a real fixture. It must not optimize if the baseline does not show a user-visible problem.

## Findings considered and rejected

- Parser O(n²) and cross-sheet network-key issues: not repeated here because current code has already fixed both.
- Beta-pinned `@ui-sdk` packages: monitor during upgrades; package metadata alone does not establish a defect or justify a migration plan.
- Splitting `App.tsx` by file length alone: defer until a concrete workflow or testability seam gives the extraction a measurable benefit.

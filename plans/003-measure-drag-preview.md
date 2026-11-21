# Plan 003: Measure cable-drag preview cost before optimizing

> **Executor instructions**: Follow this plan step by step. Preserve current drag semantics and only implement a rendering optimization if the baseline demonstrates user-visible latency.
>
> **Drift check (run first)**: `git diff --stat 3bf7ca2..HEAD -- app/src/ui/App.tsx app/src/editor/state.ts app/e2e/editor-smoke.spec.ts`
> If any in-scope file changed, compare the excerpts below with live code before proceeding; stop on mismatch.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — a split preview model can drift from committed geometry if it does not use the exact editor transformations.
- **Depends on**: `plans/001-browser-smoke-tests.md`
- **Category**: perf
- **Planned at**: commit `3bf7ca2`, 2026-11-21

## Why this matters

Cable vertex and bend previews currently call the normal editor mutation path on pointer movement. That path can parse and rebuild the document and networks for each preview frame, so cost grows with document size. Do not assume it is a user-visible bottleneck: first measure a repeatable large-fixture interaction in Chromium. Only refactor the preview path if the measurement exceeds the agreed frame budget and reproduces on the target machine.

## Current state

- `app/src/ui/App.tsx` — derives displayed preview geometry by applying the edit operation to editor state.
- `app/src/editor/state.ts` — `applyDrag` routes vertex and bend previews to document-editing functions; `moveVertex` parses/rebuilds network state to determine cable geometry.
- `app/src/ui/Canvas.tsx` — pointer movement advances the controller and emits preview effects.
- `app/e2e/editor-smoke.spec.ts` — created by plan 001; extend this browser harness with a deterministic performance scenario.
- `app/test/fixtures/inversion-giro-cej.cade` — existing real circuit fixture; use it only if it contains a movable cable vertex/bend in the current UI. Otherwise select the largest existing fixture that has a stable cable drag target and record the path.

Current source excerpts:

```tsx
// app/src/ui/App.tsx:533-536
const project = useMemo(() => (state ? projectOf(state) : null), [state]);
const display = useMemo(() => {
  if (!state || !preview) return project;
  return projectOf(applyDrag(state, preview));
}, [state, preview, project]);
```

```ts
// app/src/editor/state.ts:917-921
export function applyDrag(state: EditorState, op: DragOp): EditorState {
  if (op.kind === 'move') return moveSelection(state, op.dx, op.dy);
  if (op.kind === 'vertex') return moveVertex(state, op.from, op.to, op.sheet ?? 0);
  return bendCable(state, op.id, op.at, op.to, op.sheet ?? 0);
}
```

The gesture controller already tests one-commit and cancellation semantics in `app/test/wiring-controller.test.ts`; any optimization must preserve those semantics and must not mutate document state before pointer-up.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused performance browser test | `pnpm --filter electro-simulador test:e2e -- drag-preview.perf.spec.ts` | Prints baseline and final preview latency metrics |
| Existing gesture invariants | `OPENSSL_CONF=/dev/null NODE_OPTIONS=--openssl-config=/dev/null pnpm --filter electro-simulador test` | All unit tests pass |
| Typecheck/build | `OPENSSL_CONF=/dev/null NODE_OPTIONS=--openssl-config=/dev/null pnpm --filter electro-simulador build` | TypeScript and Vite build succeed |
| Browser regression | `pnpm --filter electro-simulador test:e2e` | All smoke/performance browser cases pass |

## Scope

**In scope**:
- `app/src/ui/App.tsx` (only if the measurement requires an optimized preview path)
- `app/src/editor/state.ts` (only if a pure preview transformation is required)
- `app/e2e/drag-preview.perf.spec.ts` (create)
- `app/e2e/editor-smoke.spec.ts` (only if a shared fixture helper must be extracted)

**Out of scope**:
- Refactoring the parser or document storage model.
- Optimizing ordinary component move/pan gestures based on this cable-preview measurement.
- Changing gesture snap/commit/cancel behavior, selection behavior, or undo semantics.
- Adding a general benchmark framework or CI performance gate.

## Git workflow

Work on the current branch. Do not commit or push without explicit instruction. If asked to commit, use a conventional message and no AI attribution or `Co-Authored-By` trailer.

## Steps

### Step 1: Establish a repeatable baseline

Create a browser test that loads a real fixture, starts a cable vertex or bend drag, sends a fixed number of pointer moves, and measures time from pointer movement to the expected SVG geometry update. Run at least 10 measured drags after one warm-up; report median and p95. Use a stable, visible test target and wait for the expected geometry rather than arbitrary sleeps. Record fixture name, browser version, move count, median, and p95 in the test output or test comment.

**Verify**: `pnpm --filter electro-simulador test:e2e -- drag-preview.perf.spec.ts` → emits median and p95 values and confirms that pointer-up commits once and pointer-cancel does not commit.

### Step 2: Apply a measured optimization only when needed

If the baseline p95 is **16.7 ms or lower** on the target machine, do not change the preview implementation; mark this plan `REJECTED (not worth doing: baseline within one 60 Hz frame)` in `plans/README.md` and stop. If p95 exceeds 16.7 ms and the delay reproduces across two runs, implement a transient geometry preview that does not serialize/reparse the full document for every pointer move. Reuse the same cable-geometry transformation rules as commit; keep the actual editor mutation in the existing pointer-up commit callback. Do not alter component move path in this plan.

**Verify**: rerun the same test with the same fixture and move count → p95 is at or below 16.7 ms, or the optimization is reported as not meeting the threshold and stopped for review; `git diff -- app/src/ui/App.tsx app/src/editor/state.ts` → only the preview/geometry changes are present.

### Step 3: Prove semantic parity

Run the Node gesture suite and all browser smoke tests. Verify preview cancellation leaves the underlying document unchanged, pointer-up produces one undoable edit, and undo restores the initial cable geometry.

**Verify**: `OPENSSL_CONF=/dev/null NODE_OPTIONS=--openssl-config=/dev/null pnpm --filter electro-simulador test` and `pnpm --filter electro-simulador test:e2e` → both exit 0.

## Test plan

- New file: `app/e2e/drag-preview.perf.spec.ts`.
- Use an existing fixture and a deterministic cable vertex/bend target.
- Include pointer-up and pointer-cancel assertions, not just timing output.
- Existing semantic reference: `app/test/wiring-controller.test.ts`.
- Performance comparison is valid only with the same fixture, browser, hardware, and pointer sequence before/after.

## Done criteria

- [ ] Baseline p95 and median are recorded with the fixture and test setup.
- [ ] If baseline p95 is within 16.7 ms, no source optimization was made and the plan was marked REJECTED with rationale.
- [ ] If baseline is above 16.7 ms in two runs, the preview path is optimized and measured again.
- [ ] Gesture tests and browser smoke/performance tests pass; document changes only on pointer-up.
- [ ] No files outside Scope changed; `plans/README.md` status row updated.

## STOP conditions

- Stop if the chosen fixture does not expose a stable draggable cable target; do not modify fixture data as a side effect.
- Stop if p95 is above 16.7 ms in only one of two runs or varies by more than 25% between repetitions; improve measurement stability before changing code.
- Stop if the only possible optimization changes committed geometry, snap behavior, or undo behavior.
- Stop if the optimized path would duplicate nontrivial cable rules without a clear shared pure transformation; report a design proposal instead.

## Maintenance notes

- The 16.7 ms threshold is a single-frame 60 Hz budget; if the app defines another target refresh rate, revise the threshold before measuring and record why.
- Keep benchmark assertions tolerant of machine variance; the metric is diagnostic, not a flaky CI gate.
- Revisit only when the preview data path or cable editing model changes.

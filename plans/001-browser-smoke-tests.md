# Plan 001: Add browser smoke coverage for critical editor flows

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If a STOP condition occurs, stop and report rather than improvising.
>
> **Drift check (run first)**: `git diff --stat 3bf7ca2..HEAD -- app/package.json pnpm-lock.yaml app/playwright.config.ts app/e2e app/.gitignore`
> If any in-scope file changed since this plan was written, compare the excerpts below with live files before proceeding. On mismatch, stop and report.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED — browser automation adds tooling and can become flaky if it depends on transient UI details.
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `3bf7ca2`, 2026-11-21

## Why this matters

The current suite validates the parser, editor operations, and gesture controller well, but it does not render the React app or exercise browser events. That leaves critical integration seams—file selection, save/download, and canvas gestures—without an end-to-end regression check. Add a small Chromium smoke suite that covers only these workflows; keep the existing fast `node:test` suite as the primary domain test layer.

## Current state

- `app/package.json` — React 19/Vite app; scripts include `"test": "node --test"` and `"build": "tsc --noEmit && vite build`.
- Root `package.json` — workspace proxy: `"test": "pnpm --filter electro-simulador test"`.
- `app/src/ui/App.tsx` — starts with a sample via `loadSample(SAMPLES[0])`; owns file open/save and passes drag callbacks into Canvas.
- `app/src/ui/Canvas.tsx` — emits declarative `preview`, `commit`, and `cancel` effects from the gesture controller; pointer events are handled by the canvas.
- `app/test/files.test.ts` — existing `node:test` pattern for fake file-picker globals and save behavior.
- `app/test/wiring-controller.test.ts` — existing pure gesture tests cover commit/cancel semantics, but do not render the canvas.

Current source excerpts:

```tsx
// app/src/ui/App.tsx:329-339
const openText = useCallback((text: string, name: string, handle: FileSystemFileHandle | null = null) => {
  setState(createEditor(text));
  setFileName(name);
  fileHandle.current = handle;
  setActiveSheet(0);
  setPlacing(null);
  setPreview(null);
  setFitToken((t) => t + 1);
}, []);

// app/src/ui/App.tsx:902-909
const onDragPreview = useCallback((op: DragOp | null) => {
  setPreview(op);
}, []);
const onDragCommit = useCallback((op: DragOp) => {
  setState((s) => (s ? applyDrag(s, op) : s));
  setPreview(null);
}, []);
```

The test runner is Node's built-in runner; there is no current browser runner or React DOM test dependency. Use accessible role/name selectors where practical. The UI is Spanish, so selectors should use its existing visible labels rather than adding test-only UI strings.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install browser runner | `pnpm --filter electro-simulador add -D @playwright/test` | Exit 0 and lockfile updated |
| Install Chromium | `pnpm --filter electro-simulador exec playwright install chromium` | Chromium downloaded successfully |
| Domain tests | `OPENSSL_CONF=/dev/null NODE_OPTIONS=--openssl-config=/dev/null pnpm --filter electro-simulador test` | 611+ tests pass; no failures |
| Browser smoke tests | `pnpm --filter electro-simulador test:e2e` | All new browser tests pass |
| Typecheck/build | `OPENSSL_CONF=/dev/null NODE_OPTIONS=--openssl-config=/dev/null pnpm --filter electro-simulador build` | `tsc --noEmit` and Vite build exit 0 |

The OpenSSL environment override is needed in the audited environment because Node could not read `/System/Library/OpenSSL/openssl.cnf`; omit it only if the local Node runtime no longer hits that restriction.

## Scope

**In scope**:
- `app/package.json`
- `pnpm-lock.yaml`
- `app/playwright.config.ts` (create)
- `app/e2e/editor-smoke.spec.ts` (create)
- `app/.gitignore` (only if needed to exclude Playwright output)

**Out of scope**:
- Product behavior in `app/src/**`; plan 002 owns the dirty-document fix.
- Replacing the existing `node:test` suite.
- WebKit/Firefox matrix, visual snapshots, broad accessibility testing, and CI workflow changes.

## Git workflow

Work on the current branch. Do not commit or push unless the operator explicitly requests it. If a commit is requested later, use a conventional commit and do not add AI attribution or `Co-Authored-By` trailers.

## Steps

### Step 1: Add Playwright and a minimal Vite test runner

Add `@playwright/test` as a dev dependency and update `pnpm-lock.yaml`. Create `app/playwright.config.ts` with Chromium as the only project and a local Vite `webServer` that starts the app from `app/`; make tests fail if the server does not become ready. Add the `test:e2e` script to `app/package.json`. Ignore generated report/result directories in `app/.gitignore` if they are not already ignored.

**Verify**: `pnpm --filter electro-simulador exec playwright --version` → prints a Playwright version; `pnpm --filter electro-simulador build` → exits 0.

### Step 2: Cover essential browser workflows

Create a small `app/e2e/editor-smoke.spec.ts` suite. Cover: app startup with the first sample visible; opening a local `.cad` fixture through the hidden file input and checking that its document name changes; saving through the existing custom “Guardar como…” flow and confirming a `.cad` download; and one canvas drag followed by undo, confirming the component/cable returns to its prior state. Inspect the current UI labels and accessible tree before choosing selectors; do not add test-only IDs unless an accessible selector cannot be made stable.

**Verify**: `pnpm --filter electro-simulador test:e2e` → all smoke cases pass in Chromium, including one downloaded file whose extension is `.cad`.

### Step 3: Keep fast domain checks intact

Run the existing unit suite and production build. Do not change Node test semantics or weaken assertions to accommodate the browser tests.

**Verify**: `OPENSSL_CONF=/dev/null NODE_OPTIONS=--openssl-config=/dev/null pnpm --filter electro-simulador test` → all unit tests pass; `OPENSSL_CONF=/dev/null NODE_OPTIONS=--openssl-config=/dev/null pnpm --filter electro-simulador build` → exit 0.

## Test plan

- New file: `app/e2e/editor-smoke.spec.ts`.
- Cover app boot, `.cad` open from file input, save-as download, and drag/undo at the rendered-UI level.
- Model existing fixture selection after `app/test/files.test.ts`; preserve the pure gesture assertions in `app/test/wiring-controller.test.ts`.
- Run browser and existing Node suites separately; both must pass.

## Done criteria

- [ ] Playwright Chromium test runner is configured and `test:e2e` is available.
- [ ] Browser smoke cases cover startup, open, save download, and drag/undo.
- [ ] `pnpm --filter electro-simulador test:e2e` exits 0.
- [ ] Existing `node:test` suite and `pnpm --filter electro-simulador build` exit 0.
- [ ] Only files listed in Scope changed, plus the generated package lockfile already listed in Scope.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Stop if Chromium cannot run in the supported local environment after the documented Playwright install; report the exact launch error rather than adding a different browser framework.
- Stop if a workflow cannot be selected/accessed through the current UI without changing product behavior; describe the missing accessibility seam before adding test-only selectors.
- Stop if the Vite dev server requires app source changes or environment secrets to start.
- Stop if the smoke suite is flaky on repeated local runs; do not increase timeouts blindly.

## Maintenance notes

- Keep this suite small: it should protect integrated document and canvas workflows, not duplicate every domain unit test.
- When menu labels or save behavior change, update the accessible selectors and expected download behavior.
- Do not add CI configuration as part of this slice; first establish that the local suite is deterministic.

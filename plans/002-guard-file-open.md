# Plan 002: Preserve unsaved work when opening a file

> **Executor instructions**: Follow this plan step by step. Run each verification command before continuing. If a STOP condition occurs, stop and report instead of broadening scope.
>
> **Drift check (run first)**: `git diff --stat 3bf7ca2..HEAD -- app/src/ui/App.tsx app/e2e/editor-smoke.spec.ts`
> If either in-scope file changed since this plan was written, compare the excerpts below with live code; on mismatch, stop and report.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW — this adds a guard before document replacement, but save/cancel semantics must remain consistent across browser picker paths.
- **Depends on**: `plans/001-browser-smoke-tests.md`
- **Category**: bug
- **Planned at**: commit `3bf7ca2`, 2026-11-21

## Why this matters

Opening a file from the menu currently replaces the in-memory document without checking whether it is dirty. If the user has unsaved edits, selecting a file silently destroys those edits. Reuse the established “save before open” decision used by drag-and-drop, and ensure a cancelled picker or failed save never replaces the current project.

## Current state

- `app/src/ui/App.tsx` — owns `state.dirty`, the active file handle, both file-open routes, save, and the hidden fallback input.
- `app/e2e/editor-smoke.spec.ts` — created by plan 001; use its local fixture and browser helpers for a regression test.
- `app/src/ui/files.ts` — contains browser picker and save helpers, but not document replacement policy.

Current source excerpts:

```tsx
// app/src/ui/App.tsx:356-372
const openDocument = useCallback(async (): Promise<void> => {
  if (!hasFileSystemAccess()) {
    fileInput.current?.click();
    return;
  }
  let picked: Awaited<ReturnType<typeof pickOpenHandle>>;
  try {
    picked = await pickOpenHandle();
  } catch {
    flash('no se pudo abrir el selector de archivos', 'error');
    return;
  }
  if (!picked) return;
  const { text, name } = await loadFile(picked.file);
  openText(text, name, picked.handle);
  cue('abrir archivo');
}, [openText, flash]);

// app/src/ui/App.tsx:480-488 (existing drop workflow)
if (state !== null && state.dirty) {
  const wantsSave = window.confirm(`Hay cambios sin guardar en «${fileName}». ¿Guardar antes de abrir «${file.name}»?`);
  if (!wantsSave) return;
  if (!(await saveDocument('save'))) return;
}
```

The fallback `<input type="file">` at `App.tsx:1274-1286` calls `loadFile(file)` and then `openText` directly. `newProject` uses a separate confirmation at `App.tsx:341-347`. Keep the existing Spanish copy and save semantics; do not invent a new prompt design in this bugfix.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused browser regression | `pnpm --filter electro-simulador test:e2e -- editor-smoke.spec.ts` | Open-while-dirty cases pass for picker and fallback input |
| Domain tests | `OPENSSL_CONF=/dev/null NODE_OPTIONS=--openssl-config=/dev/null pnpm --filter electro-simulador test` | All Node tests pass |
| Typecheck/build | `OPENSSL_CONF=/dev/null NODE_OPTIONS=--openssl-config=/dev/null pnpm --filter electro-simulador build` | TypeScript and Vite build succeed |

## Scope

**In scope**:
- `app/src/ui/App.tsx`
- `app/e2e/editor-smoke.spec.ts`

**Out of scope**:
- `app/src/editor/state.ts` dirty tracking or save-state semantics.
- New project/sample/drop behavior beyond reusing the existing file-open guard policy.
- Any changes to file format, save serialization, or native dialogs.

## Git workflow

Work on the current branch. Do not commit or push unless explicitly requested. Any requested commit must be conventional and have no AI attribution or `Co-Authored-By` trailer.

## Steps

### Step 1: Reuse one dirty-open decision for both file-opening mechanisms

Introduce a small private callback in `App.tsx` (or a narrow local helper if needed) that returns whether opening may continue: clean document → continue; dirty document → ask the same save-before-open question as `openDropped`; user declines → abort opening; user accepts → await `saveDocument('save')`, and abort if it returns `false`. Call it after a file has actually been chosen but before `loadFile`/`openText`, in both the File System Access picker path and the hidden input `onChange` path. Keep the current document, name, and file handle unchanged on cancellation or save failure. Avoid prompting when the picker is cancelled or no input file is selected.

**Verify**: `pnpm --filter electro-simulador test:e2e -- editor-smoke.spec.ts` → dirty-open tests show cancel/save-failure preserve the current document and successful save-before-open replaces it.

### Step 2: Exercise both dirty-open routes

Extend the browser test file from plan 001 with a helper that makes the current sample dirty using a real editor action. Add cases for: choosing cancel; choosing save when the save succeeds; failing/cancelling the save and confirming the selected file does not replace the dirty document; and no prompt when the document is clean. Run at least one test against the fallback file input and one against the File System Access picker branch (stub the browser picker with a deterministic test fixture if Chromium’s native dialog cannot be automated).

**Verify**: `pnpm --filter electro-simulador test:e2e -- editor-smoke.spec.ts` → all dirty-open cases pass twice consecutively.

## Test plan

- Extend `app/e2e/editor-smoke.spec.ts`.
- Verify saved/dirty file name and document contents before and after each branch; merely asserting a prompt appeared is insufficient.
- Cover picker cancellation separately from confirmation: cancelled selection should not ask the dirty guard.
- Use plan 001’s fixture and Playwright setup; do not add a second test framework.

## Done criteria

- [ ] Menu picker and fallback file input both protect dirty documents.
- [ ] Cancelled picker, declined save prompt, and failed/cancelled save preserve the prior document.
- [ ] Successful save-before-open follows the established `openDropped` policy and then opens the selected file.
- [ ] Clean document open does not show an unsaved-work prompt.
- [ ] Browser tests, Node tests, and build all pass.
- [ ] No files outside Scope changed; `plans/README.md` status row updated.

## STOP conditions

- Stop if `saveDocument('save')` can return `false` after writing the current file; inspect save semantics before changing the guard.
- Stop if “decline” is expected to mean discard-and-open in an existing user-facing flow; current `openDropped` returns without opening on decline, so do not silently change that product policy here.
- Stop if the picker can be invoked concurrently or the document changes while the picker is open; report the race and ask for a separate policy rather than guessing.
- Stop if the current dirty state is not represented by `state.dirty` in the live code.

## Maintenance notes

- Opening via file picker, fallback file input, and drop must continue to share the same save-before-replace policy.
- Review that a failed or cancelled save cannot fall through to `openText`.
- Broader three-way save/discard/cancel UX is intentionally deferred; this plan aligns current semantics without redesigning the dialog.

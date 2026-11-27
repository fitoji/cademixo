import { test } from 'node:test';
import assert from 'node:assert/strict';

import { drawingHash as canonicalHash } from '../src/format/hash.ts';
import { encodeLatin1 } from '../src/format/latin1.ts';
import { drawingHash } from '../src/ui/component-shortcuts.ts';
import { encodeLatin1 as movedEncode } from '../src/ui/files.ts';
import { beginSave, isCurrentSave } from '../src/ui/save-coordinator.ts';

test('los helpers re-exportados coinciden con los módulos canónicos', () => {
  for (const text of ['', 'ABC', 'á é ñ', '中', 'a'.repeat(4096)]) {
    assert.equal(drawingHash(text), canonicalHash(text));
    assert.deepEqual([...movedEncode(text)], [...encodeLatin1(text)]);
  }
});

test('una finalización vieja nunca limpia cambios pendientes', () => {
  const handle = { name: 'a.mixo' } as FileSystemFileHandle;
  const ctx = { text: 'CADe_SIMU*1*1#', fileName: 'a.mixo', handle, bindings: { Q1: 'q' } };
  const snapshot = beginSave(ctx, 7);

  assert.equal(isCurrentSave(snapshot, 'confirmed', ctx, 8), false);
  assert.equal(isCurrentSave(snapshot, 'confirmed', { ...ctx, text: 'otro' }, 7), false);
  assert.equal(isCurrentSave(snapshot, 'download-started', ctx, 7), false);
  assert.equal(isCurrentSave(snapshot, 'confirmed', ctx, 7), true);
});

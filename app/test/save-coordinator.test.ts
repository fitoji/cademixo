import { test } from 'node:test';
import assert from 'node:assert/strict';

import { beginSave, isCurrentSave, type SaveContext } from '../src/ui/save-coordinator.ts';

const handleA = { name: 'plano.mixo' } as FileSystemFileHandle;
const handleB = { name: 'otro.mixo' } as FileSystemFileHandle;

function context(overrides: Partial<SaveContext> = {}): SaveContext {
  return {
    text: 'CADe_SIMU*1*3000#-X##',
    fileName: 'plano.mixo',
    handle: handleA,
    bindings: { Q1: 'q', Q2: 'w' },
    ...overrides,
  };
}

test('sólo una escritura confirmada puede limpiar el documento', () => {
  const ctx = context();
  const saved = beginSave(ctx, 1);
  assert.equal(isCurrentSave(saved, 'confirmed', ctx, 1), true);
  assert.equal(isCurrentSave(saved, 'download-started', ctx, 1), false);
  assert.equal(isCurrentSave(saved, 'cancelled', ctx, 1), false);
  assert.equal(isCurrentSave(saved, 'failed', ctx, 1), false);
});

test('una finalización vieja no marca guardado si el texto, los atajos o el documento cambiaron', () => {
  const saved = beginSave(context(), 1);

  assert.equal(isCurrentSave(saved, 'confirmed', context({ text: 'CADe_SIMU editado' }), 1), false);
  assert.equal(isCurrentSave(saved, 'confirmed', context({ bindings: { Q1: 'q' } }), 1), false);
  assert.equal(isCurrentSave(saved, 'confirmed', context({ fileName: 'otro.mixo' }), 1), false);
  assert.equal(isCurrentSave(saved, 'confirmed', context({ handle: handleB }), 1), false);
  assert.equal(isCurrentSave(saved, 'confirmed', context(), 2), false);
});

test('la instantánea congela los atajos y no depende del orden de las claves', () => {
  const bindings: Record<string, string> = { Q1: 'q', Q2: 'w' };
  const saved = beginSave(context({ bindings }), 3);
  bindings.Q1 = 'z';

  assert.equal(isCurrentSave(saved, 'confirmed', context({ bindings: { Q2: 'w', Q1: 'q' } }), 3), true);
  assert.equal(isCurrentSave(saved, 'confirmed', context({ bindings: { Q1: 'z', Q2: 'w' } }), 3), false);
});

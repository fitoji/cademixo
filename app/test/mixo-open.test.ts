import { test } from 'node:test';
import assert from 'node:assert/strict';

import { serializeMixo } from '../src/format/mixo.ts';
import { inspectTextForOpen } from '../src/ui/mixo-open.ts';

const drawing = `CADe_SIMU*1*3000#-X##1#2##*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0#
DIBUJO válido con acentos: ñ á é
*2*4000##########*0*0*0*0*0*0*0*0*1*2*3*4*0*0*0*0*0*0*0*0*0*0*0#`;

const validKeys = JSON.stringify({
  version: 2,
  drawingHash: 'abc123',
  sourceName: 'plano.mixo',
  bindings: { Q1: 'q' },
});

function mixo(keys: string, overrides: Partial<Parameters<typeof serializeMixo>[0]> = {}): string {
  return serializeMixo({
    drawing: overrides.drawing ?? drawing,
    keys,
    manifest: overrides.manifest ?? { format: 'cademixo', version: 1, sourceName: 'plano.mixo' },
  });
}

test('un sidecar inválido de la misma longitud rechaza la apertura y conserva el dibujo', () => {
  // La versión no reconocida mantiene el JSON bien formado y el largo esperado:
  // el contenedor pasa las validaciones de longitud de MIXO/1.
  const invalidKeys = JSON.stringify({ version: 99, bindings: { Q1: 'mod+q' } });
  const text = mixo(invalidKeys);

  const result = inspectTextForOpen(text);

  assert.equal(result.kind, 'rejected');
  if (result.kind !== 'rejected') return;
  assert.equal(result.reason, 'bad-keys');
  assert.equal(result.drawing, drawing);
});

test('un sidecar cuyos atajos se descartan todos tampoco se abre con bindings vacíos', () => {
  const dropped = JSON.stringify({ version: 2, bindings: { Q1: 'no-es-un-atajo' } });

  const result = inspectTextForOpen(mixo(dropped));

  assert.equal(result.kind, 'rejected');
  if (result.kind !== 'rejected') return;
  assert.equal(result.reason, 'bad-keys');
  assert.equal(result.drawing, drawing);
});

test('un proyecto válido abre con sus atajos, sin sustituirlos por un conjunto vacío', () => {
  const result = inspectTextForOpen(mixo(validKeys));

  assert.equal(result.kind, 'mixo-valid');
  if (result.kind !== 'mixo-valid') return;
  assert.deepEqual(result.keys.bindings, { Q1: 'q' });
  assert.equal(result.keys.drawingHash, 'abc123');
  assert.equal(result.bundle.drawing, drawing);
});

test('un dibujo CADe sin envoltorio mixo sigue abriendo por el camino compatible', () => {
  assert.equal(inspectTextForOpen(drawing).kind, 'cad');
});

test('un dibujo que no es CADe o un bundle truncado se rechaza sin ofrecer copia', () => {
  const badDrawing = inspectTextForOpen(mixo(validKeys, { drawing: 'no es un CADe' }));
  assert.equal(badDrawing.kind, 'rejected');
  if (badDrawing.kind === 'rejected') assert.equal(badDrawing.drawing, null);

  const truncated = inspectTextForOpen(mixo(validKeys).slice(0, -5));
  assert.equal(truncated.kind, 'rejected');
});

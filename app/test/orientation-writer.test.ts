import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/format/cade.ts';
import { buildProject, GEOMETRY } from '../src/model/project.ts';
import { createEditor, projectOf, rotateSelection, select } from '../src/editor/state.ts';
import {
  effectiveTransform,
  metricsFor,
  nextWrittenSlot,
  rotateSlotRight,
} from '../src/model/orientation.ts';
import { slotFromTransform, transformFromSlot } from '../src/model/transform.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL = readFileSync(join(HERE, '../samples/rotacion/automaticoin.cad'), 'latin1');
const SAMPLE = readFileSync(join(HERE, '../samples/rotacion/manual/orientacion-8-variantes.cad'), 'latin1');

test('la tabla replica los ocho slots que CADe guardó en archivos reales', () => {
  // El sample sintético de la Parte A trae 8 variantes, pero el parser descarta
  // la primera (el bloque de título va al final). Los archivos que CADe guardó
  // directamente cubren los slots que faltan.
  const recs = [
    ...buildProject(parse(REAL)).records.filter((r) => r.code === 6001 || r.code === 6002),
    ...buildProject(parse(SAMPLE)).records.filter((r) => r.code === 6001),
  ];
  const seen = new Set<number>();
  for (const rec of recs) {
    const slot = rec.geometry[GEOMETRY.transform]!;
    if (seen.has(slot)) continue;
    seen.add(slot);
    assert.deepEqual(
      metricsFor(6001, slot),
      [rec.geometry[12], rec.geometry[13], rec.geometry[14], rec.geometry[15]],
      `métricas del slot ${slot} distintas de las que escribió CADe`,
    );
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('giro derecho y espejo siguen el bitfield medido en CADe', () => {
  assert.equal(rotateSlotRight(1), 2);
  assert.equal(rotateSlotRight(7), 4, 'giro sobre espejo+270 conserva el bit de espejo');
  assert.equal(rotateSlotRight(3), 0);
});

test('la capa visual se pliega en el slot que se va a escribir', () => {
  assert.equal(nextWrittenSlot(transformFromSlot(1), 0), 2);
  assert.equal(nextWrittenSlot(transformFromSlot(0), 90), 2, 'la capa visual ya girada una vez cuenta como giro previo');
  assert.deepEqual(effectiveTransform(transformFromSlot(5), 90), { rotation: 0, mirror: true });
  assert.equal(nextWrittenSlot(transformFromSlot(5), 90), 5, 'espejo+90 con capa visual 90 vuelve al slot 5');
});

test('girar un 6001 real escribe el slot y las métricas de CADe', () => {
  const original = projectOf(createEditor(REAL)).records.find((r) => r.id === 1)!;
  assert.equal(original.code, 6001);
  assert.equal(original.geometry[GEOMETRY.transform], 1, 'el punto de partida es el t=1 de automaticoin.cad');

  let state = select(createEditor(REAL), [1]);
  state = rotateSelection(state);

  const rec = projectOf(state).records.find((r) => r.id === 1)!;
  assert.equal(rec.geometry[GEOMETRY.transform], 2);
  assert.deepEqual(
    [rec.geometry[12], rec.geometry[13], rec.geometry[14], rec.geometry[15]],
    metricsFor(6001, 2),
  );
  assert.equal(state.dirty, true, 'la escritura cuenta como cambio');
  assert.equal(state.rotation[1], undefined, 'la capa visual se limpia al escribir');
});

test('cuatro giros sobre un 6001 real vuelven al byte original', () => {
  let state = select(createEditor(REAL), [1]);
  for (let i = 0; i < 4; i++) state = rotateSelection(state);
  assert.equal(state.text, REAL, 'un ciclo completo no deja bytes distintos');
});

test('girar un código sin tabla sigue sin tocar el archivo', () => {
  const text = readFileSync(join(HERE, '../test/fixtures/arranque-paro-motor-3f.cad'), 'latin1');
  const motor = buildProject(parse(text)).records.find((r) => r.code === 1000)!;
  let state = select(createEditor(text), [motor.id]);
  state = rotateSelection(state);
  assert.equal(state.rotation[motor.id], 90);
  assert.equal(state.text, text, 'sin tabla no se escribe geometry[17]');
});

test('el slot escrito sobrevive al round-trip', () => {
  let state = select(createEditor(REAL), [1]);
  state = rotateSelection(state);
  const rec = projectOf(state).records.find((r) => r.id === 1)!;
  const reparsed = buildProject(parse(state.text)).records.find((r) => r.id === 1)!;
  assert.deepEqual(reparsed.transform, rec.transform);
  assert.equal(slotFromTransform(reparsed.transform), 2);
});

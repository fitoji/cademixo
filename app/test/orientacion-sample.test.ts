import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, serialize } from '../src/format/cade.ts';
import { buildProject, GEOMETRY } from '../src/model/project.ts';
import { REFERENCE_METRICS } from '../src/model/orientation.ts';
import { slotFromTransform, transformFromSlot } from '../src/model/transform.ts';

const SAMPLE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'samples',
  'rotacion',
  'manual',
  'orientacion-8-variantes.cad',
);
const TEXT = readFileSync(SAMPLE, 'latin1');

test('la muestra de 8 orientaciones ancla el primer registro justo tras el magic', () => {
  const doc = parse(TEXT);
  assert.equal(doc.hasMagic, true);
  assert.equal(doc.prefix, '', 'la cabecera CADe_SIMU debe ir seguida de un solo *');
  assert.equal(doc.records.length, 8);
  assert.deepEqual(
    doc.records.map((r) => r.id),
    [201, 202, 203, 204, 205, 206, 207, 208],
  );
  assert.equal(doc.records[0].at, 0);
});

test('la muestra conserva la variante t=0 y las ocho métricas medidas en CADe', () => {
  const project = buildProject(parse(TEXT));
  assert.equal(project.records.length, 8);
  project.records.forEach((rec, i) => {
    assert.equal(rec.geometry[GEOMETRY.transform], i, `slot de la variante ${i}`);
    assert.deepEqual(rec.transform, transformFromSlot(i));
    assert.equal(slotFromTransform(rec.transform), i);
    assert.deepEqual(
      [rec.geometry[12], rec.geometry[13], rec.geometry[14], rec.geometry[15]],
      [...REFERENCE_METRICS[i]],
      `métricas de la variante ${i}`,
    );
  });
});

test('la muestra de orientaciones hace round-trip byte a byte', () => {
  assert.equal(serialize(parse(TEXT)), TEXT);
});

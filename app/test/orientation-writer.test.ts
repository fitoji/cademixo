import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/format/cade.ts';
import { buildProject, GEOMETRY } from '../src/model/project.ts';
import {
  createEditor,
  mirrorSelection,
  projectOf,
  rotateLeftSelection,
  rotateSelection,
  select,
} from '../src/editor/state.ts';
import { nextMetrics, nextSlot, REFERENCE_METRICS, type OrientationMetrics } from '../src/model/orientation.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL = readFileSync(join(HERE, '../samples/rotacion/automaticoin.cad'), 'latin1');
const SAMPLE = readFileSync(join(HERE, '../samples/rotacion/manual/orientacion-8-variantes.cad'), 'latin1');
const ARRANQUE = readFileSync(join(HERE, '../test/fixtures/arranque-paro-motor-3f.cad'), 'latin1');

const metricsOf = (geometry: number[]): string =>
  [geometry[12], geometry[13], geometry[14], geometry[15]].join(',');

test('las cuatro fórmulas del binario reproducen la tabla de los 8 slots', () => {
  // Tabla medida por CADe en orientacion-8-variantes.cad + automaticoin.cad.
  const recs = [
    ...buildProject(parse(REAL)).records.filter((r) => r.code === 6001 || r.code === 6002),
    ...buildProject(parse(SAMPLE)).records.filter((r) => r.code === 6001),
  ];
  const seen = new Map<number, string>();
  for (const rec of recs) {
    const slot = rec.geometry[GEOMETRY.transform]!;
    if (!seen.has(slot)) seen.set(slot, metricsOf(rec.geometry));
  }
  assert.deepEqual([...seen.keys()].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);

  for (const [from, to] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4]] as const) {
    assert.equal(nextSlot('rotate-right', from), to, `giro derecho ${from}->${to}`);
    assert.equal(
      nextMetrics('rotate-right', REFERENCE_METRICS[from]).join(','),
      seen.get(to),
      `métricas del giro derecho ${from}->${to}`,
    );
  }
  for (const [from, to] of [[0, 3], [3, 2], [2, 1], [1, 0], [4, 7], [7, 6], [6, 5], [5, 4]] as const) {
    assert.equal(nextSlot('rotate-left', from), to, `giro izquierdo ${from}->${to}`);
    assert.equal(nextMetrics('rotate-left', REFERENCE_METRICS[from]).join(','), seen.get(to));
  }
  for (const [from, to] of [[0, 4], [1, 7], [2, 6], [3, 5], [4, 0], [5, 3], [6, 2], [7, 1]] as const) {
    assert.equal(nextSlot('mirror-v', from), to, `espejo vertical ${from}->${to}`);
    assert.equal(nextMetrics('mirror-v', REFERENCE_METRICS[from]).join(','), seen.get(to));
  }
  for (const [from, to] of [[0, 6], [1, 5], [2, 4], [3, 7], [4, 2], [5, 1], [6, 0], [7, 3]] as const) {
    assert.equal(nextSlot('mirror-h', from), to, `espejo horizontal ${from}->${to}`);
    assert.equal(nextMetrics('mirror-h', REFERENCE_METRICS[from]).join(','), seen.get(to));
  }
});

test('cada acción es involutiva o de orden cuatro, como en CADe', () => {
  for (let slot = 0; slot < 8; slot++) {
    assert.equal(nextSlot('mirror-v', nextSlot('mirror-v', slot)), slot);
    assert.equal(nextSlot('mirror-h', nextSlot('mirror-h', slot)), slot);
    assert.equal(nextSlot('rotate-left', nextSlot('rotate-right', slot)), slot);
    let s = slot;
    for (let i = 0; i < 4; i++) s = nextSlot('rotate-right', s);
    assert.equal(s, slot);
  }
});

test('girar un 6001 real escribe el slot y las métricas que CADe guardó', () => {
  let state = select(createEditor(REAL), [1]); // t=1
  state = rotateSelection(state);
  const rec = projectOf(state).records.find((r) => r.id === 1)!;
  assert.equal(rec.geometry[GEOMETRY.transform], 2);
  assert.equal(metricsOf(rec.geometry), seenMetrics(2));
  assert.equal(state.rotation[1], undefined, 'la capa visual se pliega y se limpia');
});

function seenMetrics(slot: number): string {
  return REFERENCE_METRICS[slot].join(',');
}

test('cuatro giros sobre un 6001 real vuelven al byte original', () => {
  let state = select(createEditor(REAL), [1]);
  for (let i = 0; i < 4; i++) state = rotateSelection(state);
  assert.equal(state.text, REAL);
});

test('el escritor ya no depende del código: gira un motor 1000 y un 6003', () => {
  for (const code of [1000, 6003]) {
    const rec = buildProject(parse(ARRANQUE)).records.find((r) => r.code === code)!;
    const before = metricsOf(rec.geometry);
    let state = select(createEditor(ARRANQUE), [rec.id]);
    state = rotateSelection(state);
    const after = projectOf(state).records.find((r) => r.id === rec.id)!;
    assert.equal(after.geometry[GEOMETRY.transform], 1, `${code} escribe el slot`);
    const beforeMetrics: OrientationMetrics = [rec.geometry[12], rec.geometry[13], rec.geometry[14], rec.geometry[15]];
    assert.equal(metricsOf(after.geometry), nextMetrics('rotate-right', beforeMetrics).join(','), `${code} escribe las métricas transformadas`);
    assert.notEqual(metricsOf(after.geometry), before, `${code} cambió la caja`);
    for (let i = 0; i < 3; i++) state = rotateSelection(state);
    assert.equal(state.text, ARRANQUE, `${code}: cuatro giros cierran el ciclo`);
  }
});

test('el espejo se escribe y se deshace con el espejo opuesto', () => {
  let state = select(createEditor(REAL), [1]);
  state = mirrorSelection(state, 'v');
  const mirrored = projectOf(state).records.find((r) => r.id === 1)!;
  assert.equal(mirrored.geometry[GEOMETRY.transform], 7, 'espejo vertical sobre t=1 da t=7');
  assert.equal(metricsOf(mirrored.geometry), seenMetrics(7));
  state = mirrorSelection(state, 'v');
  assert.equal(projectOf(state).records.find((r) => r.id === 1)!.geometry[GEOMETRY.transform], 1);
  assert.equal(state.text, REAL, 'doble espejo restaura el archivo');
});

test('giro izquierdo y derecho son inversos en un archivo real', () => {
  let state = select(createEditor(REAL), [1]);
  state = rotateLeftSelection(state);
  assert.equal(projectOf(state).records.find((r) => r.id === 1)!.geometry[GEOMETRY.transform], 0);
  state = rotateSelection(state);
  assert.equal(state.text, REAL);
});

test('un registro sin bloque de geometría no se escribe', () => {
  const text = readFileSync(join(HERE, '../test/fixtures/arranque-paro-motor-3f.cad'), 'latin1');
  const rec = buildProject(parse(text)).records.find((r) => r.kind === 'text')!;
  let state = select(createEditor(text), [rec.id]);
  state = rotateSelection(state);
  assert.equal(state.text, text);
});

/**
 * Visibilidad de bornes, verificada con las muestras `samples/bornesocultos`
 * guardadas desde CADe_SIMU: los primeros campos de la geometría son un flag
 * por borne (1 visible, 0 oculto) y `geometry[19]` es el "mostrar nombres" de
 * todos los bornes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from '../src/format/cade.ts';
import {
  buildProject,
  serializeProject,
  serializeWith,
  withPinLabelsVisible,
  withPinVisible,
} from '../src/model/project.ts';
import { createEditor, setPinLabelsVisible, setPinVisible, undo } from '../src/editor/state.ts';

const SAMPLES = join(dirname(fileURLToPath(import.meta.url)), '..', 'samples', 'bornesocultos');

function load(name: string) {
  return buildProject(parse(readFileSync(join(SAMPLES, name), 'latin1')));
}

test('las muestras de CADe se leen con su flag por borne', () => {
  const cases = [
    { file: 'unborneoculto.cad', pins: [false, true, true, true, true, true], labels: true },
    { file: 'tresbornesoculto', pins: [false, false, false, true, true, true], labels: true },
    { file: 'nombreoculto', pins: [true, true, true, true, true, true], labels: false },
  ];
  for (const { file, pins, labels } of cases) {
    const rec = load(file).records.find((r) => r.code === 2001)!;
    assert.deepEqual(rec.pins, ['1', '3', '5', '2', '4', '6'], file);
    assert.deepEqual(rec.pinVisible, pins, file);
    assert.equal(rec.pinLabelsVisible, labels, file);
  }
});

test('ocultar un borne escribe sólo su flag y sobrevive al round-trip', () => {
  const project = load('nombreoculto');
  const index = project.records.findIndex((r) => r.code === 2001);
  const rec = project.records[index]!;

  const raw = withPinVisible(rec, 1, false);
  const edited = serializeWith(project, new Map([[index, raw]]));
  assert.equal(serializeProject(buildProject(parse(edited))), edited);

  const reparsed = buildProject(parse(edited)).records[index]!;
  assert.deepEqual(reparsed.pinVisible, [true, false, true, true, true, true]);
  assert.equal(reparsed.pinLabelsVisible, false);
  assert.deepEqual(reparsed.pins, rec.pins);
  assert.deepEqual(reparsed.geometry.slice(2), rec.geometry.slice(2));
});

test('ocultar nombres escribe geometry[19] sin tocar los flags de borne', () => {
  const project = load('unborneoculto.cad');
  const rec = project.records.find((r) => r.code === 2001)!;
  assert.equal(rec.pinLabelsVisible, true);

  const reparsed = buildProject(parse(withPinLabelsVisible(rec, false))).records[0]!;
  assert.equal(reparsed.pinLabelsVisible, false);
  assert.deepEqual(reparsed.pinVisible, rec.pinVisible);
  assert.deepEqual(reparsed.geometry.slice(0, 6), rec.geometry.slice(0, 6));
});

test('setPinVisible y setPinLabelsVisible se pueden deshacer', () => {
  const text = readFileSync(join(SAMPLES, 'unborneoculto.cad'), 'latin1');
  const state = createEditor(text);
  const id = buildProject(parse(text)).records.find((r) => r.code === 2001)!.id;

  const shown = setPinVisible(state, id, 0, true);
  assert.notEqual(shown.text, state.text);
  assert.equal(buildProject(parse(shown.text)).records.find((r) => r.id === id)!.pinVisible[0], true);

  const labeled = setPinLabelsVisible(shown, id, false);
  assert.equal(buildProject(parse(labeled.text)).records.find((r) => r.id === id)!.pinLabelsVisible, false);

  assert.equal(buildProject(parse(undo(labeled).text)).records.find((r) => r.id === id)!.pinLabelsVisible, true);
  assert.equal(undo(undo(labeled)).text, state.text);
});

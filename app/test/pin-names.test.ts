/**
 * Renombrado de bornes: el nombre vive en la cabecera del registro, no en un
 * campo aparte. Cambiar un token no debe correr los demás ni tocar el slot de
 * color de las lámparas, que se parsea justo después de los bornes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from '../src/format/cade.ts';
import { buildProject, serializeProject, serializeWith, withPinName } from '../src/model/project.ts';
import { createEditor, setPinName, undo } from '../src/editor/state.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function load(name: string) {
  return buildProject(parse(readFileSync(join(FIXTURES, name), 'latin1')));
}

const contactorFile = 'arranque-paro-motor-3f.cad';

test('renombra un borne sin mover los otros cinco del contactor III', () => {
  const project = load(contactorFile);
  const rec = project.records.find((r) => r.code === 2001 && r.pins.length === 6)!;
  assert.deepEqual(rec.pins, ['1', '3', '5', '2', '4', '6']);

  const raw = withPinName(rec, 2, '35');
  const reparsed = buildProject(parse(raw)).records[0]!;
  assert.deepEqual(reparsed.pins, ['1', '3', '35', '2', '4', '6']);
  assert.equal(reparsed.geometry.join(','), rec.geometry.join(','));

  const before = rec.raw.split('#');
  const after = raw.split('#');
  const changed = before.map((field, i) => (field === after[i] ? 0 : i)).filter((i) => i !== 0);
  assert.deepEqual(changed, [5]);
});

test('renombrar el último borne no toca el slot de color de una lámpara', () => {
  const project = load('luces/luz_roja.cad');
  const rec = project.records.find((r) => r.code === 9008)!;
  assert.deepEqual(rec.pins, ['X1', 'X2']);
  assert.equal(rec.lampColor, 1);

  const raw = withPinName(rec, 1, 'L2');
  const reparsed = buildProject(parse(raw)).records[0]!;
  assert.deepEqual(reparsed.pins, ['X1', 'L2']);
  assert.equal(reparsed.lampColor, 1);
});

test('un nombre vacío o un índice fuera de rango no cambian el registro', () => {
  const rec = load(contactorFile).records.find((r) => r.code === 2001)!;
  assert.equal(withPinName(rec, 0, '   '), rec.raw);
  assert.equal(withPinName(rec, -1, 'x'), rec.raw);
  assert.equal(withPinName(rec, rec.pins.length, 'x'), rec.raw);
});

test('setPinName guarda en el texto, mantiene la selección y se puede deshacer', () => {
  const project = load(contactorFile);
  const rec = project.records.find((r) => r.code === 2001)!;
  const state = {
    ...createEditor(readFileSync(join(FIXTURES, contactorFile), 'latin1')),
    selection: [rec.id],
  };

  const changed = setPinName(state, rec.id, 0, 'A1');
  assert.notEqual(changed, state);
  assert.notEqual(changed.text, state.text);
  assert.deepEqual(changed.selection, [rec.id]);
  assert.equal(changed.dirty, true);
  assert.deepEqual(
    buildProject(parse(changed.text)).records.find((r) => r.id === rec.id)!.pins,
    ['A1', '3', '5', '2', '4', '6'],
  );

  assert.equal(buildProject(parse(undo(changed).text)).records.find((r) => r.id === rec.id)!.pins[0], '1');
  assert.equal(setPinName(changed, rec.id, 0, 'A1'), changed);
});

test('el round-trip completo conserva todos los registros salvo el renombrado', () => {
  const project = load(contactorFile);
  const index = project.records.findIndex((r) => r.code === 2001);
  const rec = project.records[index]!;
  const raw = withPinName(rec, 0, 'A1');
  const editedRaw = serializeWith(project, new Map([[index, raw]]));
  assert.equal(serializeProject(buildProject(parse(editedRaw))), editedRaw);
  assert.equal(editedRaw.replace('#A1#', '#1#'), serializeProject(project));
});

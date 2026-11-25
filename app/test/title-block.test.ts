import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, serialize } from '../src/format/cade.ts';
import {
  parseTitleBlock,
  titleCableNumbers,
  titleCajetin,
  titleContorno,
  titleGrid,
  titleOrientation,
  titlePageFormat,
  titlePageSize,
  titleReferenciado,
  titleSymbolConnections,
  titleValues,
  titleZoom,
  withTitleField,
  withTitleFlags,
  withTitleNumeric,
} from '../src/model/title-block.ts';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'latin1');

const BASE = fixture('pr1-rodolfo-giusti.cad');
const PROBE = fixture('cajetin-probe.cad');

test('el cajetín se encuentra y el round-trip del archivo no cambia', () => {
  const block = parseTitleBlock(BASE);
  assert.ok(block);
  assert.equal(BASE.slice(block!.start, block!.end), block!.raw);
  assert.equal(serialize(parse(BASE)), BASE);
});

test('layout de 10 campos: valores por defecto', () => {
  const block = parseTitleBlock(BASE)!;
  assert.equal(block.fields.length, 10);
  assert.deepEqual(block.visibility, [true, true, true, true, true, true, true]);
  assert.deepEqual(block.alignment, [1, 1, 1, 1, 1, 1, 1]);
  const values = titleValues(block);
  assert.equal(values[6], '02-nov.-2026');
  assert.equal(values[7], '1');
  assert.equal(values[8], '1');
  assert.equal(values[9], 'CADe_S2');
});

test('layout de 12 campos: la variante con ** conserva el mapeo', () => {
  const block = parseTitleBlock(PROBE)!;
  assert.equal(block.fields.length, 10);
  const values = titleValues(block);
  assert.deepEqual(values.slice(0, 6), ['DIB1', 'DIB2', 'COM1', 'COM2', 'EMPRESA', 'TITULO']);
  assert.equal(values[7], '1NUM1');
  assert.equal(values[8], '1NUM2');
  assert.deepEqual(block.visibility, [true, false, true, true, true, true, true]);
  assert.deepEqual(block.alignment, [0, 0, 0, 2, 0, 0, 0]);
});

test('editar un campo respeta el ancho original y no toca otros bytes', () => {
  const next = withTitleField(BASE, 5, 'MI TITULO');
  const block = parseTitleBlock(next)!;
  assert.equal(titleValues(block)[5], 'MI TITULO');
  assert.equal(block.fields[5]!.width, 25);
  assert.equal(next.replace(block.raw, ''), BASE.replace(parseTitleBlock(BASE)!.raw, ''));
  assert.equal(serialize(parse(next)), next);
});

test('cambiar visibilidad y alineación modifica sólo los flags elegidos', () => {
  const next = withTitleFlags(BASE, { visibility: { 1: false }, alignment: { 3: 2 } });
  const block = parseTitleBlock(next)!;
  assert.deepEqual(block.visibility, [true, false, true, true, true, true, true]);
  assert.deepEqual(block.alignment, [1, 1, 1, 2, 1, 1, 1]);
  assert.equal(serialize(parse(next)), next);
});

test('un valor con * no corrompe el trailer', () => {
  assert.equal(withTitleField(BASE, 5, 'A*B'), BASE);
  assert.equal(withTitleField(BASE, 5, 'A***$$$&&&B'), BASE);
});

test('un documento sin cajetín no se modifica', () => {
  const plain = 'CADe_SIMU*0*20000#XXX#########*0*0#';
  assert.equal(parseTitleBlock(plain), null);
  assert.equal(withTitleField(plain, 0, 'x'), plain);
  assert.equal(withTitleFlags(plain, { visibility: { 0: false } }), plain);
  assert.equal(withTitleNumeric(plain, 0, 2), plain);
});

test('los numéricos confirmados se leen del trailer', () => {
  const block = parseTitleBlock(BASE)!;
  assert.equal(titlePageFormat(block), 1);
  assert.equal(titleContorno(block), true);
  assert.equal(titleReferenciado(block), true);
  assert.equal(titleCajetin(block), 2);
  assert.equal(titleZoom(block), 5);
  assert.equal(titleOrientation(block), 0);
  assert.equal(titleGrid(block), true);
  assert.equal(titleSymbolConnections(block), false);
  assert.equal(titleCableNumbers(block), false);
  assert.deepEqual(titlePageSize(block), { alto: 279, ancho: 210 });
});

test('cambiar un numérico respeta el ancho y el terminador &&&', () => {
  const next = withTitleNumeric(BASE, 3, 0);
  const block = parseTitleBlock(next)!;
  assert.equal(titleCajetin(block), 0);
  assert.equal(block.raw.endsWith('&&&'), true);
  assert.equal(next.replace(block.raw, ''), BASE.replace(parseTitleBlock(BASE)!.raw, ''));
  assert.equal(serialize(parse(next)), next);

  const resized = withTitleNumeric(BASE, 9, 210);
  assert.deepEqual(titlePageSize(parseTitleBlock(resized)!), { alto: 210, ancho: 210 });
  assert.equal(resized.includes('*210*210&&&'), true);
});

test('ocultar el cajetín en CADe es el campo 4 a 0, no los flags', () => {
  const visible = fixture('arranque-paro-motor-3f.cad');
  const hidden = fixture('arranque-paro-motor-3fcajetinoculto');
  const a = parseTitleBlock(visible)!;
  const b = parseTitleBlock(hidden)!;

  assert.equal(titleCajetin(a), 2, 'el original tiene Cajetín 2');
  assert.equal(titleCajetin(b), 0, 'el oculto tiene Cajetín: Ninguno');
  assert.equal(titleContorno(b), false);

  // Los 14 flags siguen en 1: no son el mecanismo de ocultación.
  assert.equal(b.visibility.every(Boolean), true);
  assert.deepEqual(b.alignment, [1, 1, 1, 1, 1, 1, 1]);

  // El trailer sigue completo; CADe no borra los textos al ocultar el cajetín.
  assert.equal(titleValues(b)[9], 'arranque-paro-motor-3f.cad');
  assert.equal(serialize(parse(hidden)), hidden);
});

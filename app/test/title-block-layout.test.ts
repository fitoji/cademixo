import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseTitleBlock,
  type TitleBlock,
  withTitleFlags,
  withTitleNumeric,
} from '../src/model/title-block.ts';
import { TITLE_LAYOUT, titleBlockLayout } from '../src/model/title-block-layout.ts';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'latin1');

const PROBE = fixture('cajetin-probe.cad');

const layoutOf = (text: string) => titleBlockLayout(parseTitleBlock(text));

const hasLine = (
  lines: ReadonlyArray<{ x1: number; y1: number; x2: number; y2: number }>,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean => lines.some((l) => l.x1 === x1 && l.y1 === y1 && l.x2 === x2 && l.y2 === y2);

test('sin cajetín no hay layout', () => {
  assert.equal(titleBlockLayout(null), null);
});

test('cajetín «ninguno» no se dibuja', () => {
  assert.equal(layoutOf(withTitleNumeric(PROBE, 3, 0)), null);
});

test('un formato que no es A4 horizontal no se dibuja', () => {
  assert.equal(layoutOf(withTitleNumeric(PROBE, 0, 2)), null);
});

test('la página útil toma el lado mayor como ancho', () => {
  const layout = layoutOf(PROBE)!;
  assert.deepEqual(layout.page, { width: 279, height: 210 });
});

test('el bloque de título queda pegado a la esquina inferior derecha', () => {
  const layout = layoutOf(PROBE)!;
  const first = layout.cells[0]!;
  const last = layout.cells.at(-1)!;
  assert.equal(first.rect.y, TITLE_LAYOUT.blockTop(279, 210));
  assert.equal(first.rect.y, 158);
  assert.equal(last.rect.y + last.rect.h, 200);
  assert.equal(last.rect.x + last.rect.w, 269);
});

test('siete filas de seis unidades, una por fila del diálogo', () => {
  const layout = layoutOf(PROBE)!;
  const rows = [...new Set(layout.cells.map((c) => c.rect.y))];
  assert.deepEqual(rows, [158, 164, 170, 176, 182, 188, 194]);
  for (const cell of layout.cells) assert.equal(cell.rect.h, 6);
});

test('cada campo lleva el valor del trailer y la alineación de su fila', () => {
  const layout = layoutOf(PROBE)!;
  assert.deepEqual(
    layout.cells.map((c) => c.text),
    [
      'DIB1',
      'DIB2',
      'COM1',
      'COM2',
      'EMPRESA',
      'TITULO',
      '02-nov.-202',
      '1NUM1',
      '1NUM2',
      'pr1.cadARCH20',
    ],
  );
  // Alineación del fixture: fila 0 izq, filas 1..2 izq, fila 3 derecha, resto izq.
  assert.equal(layout.cells[5]!.align, 2);
  assert.equal(layout.cells[4]!.align, 0);
});

test('las filas de dos campos llevan rótulo propio y las de uno no', () => {
  const layout = layoutOf(PROBE)!;
  assert.equal(layout.cells[0]!.caption, 'Fecha');
  assert.equal(layout.cells[1]!.caption, 'Nombre');
  assert.equal(layout.cells[4]!.caption, undefined);
  assert.equal(layout.cells[5]!.caption, undefined);
  assert.equal(layout.cells[7]!.caption, 'Hoja');
  assert.equal(layout.cells[8]!.caption, 'Total');
});

test('los flags de visibilidad no cambian el layout: CADe los ignora al dibujar', () => {
  const off = withTitleFlags(PROBE, { visibility: { 0: false, 1: false, 2: false } });
  const a = layoutOf(PROBE)!;
  const b = layoutOf(off)!;
  assert.equal(b.cells.length, a.cells.length);
  assert.deepEqual(b.lines, a.lines);
});

test('sin «Contorno» no hay marco pero el bloque sigue', () => {
  const layout = layoutOf(withTitleNumeric(PROBE, 1, 0))!;
  assert.equal(hasLine(layout.lines, 0, 0, 279, 0), false);
  assert.equal(layout.cells.length, 10);
});

test('con «Contorno» se dibujan los dos marcos', () => {
  const layout = layoutOf(PROBE)!;
  assert.equal(hasLine(layout.lines, 0, 0, 279, 0), true);
  assert.equal(hasLine(layout.lines, 10, 10, 269, 10), true);
});

test('sin referenciado no hay letras ni números de franja', () => {
  const layout = layoutOf(withTitleNumeric(PROBE, 2, 0))!;
  const band = layout.labels.filter((l) => l.anchor === 'middle');
  assert.equal(band.length, 0);
  assert.equal(layout.labels.length, 7);
});

test('con referenciado hay una letra por columna y un número por fila', () => {
  const layout = layoutOf(PROBE)!;
  const texts = layout.labels.map((l) => l.text);
  assert.ok(texts.includes('A'));
  assert.ok(texts.includes('1'));
  for (const label of layout.labels) {
    assert.ok(Number.isFinite(label.x) && Number.isFinite(label.y));
  }
});

test('las filas se rotulan con el nombre del diálogo', () => {
  const layout = layoutOf(PROBE)!;
  const rows = layout.labels.filter((l) => l.anchor === 'start').map((l) => l.text);
  assert.deepEqual(rows, [
    'Dibujado',
    'Comprobado',
    'Entidad',
    'Título',
    'Fecha',
    'Número',
    'Archivo',
  ]);
});

test('el énfasis queda en Entidad y Título', () => {
  const block: TitleBlock = parseTitleBlock(PROBE)!;
  const layout = titleBlockLayout(block)!;
  const emphasised = layout.cells.filter((c) => c.emphasis).map((c) => c.text);
  assert.deepEqual(emphasised, ['EMPRESA', 'TITULO']);
});

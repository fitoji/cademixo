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

/**
 * El fixture trae la fila «Comprobado» oculta (`visibility[1] = 0`). La
 * geometría completa se prueba con todas las filas visibles.
 */
const FULL = withTitleFlags(PROBE, {
  visibility: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true },
});

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

test('el cajetín 1 en A4 mide 207 × 36 y queda abajo a la derecha', () => {
  const text = fixture('cajetin1-medido.cad');
  const layout = layoutOf(text)!;
  assert.ok(layout);
  assert.deepEqual(layout.page, { width: 279, height: 210 });
  const xs = layout.lines.flatMap((l) => [l.x1, l.x2]);
  const ys = layout.lines.flatMap((l) => [l.y1, l.y2]);
  assert.equal(Math.min(...xs), 69);
  assert.equal(Math.max(...xs), 276);
  assert.equal(Math.min(...ys), 171);
  assert.equal(Math.max(...ys), 207);
  const texts = layout.cells.map((c) => c.text);
  assert.deepEqual(texts.slice(0, 6), ['02-nov.-202', 'EMPRESA', 'DIB1', 'DIB2', 'COM1', 'COM2']);
  assert.ok(texts.includes('1NUM1 de 1NUM2'));
  assert.ok(texts.includes('cajetin-probe.cad'));
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

test('el bloque queda abajo a la izquierda como en CADe', () => {
  const layout = layoutOf(FULL)!;
  const first = layout.cells[0]!;
  const last = layout.cells.at(-1)!;
  assert.equal(first.rect.y, TITLE_LAYOUT.blockTop(279, 210));
  assert.equal(first.rect.y, 165);
  assert.equal(last.rect.y + last.rect.h, 207);
  assert.equal(last.rect.x + last.rect.w, 210);
});

test('el bloque mide 207 unidades, sin escalar ni recortar', () => {
  const layout = layoutOf(FULL)!;
  const first = layout.cells[0]!;
  assert.equal(TITLE_LAYOUT.blockWidth, 207);
  assert.equal(TITLE_LAYOUT.widthFor(279), 207);
  assert.equal(first.rect.x, TITLE_LAYOUT.blockLeft(279) + TITLE_LAYOUT.labelWidth);
  assert.equal(first.rect.x, 33);
});

test('siete filas de seis unidades, una por fila del diálogo', () => {
  const layout = layoutOf(FULL)!;
  const rows = [...new Set(layout.cells.map((c) => c.rect.y))];
  assert.deepEqual(rows, [165, 171, 177, 183, 189, 195, 201]);
  for (const cell of layout.cells) assert.equal(cell.rect.h, 6);
});

test('cada campo lleva el valor del trailer y la alineación de su fila', () => {
  const layout = layoutOf(FULL)!;
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
  const layout = layoutOf(FULL)!;
  assert.equal(layout.cells[0]!.caption, 'Fecha');
  assert.equal(layout.cells[1]!.caption, 'Nombre');
  assert.equal(layout.cells[4]!.caption, undefined);
  assert.equal(layout.cells[5]!.caption, undefined);
  assert.equal(layout.cells[7]!.caption, 'Hoja');
  assert.equal(layout.cells[8]!.caption, 'Total');
});

test('una fila oculta no se dibuja y el bloque se acorta desde arriba', () => {
  const base = layoutOf(PROBE)!;
  // Fila 4 = «Fecha», un solo campo.
  const off = layoutOf(withTitleFlags(PROBE, { visibility: { 4: false } }))!;
  assert.equal(off.cells.length, base.cells.length - 1);
  assert.equal(
    off.labels.filter((l) => l.anchor === 'start').length,
    base.labels.filter((l) => l.anchor === 'start').length - 1,
  );
  assert.equal(off.labels.some((l) => l.text === 'Fecha' && l.anchor === 'start'), false);
  const last = off.cells.at(-1)!;
  // El borde inferior no se mueve: la caja se ancla al marco.
  assert.equal(last.rect.y + last.rect.h, 207);
});

test('sin «Contorno» no hay marco pero el bloque sigue', () => {
  const layout = layoutOf(withTitleFlags(withTitleNumeric(PROBE, 1, 0), { visibility: { 1: true } }))!;
  assert.equal(hasLine(layout.lines, 0, 0, 279, 0), false);
  assert.equal(layout.cells.length, 10);
});

test('con «Contorno» se dibujan los dos marcos', () => {
  const layout = layoutOf(FULL)!;
  assert.equal(hasLine(layout.lines, 0, 0, 279, 0), true);
  assert.equal(hasLine(layout.lines, 10, 10, 269, 10), true);
});

test('sin referenciado no hay letras ni números de franja', () => {
  const layout = layoutOf(withTitleFlags(withTitleNumeric(PROBE, 2, 0), { visibility: { 1: true } }))!;
  const band = layout.labels.filter((l) => l.anchor === 'middle');
  assert.equal(band.length, 0);
  assert.equal(layout.labels.length, 7);
});

test('con referenciado hay una letra por columna y un número por fila', () => {
  const layout = layoutOf(FULL)!;
  const texts = layout.labels.map((l) => l.text);
  assert.ok(texts.includes('A'));
  assert.ok(texts.includes('1'));
  for (const label of layout.labels) {
    assert.ok(Number.isFinite(label.x) && Number.isFinite(label.y));
  }
});

test('el fixture trae «Comprobado» oculto y se respeta', () => {
  const layout = layoutOf(PROBE)!;
  // «Comprobado» tiene dos campos: 10 - 2.
  assert.equal(layout.cells.length, 8);
  assert.equal(layout.cells.some((c) => c.text === 'COM1'), false);
  assert.equal(
    layout.labels.some((l) => l.text === 'Comprobado' && l.anchor === 'start'),
    false,
  );
  const last = layout.cells.at(-1)!;
  assert.equal(last.rect.y + last.rect.h, 207);
});

test('las filas se rotulan con el nombre del diálogo', () => {
  const layout = layoutOf(FULL)!;
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
  const block: TitleBlock = parseTitleBlock(FULL)!;
  const layout = titleBlockLayout(block)!;
  const emphasised = layout.cells.filter((c) => c.emphasis).map((c) => c.text);
  assert.deepEqual(emphasised, ['EMPRESA', 'TITULO']);
});

/**
 * Encuadre de las vistas previas: el viewBox se ajusta a la tinta del símbolo
 * para que ningún componente se vea diminuto ni recortado en su cuadrado.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { lineList, resolveSymbol, symbolList } from '../src/symbols/library.ts';
import { previewViewBox } from '../src/symbols/preview.ts';

const boxOf = (code: number, pinNames: string[] = []): number[] =>
  previewViewBox(code, pinNames).split(' ').map(Number);

test('todo el catálogo produce un viewBox cuadrado, finito y positivo', () => {
  for (const sym of [...symbolList(), ...lineList()]) {
    const [x, y, w, h] = boxOf(sym.code, sym.pins.map((p) => p.name));
    assert.ok([x, y, w, h].every(Number.isFinite), `viewBox no finito en ${sym.code}`);
    assert.ok(w > 0 && h > 0, `lado no positivo en ${sym.code}`);
    assert.equal(w, h, `viewBox no cuadrado en ${sym.code}`);
  }
});

test('un terminal diminuto se agranda en vez de perderse en la caja fija', () => {
  const sym = resolveSymbol(3002, []);
  const [, , side] = boxOf(sym.code, sym.pins.map((p) => p.name));
  // El viewBox histórico medía 26 de ancho; la tinta de este terminal mide ~2,7.
  assert.ok(side < 26, `se esperaba encuadre ajustado, se obtuvo ${side}`);
});

test('un símbolo que desbordaba la caja entra completo en el encuadre', () => {
  const sym = resolveSymbol(1000, []);
  const [, , side] = boxOf(sym.code, sym.pins.map((p) => p.name));
  // El motor anclado al origen dibuja fuera de la caja de 18×15.
  assert.ok(side > 26, `se esperaba encuadre ampliado, se obtuvo ${side}`);
});

test('el encuadre es determinista', () => {
  const a = previewViewBox(1000, []);
  const b = previewViewBox(1000, []);
  assert.equal(a, b);
});

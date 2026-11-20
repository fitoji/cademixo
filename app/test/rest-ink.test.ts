import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { bladeAngle } from '../src/symbols/draw.ts';
import { lineList, symbolList, type Shape, type SymbolDef } from '../src/symbols/library.ts';

/**
 * Guardia de la tinta en reposo (S10).
 *
 * Todo símbolo dibujado sin simular tiene que verse igual que el calibrado: si
 * alguien cambia la geometría, el peso de un trazo o la pose de reposo de una
 * cuchilla, la huella de abajo cambia y el test falla. Un fallo acá significa
 * que el dibujo del usuario cambió sin simular nada; si el cambio es deseado,
 * hay que recalcular la huella a mano y explicar por qué.
 */

/** Estado de las cuchillas en reposo, antes de simular: sin cerrar ni apretar. */
const REST = { closed: false, pressed: false } as const;

/**
 * Caja con la que se resuelven los símbolos que no declaran tamaño propio.
 * Los que sí lo declaran usan el suyo, que es el que se ve en el lienzo.
 */
const DEFAULT_SIZE = { w: 12, h: 15 };

/** Tinta de una forma: el trazo, sus banderas y el giro de reposo de la hoja. */
function inkOf(shape: Shape): string {
  const flags = [
    shape.fill ? 'fill' : '',
    shape.thin ? 'thin' : '',
    shape.dashed ? 'dashed' : '',
    shape.lamp ? 'lamp' : '',
  ]
    .filter(Boolean)
    .join('+');
  const angle = shape.blade ? bladeAngle(shape.blade, REST) : 0;
  return `${shape.d}|${flags}|${angle}`;
}

/** Todas las formas en reposo del símbolo, en el orden en que se pintan. */
function inkOfSymbol(sym: SymbolDef): string[] {
  const { w, h } = sym.size ?? DEFAULT_SIZE;
  return sym.shapes(w, h).map(inkOf);
}

/** Los códigos que dibuja la librería: los componentes y los cables. */
function drawnSymbols(): SymbolDef[] {
  return [...symbolList(), ...lineList()];
}

/** Cantidad de códigos dibujados y huella de su tinta en reposo. */
function restingFingerprint(): { codes: number; hash: string } {
  const symbols = drawnSymbols();
  const ink = symbols.map((sym) => `${sym.code}:${inkOfSymbol(sym).join(';')}`);
  return {
    codes: symbols.length,
    hash: createHash('sha256').update(ink.join('\n')).digest('hex'),
  };
}

test('el dibujo en reposo de los 232 códigos es el calibrado', () => {
  const { codes, hash } = restingFingerprint();
  assert.equal(codes, 232, `la librería dibuja ${codes} códigos y no los 232 calibrados`);
  // Huella regenerada por `bornes-grilla-del-archivo` (S5): los seis pulsadores
  // 8000-8005 dejaron de coincidir con la captura de CADe por decisión de
  // producto —sus bornes son las filas 0/12 del registro y la tinta se corrió
  // +6 en `y` para llegar a ellos—, así que su tinta en reposo ya no es la
  // calibrada. El resto de los 226 códigos no cambia (S6).
  assert.equal(
    hash,
    'ae16b51226446c46611c3155aa813518b1535494adeb9b4bb7a93f9ee2cab633',
    `la tinta en reposo cambió (huella ${hash}): el dibujo sin simular ya no es el calibrado`,
  );
});

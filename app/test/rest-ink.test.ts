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

test('el dibujo en reposo de los 227 códigos es el calibrado', () => {
  const { codes, hash } = restingFingerprint();
  assert.equal(codes, 227, `la librería dibuja ${codes} códigos y no los 227 calibrados`);
  // Huella regenerada por `bornes-grilla-del-archivo` (S5): los seis pulsadores
  // 8000-8005 dejaron de coincidir con la captura de CADe por decisión de
  // producto —sus bornes son las filas 0/12 del registro y la tinta se corrió
  // +6 en `y` para llegar a ellos—, así que su tinta en reposo ya no es la
  // calibrada. El resto de los 226 códigos no cambia (S6).
  //
  // Regenerada otra vez por el mismo feature (L8/L9): 5000 y 5002 estiran su
  // ramal inferior 0,25 hasta la fila 12, y 5001, 5003 y 8017 corren la tinta
  // +12 en `y` para que los bornes del archivo (filas 0 y 12) caigan sobre ella.
  // El 9004 no entra: queda bloqueado, sin tocar. El resto de los 227 códigos
  // conserva la huella anterior (diferencial de tinta: 5 de 232 códigos).
  //
  // Huella regenerada al quitar los símbolos duplicados (6000, 6002, 6003,
  // 6007, 6009): la lista pasa de 232 a 227 entradas porque esos cinco códigos
  // tenían una definición vieja y la generada desde los planos. La tinta de
  // cada código no cambió: sólo desaparecieron líneas repetidas del listado.
  //
  // Regenerada al completar el desplazamiento de 5000 y 5002 (L2/L3 de
  // `fusibles-5000-5002`): el +12 ya no es sólo del ramal inferior, sino de
  // toda la tinta medida —el cuerpo pasa a 3..9 y el conductor es continuo de
  // 0 a 12, que subsume el vástago central—, igual que 5001, 5003 y 8017. El
  // resto de los 227 códigos conserva la huella anterior (diferencial: 2 de
  // 227 códigos).
  assert.equal(
    hash,
    // Regenerada al pasar la paleta del 8017 de catorce puntos a una cuña
    // rellena y al migrar el 6007 a la captura real de CADe (tres dados).
    // Regenerada al añadir el cuadro de disparo del segundo polo del 6002,
    // medido en PR1 (refOnly 65 -> 50, overlap 151 -> 171, stray 0). El 6001
    // conserva el cuadro sólo en el primer polo (`test01.png`).
    'cdb74546024c0a400d318f1b194eec7578a9e6a45f835fcda0c93c2abe8cba8f',
    `la tinta en reposo cambió (huella ${hash}): el dibujo sin simular ya no es el calibrado`,
  );
});

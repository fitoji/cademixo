import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circle } from '../src/symbols/draw.ts';
import { resolveSymbol } from '../src/symbols/library.ts';

/**
 * S4 — el cuerpo declarado de un motor es el círculo que dibuja `shapes`.
 *
 * El pivote del giro sale de `motorBody`; lo que el usuario ve es `shapes()`. Si
 * alguien mueve una mitad sin la otra, la flecha vuelve a girar fuera de eje
 * —que es exactamente el reporte original— sin que ningún test lo note.
 */
test('el 1000 declara como cuerpo el mismo círculo que dibuja', () => {
  const def = resolveSymbol(1000, []);
  const body = def.motorBody;

  assert.deepEqual(body, { x: 6, y: 6, r: 9 }, 'el cuerpo se declara, no se adivina');
  assert.equal(def.shapes(24, 24)[0]!.d, circle(body!.x, body!.y, body!.r), 'y es el primer trazo dibujado');
});

test('los motores de caja no declaran cuerpo y dibujan el círculo de su caja', () => {
  for (const code of [1001, 1006, 1007]) {
    const def = resolveSymbol(code, []);

    assert.equal(def.motorBody, undefined, `${code} no declara cuerpo`);
    assert.equal(def.shapes(24, 24)[0]!.d, circle(12, 12, 24 * 0.42), `${code} dibuja el círculo de su caja`);
  }
});

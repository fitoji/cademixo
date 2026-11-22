/**
 * Caja de impacto de un componente: tiene que cubrir el bloque que se ve, no
 * sólo la tinta dibujada. La tinta de un símbolo son trazos con `fill: none`,
 * así que el puntero sólo la encuentra sobre los propios trazos: los
 * intersticios dependen del rectángulo invisible que cada componente dibuja.
 *
 * Ese rectángulo salía de la caja declarada sola, y en un símbolo anclado al
 * origen la caja declarada es la grilla de conexión mientras la tinta vive en
 * coordenadas absolutas del archivo: el halo aparecía sobre los trazos y
 * desaparecía en el resto del bloque.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { componentHitBox } from '../src/ui/hit-box.ts';
import { IDENTITY, transformBox, type Box, type Transform } from '../src/model/transform.ts';
import { symbolFor, symbolList, type SymbolDef } from '../src/symbols/library.ts';
import { shapesBounds } from '../src/symbols/draw.ts';

const EPS = 0.001;

type Ink = { minX: number; minY: number; maxX: number; maxY: number };

/** Caja declarada del símbolo: la grilla de conexión, apoyada en el origen. */
const declaredOf = (sym: SymbolDef): Box => {
  if (!sym.size) throw new Error(`el símbolo ${sym.code} no declara tamaño`);
  return { x: 0, y: 0, w: sym.size.w, h: sym.size.h };
};

const inkOf = (sym: SymbolDef): Ink => shapesBounds(sym.shapes(declaredOf(sym).w, declaredOf(sym).h));

const symOf = (code: number): SymbolDef => {
  const sym = symbolFor(code);
  if (!sym) throw new Error(`falta el símbolo ${code}`);
  return sym;
};

const covered = (box: Box, ink: Ink): boolean =>
  box.x <= ink.minX + EPS &&
  box.y <= ink.minY + EPS &&
  box.x + box.w >= ink.maxX - EPS &&
  box.y + box.h >= ink.maxY - EPS;

test('un símbolo normal también suma la tinta que se sale de su caja declarada', () => {
  const sym = symOf(2001);
  const declared = declaredOf(sym);
  const ink = inkOf(sym);
  const hit = componentHitBox({ declared, ink, anchored: sym.anchor === 'origin', transform: IDENTITY });

  // El contactor dibuja tres unidades a la izquierda de su grilla: la caja
  // declarada sola dejaba ese tramo de tinta sin responder al puntero.
  assert.ok(!covered(declared, ink), 'la prueba no sirve si la tinta ya cabía en la caja declarada');
  assert.ok(covered(hit, ink), `la caja de impacto no cubre la tinta: ${JSON.stringify(hit)}`);
  assert.ok(hit.x <= declared.x && hit.x + hit.w >= declared.x + declared.w, 'la caja declarada sigue adentro');
});

test('si la tinta ya cabe en la caja declarada, la caja de impacto no crece', () => {
  const adentro = symbolList().find((sym) => {
    if (!sym.size) return false;
    const declared = declaredOf(sym);
    const ink = inkOf(sym);
    return Number.isFinite(ink.minX) && covered(declared, ink);
  });
  assert.ok(adentro, 'la prueba no sirve si ningún símbolo tiene su tinta dentro de la caja');
  const declared = declaredOf(adentro);
  const hit = componentHitBox({
    declared,
    ink: inkOf(adentro),
    anchored: adentro.anchor === 'origin',
    transform: IDENTITY,
  });
  assert.deepEqual(hit, declared);
});

test('un símbolo anclado al origen suma su tinta a la caja declarada', () => {
  const sym = symOf(5000);
  const declared = declaredOf(sym);
  const ink = inkOf(sym);
  // El fusible dibuja su cuerpo a la izquierda del origen, fuera de la grilla.
  assert.ok(ink.minX < declared.x, `la tinta debería empezar antes del origen, empieza en ${ink.minX}`);

  const hit = componentHitBox({ declared, ink, anchored: true, transform: IDENTITY });

  assert.ok(covered(hit, ink), `la caja de impacto no cubre la tinta: ${JSON.stringify(hit)}`);
  assert.ok(hit.x <= declared.x && hit.x + hit.w >= declared.x + declared.w, 'la caja declarada sigue adentro');
});

test('la caja de impacto cubre la tinta de todo símbolo de la biblioteca', () => {
  let anclados = 0;
  let fueraDeLaCaja = 0;
  for (const sym of symbolList()) {
    if (!sym.size) continue;
    const declared = declaredOf(sym);
    const ink = inkOf(sym);
    if (!Number.isFinite(ink.minX)) continue;
    const anclado = sym.anchor === 'origin';
    if (anclado) anclados += 1;
    if (!covered(declared, ink)) fueraDeLaCaja += 1;

    const hit = componentHitBox({ declared, ink, anchored: anclado, transform: IDENTITY });
    assert.ok(
      covered(hit, ink),
      `el símbolo ${sym.code} no queda cubierto: ${JSON.stringify(hit)} vs ${JSON.stringify(ink)}`,
    );
  }
  assert.ok(anclados > 0, 'la prueba no sirve si no hay símbolos anclados');
  assert.ok(fueraDeLaCaja > 0, 'la prueba no sirve si la caja declarada ya cubría toda la tinta');
});

test('con orientación la caja de impacto envuelve la tinta girada', () => {
  const sym = symOf(5000);
  const declared = declaredOf(sym);
  const ink = inkOf(sym);
  const quarter: Transform = { rotation: 90, mirror: false };

  const hit = componentHitBox({ declared, ink, anchored: true, transform: quarter });
  const sinGiro = componentHitBox({ declared, ink, anchored: true, transform: IDENTITY });

  // Un cuarto de vuelta rígido cambia las medidas de la envuelta sin cambiar su
  // superficie: si el pivote fuera el de la caja declarada en vez del de la
  // tinta, la envuelta dejaría de cerrar con la tinta girada.
  assert.equal(hit.w, sinGiro.h);
  assert.equal(hit.h, sinGiro.w);
  assert.equal(Math.abs(hit.w * hit.h - sinGiro.w * sinGiro.h) < EPS, true);
  // Y cubre la tinta girada alrededor de su propio centro, que es el pivote que
  // usa el glifo anclado al origen.
  const cx = (ink.minX + ink.maxX) / 2;
  const cy = (ink.minY + ink.maxY) / 2;
  const halfW = (ink.maxX - ink.minX) / 2;
  const halfH = (ink.maxY - ink.minY) / 2;
  const girada = { minX: cx - halfH, minY: cy - halfW, maxX: cx + halfH, maxY: cy + halfW };
  assert.ok(covered(hit, girada), `la caja no cubre la tinta girada: ${JSON.stringify(hit)}`);
});

test('sin tinta finita la caja de impacto cae a la caja declarada', () => {
  const declared = { x: 1, y: 2, w: 6, h: 15 };
  const vacia = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  assert.deepEqual(componentHitBox({ declared, ink: vacia, anchored: false, transform: IDENTITY }), declared);
  assert.deepEqual(componentHitBox({ declared, ink: null, anchored: true, transform: IDENTITY }), declared);
});

test('transformBox conserva su comportamiento: identidad y cuartos de vuelta', () => {
  const box = { x: 0, y: 0, w: 2, h: 4 };
  assert.deepEqual(transformBox(box, IDENTITY), box);
  const girada = transformBox(box, { rotation: 90, mirror: false });
  assert.equal(girada.w, 4);
  assert.equal(girada.h, 2);
  assert.equal(girada.x + girada.w / 2, box.x + box.w / 2, 'el centro no se mueve');
  assert.equal(girada.y + girada.h / 2, box.y + box.h / 2, 'el centro no se mueve');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstPin, nextPin, pinKey, pinRefs, samePin } from '../src/editor/wiring/keyboard.ts';
import type { Point } from '../src/editor/pins.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, '..', 'src', 'ui');
const CSS = readFileSync(join(UI, 'diagram.css'), 'utf8');
const CANVAS = readFileSync(join(UI, 'Canvas.tsx'), 'utf8');

/**
 * Los bornes llegan del modelo como `Map<id, Point[]>`: el índice es la
 * posición en el arreglo y el mapa no repite el id dentro de cada punto. Para
 * navegar por teclado hace falta la identidad, así que el módulo la agrega.
 */
const sheet = (): Map<number, Point[]> =>
  new Map<number, Point[]>([
    [7, [{ x: 0, y: 0 }, { x: 0, y: 12 }]],
    [3, [{ x: 12, y: 0 }]],
  ]);

test('pinRefs agrega identidad sin tocar el mapa de origen', () => {
  const pins = sheet();
  const refs = pinRefs(pins);

  assert.deepEqual(refs.map(pinKey), ['3:0', '7:0', '7:1'], 'orden estable: componente y después borne');
  assert.deepEqual(refs[1]!.point, { x: 0, y: 0 });

  refs[0]!.point.x = 99;
  assert.equal(pins.get(3)![0]!.x, 12, 'el punto es una copia: editar el ref no edita el modelo');
});

test('no hay cursor sin bornes', () => {
  assert.deepEqual(pinRefs(new Map()), []);
  assert.equal(firstPin([]), null);
});

test('el primer borne es el de arriba a la izquierda', () => {
  const refs = pinRefs(
    new Map([
      [1, [{ x: 30, y: 0 }]],
      [2, [{ x: 12, y: 6 }]],
      [3, [{ x: 0, y: 0 }]],
    ]),
  );
  assert.equal(pinKey(firstPin(refs)!), '3:0', 'gana la fila de arriba; a igual fila, la izquierda');
});

test('la flecha va al borne más alineado, no al más cercano en línea recta', () => {
  const refs = pinRefs(
    new Map([
      [1, [{ x: 0, y: 0 }]],
      // Más cerca en distancia euclídea (4,24) pero desalineado.
      [2, [{ x: 3, y: 3 }]],
      // Más lejos (6) pero en la misma fila: es el que el ojo espera.
      [3, [{ x: 6, y: 0 }]],
    ]),
  );
  const from = refs.find((r) => pinKey(r) === '1:0')!;

  assert.equal(pinKey(nextPin(refs, from, 'right')!), '3:0');
});

test('solo cuenta el semiespacio de la flecha', () => {
  const refs = pinRefs(new Map([[1, [{ x: 0, y: 0 }, { x: 6, y: 0 }]]]));
  const left = refs.find((r) => r.point.x === 6)!;

  assert.equal(pinKey(nextPin(refs, left, 'left')!), '1:0');
  assert.equal(nextPin(refs, refs[0]!, 'left'), null, 'no hay nada a la izquierda del primero');
});

test('un borne no es candidato de sí mismo', () => {
  const refs = pinRefs(new Map([[1, [{ x: 0, y: 0 }]]]));

  for (const dir of ['left', 'right', 'up', 'down'] as const) {
    assert.equal(nextPin(refs, refs[0]!, dir), null, `sin vecinos, ${dir} no inventa uno`);
  }
});

test('un borne en la misma vertical no está "a la derecha"', () => {
  const refs = pinRefs(
    new Map([
      [1, [{ x: 0, y: 0 }]],
      [2, [{ x: 0, y: 6 }]],
    ]),
  );
  const from = refs.find((r) => pinKey(r) === '1:0')!;

  assert.equal(nextPin(refs, from, 'right'), null, 'avanzar en x exige avanzar en x');
  assert.equal(pinKey(nextPin(refs, from, 'down')!), '2:0');
});

test('bajar prefiere la columna', () => {
  const refs = pinRefs(
    new Map([
      [1, [{ x: 0, y: 0 }]],
      [2, [{ x: 6, y: 6 }]],
      [3, [{ x: 0, y: 12 }]],
    ]),
  );
  const from = refs.find((r) => pinKey(r) === '1:0')!;

  assert.equal(pinKey(nextPin(refs, from, 'down')!), '3:0', 'la misma columna gana sobre la diagonal');
});

test('el empate se resuelve siempre igual', () => {
  const refs = pinRefs(
    new Map([
      [4, [{ x: 6, y: -3 }]],
      [2, [{ x: 6, y: 3 }]],
      [9, [{ x: 0, y: 0 }]],
    ]),
  );
  const from = refs.find((r) => pinKey(r) === '9:0')!;

  // Mismo puntaje (6 + 3 * 3); gana el id menor para que dos pulsaciones
  // seguidas no alternen entre los dos.
  assert.equal(pinKey(nextPin(refs, from, 'right')!), '2:0');
  assert.equal(pinKey(nextPin(refs, from, 'right')!), '2:0');
});

test('samePin compara identidad, no coordenadas', () => {
  const a = { componentId: 4, pinIndex: 1, point: { x: 0, y: 0 } };
  const b = { componentId: 4, pinIndex: 1, point: { x: 0, y: 0 } };
  const c = { componentId: 4, pinIndex: 2, point: { x: 0, y: 0 } };

  assert.equal(samePin(a, b), true);
  assert.equal(samePin(a, c), false);
  assert.equal(samePin(null, a), false);
  assert.equal(samePin(a, null), false);
});

/**
 * El hueco real: sin puntero no se podía cablear. El lienzo no era enfocable y
 * no manejaba Enter ni flechas; los bornes no tenían ninguna señal de foco.
 */
test('el lienzo es enfocable y anuncia lo que pasa', () => {
  assert.ok(CANVAS.includes('tabIndex={0}'), 'el svg entra en el orden de tabulación');
  assert.ok(CANVAS.includes('onKeyDown={onCanvasKeyDown}'), 'el lienzo maneja sus propias teclas');
  assert.ok(CANVAS.includes('aria-live='), 'hay una región viva para anunciar el borne enfocado');
  assert.ok(CANVAS.includes('ArrowRight'), 'las flechas mueven el cursor de bornes');
  assert.ok(CANVAS.includes('Enter'), 'Enter inicia y cierra el cable');
});

test('el borne enfocado se dibuja distinto', () => {
  assert.ok(CANVAS.includes('pin-cursor'), 'el cursor de bornes tiene su propia marca');
  assert.ok(CSS.includes('.pin-cursor'), 'la marca tiene estilo');
  const rule = /\.pin-cursor\s*\{([^}]*)\}/.exec(CSS);
  assert.ok(rule, 'falta la regla del cursor de bornes');
  assert.ok(rule![1]!.includes('var(--select)'), `usa el acento del tema: ${rule![1]}`);
});

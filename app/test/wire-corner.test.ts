import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WIRE_CORNER_RADIUS, WIRE_CORNER_TOL, wireCornerPaths, type WireSegment } from '../src/ui/wire-corner.ts';

/**
 * El redondeo de esquinas de cable es SÓLO de pintado (S1): el modelo guarda un
 * segmento por registro y un codo son dos registros que comparten vértice, así
 * que la curva se resuelve acá, leyendo los segmentos, sin tocar el formato.
 *
 * Estos tests son puros: no hay DOM ni SVG, sólo segmentos y el `d` resultante.
 */

const TOL = WIRE_CORNER_TOL;

const seg = (id: number, x1: number, y1: number, x2: number, y2: number, sheet = 0): WireSegment => ({
  id,
  sheet,
  x1,
  y1,
  x2,
  y2,
});

/** El `d` de hoy: el que la app pinta cuando no hay nada que redondear (S6). */
const plain = (x1: number, y1: number, x2: number, y2: number): string => `M${x1} ${y1}L${x2} ${y2}`;

const nothingPinned = (): boolean => false;

/** Arco tangente: control en el vértice, destino el recorte del otro tramo. */
const arc = (cx: number, cy: number, ex: number, ey: number): string => `Q${cx} ${cy} ${ex} ${ey}`;

test('el radio de esquina arranca en 1 unidad de plano (S2)', () => {
  assert.equal(WIRE_CORNER_RADIUS, 1);
});

test('un codo recto recorta los dos tramos y los une con un arco tangente (S4)', () => {
  const paths = wireCornerPaths([seg(1, 10, 0, 10, 10), seg(2, 10, 10, 20, 10)], 1, nothingPinned);

  // El arco lo dibuja UN solo tramo (el de id menor): el otro termina en su
  // punto recortado, así la esquina no se pinta dos veces.
  assert.equal(paths.get(1), `M10 0L10 9${arc(10, 10, 11, 10)}`);
  assert.equal(paths.get(2), plain(11, 10, 20, 10));
});

test('el arco también se dibuja cuando el vértice es el arranque del tramo', () => {
  // Mismo codo que el anterior con el segundo registro al revés: el arco se
  // antepone y el tramo conserva su recorrido.
  const paths = wireCornerPaths([seg(1, 10, 10, 10, 0), seg(2, 10, 10, 20, 10)], 1, nothingPinned);

  assert.equal(paths.get(1), `M11 10${arc(10, 10, 10, 9)}L10 0`);
  assert.equal(paths.get(2), plain(11, 10, 20, 10));
});

test('un par colineal no forma codo y se pinta como hoy (S6)', () => {
  const paths = wireCornerPaths([seg(1, 10, 0, 10, 10), seg(2, 10, 10, 10, 20)], 1, nothingPinned);

  assert.equal(paths.get(1), plain(10, 0, 10, 10));
  assert.equal(paths.get(2), plain(10, 10, 10, 20));
});

test('un vértice con tres cables se lee recto (S4)', () => {
  const paths = wireCornerPaths(
    [seg(1, 10, 0, 10, 10), seg(2, 10, 10, 20, 10), seg(3, 0, 10, 10, 10)],
    1,
    nothingPinned,
  );

  assert.equal(paths.get(1), plain(10, 0, 10, 10));
  assert.equal(paths.get(2), plain(10, 10, 20, 10));
  assert.equal(paths.get(3), plain(0, 10, 10, 10));
});

test('un vértice clavado (borne o unión) se lee recto (S4)', () => {
  const pinned = (x: number, y: number): boolean => Math.abs(x - 10) < TOL && Math.abs(y - 10) < TOL;
  const paths = wireCornerPaths([seg(1, 10, 0, 10, 10), seg(2, 10, 10, 20, 10)], 1, pinned);

  assert.equal(paths.get(1), plain(10, 0, 10, 10));
  assert.equal(paths.get(2), plain(10, 10, 20, 10));
});

test('el predicado se consulta en el vértice y no en cualquier punto', () => {
  const asked: string[] = [];
  const pinned = (x: number, y: number): boolean => {
    asked.push(`${x},${y}`);
    return false;
  };
  wireCornerPaths([seg(1, 10, 0, 10, 10), seg(2, 10, 10, 20, 10)], 1, pinned);

  assert.deepEqual(asked, ['10,10']);
});

test('un tramo corto recorta como máximo su mitad, nunca se invierte (S5)', () => {
  // El segundo tramo mide 1: con radio 1 el recorte sería el punto entero y el
  // cable se daría vuelta. Se limita a la mitad (0,5).
  const paths = wireCornerPaths([seg(1, 0, 0, 5, 0), seg(2, 5, 0, 5, 1)], 1, nothingPinned);

  assert.equal(paths.get(1), `M0 0L4 0${arc(5, 0, 5, 0.5)}`);
  assert.equal(paths.get(2), plain(5, 0.5, 5, 1));
});

test('dos codos sobre un tramo corto se comen el tramo sin invertirlo (S5)', () => {
  // El tramo del medio mide 1 y tiene codo en sus dos puntas: cada recorte es
  // 0,5 y el tramo queda reducido a su punto medio, no dado vuelta.
  const paths = wireCornerPaths(
    [seg(1, 0, 0, 5, 0), seg(2, 5, 0, 5, 1), seg(3, 5, 1, 10, 1)],
    1,
    nothingPinned,
  );

  assert.equal(paths.get(1), `M0 0L4 0${arc(5, 0, 5, 0.5)}`);
  assert.equal(paths.get(2), `M5 0.5${arc(5, 1, 6, 1)}`);
  assert.equal(paths.get(3), plain(6, 1, 10, 1));
});

test('radio 0 devuelve exactamente los caminos de hoy (S3, S6)', () => {
  const segments = [seg(1, 10, 0, 10, 10), seg(2, 10, 10, 20, 10), seg(3, 1.5, 2.25, 3, 4.5)];
  const paths = wireCornerPaths(segments, 0, nothingPinned);

  assert.equal(paths.get(1), plain(10, 0, 10, 10));
  assert.equal(paths.get(2), plain(10, 10, 20, 10));
  // Sin redondeo no hay formateo: los decimales salen tal cual están.
  assert.equal(paths.get(3), plain(1.5, 2.25, 3, 4.5));
});

test('el radio está en unidades de plano: el recorte escala con él (S2)', () => {
  const corner = (radius: number): string | undefined =>
    wireCornerPaths([seg(1, 10, 0, 10, 10), seg(2, 10, 10, 20, 10)], radius, nothingPinned).get(1);

  assert.equal(corner(2), `M10 0L10 8${arc(10, 10, 12, 10)}`);
  assert.equal(corner(2.5), `M10 0L10 7.5${arc(10, 10, 12.5, 10)}`);
});

test('un registro de longitud cero (unión 4001) no se redondea ni rompe el pase (S4)', () => {
  const paths = wireCornerPaths([seg(1, 5, 5, 5, 5), seg(2, 5, 5, 20, 5)], 1, nothingPinned);

  assert.equal(paths.get(1), plain(5, 5, 5, 5));
  assert.equal(paths.get(2), plain(5, 5, 20, 5));
});

test('dos hojas no comparten vértice aunque las coordenadas coincidan (S4)', () => {
  const paths = wireCornerPaths([seg(1, 10, 0, 10, 10, 0), seg(2, 10, 10, 20, 10, 1)], 1, nothingPinned);

  assert.equal(paths.get(1), plain(10, 0, 10, 10));
  assert.equal(paths.get(2), plain(10, 10, 20, 10));
});

test('es pura: no muta los segmentos y es determinista (S7)', () => {
  const input = [seg(1, 10, 0, 10, 10), seg(2, 10, 10, 20, 10)];
  const before = structuredClone(input);

  const first = wireCornerPaths(input, 1, nothingPinned);
  const second = wireCornerPaths(input, 1, nothingPinned);

  assert.deepEqual(input, before);
  assert.deepEqual([...first.entries()], [...second.entries()]);
});

test('todos los segmentos reciben un camino, redondeados o no (S7)', () => {
  const segments = [seg(1, 10, 0, 10, 10), seg(2, 10, 10, 20, 10), seg(3, 0, 40, 10, 40)];
  const paths = wireCornerPaths(segments, 1, nothingPinned);

  assert.equal(paths.size, segments.length);
  for (const s of segments) assert.equal(typeof paths.get(s.id), 'string');
});

/**
 * S3: el estilo decide. El módulo es puro y no conoce el DOM, así que la
 * costura se verifica en el cableado: clásico pide radio 0 y moderno el radio
 * del módulo, y el lienzo usa el módulo para el `d` de los cables.
 */
test('sólo el estilo moderno pide esquinas redondeadas (S3)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const app = readFileSync(join(here, '..', 'src', 'ui', 'App.tsx'), 'utf8');
  const canvas = readFileSync(join(here, '..', 'src', 'ui', 'Canvas.tsx'), 'utf8');

  assert.match(app, /cornerRadius=\{styleMode === 'moderno' \? WIRE_CORNER_RADIUS : 0\}/);
  assert.match(canvas, /wireCornerPaths\(/);
  assert.match(canvas, /d=\{path \?\?/);
});

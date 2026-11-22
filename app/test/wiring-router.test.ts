import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeOrthogonal, routeSimple, type Box } from '../src/editor/wiring/router.ts';

import { toSegments } from '../src/editor/wiring/geometry.ts';

const box = (minX: number, minY: number, maxX: number, maxY: number): Box => ({ minX, minY, maxX, maxY });

test('routeSimple devuelve los dos candidatos HV y VH', () => {
  const from = { x: 0, y: 0 };
  const to = { x: 30, y: 20 };
  assert.deepEqual(routeSimple(from, to, 'H'), [from, { x: 30, y: 0 }, to]);
  assert.deepEqual(routeSimple(from, to, 'V'), [from, { x: 0, y: 20 }, to]);
});

test('sin obstáculos elige la ruta HV de un codo, de forma determinista', () => {
  const request = { from: { x: 0, y: 0 }, to: { x: 30, y: 20 }, obstacles: [] };
  const a = routeOrthogonal(request);
  const b = routeOrthogonal(request);
  assert.deepEqual(a.waypoints, [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 30, y: 20 },
  ]);
  assert.deepEqual(a, b, 'mismos datos dan la misma ruta');
  assert.equal(a.bends, 1);
});

test('nunca atraviesa una caja de símbolo', () => {
  const obstacle = box(10, 5, 20, 15);
  const r = routeOrthogonal({
    from: { x: 0, y: 10 },
    to: { x: 30, y: 10 },
    obstacles: [obstacle],
  });
  assert.ok(r.waypoints.length > 2, 'tuvo que desviarse');
  for (const seg of toSegments(r.waypoints)) {
    const vertical = Math.abs(seg.a.x - seg.b.x) < 1e-9;
    const insideX = vertical && seg.a.x > obstacle.minX && seg.a.x < obstacle.maxX;
    const insideY = !vertical && seg.a.y > obstacle.minY && seg.a.y < obstacle.maxY;
    const lo = vertical ? Math.min(seg.a.y, seg.b.y) : Math.min(seg.a.x, seg.b.x);
    const hi = vertical ? Math.max(seg.a.y, seg.b.y) : Math.max(seg.a.x, seg.b.x);
    const along = vertical ? [obstacle.minY, obstacle.maxY] : [obstacle.minX, obstacle.maxX];
    assert.equal(insideX && lo < along[1]! && hi > along[0]!, false, 'tramo vertical dentro de la caja');
    assert.equal(insideY && lo < along[1]! && hi > along[0]!, false, 'tramo horizontal dentro de la caja');
  }
});

test('prefieren menos codos cuando dos rutas tienen la misma longitud', () => {
  const r = routeOrthogonal({
    from: { x: 0, y: 0 },
    to: { x: 30, y: 30 },
    obstacles: [],
    bendPenalty: 40,
  });
  assert.equal(r.bends, 1, 'la ruta directa de un codo gana');
});

test('dos cajas dejan un pasillo y la ruta no las atraviesa', () => {
  const lower = box(15, -20, 25, -2);
  const upper = box(15, 2, 25, 20);
  const r = routeOrthogonal({
    from: { x: 0, y: 0 },
    to: { x: 60, y: 0 },
    obstacles: [lower, upper],
  });
  assert.ok(r.waypoints.length >= 2);
  for (const seg of toSegments(r.waypoints)) {
    const vertical = Math.abs(seg.a.x - seg.b.x) < 1e-9;
    for (const b of [lower, upper]) {
      const insideCross = vertical
        ? seg.a.x > b.minX && seg.a.x < b.maxX
        : seg.a.y > b.minY && seg.a.y < b.maxY;
      const lo = vertical ? Math.min(seg.a.y, seg.b.y) : Math.min(seg.a.x, seg.b.x);
      const hi = vertical ? Math.max(seg.a.y, seg.b.y) : Math.max(seg.a.x, seg.b.x);
      const along = vertical ? [b.minY, b.maxY] : [b.minX, b.maxX];
      assert.equal(insideCross && lo < along[1]! && hi > along[0]!, false, 'la ruta atraviesa una caja');
    }
  }
});

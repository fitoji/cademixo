import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/format/cade.ts';
import { buildProject, boundsOf, roundTrips } from '../src/model/project.ts';
import { createEditor, projectOf, addRoutedWire } from '../src/editor/state.ts';
import { routeOrthogonal } from '../src/editor/wiring/router.ts';
import { WIRE_TEMPLATES } from '../src/symbols/templates.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const ARRANQUE = readFileSync(join(FIXTURES, 'arranque-paro-motor-3f.cad'), 'latin1');
const WIRE = WIRE_TEMPLATES[4000]!;
const obstaclesOf = (text: string) =>
  buildProject(parse(text))
    .records.filter((rec) => rec.kind === 'component')
    .map((rec) => boundsOf(rec))
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .map((b) => ({ minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h }));

test('el texto tras dibujar un cable enrutado hace round-trip byte a byte', () => {
  let s = createEditor(ARRANQUE);
  s = addRoutedWire(s, { x: 300, y: 200 }, { x: 360, y: 230 }, obstaclesOf(ARRANQUE), WIRE);
  assert.equal(roundTrips(s.text), true, 'el formato sigue siendo CADe_SIMU puro');
});

test('dibujar un cable enrutado no reescribe los registros existentes', () => {
  const base = buildProject(parse(ARRANQUE)).records;
  const routed = createEditor(ARRANQUE);
  const after = projectOf(addRoutedWire(routed, { x: 300, y: 200 }, { x: 360, y: 230 }, obstaclesOf(ARRANQUE), WIRE))
    .records;
  assert.ok(after.length > base.length, 'se agregaron tramos');
  for (let i = 0; i < base.length; i++) {
    assert.equal(after[i]!.raw, base[i]!.raw, `el registro ${base[i]!.id} queda byte a byte`);
  }
});

test('50 rutas con 20 obstáculos se calculan en menos de 500 ms', () => {
  const obstacles = Array.from({ length: 20 }, (_, i) => ({
    minX: 20 + (i % 5) * 40,
    minY: 20 + Math.floor(i / 5) * 30,
    maxX: 36 + (i % 5) * 40,
    maxY: 32 + Math.floor(i / 5) * 30,
  }));
  const start = performance.now();
  for (let i = 0; i < 50; i++) {
    const r = routeOrthogonal({
      from: { x: 0, y: 10 + i },
      to: { x: 220, y: 150 - i },
      obstacles,
    });
    assert.ok(r.waypoints.length >= 2);
  }
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 500, `50 rutas tardaron ${elapsed.toFixed(1)} ms`);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/format/cade.ts';
import { buildProject } from '../src/model/project.ts';
import { buildNetwork } from '../src/editor/network.ts';
import { anchorPointOf, pathPoints, wirePathsOf } from '../src/editor/wiring/types.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const ARRANQUE = readFileSync(join(FIXTURES, 'arranque-paro-motor-3f.cad'), 'latin1');
const network = () => buildNetwork(buildProject(parse(ARRANQUE)).records);

test('wirePathsOf deriva un WirePath por cable con los waypoints ordenados', () => {
  const paths = wirePathsOf(network());
  const p17 = paths.find((p) => p.cable === 17)!;
  assert.ok(p17, 'el cable 17 existe en el fixture');
  assert.equal(p17.segmentIds.length, 3, 'el cable 17 tiene tres tramos');
  assert.equal(p17.vertices.length, 2, 'los vértices interiores son dos');
  assert.equal(p17.routing, 'manual', 'los waypoints vienen del archivo');
});

test('pathPoints reconstruye la polilínea completa y ortogonal', () => {
  const net = network();
  const paths = wirePathsOf(net);
  assert.ok(paths.length > 0);
  for (const path of paths) {
    const pts = pathPoints(net, path);
    assert.equal(pts.length, path.segmentIds.length + 1, `cable ${path.cable}: un punto más que tramos`);
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      assert.ok(
        Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01,
        `cable ${path.cable}: el tramo ${i} es ortogonal`,
      );
    }
  }
});

test('un ancla pin resuelve a una coordenada real', () => {
  const net = network();
  const path = wirePathsOf(net).find((p) => p.from.kind === 'pin' || p.to.kind === 'pin')!;
  const anchor = path.from.kind === 'pin' ? path.from : path.to;
  const pt = anchorPointOf(anchor, net);
  assert.ok(pt, 'el borne resuelve a un punto');
  assert.ok(Number.isFinite(pt.x) && Number.isFinite(pt.y));
});

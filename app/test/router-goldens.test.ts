/**
 * Caracterización del router: las mismas entradas deben devolver exactamente
 * las mismas secuencias de puntos. Los golden se capturaron con el router
 * anterior a indexar obstáculos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createEditor, projectOf } from '../src/editor/state.ts';
import { boundsOf } from '../src/model/project.ts';
import { routeOrthogonal, type Box } from '../src/editor/wiring/router.ts';
import { wiredSheetText } from '../bench/wired-sheet.ts';

const here = dirname(fileURLToPath(import.meta.url));
const goldens = JSON.parse(readFileSync(join(here, 'fixtures', 'route-goldens.json'), 'utf8')) as Array<{
  name: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  waypoints: Array<{ x: number; y: number }>;
  length: number;
  bends: number;
}>;

const sheet = wiredSheetText(9787);
const project = projectOf(createEditor(sheet.text));
const obstacles: Box[] = project.records
  .filter((rec) => rec.kind === 'component')
  .map((rec) => boundsOf(rec))
  .filter((b): b is NonNullable<typeof b> => b !== null)
  .map((b) => ({ minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h }));

test('las rutas son idénticas a las capturadas antes de indexar obstáculos', () => {
  for (const golden of goldens) {
    const result = routeOrthogonal({ from: golden.from, to: golden.to, obstacles });
    assert.deepEqual(result.waypoints, golden.waypoints, `waypoints de ${golden.name}`);
    assert.equal(result.length, golden.length, `longitud de ${golden.name}`);
    assert.equal(result.bends, golden.bends, `codos de ${golden.name}`);
  }
});

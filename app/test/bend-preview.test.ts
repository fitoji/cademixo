/**
 * El preview de doblar un cable dibuja exactamente la geometría que el commit
 * escribe. El commit no cambia: esto sólo verifica que la pintura no mienta.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyDrag, createEditor, projectOf, select } from '../src/editor/state.ts';
import { bendPreviewLegs } from '../src/editor/wiring/bend-preview.ts';
import { wirePoints, type WirePoints } from '../src/model/project.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const ARRANQUE = readFileSync(join(FIXTURES, 'arranque-paro-motor-3f.cad'), 'latin1');

const sig = (pts: WirePoints): string =>
  [`${pts.x1},${pts.y1}`, `${pts.x2},${pts.y2}`].sort().join('|');

test('el preview de doblar coincide con los tramos que escribe el commit', () => {
  const base = createEditor(ARRANQUE);
  const project = projectOf(base);
  const wires = project.records.filter((r) => r.kind === 'connection').slice(0, 12);
  let checked = 0;

  for (const rec of wires) {
    const pts = wirePoints(rec);
    if (!pts) continue;
    const vertical = Math.abs(pts.x1 - pts.x2) < 0.01;
    const at = { x: (pts.x1 + pts.x2) / 2, y: (pts.y1 + pts.y2) / 2 };
    for (const delta of [33, -33]) {
      const to = vertical ? { x: at.x + delta, y: at.y } : { x: at.x, y: at.y + delta };
      const preview = bendPreviewLegs(pts, at, to);
      const state = select(base, [rec.id]);
      const committed = projectOf(applyDrag(state, { kind: 'segment', id: rec.id, at, to, sheet: 0 }));
      if (committed.records.length === project.records.length) continue; // la poda deshizo el gesto

      const beforeIds = new Set(project.records.map((r) => r.id));
      const touched = committed.records.filter((r) => r.id === rec.id || !beforeIds.has(r.id));
      const written = touched.map((r) => wirePoints(r)).filter((p): p is WirePoints => p !== null);
      assert.deepEqual(
        written.map(sig).sort(),
        preview.map(sig).sort(),
        `cable ${rec.id} con delta ${delta}`,
      );
      checked += 1;
    }
  }

  assert.ok(checked > 0, 'algún cable debe ejercitar el preview');
});

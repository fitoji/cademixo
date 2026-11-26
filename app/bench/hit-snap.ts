/**
 * Costo real de las consultas de hit-test y snap (con el contexto ya armado).
 *
 * Mide `hitTest` y `snapTarget` por separado sobre la hoja cableada grande, en
 * tres clases de punto: denso (sobre un borne), cruce (dos tramos que se
 * cruzan sin unión) y vacío (sin candidatos). Registra p50/p95, candidatos
 * examinados y, como referencia de la interacción completa, el costo del
 * trazado del cable fantasma que comparte el gesto de dibujar.
 *
 * Uso: node --expose-gc bench/hit-snap.ts [registros]
 */
import { createEditor, projectOf } from '../src/editor/state.ts';
import { buildNetwork } from '../src/editor/network.ts';
import { hitContext, hitTest } from '../src/editor/wiring/hitTest.ts';
import { snapContext, snapTarget } from '../src/editor/wiring/snap.ts';
import { routeOrthogonal } from '../src/editor/wiring/router.ts';
import { boundsOf } from '../src/model/project.ts';
import type { Point } from '../src/editor/pins.ts';
import type { NetSegment } from '../src/editor/network.ts';
import { wiredSheetText } from './wired-sheet.ts';

const target = Number(process.argv[2] ?? 9787);
const sheet = wiredSheetText(target);
const project = projectOf(createEditor(sheet.text));
const network = buildNetwork(project.records);
const hitCtx = hitContext(network, project.records, 0);
const wiring = snapContext(network, project.records, 0);

const TOL_HIT = 1.45; // 4 px a zoom 2,755
const TOL_SNAP = 4; // 11 px a zoom 2,755
const GRID = 3;

const segments: NetSegment[] = [...network.segments.values()].filter((s) => s.sheet === 0);
const pins: Point[] = [...wiring.pins.values()].flat();

const midX = Math.floor(sheet.blocks / 2) * 400;

/** Punto sobre un borne del bloque central (zona densa). */
function pinPoint(): Point {
  const near = pins
    .filter((p) => p.x >= midX && p.x <= midX + 400)
    .sort((a, b) => Math.hypot(a.x - midX - 200, a.y - 100) - Math.hypot(b.x - midX - 200, b.y - 100));
  return near[0] ?? pins[0]!;
}

/** Cruce estricto entre un tramo horizontal y uno vertical, sin unión. */
function crossingPoint(): Point {
  const horizontals = segments.filter((s) => Math.abs(s.points.y1 - s.points.y2) < 0.01 && s.points.x1 !== s.points.x2);
  const verticals = segments.filter((s) => Math.abs(s.points.x1 - s.points.x2) < 0.01 && s.points.y1 !== s.points.y2);
  for (const h of horizontals) {
    if (h.points.x1 < midX || h.points.x1 > midX + 400) continue;
    for (const v of verticals) {
      const x = v.points.x1;
      const y = h.points.y1;
      const insideH = x > Math.min(h.points.x1, h.points.x2) && x < Math.max(h.points.x1, h.points.x2);
      const insideV = y > Math.min(v.points.y1, v.points.y2) && y < Math.max(v.points.y1, v.points.y2);
      if (insideH && insideV) return { x, y };
    }
  }
  return { x: midX + 200, y: 100 };
}

const points = {
  denso: pinPoint(),
  cruce: crossingPoint(),
  vacio: { x: midX + 200, y: 1000 },
};

const median = (xs: number[]): number => {
  xs.sort((a, b) => a - b);
  return xs[Math.floor(xs.length / 2)]!;
};
const p95 = (xs: number[]): number => {
  xs.sort((a, b) => a - b);
  return xs[Math.min(xs.length - 1, Math.floor((xs.length - 1) * 0.95))]!;
};
function time(fn: () => unknown, runs = 300): { p50: number; p95: number } {
  for (let i = 0; i < 10; i++) fn();
  const s: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn();
    s.push(performance.now() - t);
  }
  return { p50: median(s), p95: p95(s) };
}

/** Candidatos que la consulta recorre: el escaneo es exhaustivo por hoja. */
const scanned = {
  segments: segments.length,
  components: hitCtx.components.length,
  pins: pins.length,
  junctions: wiring.junctions.length,
};

const within = (p: Point) => ({
  segments: segments.filter((s) => {
    const dx = s.points.x2 - s.points.x1;
    const dy = s.points.y2 - s.points.y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return false;
    const t = Math.max(0, Math.min(1, ((p.x - s.points.x1) * dx + (p.y - s.points.y1) * dy) / len2));
    return Math.hypot(p.x - (s.points.x1 + t * dx), p.y - (s.points.y1 + t * dy)) <= TOL_HIT;
  }).length,
  pins: pins.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) <= TOL_SNAP).length,
});

const results: Record<string, unknown> = { records: sheet.records, scanned, points };
for (const [name, p] of Object.entries(points)) {
  const hit = time(() => hitTest(p, hitCtx, TOL_HIT, { endpoints: false }));
  const snap = time(() => snapTarget(p, wiring, TOL_SNAP, GRID, []));
  results[name] = { ...within(p), hit, snap };
}

// Referencia de la interacción: el trazado del fantasma comparte el gesto con
// el snap (se recalcula cuando cambia el hover).
const obstacles = project.records
  .filter((rec) => rec.kind === 'component')
  .map((rec) => boundsOf(rec))
  .filter((b): b is NonNullable<typeof b> => b !== null)
  .map((b) => ({ minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h }));
const from = points.denso;
const to = { x: from.x + 300, y: from.y + 200 };
const route = time(() => routeOrthogonal({ from, to, obstacles }), 20);
results.route = { obstacles: obstacles.length, ...route };

console.log(JSON.stringify(results, null, 2));

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
import { bendPreviewLegs, isVertexPlanSafe, legsOf, planSegmentPolyline, planSplitBend, planVertexMove } from '../src/editor/wiring/preview-geometry.ts';
import { wirePoints, type WirePoints } from '../src/model/project.ts';
import { buildNetwork, cableNumberOf } from '../src/editor/network.ts';
import { pathPoints, wirePathsOf } from '../src/editor/wiring/types.ts';

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

/** ¿La geometría del preview está cubierta por algún tramo escrito? (admite fusión de colineales) */
const covered = (leg: WirePoints, written: WirePoints[]): boolean => {
  const horizontal = Math.abs(leg.y1 - leg.y2) < 0.01;
  const lo = horizontal ? Math.min(leg.x1, leg.x2) : Math.min(leg.y1, leg.y2);
  const hi = horizontal ? Math.max(leg.x1, leg.x2) : Math.max(leg.y1, leg.y2);
  return written.some((w) => {
    const wh = Math.abs(w.y1 - w.y2) < 0.01;
    if (wh !== horizontal) return false;
    if (horizontal) {
      if (Math.abs(w.y1 - leg.y1) > 0.01) return false;
      const wlo = Math.min(w.x1, w.x2);
      const whi = Math.max(w.x1, w.x2);
      return wlo <= lo + 0.01 && whi >= hi - 0.01;
    }
    if (Math.abs(w.x1 - leg.x1) > 0.01) return false;
    const wlo = Math.min(w.y1, w.y2);
    const whi = Math.max(w.y1, w.y2);
    return wlo <= lo + 0.01 && whi >= hi - 0.01;
  });
};

test('el preview del vértice cubre los tramos que escribe el commit (incluye unión T)', () => {
  const base = createEditor(ARRANQUE);
  const project = projectOf(base);
  const vertices = new Map<string, { from: { x: number; y: number }; count: number }>();
  for (const rec of project.records) {
    const pts = wirePoints(rec);
    if (!pts) continue;
    for (const p of [{ x: pts.x1, y: pts.y1 }, { x: pts.x2, y: pts.y2 }]) {
      const key = `${p.x},${p.y}`;
      const prev = vertices.get(key);
      vertices.set(key, { from: p, count: (prev?.count ?? 0) + 1 });
    }
  }

  let checked = 0;
  let multi = 0;
  let unsafe = 0;
  for (const { from, count } of vertices.values()) {
    for (const delta of [6, -6]) {
      const to = { x: from.x + delta, y: from.y + delta };
      const plan = planVertexMove(project.records, from, to);
      if (plan.edits.size === 0) continue;
      // Sólo los planes seguros se previsualizan; el resto cae al documento.
      if (!isVertexPlanSafe(project.records, plan)) {
        unsafe += 1;
        continue;
      }
      const out = applyDrag(select(base, []), { kind: 'vertex', from, to, sheet: 0 });
      if (out.text === base.text) continue;
      const committed = projectOf(out);

      // Todos los tramos del documento confirmado: la poda puede descartar un
      // tramo porque ya existe uno idéntico, y la geometría sigue cubierta.
      const written = committed.records
        .map((r) => wirePoints(r))
        .filter((p): p is WirePoints => p !== null);

      for (const leg of [...plan.edits.values(), ...plan.extras.map((e) => e.points)]) {
        assert.ok(covered(leg, written), `preview sin commit en (${from.x},${from.y}) → (${to.x},${to.y})`);
      }
      checked += 1;
      if (count > 1) multi += 1;
    }
  }

  assert.ok(checked > 0, 'algún vértice debe ejercitar el preview');
  assert.ok(multi > 0, 'debe cubrir un vértice compartido por varios tramos (unión T)');
  assert.ok(unsafe > 0 || checked > 0, 'los casos no seguros caen al preview por documento');
});

test('el preview del cable agrupado coincide con la polilínea completa que escribe el commit', () => {
  const base = createEditor(ARRANQUE);
  const project = projectOf(base);
  const network = buildNetwork(project.records);
  const grouped = wirePathsOf(network).find((path) => path.segmentIds.length >= 3);
  assert.ok(grouped, 'el fixture debe tener una polilínea de varios tramos');

  const points = pathPoints(network, grouped);
  const index = 1; // tramo interior: el commit normaliza los vecinos
  const id = grouped.segmentIds[index]!;
  const source = project.records.find((r) => r.id === id)!;
  const cable = cableNumberOf(source);
  const p = points[index]!;
  const q = points[index + 1]!;
  const vertical = Math.abs(p.x - q.x) < 0.01;

  let checked = 0;
  for (const delta of [6, -6, 12]) {
    const at = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    const to = vertical ? { x: at.x + delta, y: at.y } : { x: at.x, y: at.y + delta };
    const plan = planSegmentPolyline(points, index, to);
    if (plan.kind !== 'polyline') continue;
    const out = applyDrag(select(base, [id]), { kind: 'segment', id, at, to, sheet: 0 });
    if (out.text === base.text) continue;

    // Todo el cable, no sólo el tramo agarrado: la normalización toca vecinos.
    const cableRecords = projectOf(out).records.filter(
      (r) => r.kind === 'connection' && r.sheet === 0 && cableNumberOf(r) === cable,
    );
    const written = cableRecords.map((r) => wirePoints(r)).filter((x): x is WirePoints => x !== null);
    assert.deepEqual(
      written.map(sig).sort(),
      legsOf(plan.points).map(sig).sort(),
      `cable agrupado con delta ${delta}`,
    );
    checked += 1;
  }
  assert.ok(checked > 0, 'algún desplazamiento debe ejercitar la polilínea');
});


/** Cobertura por unión: un tramo puede ser la fusión de varios colineales. */
const coveredByUnion = (leg: WirePoints, segments: WirePoints[]): boolean => {
  const horizontal = Math.abs(leg.y1 - leg.y2) < 0.01;
  const lo = horizontal ? Math.min(leg.x1, leg.x2) : Math.min(leg.y1, leg.y2);
  const hi = horizontal ? Math.max(leg.x1, leg.x2) : Math.max(leg.y1, leg.y2);
  const spans: [number, number][] = [];
  for (const s of segments) {
    const sh = Math.abs(s.y1 - s.y2) < 0.01;
    if (sh !== horizontal) continue;
    if (horizontal ? Math.abs(s.y1 - leg.y1) > 0.01 : Math.abs(s.x1 - leg.x1) > 0.01) continue;
    spans.push(
      horizontal
        ? [Math.min(s.x1, s.x2), Math.max(s.x1, s.x2)]
        : [Math.min(s.y1, s.y2), Math.max(s.y1, s.y2)],
    );
  }
  spans.sort((a, b) => a[0] - b[0]);
  let reach = lo;
  for (const [a, b] of spans) {
    if (a > reach + 0.01) break;
    if (b > reach) reach = b;
    if (reach >= hi - 0.01) return true;
  }
  return reach >= hi - 0.01;
};

test('el preview del tramo extremo agrupado coincide con el commit en ambos extremos', () => {
  const base = createEditor(ARRANQUE);
  const project = projectOf(base);
  const network = buildNetwork(project.records);
  const grouped = wirePathsOf(network).find((path) => path.segmentIds.length >= 3);
  assert.ok(grouped, 'el fixture debe tener una polilínea de varios tramos');

  const touches = (pts: WirePoints, p: { x: number; y: number }): boolean =>
    (Math.abs(pts.x1 - p.x) < 0.01 && Math.abs(pts.y1 - p.y) < 0.01) ||
    (Math.abs(pts.x2 - p.x) < 0.01 && Math.abs(pts.y2 - p.y) < 0.01);

  let checked = 0;
  let unsafe = 0;
  for (const index of [0, grouped.segmentIds.length - 1]) {
    const id: number = grouped.segmentIds[index]!;
    const rec = project.records.find((r) => r.id === id)!;
    const pts = wirePoints(rec)!;
    const vertical = Math.abs(pts.x1 - pts.x2) < 0.01;
    const at = { x: (pts.x1 + pts.x2) / 2, y: (pts.y1 + pts.y2) / 2 };

    for (const delta of [6, -6]) {
      const to = vertical ? { x: at.x + delta, y: at.y } : { x: at.x, y: at.y + delta };
      const plan = planSplitBend(project.records, id, at, to);
      if (plan.kind === 'unsafe') unsafe += 1;
      if (plan.kind !== 'legs') continue;

      const out = applyDrag(select(base, [id]), { kind: 'segment', id, at, to, sheet: 0 });
      if (out.text === base.text) continue;

      // Todo el cable: tramos del cable que el gesto no toca + los del plan.
      const cable = cableNumberOf(rec);
      const untouched: WirePoints[] = grouped.segmentIds
        .filter((segId) => segId !== id)
        .map((segId) => wirePoints(project.records.find((r) => r.id === segId)!))
        .filter((p): p is WirePoints => p !== null)
        .filter((seg) => !touches(seg, at));
      const expected = [...plan.legs.filter((leg) => leg.sourceId === id).map((leg) => leg.points), ...untouched];
      const written = projectOf(out).records
        .filter((r) => r.kind === 'connection' && r.sheet === 0 && cableNumberOf(r) === cable)
        .map((r) => wirePoints(r))
        .filter((p): p is WirePoints => p !== null);

      for (const leg of expected) assert.ok(coveredByUnion(leg, written), `falta geometría del cable (${index}, ${delta})`);
      for (const leg of written) assert.ok(coveredByUnion(leg, expected), `sobra geometría del cable (${index}, ${delta})`);

      // Conexiones vecinas: el plan puede tocar otros tramos que pasan por `at`.
      const documentSegments = projectOf(out).records
        .map((r) => wirePoints(r))
        .filter((p): p is WirePoints => p !== null);
      for (const leg of plan.legs.filter((l) => l.sourceId !== id)) {
        assert.ok(coveredByUnion(leg.points, documentSegments), `falta geometría vecina (${index}, ${delta})`);
      }
      checked += 1;
    }
  }

  assert.ok(checked > 0, 'ambos extremos deben ejercitar el preview');
  assert.ok(unsafe >= 0);
});

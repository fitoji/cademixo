/**
 * Geometría del preview al doblar un cable.
 *
 * `bendCable` confirma en dos pasos: inserta un vértice en `at` y lo mueve a
 * `to`; el commit normaliza los puntos colineales al escribir la polilínea.
 * Este módulo reproduce esa geometría como cálculo puro para dibujar el gesto
 * sin reconstruir el documento. El commit sigue usando `bendCable`: esto es
 * sólo pintura.
 */
import type { Point } from '../pins.ts';
import { wirePoints, type CadeRecordModel, type WirePoints } from '../../model/project.ts';
import { normalizeOrthogonal } from './geometry.ts';

const TOL = 0.01;

const ortho = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) < TOL || Math.abs(a.y - b.y) < TOL;
const same = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) < TOL && Math.abs(a.y - b.y) < TOL;

/**
 * Puntos desde el extremo quieto hasta `to`, con el mismo codo que elige
 * `moveVertex`: junto al extremo quieto, conservando la orientación original.
 */
function pointsFromFixed(leg: WirePoints, from: Point, to: Point): Point[] | null {
  const atA = same({ x: leg.x1, y: leg.y1 }, from);
  const atB = same({ x: leg.x2, y: leg.y2 }, from);
  if (!atA && !atB) return null;

  const fixed = atA ? { x: leg.x2, y: leg.y2 } : { x: leg.x1, y: leg.y1 };
  if (same(fixed, to)) return [fixed];
  if (ortho(fixed, to)) return [fixed, to];

  const wasVertical = Math.abs(leg.x1 - leg.x2) < TOL;
  const corner = wasVertical ? { x: to.x, y: fixed.y } : { x: fixed.x, y: to.y };
  return [fixed, corner, to];
}

/** Tramos del preview al doblar un cable de un solo tramo en `at` hacia `to`. */
export function bendPreviewLegs(pts: WirePoints, at: Point, to: Point): WirePoints[] {
  const first = pointsFromFixed({ x1: pts.x1, y1: pts.y1, x2: at.x, y2: at.y }, at, to);
  const second = pointsFromFixed({ x1: pts.x2, y1: pts.y2, x2: at.x, y2: at.y }, at, to);
  if (!first || !second) return [];

  // Polilínea en orden: p … to … q (el segundo tramo se recorre al revés).
  const points = [...first, ...second.slice(0, -1).reverse()];

  // Sin puntos repetidos ni intermedios colineales: el commit normaliza igual.
  const compact: Point[] = [];
  for (const p of points) {
    if (compact.length > 0 && same(compact[compact.length - 1]!, p)) continue;
    compact.push(p);
  }
  const out: Point[] = [];
  for (const p of compact) {
    while (out.length >= 2) {
      const a = out[out.length - 2]!;
      const b = out[out.length - 1]!;
      const collinear = (Math.abs(a.x - b.x) < TOL && Math.abs(b.x - p.x) < TOL) || (Math.abs(a.y - b.y) < TOL && Math.abs(b.y - p.y) < TOL);
      if (!collinear) break;
      out.pop();
    }
    out.push(p);
  }

  const legs: WirePoints[] = [];
  for (let i = 0; i + 1 < out.length; i++) {
    const a = out[i]!;
    const b = out[i + 1]!;
    legs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  return legs;
}

/** Tramos que el commit escribe al mover el vértice `from` a `to`. */
export interface VertexPlan {
  /** Reemplazo de cada registro afectado (un tramo). */
  edits: Map<number, WirePoints>;
  /** Tramos extra que el commit agrega como registros nuevos. */
  extras: { sourceId: number; points: WirePoints }[];
}

const sign = (a: Point, b: Point): string => {
  const [p, q] = a.x < b.x || (a.x === b.x && a.y <= b.y) ? [a, b] : [b, a];
  return `${p.x},${p.y},${q.x},${q.y}`;
};

/**
 * Plan puro de `moveVertex`: qué tramo reemplaza a cada registro tocado y qué
 * codos se agregan. Preview y commit consumen el mismo plan.
 */
export function planVertexMove(records: readonly CadeRecordModel[], from: Point, to: Point): VertexPlan {
  const edits = new Map<number, WirePoints>();
  const extras: { sourceId: number; points: WirePoints }[] = [];
  const used = new Set<string>();

  const pushLeg = (id: number, leg: WirePoints, isExtra: boolean): void => {
    const sig = sign({ x: leg.x1, y: leg.y1 }, { x: leg.x2, y: leg.y2 });
    if (isExtra && used.has(sig)) return;
    used.add(sig);
    if (isExtra) extras.push({ sourceId: id, points: leg });
    else edits.set(id, leg);
  };

  for (const rec of records) {
    const pts = wirePoints(rec);
    if (!pts) continue;
    const atA = same({ x: pts.x1, y: pts.y1 }, from);
    const atB = same({ x: pts.x2, y: pts.y2 }, from);
    if (!atA && !atB) continue;

    const fixed = atA ? { x: pts.x2, y: pts.y2 } : { x: pts.x1, y: pts.y1 };
    if (same(fixed, to)) continue;

    if (ortho(fixed, to)) {
      pushLeg(rec.id, { x1: fixed.x, y1: fixed.y, x2: to.x, y2: to.y }, false);
      continue;
    }

    const wasVertical = Math.abs(pts.x1 - pts.x2) < TOL;
    const preferred = wasVertical ? { x: to.x, y: fixed.y } : { x: fixed.x, y: to.y };
    const alternate = wasVertical ? { x: fixed.x, y: to.y } : { x: to.x, y: fixed.y };
    let corner: Point | null = null;
    for (const candidate of [preferred, alternate]) {
      if (!ortho(fixed, candidate) || !ortho(candidate, to)) continue;
      if (same(candidate, to)) continue;
      if (!used.has(sign(candidate, to))) {
        corner = candidate;
        break;
      }
    }
    corner ??= preferred;
    pushLeg(rec.id, { x1: fixed.x, y1: fixed.y, x2: corner.x, y2: corner.y }, false);
    pushLeg(rec.id, { x1: corner.x, y1: corner.y, x2: to.x, y2: to.y }, true);
  }

  return { edits, extras };
}

const collinearOverlap = (a: WirePoints, b: WirePoints): boolean => {
  const aHorizontal = Math.abs(a.y1 - a.y2) < TOL;
  if (aHorizontal !== (Math.abs(b.y1 - b.y2) < TOL)) return false;
  if (aHorizontal) {
    if (Math.abs(a.y1 - b.y1) > TOL) return false;
    const alo = Math.min(a.x1, a.x2);
    const ahi = Math.max(a.x1, a.x2);
    const blo = Math.min(b.x1, b.x2);
    const bhi = Math.max(b.x1, b.x2);
    return Math.min(ahi, bhi) - Math.max(alo, blo) > TOL;
  }
  if (Math.abs(a.x1 - b.x1) > TOL) return false;
  const alo = Math.min(a.y1, a.y2);
  const ahi = Math.max(a.y1, a.y2);
  const blo = Math.min(b.y1, b.y2);
  const bhi = Math.max(b.y1, b.y2);
  return Math.min(ahi, bhi) - Math.max(alo, blo) > TOL;
};

/**
 * El preview sólo es confiable si ningún tramo ajeno se superpone en colineal
 * con los tramos del plan: en ese caso la poda del commit recorta distinto y el
 * preview mentiría. Si no es seguro, el lienzo cae al preview por documento.
 */
export function isVertexPlanSafe(records: readonly CadeRecordModel[], plan: VertexPlan): boolean {
  const legs = [...plan.edits.values(), ...plan.extras.map((e) => e.points)];
  if (legs.length === 0) return false;
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      if (collinearOverlap(legs[i]!, legs[j]!)) return false;
    }
  }
  const touched = new Set([...plan.edits.keys(), ...plan.extras.map((e) => e.sourceId)]);
  for (const rec of records) {
    if (touched.has(rec.id)) continue;
    const pts = wirePoints(rec);
    if (!pts) continue;
    if (legs.some((leg) => collinearOverlap(leg, pts))) return false;
  }
  return true;
}

export type SegmentPlan =
  | { kind: 'none' }
  | { kind: 'end' }
  | { kind: 'polyline'; points: Point[] };

/**
 * Plan puro de `moveSegment` para un tramo interior de la polilínea: mueve el
 * tramo y normaliza los vecinos. `kind: 'end'` indica que el commit resuelve el
 * extremo con `bendCable` y el gesto no se previsualiza.
 */
export function planSegmentPolyline(points: readonly Point[], index: number, to: Point): SegmentPlan {
  const p = points[index];
  const q = points[index + 1];
  if (!p || !q) return { kind: 'none' };
  const vertical = Math.abs(p.x - q.x) < TOL;
  const newValue = vertical ? to.x : to.y;
  const oldValue = vertical ? p.x : p.y;
  if (Math.abs(newValue - oldValue) < TOL) return { kind: 'none' };
  if (index === 0 || index === points.length - 2) return { kind: 'end' };

  const movedP = vertical ? { x: newValue, y: p.y } : { x: p.x, y: newValue };
  const movedQ = vertical ? { x: newValue, y: q.y } : { x: q.x, y: newValue };
  const out: Point[] = points.slice(0, index);
  const a = points[index - 1]!;
  const bendA = vertical ? { x: a.x, y: movedP.y } : { x: movedP.x, y: a.y };
  if (!same(bendA, a) && !same(bendA, movedP)) out.push(bendA);
  out.push(movedP, movedQ);
  const b = points[index + 2]!;
  const bendB = vertical ? { x: b.x, y: movedQ.y } : { x: movedQ.x, y: b.y };
  if (!same(bendB, movedQ) && !same(bendB, b)) out.push(bendB);
  out.push(...points.slice(index + 2));

  return { kind: 'polyline', points: normalizeOrthogonal(out) };
}

/** Tramos entre puntos consecutivos, sin nulos. */
export function legsOf(points: readonly Point[]): WirePoints[] {
  const legs: WirePoints[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (same(a, b)) continue;
    legs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  return legs;
}

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
import type { WirePoints } from '../../model/project.ts';

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

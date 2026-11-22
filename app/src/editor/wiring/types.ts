/**
 * Tipos del dominio de cableado (fase 1 del plan de
 * `docs/WIRING_ARCHITECTURE.md`, revisado en `docs/WIRING_ARCHITECTURE_REVIEW.md`).
 *
 * Correspondencia con el formato CADe_SIMU:
 *
 * | entidad         | registro fuente                                        |
 * |-----------------|--------------------------------------------------------|
 * | `WirePath`      | grupo de registros 4xxx con el mismo número de cable   |
 * |                 | (`geometry[21]`) en la misma hoja                      |
 * | `JunctionPoint` | registro 4001 (`geometry[8..9]` = x, y)                |
 * | ancla de pin    | un punto de `attachPoints` del componente (pins.ts)    |
 * | ancla libre     | extremo de tramo sin borne ni unión                    |
 *
 * Importante: el formato **no guarda anclas**. La conectividad es siempre
 * geométrica y se re-deriva al parsear (`buildNetwork`, editor/network.ts).
 * Estos tipos son la representación editable durante un gesto (el
 * `WiringDraft`), no un modelo persistente: al confirmar, los comandos
 * escriben registros 4xxx/4001 y las anclas vuelven a derivarse.
 */

import type { Point } from '../pins.ts';

/**
 * Extremo de un cable. La identidad es explícita durante la edición (el snap
 * la resuelve), aunque el archivo solo guarde la coordenada resultante.
 */
export type Anchor =
  /** Borne de un componente: el índice dentro de la lista de `attachPoints`. */
  | { kind: 'pin'; componentId: number; pinIndex: number }
  /** Punto de unión declarado por un registro 4001. */
  | { kind: 'junction'; recordId: number }
  /** Extremo suelto, sin borne ni unión: es el estado de un cable a medio dibujar. */
  | { kind: 'free'; point: Point };

/** Cable lógico: el grupo de tramos que el usuario ve como un solo cable. */
export interface WirePath {
  /** Ids de los registros 4xxx del grupo, en orden de archivo. */
  segmentIds: number[];
  sheet: number;
  /** Número de cable (`geometry[21]`); 0 = sin número. */
  cable: number;
  from: Anchor;
  to: Anchor;
  /**
   * Vértices interiores, sin los extremos (convención del proyecto). La
   * polilínea completa es `[puntoDe(from), ...vertices, puntoDe(to)]`.
   */
  vertices: Point[];
  routing: 'manual' | 'auto';
}

/** Punto de unión declarado por un registro 4001. */
export interface JunctionPoint {
  recordId: number;
  sheet: number;
  point: Point;
}

/**
 * Borrador transitorio de un gesto: se construye al empezar, se renderiza como
 * preview y se confirma una sola vez al soltar. Nunca entra al historial; lo
 * que entra es el texto confirmado por el comando.
 */
export interface WiringDraft {
  paths: Map<number, WirePath>;
  junctions: Map<number, JunctionPoint>;
}

// --- vista derivada ----------------------------------------------------------
//
// Los registros siguen siendo la única fuente de verdad: estas funciones NO
// guardan nada, sólo proyectan el `Network` (que ya se deriva del texto) a los
// tipos del dominio. `routing: 'manual'` significa "los waypoints están en el
// archivo"; el router los respeta salvo petición explícita (S4).

import { netKey, type Network, type NetSegment } from '../network.ts';
import { EPS } from './geometry.ts';

/** Resuelve un ancla a coordenadas usando la red derivada del archivo. */
export function anchorPointOf(anchor: Anchor, network: Network): Point | null {
  switch (anchor.kind) {
    case 'pin': {
      const list = network.pins.get(anchor.componentId);
      const p = list?.[anchor.pinIndex];
      return p ? { ...p } : null;
    }
    case 'junction': {
      const j = network.junctionPoints.find((p) => p.recordId === anchor.recordId);
      return j ? { x: j.x, y: j.y } : null;
    }
    case 'free':
      return { ...anchor.point };
  }
}

/** Ordena los tramos de un cable en una cadena continua. */
function orderSegments(segments: readonly NetSegment[]): NetSegment[] {
  if (segments.length <= 1) return [...segments];
  const byKey = new Map<string, NetSegment[]>();
  for (const s of segments) {
    for (const k of [s.a, s.b]) {
      const list = byKey.get(k) ?? [];
      list.push(s);
      byKey.set(k, list);
    }
  }
  const boundary = segments.find(
    (s) => (byKey.get(s.a)?.length ?? 0) === 1 || (byKey.get(s.b)?.length ?? 0) === 1,
  );
  const start = boundary ?? segments[0]!;
  const startKey = (byKey.get(start.a)?.length ?? 0) === 1 ? start.a : start.b;
  const used = new Set<number>([start.id]);
  const ordered = [start];
  let key = startKey === start.a ? start.b : start.a;
  while (ordered.length < segments.length) {
    const next = (byKey.get(key) ?? []).find((s) => !used.has(s.id));
    if (!next) break;
    used.add(next.id);
    ordered.push(next);
    key = next.a === key ? next.b : next.a;
  }
  return ordered;
}

/** Polilínea completa (extremos incluidos) de un conjunto de tramos. */
function polylineOf(segments: readonly NetSegment[]): Point[] {
  const ordered = orderSegments(segments);
  if (ordered.length === 0) return [];
  const byKey = new Map<string, NetSegment[]>();
  for (const s of ordered) {
    for (const k of [s.a, s.b]) byKey.set(k, [...(byKey.get(k) ?? []), s]);
  }
  const start = ordered[0]!;
  let key = (byKey.get(start.a)?.length ?? 0) === 1 ? start.a : start.b;
  const points: Point[] = [];
  for (const seg of ordered) {
    const fromA = seg.a === key;
    const first = fromA ? seg.points : { x1: seg.points.x2, y1: seg.points.y2, x2: seg.points.x1, y2: seg.points.y1 };
    if (points.length === 0) points.push({ x: first.x1, y: first.y1 });
    points.push({ x: first.x2, y: first.y2 });
    key = fromA ? seg.b : seg.a;
  }
  return points;
}

function anchorAt(network: Network, sheet: number, point: Point): Anchor {
  const node = network.nodes.get(netKey(sheet, point.x, point.y));
  if (node?.junction) {
    const j = network.junctionPoints.find(
      (p) => p.sheet === sheet && Math.abs(p.x - point.x) < EPS && Math.abs(p.y - point.y) < EPS,
    );
    if (j) return { kind: 'junction', recordId: j.recordId };
  }
  if (node?.pin) {
    for (const [componentId, list] of network.pins) {
      const pinIndex = list.findIndex((p) => Math.abs(p.x - point.x) < EPS && Math.abs(p.y - point.y) < EPS);
      if (pinIndex >= 0) return { kind: 'pin', componentId, pinIndex };
    }
  }
  return { kind: 'free', point: { ...point } };
}

/** Deriva un `WirePath` por cada número de cable de la red. */
export function wirePathsOf(network: Network): WirePath[] {
  const out: WirePath[] = [];
  for (const [groupKey, ids] of network.cables) {
    const [sheetText, cableText] = groupKey.split(':');
    const sheet = Number(sheetText);
    const cable = Number(cableText);
    const segments = ids
      .map((id) => network.segments.get(id))
      .filter((s): s is NetSegment => s !== undefined);
    if (segments.length === 0) continue;
    const ordered = orderSegments(segments);
    const points = polylineOf(ordered);
    if (points.length < 2) continue;
    out.push({
      segmentIds: ordered.map((s) => s.id),
      sheet,
      cable,
      from: anchorAt(network, sheet, points[0]!),
      to: anchorAt(network, sheet, points.at(-1)!),
      vertices: points.slice(1, -1),
      routing: 'manual',
    });
  }
  return out;
}

/** La polilínea completa de un `WirePath`, en orden de extremo a extremo. */
export function pathPoints(network: Network, path: WirePath): Point[] {
  const segments = path.segmentIds
    .map((id) => network.segments.get(id))
    .filter((s): s is NetSegment => s !== undefined);
  return polylineOf(segments);
}

/**
 * Router ortogonal para cables (F1 del plan `docs/WIRING_ARCHITECTURE.md:127`).
 *
 * Algoritmo: Orthogonal Connector Routing (Wybrow, Marriott & Stuckey, 2009),
 * la base de libavoid. En vez de una grilla de píxeles se usa el **grafo de
 * visibilidad ortogonal**: coordenadas de los bordes de los obstáculos (con
 * margen) y de los extremos; los nodos son sus intersecciones libres y las
 * aristas van al vecino más cercano en cada dirección cardinal. A* con estado
 * `(nodo, dirección)` minimiza `longitud + λ·codos` y es determinista.
 *
 * Es una función pura: no conoce el formato CADe, no muta nada y devuelve
 * waypoints. La conversión a registros 4xxx vive en la capa de comandos (T3).
 */

import type { Point } from '../pins.ts';
import { normalizeOrthogonal, pathLength } from './geometry.ts';

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Tramo recto que la ruta no puede compartir en colineal. */
export interface LineObstacle {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RouteRequest {
  from: Point;
  to: Point;
  obstacles: readonly Box[];
  /** Margen alrededor de cada símbolo. Por defecto 1 unidad de plano. */
  padding?: number;
  /** Coste de cada codo. Por defecto 20 (docs/WIRING_ARCHITECTURE.md:137). */
  bendPenalty?: number;
  /**
   * Trazado previo: en empates de coste se prefiere la ruta que reutiliza sus
   * carriles. El dibujo manual no lo pasa, así que su comportamiento no cambia.
   */
  preferred?: readonly Point[];
  /**
   * Si es `true`, un obstáculo que sólo toca el borde de un extremo sigue
   * bloqueando su interior (el extremo puede estar sobre el borde del símbolo).
   * Por defecto se conserva la regla histórica de excluir el obstáculo entero.
   */
  keepBoundaryObstacles?: boolean;
  /**
   * Tramos de otras redes que la ruta no puede reutilizar en colineal. Un cruce
   * perpendicular sigue permitido: el modelo eléctrico lo lee como cruce sin
   * unión.
   */
  avoid?: readonly LineObstacle[];
}

export interface RouteResult {
  waypoints: Point[];
  length: number;
  bends: number;
  /** Nodos expandidos por A*: útil para el benchmark de F5. */
  explored: number;
  /** `false` si el grafo de visibilidad no encontró camino. */
  found: boolean;
}

const EPS = 1e-6;
const DX = [1, 0, -1, 0] as const;
const DY = [0, 1, 0, -1] as const;

const same = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
const manhattan = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const right = (dir: number): number => (dir + 1) % 4;
const left = (dir: number): number => (dir + 3) % 4;

/** Candidatos rápidos para el preview: HV y VH, con un solo codo. */
export function routeSimple(from: Point, to: Point, preference: 'H' | 'V'): Point[] {
  const corner = preference === 'H' ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
  return [{ ...from }, corner, { ...to }];
}

interface Entry {
  f: number;
  g: number;
  length: number;
  bends: number;
  node: number;
  dir: number;
  parent: number;
  seq: number;
  /** Longitud de arista que coincide con el trazado previo (desempate). */
  pref: number;
}

/** Heap binario mínimo con tie-break por orden de inserción. */
class MinHeap {
  private items: Entry[] = [];

  get size(): number {
    return this.items.length;
  }

  push(entry: Entry): void {
    const items = this.items;
    items.push(entry);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(items[i]!, items[parent]!)) break;
      [items[i], items[parent]] = [items[parent]!, items[i]!];
      i = parent;
    }
  }

  pop(): Entry | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && this.less(items[l]!, items[smallest]!)) smallest = l;
        if (r < items.length && this.less(items[r]!, items[smallest]!)) smallest = r;
        if (smallest === i) break;
        [items[i], items[smallest]] = [items[smallest]!, items[i]!];
        i = smallest;
      }
    }
    return top;
  }

  private less(a: Entry, b: Entry): boolean {
    if (a.f !== b.f) return a.f < b.f;
    if (a.pref !== b.pref) return a.pref > b.pref;
    return a.seq < b.seq;
  }
}

/** Ruta ortogonal óptima según `longitud + λ·codos`. */
/** Contador de cálculos de ruta. Lo lee el benchmark; no altera el resultado. */
export const routeStats = { calls: 0 };

if (typeof window !== 'undefined') {
  (window as unknown as { __routeStats?: typeof routeStats }).__routeStats = routeStats;
}

/** Índice espacial conservador sobre los obstáculos que bloquean. */
interface BoxIndex {
  minX: number;
  minY: number;
  cw: number;
  ch: number;
  cells: Map<string, Box[]>;
}

function buildBoxIndex(boxes: Box[]): BoxIndex | null {
  if (boxes.length < 64) return null; // pocos: el escaneo directo es más barato
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  const side = Math.max(1, Math.ceil(Math.sqrt(boxes.length)));
  const cw = Math.max(1, (maxX - minX) / side);
  const ch = Math.max(1, (maxY - minY) / side);
  const cells = new Map<string, Box[]>();
  for (const b of boxes) {
    const x0 = Math.floor((b.minX - minX) / cw);
    const x1 = Math.floor((b.maxX - minX) / cw);
    const y0 = Math.floor((b.minY - minY) / ch);
    const y1 = Math.floor((b.maxY - minY) / ch);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const key = `${cx},${cy}`;
        const list = cells.get(key);
        if (list) list.push(b);
        else cells.set(key, [b]);
      }
    }
  }
  return { minX, minY, cw, ch, cells };
}

/** Cajas que podrían tocar un punto (una celda: cualquier caja que lo contenga está ahí). */
function boxesAt(index: BoxIndex | null, boxes: Box[], p: Point): Box[] {
  if (index === null) return boxes;
  const cx = Math.floor((p.x - index.minX) / index.cw);
  const cy = Math.floor((p.y - index.minY) / index.ch);
  return index.cells.get(`${cx},${cy}`) ?? [];
}

/** Cajas que podrían tocar un tramo recto (todas las celdas de su caja envolvente). */
function boxesOnSegment(index: BoxIndex | null, boxes: Box[], a: Point, b: Point): Box[] {
  if (index === null) return boxes;
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const x0 = Math.floor((minX - index.minX) / index.cw);
  const x1 = Math.floor((maxX - index.minX) / index.cw);
  const y0 = Math.floor((minY - index.minY) / index.ch);
  const y1 = Math.floor((maxY - index.minY) / index.ch);
  const out: Box[] = [];
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const list = index.cells.get(`${cx},${cy}`);
      if (list) out.push(...list);
    }
  }
  return out;
}

export function routeOrthogonal(request: RouteRequest): RouteResult {
  routeStats.calls += 1;
  // La traza de diagnóstico instala `__routeTimes` en la ventana. En producción
  // no existe, así que no se registra nada: sin asignaciones ni crecimiento.
  const times =
    typeof window === 'undefined'
      ? undefined
      : (window as unknown as {
          __routeTimes?: Array<{ start: number; end: number; from: { x: number; y: number }; to: { x: number; y: number } }>;
        }).__routeTimes;
  if (!times) return routeCore(request);
  const startedAt = performance.now();
  try {
    return routeCore(request);
  } finally {
    times.push({
      start: startedAt,
      end: performance.now(),
      from: { ...request.from },
      to: { ...request.to },
    });
  }
}

function routeCore(request: RouteRequest): RouteResult {
  const { from, to } = request;
  const padding = request.padding ?? 1;
  const bendPenalty = request.bendPenalty ?? 20;
  const keepBoundary = request.keepBoundaryObstacles ?? false;
  const inflated: Box[] = request.obstacles.map((b) => ({
    minX: b.minX - padding,
    minY: b.minY - padding,
    maxX: b.maxX + padding,
    maxY: b.maxY + padding,
  }));
  const contains = (b: Box, p: Point, strict: boolean): boolean =>
    strict
      ? p.x > b.minX + EPS && p.x < b.maxX - EPS && p.y > b.minY + EPS && p.y < b.maxY - EPS
      : p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
  // Un borne puede caer justo sobre el borde inflado de su propio símbolo: ese
  // obstáculo no puede bloquear la salida. Con `keepBoundaryObstacles` sólo se
  // excluye si el extremo está ESTRICTAMENTE adentro, así el símbolo destino
  // sigue bloqueando su interior y la ruta lo rodea.
  const blockers = inflated.filter(
    (b) => !contains(b, from, keepBoundary) && !contains(b, to, keepBoundary),
  );
  const boxIndex = buildBoxIndex(blockers);
  const inside = (p: Point): boolean =>
    boxesAt(boxIndex, blockers, p).some(
      (b) => p.x > b.minX + EPS && p.x < b.maxX - EPS && p.y > b.minY + EPS && p.y < b.maxY - EPS,
    );

  if (same(from, to)) return { waypoints: [{ ...from }], length: 0, bends: 0, explored: 0, found: true };

  const xsSet = new Set<number>([from.x, to.x]);
  const ysSet = new Set<number>([from.y, to.y]);
  for (const b of inflated) {
    xsSet.add(b.minX);
    xsSet.add(b.maxX);
    ysSet.add(b.minY);
    ysSet.add(b.maxY);
  }
  const xs = [...xsSet].sort((a, b) => a - b);
  const ys = [...ysSet].sort((a, b) => a - b);
  const nodes: Point[] = [];
  const valid: boolean[] = [];
  for (const y of ys) {
    for (const x of xs) {
      const p = { x, y };
      nodes.push(p);
      valid.push(same(p, from) || same(p, to) || !inside(p));
    }
  }
  const xIndex = new Map<number, number>();
  for (let i = 0; i < xs.length; i++) xIndex.set(xs[i]!, i);
  const yIndex = new Map<number, number>();
  for (let i = 0; i < ys.length; i++) yIndex.set(ys[i]!, i);
  const index = (p: Point): number => (yIndex.get(p.y) ?? 0) * xs.length + (xIndex.get(p.x) ?? 0);
  const start = index(from);
  const end = index(to);

  /** ¿El tramo recto entre dos nodos atraviesa un obstáculo? */
  const collinearShared = (a: Point, b: Point, line: LineObstacle): boolean => {
    const vertical = Math.abs(a.x - b.x) < EPS;
    const lineVertical = Math.abs(line.x1 - line.x2) < EPS;
    if (vertical !== lineVertical) return false;
    if (vertical) {
      if (Math.abs(a.x - line.x1) > EPS) return false;
      const alo = Math.min(a.y, b.y);
      const ahi = Math.max(a.y, b.y);
      const llo = Math.min(line.y1, line.y2);
      const lhi = Math.max(line.y1, line.y2);
      return Math.min(ahi, lhi) - Math.max(alo, llo) > EPS;
    }
    if (Math.abs(a.y - line.y1) > EPS) return false;
    const alo = Math.min(a.x, b.x);
    const ahi = Math.max(a.x, b.x);
    const llo = Math.min(line.x1, line.x2);
    const lhi = Math.max(line.x1, line.x2);
    return Math.min(ahi, lhi) - Math.max(alo, llo) > EPS;
  };
  const avoid = request.avoid ?? [];
  const blocked = (a: Point, b: Point): boolean => {
    if (avoid.some((line) => collinearShared(a, b, line))) return true;
    const vertical = Math.abs(a.x - b.x) < EPS;
    const lo = vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
    const hi = vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
    for (const box of boxesOnSegment(boxIndex, blockers, a, b)) {
      if (vertical) {
        if (box.minX + EPS < a.x && a.x < box.maxX - EPS && lo < box.maxY - EPS && hi > box.minY + EPS)
          return true;
      } else if (box.minY + EPS < a.y && a.y < box.maxY - EPS && lo < box.maxX - EPS && hi > box.minX + EPS) {
        return true;
      }
    }
    return false;
  };

  /** Vecino más cercano en una dirección cardinal, o -1. */
  const nearest = (node: number, dir: number): number => {
    const p = nodes[node]!;
    const ix = xIndex.get(p.x)!;
    const iy = yIndex.get(p.y)!;
    const step = DX[dir]!;
    const ystep = DY[dir]!;
    let ci = ix + step;
    let cy = iy + ystep;
    while (ci >= 0 && ci < xs.length && cy >= 0 && cy < ys.length) {
      const idx = cy * xs.length + ci;
      if (valid[idx]) {
        const q = nodes[idx]!;
        if (!blocked(p, q)) return idx;
      }
      ci += step;
      cy += ystep;
    }
    return -1;
  };

  const order = (dir: number): number[] =>
    dir < 0 ? [0, 1, 2, 3] : [dir, right(dir), left(dir)]; // recto, derecha, izquierda

  // Trazado previo: sólo desempata. Se compara la superposición colineal de
  // cada arista con los tramos previos; el coste principal sigue siendo g.
  const prefSegments: { x1: number; y1: number; x2: number; y2: number; vertical: boolean }[] = [];
  if (request.preferred && request.preferred.length > 1) {
    for (let i = 0; i + 1 < request.preferred.length; i++) {
      const a = request.preferred[i]!;
      const b = request.preferred[i + 1]!;
      const isVertical = Math.abs(a.x - b.x) < EPS;
      const isHorizontal = Math.abs(a.y - b.y) < EPS;
      if (!isVertical && !isHorizontal) continue;
      prefSegments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, vertical: isVertical });
    }
  }
  const preferredOverlap = (a: Point, b: Point): number => {
    const isVertical = Math.abs(a.x - b.x) < EPS;
    let total = 0;
    for (const p of prefSegments) {
      if (p.vertical !== isVertical) continue;
      if (isVertical) {
        if (Math.abs(a.x - p.x1) > EPS) continue;
        const alo = Math.min(a.y, b.y);
        const ahi = Math.max(a.y, b.y);
        const plo = Math.min(p.y1, p.y2);
        const phi = Math.max(p.y1, p.y2);
        total += Math.max(0, Math.min(ahi, phi) - Math.max(alo, plo));
      } else {
        if (Math.abs(a.y - p.y1) > EPS) continue;
        const alo = Math.min(a.x, b.x);
        const ahi = Math.max(a.x, b.x);
        const plo = Math.min(p.x1, p.x2);
        const phi = Math.max(p.x1, p.x2);
        total += Math.max(0, Math.min(ahi, phi) - Math.max(alo, plo));
      }
    }
    return total;
  };

  const heap = new MinHeap();
  const entries: Entry[] = [];
  const best = new Map<string, { g: number; pref: number }>();
  let sequence = 0;
  const initial: Entry = {
    f: manhattan(from, to),
    g: 0,
    length: 0,
    bends: 0,
    node: start,
    dir: -1,
    parent: -1,
    seq: sequence++,
    pref: 0,
  };
  entries.push(initial);
  heap.push(initial);
  best.set(`${start}|-1`, { g: 0, pref: 0 });
  let explored = 0;

  while (heap.size > 0) {
    const current = heap.pop()!;
    explored++;
    if (current.node === end) {
      const points: Point[] = [];
      let at: number = current.seq;
      while (at >= 0) {
        points.push(nodes[entries[at]!.node]!);
        at = entries[at]!.parent;
      }
      points.reverse();
      const waypoints = normalizeOrthogonal(points);
      return {
        waypoints,
        length: pathLength(waypoints),
        bends: Math.max(0, waypoints.length - 2),
        explored,
        found: true,
      };
    }
    const key = `${current.node}|${current.dir}`;
    const currentBest = best.get(key);
    if (currentBest && (currentBest.g < current.g || (currentBest.g === current.g && currentBest.pref > current.pref))) {
      continue;
    }
    for (const dir of order(current.dir)) {
      const next = nearest(current.node, dir);
      if (next < 0) continue;
      const stepLength = manhattan(nodes[current.node]!, nodes[next]!);
      const bends = current.bends + (current.dir < 0 || current.dir === dir ? 0 : 1);
      const length = current.length + stepLength;
      const g = length + bendPenalty * bends;
      const pref = current.pref + preferredOverlap(nodes[current.node]!, nodes[next]!);
      const stateKey = `${next}|${dir}`;
      const known = best.get(stateKey);
      if (known && (g > known.g || (g === known.g && pref <= known.pref))) continue;
      best.set(stateKey, { g, pref });
      const entry: Entry = {
        f: g + manhattan(nodes[next]!, to),
        g,
        length,
        bends,
        node: next,
        dir,
        parent: current.seq,
        seq: sequence++,
        pref,
      };
      entries.push(entry);
      heap.push(entry);
    }
  }

  // Sin ruta (obstáculos que encierran el destino): devolver el candidato HV.
  // El llamador puede decidir usar la ruta directa y avisar.
  const waypoints = normalizeOrthogonal(routeSimple(from, to, 'H'));
  return {
    waypoints,
    length: manhattan(from, to),
    bends: Math.max(0, waypoints.length - 2),
    explored,
    found: false,
  };
}

/**
 * Estrategia de manejo de cables al mover componentes.
 *
 * El modo Actual vive en `state.ts` (`moveDelta` + `moveSelection`) y no se
 * toca. Este módulo implementa el modo **Ortogonal (Wybrow)** como cálculo puro:
 * recibe los registros originales, la selección y el desplazamiento, y devuelve
 * una propuesta completa o un rechazo con motivo.
 *
 * Dos etapas, en este orden:
 *
 * 1. **Deformación local**: el tramo de salida de cada borne se traslada rígido
 *    hasta su primer codo móvil y el tramo siguiente se estira (o se extiende)
 *    conservando su carril. Es lo que mantiene los tres carriles superiores y
 *    los tres inferiores de K2M. No se arrastra una derivación compartida
 *    (unión 4001, T o pin de otro componente): esos casos caen al router.
 * 2. **Router de visibilidad** de `router.ts` (Wybrow, Marriott & Stuckey):
 *    grafo ortogonal + A* con longitud y codos, preferencia por el trazado
 *    previo, rejilla del editor y separación de tramos paralelos antes de
 *    validar.
 *
 * La conectividad se compara por identidad de borne (componente + índice de
 * `attachPoints`), con las mismas uniones que `sim/netlist.ts`, incluyendo los
 * bornes aislados.
 */

import {
  boundsOf,
  wirePoints,
  type CadeRecordModel,
  type WirePoints,
} from '../../model/project.ts';
import { attachPoints, type Point } from '../pins.ts';
import { JUNCTION_CODE, buildNetwork, netKey, type Network, type NetNode } from '../network.ts';
import { normalizeOrthogonal, EPS } from './geometry.ts';
import { routeOrthogonal, type Box } from './router.ts';

export type CableHandling = 'actual' | 'ortogonal';
export const CABLE_HANDLINGS: readonly CableHandling[] = ['actual', 'ortogonal'];

export type MoveStrategy = 'actual' | 'local' | 'wybrow';

/** Delta que consume el preview del lienzo (misma forma que `moveDelta`). */
export interface MoveDelta {
  /** Posición nueva de cada componente seleccionado, por id. */
  positions: Map<number, { x: number; y: number }>;
  /** Puntos nuevos de cada cable afectado, por id. */
  wires: Map<number, WirePoints>;
  /** Tramos que el preview dibuja como registro nuevo, por cable fuente. */
  codos: { wireId: number; moving: WirePoints }[];
  dx: number;
  dy: number;
  /** Puntos que una poda no debe tocar. */
  protect: Point[];
  /** Registros que la propuesta quita y el preview no debe dibujar. */
  hidden: Set<number>;
  strategy: MoveStrategy;
}

export interface AddedSegment {
  /** Registro del que se copia código, hoja y número de cable. */
  wireId: number;
  points: WirePoints;
}

export interface MoveProposal {
  positions: Map<number, { x: number; y: number }>;
  /** Geometría nueva de los registros de cable que se reemplazan. */
  wires: Map<number, WirePoints>;
  /** Tramos nuevos (los que no existían en el documento). */
  added: AddedSegment[];
  /** Registros de cable que la propuesta elimina. */
  removed: Set<number>;
  protect: Point[];
  dx: number;
  dy: number;
  strategy: 'local' | 'wybrow';
}

export type CableMovePlan =
  | { ok: true; proposal: MoveProposal }
  | { ok: false; reason: string };

interface SceneBox {
  id: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface SceneSegment {
  id: number;
  points: WirePoints;
  net: number;
}

interface PinPoint {
  componentId: number;
  index: number;
  point: Point;
}

interface AttachedWire {
  id: number;
  rec: CadeRecordModel;
  points: WirePoints;
  a: Point;
  b: Point;
  movedA: boolean;
  movedB: boolean;
  sharedA: boolean;
  sharedB: boolean;
}

export interface CableMoveContext {
  records: readonly CadeRecordModel[];
  selection: ReadonlySet<number>;
  pins: Map<number, Point[]>;
  network: Network;
  sheetOf: Map<number, number>;
  /** Claves de hoja+punto de los bornes de los componentes seleccionados. */
  movedPortKeys: Set<string>;
  attached: AttachedWire[];
  segmentNets: Map<number, number>;
  segments: SceneSegment[];
  /** Caja de cada componente, con la transformación del dibujo. */
  boxes: SceneBox[];
  pinPoints: PinPoint[];
  junctionPoints: { x: number; y: number; net: number }[];
  groups: string[][];
  grid: number;
}

class UnionFind {
  private parent = new Map<string, string>();

  add(key: string): void {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    this.add(key);
    let root = key;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = key;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

const samePoint = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

const endsAt = (pts: WirePoints, p: Point): boolean =>
  (Math.abs(pts.x1 - p.x) < EPS && Math.abs(pts.y1 - p.y) < EPS) ||
  (Math.abs(pts.x2 - p.x) < EPS && Math.abs(pts.y2 - p.y) < EPS);

const startsAt = (pts: WirePoints, p: Point): boolean =>
  Math.abs(pts.x1 - p.x) < EPS && Math.abs(pts.y1 - p.y) < EPS;

const otherEnd = (pts: WirePoints, p: Point): Point =>
  Math.abs(pts.x1 - p.x) < EPS && Math.abs(pts.y1 - p.y) < EPS
    ? { x: pts.x2, y: pts.y2 }
    : { x: pts.x1, y: pts.y1 };

const vertical = (pts: WirePoints): boolean => Math.abs(pts.x1 - pts.x2) < EPS;
const horizontal = (pts: WirePoints): boolean => Math.abs(pts.y1 - pts.y2) < EPS;

const segmentNetMap = (network: Network): Map<number, number> => {
  const uf = new UnionFind();
  for (const node of network.nodes.values()) uf.add(node.key);
  for (const seg of network.segments.values()) uf.union(seg.a, seg.b);
  for (const node of network.nodes.values()) {
    for (const id of node.through) {
      const seg = network.segments.get(id);
      if (seg) uf.union(node.key, seg.a);
    }
  }
  const nets = new Map<number, number>();
  const roots = new Map<string, number>();
  let next = 0;
  for (const seg of network.segments.values()) {
    const root = uf.find(seg.a);
    let net = roots.get(root);
    if (net === undefined) {
      net = next++;
      roots.set(root, net);
    }
    nets.set(seg.id, net);
  }
  return nets;
};

/** Grupos de bornes conectados, por identidad `componente:índice`. */
export function connectionGroups(
  records: readonly CadeRecordModel[],
  network?: Network,
  pins?: Map<number, Point[]>,
): string[][] {
  const net = network ?? buildNetwork([...records]);
  const attach = pins ?? attachPoints([...records]);
  const sheetOf = new Map(records.map((r) => [r.id, r.sheet] as const));
  const uf = new UnionFind();
  for (const node of net.nodes.values()) uf.add(node.key);
  for (const seg of net.segments.values()) uf.union(seg.a, seg.b);
  for (const node of net.nodes.values()) {
    for (const id of node.through) {
      const seg = net.segments.get(id);
      if (seg) uf.union(node.key, seg.a);
    }
  }
  const groups = new Map<string, string[]>();
  for (const [componentId, list] of attach) {
    const sheet = sheetOf.get(componentId) ?? 0;
    list.forEach((p, index) => {
      const root = uf.find(netKey(sheet, p.x, p.y));
      const identity = `${componentId}:${index}`;
      const group = groups.get(root) ?? [];
      group.push(identity);
      groups.set(root, group);
    });
  }
  return [...groups.values()]
    .map((group) => group.sort())
    .sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''));
};

/** Superposiciones colineales entre tramos de redes distintas (para pruebas). */
export function differentNetOverlaps(records: readonly CadeRecordModel[], network?: Network): string[] {
  const net = network ?? buildNetwork([...records]);
  const nets = segmentNetMap(net);
  const segs = [...net.segments.values()];
  const out: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i]!;
      const b = segs[j]!;
      if (nets.get(a.id) === nets.get(b.id)) continue;
      if (collinearOverlap(a.points, b.points)) out.push(`${a.id}~${b.id}`);
    }
  }
  return out;
}

const collinearOverlap = (a: WirePoints, b: WirePoints): boolean => {
  const ah = horizontal(a);
  if (ah !== horizontal(b)) return false;
  if (ah) {
    if (Math.abs(a.y1 - b.y1) > EPS) return false;
    const alo = Math.min(a.x1, a.x2);
    const ahi = Math.max(a.x1, a.x2);
    const blo = Math.min(b.x1, b.x2);
    const bhi = Math.max(b.x1, b.x2);
    return Math.min(ahi, bhi) - Math.max(alo, blo) > EPS;
  }
  if (Math.abs(a.x1 - b.x1) > EPS) return false;
  const alo = Math.min(a.y1, a.y2);
  const ahi = Math.max(a.y1, a.y2);
  const blo = Math.min(b.y1, b.y2);
  const bhi = Math.max(b.y1, b.y2);
  return Math.min(ahi, bhi) - Math.max(alo, blo) > EPS;
};

const pointInsideSegment = (p: Point, pts: WirePoints): boolean => {
  if (endsAt(pts, p)) return false;
  if (vertical(pts)) {
    return Math.abs(p.x - pts.x1) < EPS && p.y > Math.min(pts.y1, pts.y2) + EPS && p.y < Math.max(pts.y1, pts.y2) - EPS;
  }
  if (horizontal(pts)) {
    return Math.abs(p.y - pts.y1) < EPS && p.x > Math.min(pts.x1, pts.x2) + EPS && p.x < Math.max(pts.x1, pts.x2) - EPS;
  }
  return false;
};

const boxContains = (box: SceneBox, p: Point): boolean =>
  p.x >= box.minX - EPS && p.x <= box.maxX + EPS && p.y >= box.minY - EPS && p.y <= box.maxY + EPS;

const boxInteriorIntersects = (box: SceneBox, pts: WirePoints): boolean => {
  if (vertical(pts)) {
    const lo = Math.min(pts.y1, pts.y2);
    const hi = Math.max(pts.y1, pts.y2);
    return pts.x1 > box.minX + EPS && pts.x1 < box.maxX - EPS && lo < box.maxY - EPS && hi > box.minY + EPS;
  }
  if (horizontal(pts)) {
    const lo = Math.min(pts.x1, pts.x2);
    const hi = Math.max(pts.x1, pts.x2);
    return pts.y1 > box.minY + EPS && pts.y1 < box.maxY - EPS && lo < box.maxX - EPS && hi > box.minX + EPS;
  }
  return false;
};

const asBox = (b: { x: number; y: number; w: number; h: number }): Omit<SceneBox, 'id'> => ({
  minX: b.x,
  minY: b.y,
  maxX: b.x + b.w,
  maxY: b.y + b.h,
});

const translatePt = (p: Point, dx: number, dy: number): Point => ({ x: p.x + dx, y: p.y + dy });

/**
 * Reúne una vez por gesto todo lo que no depende del desplazamiento: bornes,
 * redes, cajas, uniones y grupos de conectividad. El preview reutiliza este
 * contexto en cada evento del puntero.
 */
export function prepareCableMove(
  records: readonly CadeRecordModel[],
  selection: ReadonlySet<number>,
  pins?: Map<number, Point[]>,
  network?: Network,
  opts: { groups?: boolean } = {},
): CableMoveContext {
  const attach = pins ?? attachPoints([...records]);
  const net = network ?? buildNetwork([...records]);
  const sheetOf = new Map(records.map((r) => [r.id, r.sheet] as const));

  const movedPortKeys = new Set<string>();
  for (const rec of records) {
    if (rec.kind !== 'component' || !selection.has(rec.id)) continue;
    const sheet = rec.sheet;
    for (const p of attach.get(rec.id) ?? []) movedPortKeys.add(netKey(sheet, p.x, p.y));
  }

  const pinComponents = new Map<string, Set<number>>();
  for (const [componentId, list] of attach) {
    const sheet = sheetOf.get(componentId) ?? 0;
    for (const p of list) {
      const key = netKey(sheet, p.x, p.y);
      const set = pinComponents.get(key) ?? new Set<number>();
      set.add(componentId);
      pinComponents.set(key, set);
    }
  }

  const shared = (rec: CadeRecordModel, p: Point): boolean => {
    const key = netKey(rec.sheet, p.x, p.y);
    const node = net.nodes.get(key);
    if (!node) return false;
    if (node.junction || node.through.length > 0 || node.ends.length > 2) return true;
    const owners = pinComponents.get(key);
    if (owners) {
      for (const owner of owners) if (!selection.has(owner)) return true;
    }
    return false;
  };

  const attached: AttachedWire[] = [];
  for (const rec of records) {
    if (rec.kind !== 'connection' || rec.code === JUNCTION_CODE) continue;
    const pts = wirePoints(rec);
    if (!pts) continue;
    const a = { x: pts.x1, y: pts.y1 };
    const b = { x: pts.x2, y: pts.y2 };
    const movedA = movedPortKeys.has(netKey(rec.sheet, a.x, a.y));
    const movedB = movedPortKeys.has(netKey(rec.sheet, b.x, b.y));
    if (!movedA && !movedB) continue;
    attached.push({
      id: rec.id,
      rec,
      points: pts,
      a,
      b,
      movedA,
      movedB,
      sharedA: movedA ? shared(rec, a) : false,
      sharedB: movedB ? shared(rec, b) : false,
    });
  }

  const boxes: SceneBox[] = [];
  for (const rec of records) {
    if (rec.kind !== 'component') continue;
    const b = boundsOf(rec);
    if (b) boxes.push({ ...asBox(b), id: rec.id });
  }

  const pinPoints: PinPoint[] = [];
  for (const [componentId, list] of attach) {
    list.forEach((point, index) => pinPoints.push({ componentId, index, point }));
  }

  const nets = segmentNetMap(net);
  const segments: SceneSegment[] = [...net.segments.values()].map((seg) => ({
    id: seg.id,
    points: seg.points,
    net: nets.get(seg.id) ?? -1,
  }));

  const junctionPoints = net.junctionPoints.map((j) => {
    const node = net.nodes.get(netKey(j.sheet, j.x, j.y));
    const segId = node?.ends[0] ?? node?.through[0];
    return { x: j.x, y: j.y, net: segId !== undefined ? (nets.get(segId) ?? -1) : -1 };
  });

  return {
    records,
    selection,
    pins: attach,
    network: net,
    sheetOf,
    movedPortKeys,
    attached,
    segmentNets: nets,
    segments,
    boxes,
    pinPoints,
    junctionPoints,
    groups: opts.groups === false ? [] : connectionGroups(records, net, attach),
    grid: 3,
  };
}

const freeElbow = (ctx: CableMoveContext, rec: CadeRecordModel, p: Point): boolean => {
  const node = ctx.network.nodes.get(netKey(rec.sheet, p.x, p.y));
  return !!node && !node.junction && !node.pin && node.through.length === 0 && node.ends.length === 2;
};

const nextAt = (ctx: CableMoveContext, rec: CadeRecordModel, p: Point, exclude: number): number | null => {
  const node = ctx.network.nodes.get(netKey(rec.sheet, p.x, p.y));
  if (!node) return null;
  const next = node.ends.find((id) => id !== exclude);
  return next ?? null;
};

/**
 * Deformación local: traslada el tramo de salida y estira el siguiente carril.
 * Devuelve `null` cuando hay una derivación compartida, un anclaje que no queda
 * alineado o cualquier ambigüedad: eso lo resuelve el router.
 */
function tryLocal(ctx: CableMoveContext, dx: number, dy: number): MoveProposal | null {
  const positions = new Map<number, { x: number; y: number }>();
  for (const rec of ctx.records) {
    if (rec.kind === 'component' && ctx.selection.has(rec.id)) {
      positions.set(rec.id, { x: rec.geometry[8]! + dx, y: rec.geometry[9]! + dy });
    }
  }

  const wires = new Map<number, WirePoints>();
  const added: AddedSegment[] = [];
  const removed = new Set<number>();
  const protect: Point[] = [];
  const handled = new Set<number>();

  // Cables seleccionados explícitamente: se trasladan enteros, como en Actual.
  for (const rec of ctx.records) {
    if (rec.kind !== 'connection' || rec.code === JUNCTION_CODE || !ctx.selection.has(rec.id)) continue;
    const pts = wirePoints(rec);
    if (!pts) continue;
    wires.set(rec.id, { x1: pts.x1 + dx, y1: pts.y1 + dy, x2: pts.x2 + dx, y2: pts.y2 + dy });
    protect.push({ x: pts.x1 + dx, y: pts.y1 + dy }, { x: pts.x2 + dx, y: pts.y2 + dy });
    handled.add(rec.id);
  }

  const planned = new Map<number, WirePoints>();

  for (const wire of ctx.attached) {
    if (handled.has(wire.id)) continue;

    if (wire.movedA && wire.movedB) {
      if (wire.sharedA || wire.sharedB) return null; // derivación: router
      wires.set(wire.id, {
        x1: wire.a.x + dx,
        y1: wire.a.y + dy,
        x2: wire.b.x + dx,
        y2: wire.b.y + dy,
      });
      protect.push(translatePt(wire.a, dx, dy), translatePt(wire.b, dx, dy));
      handled.add(wire.id);
      continue;
    }

    const moving = wire.movedA ? wire.a : wire.b;
    const fixed = wire.movedA ? wire.b : wire.a;
    if (wire.sharedA || wire.sharedB) return null; // derivación compartida: router
    if (!freeElbow(ctx, wire.rec, fixed)) {
      // Anclaje fijo: si queda alineado el tramo se estira; si no, router.
      const moved = translatePt(moving, dx, dy);
      const aligned = Math.abs(moved.x - fixed.x) < EPS || Math.abs(moved.y - fixed.y) < EPS;
      if (!aligned) return null;
      const pts = startsAt(wire.points, fixed)
        ? toWirePoints(fixed, moved)
        : toWirePoints(moved, fixed);
      wires.set(wire.id, pts);
      protect.push(moved, fixed);
      handled.add(wire.id);
      continue;
    }

    const nextId = nextAt(ctx, wire.rec, fixed, wire.id);
    if (nextId === null) return null;
    if (ctx.selection.has(nextId)) return null;
    const nextRec = ctx.records.find((r) => r.id === nextId);
    const nextPts = nextRec ? wirePoints(nextRec) : null;
    if (!nextRec || !nextPts) return null;
    const far = otherEnd(nextPts, fixed);
    if (ctx.movedPortKeys.has(netKey(nextRec.sheet, far.x, far.y))) return null;
    if (planned.has(nextId)) return null;

    const moved = translatePt(moving, dx, dy);
    const elbow = translatePt(fixed, dx, dy);

    // El carril siguiente conserva su coordenada perpendicular; el tramo de
    // salida se extiende por su propio eje hasta encontrarla (o se recorta).
    let exitFar = elbow;
    let laneStart = elbow;
    if (vertical(wire.points)) {
      exitFar = { x: elbow.x, y: far.y };
    } else if (horizontal(wire.points)) {
      exitFar = { x: far.x, y: elbow.y };
    } else {
      return null;
    }
    laneStart = exitFar;

    if (samePoint(exitFar, moved)) {
      // El borne quedó sobre el carril: el tramo de salida desaparece.
      removed.add(wire.id);
      laneStart = moved;
    } else {
      const exit = startsAt(wire.points, fixed) ? { a: exitFar, b: moved } : { a: moved, b: exitFar };
      wires.set(wire.id, toWirePoints(exit.a, exit.b));
      protect.push(moved, exitFar);
      handled.add(wire.id);
    }

    if (samePoint(exitFar, far)) {
      removed.add(nextId);
    } else {
      const lane = startsAt(nextPts, fixed)
        ? toWirePoints(laneStart, far)
        : toWirePoints(far, laneStart);
      wires.set(nextId, lane);
      planned.set(nextId, lane);
      protect.push(laneStart, far);
    }
  }

  const proposal: MoveProposal = { positions, wires, added, removed, protect, dx, dy, strategy: 'local' };
  const geom = validateProposalGeometry(ctx, proposal);
  return geom.ok ? proposal : null;
}

// --- router ---------------------------------------------------------------

const toWirePoints = (a: Point, b: Point): WirePoints => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });

const sameNet = (ctx: CableMoveContext, id: number): number => ctx.segmentNets.get(id) ?? -1;

const routeClear = (points: readonly Point[], obstacles: readonly Box[]): boolean => {
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const pts = toWirePoints(a, b);
    for (const o of obstacles) {
      if (boxInteriorIntersects({ id: -1, ...o }, pts)) return false;
    }
  }
  return true;
};

/** Ajusta los vértices interiores a la rejilla si la ruta sigue siendo válida. */
function snapRoute(points: readonly Point[], grid: number, obstacles: readonly Box[]): Point[] {
  if (grid <= 0 || points.length <= 2) return [...points];
  const snapped = points.map((p, i) =>
    i === 0 || i === points.length - 1
      ? { ...p }
      : { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid },
  );
  const norm = normalizeOrthogonal(snapped);
  for (let i = 0; i + 1 < norm.length; i++) {
    const a = norm[i]!;
    const b = norm[i + 1]!;
    if (Math.abs(a.x - b.x) > EPS && Math.abs(a.y - b.y) > EPS) return [...points];
  }
  return routeClear(norm, obstacles) ? norm : [...points];
}

/** Mueve un tramo interior de la polilínea en perpendicular, como `moveSegment`. */
function shiftPolylineSegment(points: readonly Point[], index: number, value: number): Point[] | null {
  if (index <= 0 || index + 2 >= points.length) return null;
  const p = points[index]!;
  const q = points[index + 1]!;
  const isVertical = Math.abs(p.x - q.x) < EPS;
  const movedP = isVertical ? { x: value, y: p.y } : { x: p.x, y: value };
  const movedQ = isVertical ? { x: value, y: q.y } : { x: q.x, y: value };
  const out: Point[] = points.slice(0, index);
  const prev = points[index - 1]!;
  const bendPrev = isVertical ? { x: prev.x, y: movedP.y } : { x: movedP.x, y: prev.y };
  if (!samePoint(bendPrev, prev) && !samePoint(bendPrev, movedP)) out.push(bendPrev);
  out.push(movedP, movedQ);
  const next = points[index + 2]!;
  const bendNext = isVertical ? { x: next.x, y: movedQ.y } : { x: movedQ.x, y: next.y };
  if (!samePoint(bendNext, movedQ) && !samePoint(bendNext, next)) out.push(bendNext);
  out.push(...points.slice(index + 2));
  return normalizeOrthogonal(out);
}

/**
 * Ordena y separa tramos paralelos: si un tramo nuevo se superpone en colineal
 * con otro de una red distinta, se prueba correrlo en perpendicular sobre la
 * rejilla. Si no hay separación válida, la ruta no sirve.
 */
function separateRoute(
  points: Point[],
  risk: readonly { points: WirePoints; net: number }[],
  net: number,
  grid: number,
  obstacles: readonly Box[],
): Point[] | null {
  let current = points;
  for (let round = 0; round < 8; round++) {
    let conflict: { start: number; pts: WirePoints } | null = null;
    for (let i = 0; i + 1 < current.length; i++) {
      const seg = toWirePoints(current[i]!, current[i + 1]!);
      if (risk.some((r) => r.net !== net && collinearOverlap(seg, r.points))) {
        conflict = { start: i, pts: seg };
        break;
      }
    }
    if (!conflict) return current;
    const isVertical = Math.abs(conflict.pts.x1 - conflict.pts.x2) < EPS;
    const base = isVertical ? conflict.pts.x1 : conflict.pts.y1;
    let shifted: Point[] | null = null;
    for (const delta of [grid, -grid, grid * 2, -grid * 2, grid * 3, -grid * 3]) {
      const candidate = shiftPolylineSegment(current, conflict.start, base + delta);
      if (!candidate) continue;
      if (!routeClear(candidate, obstacles)) continue;
      const ok = candidate.every((p, i) => {
        if (i + 1 >= candidate.length) return true;
        const seg = toWirePoints(p, candidate[i + 1]!);
        return !risk.some((r) => r.net !== net && collinearOverlap(seg, r.points));
      });
      if (ok) shifted = candidate;
      if (shifted) break;
    }
    if (!shifted) return null;
    current = shifted;
  }
  return null;
}

const strictInsideBox = (box: Box, p: Point): boolean =>
  p.x > box.minX + EPS && p.x < box.maxX - EPS && p.y > box.minY + EPS && p.y < box.maxY - EPS;

interface Region {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const boxHits = (b: Box, r: Region): boolean =>
  b.minX <= r.maxX && b.maxX >= r.minX && b.minY <= r.maxY && b.maxY >= r.minY;

const pointHits = (p: Point, r: Region): boolean =>
  p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;

const segHits = (pts: WirePoints, r: Region): boolean =>
  boxHits(
    {
      minX: Math.min(pts.x1, pts.x2),
      minY: Math.min(pts.y1, pts.y2),
      maxX: Math.max(pts.x1, pts.x2),
      maxY: Math.max(pts.y1, pts.y2),
    },
    r,
  );

const routeRegion = (from: Point, to: Point): Region => ({
  minX: Math.min(from.x, to.x) - 200,
  minY: Math.min(from.y, to.y) - 200,
  maxX: Math.max(from.x, to.x) + 200,
  maxY: Math.max(from.y, to.y) + 200,
});

function routeStub(
  ctx: CableMoveContext,
  from: Point,
  to: Point,
  obstacles: readonly Box[],
  risk: readonly { points: WirePoints; net: number }[],
  net: number,
  preferred?: readonly Point[],
): Point[] | null {
  const region = routeRegion(from, to);
  // Bornes y derivaciones ajenos se tratan como obstáculos chicos: una ruta no
  // puede pasar por encima de un borne sin declarar la unión. Para que el grafo
  // de visibilidad no crezca con toda la hoja, el A* sólo ve la zona afectada;
  // la comprobación final sí recorre todos los obstáculos.
  const pinBoxes: Box[] = [];
  for (const pin of ctx.pinPoints) {
    if (ctx.selection.has(pin.componentId)) continue;
    const p = pin.point;
    if (samePoint(p, from) || samePoint(p, to)) continue;
    pinBoxes.push({ minX: p.x - 0.4, minY: p.y - 0.4, maxX: p.x + 0.4, maxY: p.y + 0.4 });
  }
  const junctionBoxes: Box[] = [];
  for (const j of ctx.junctionPoints) {
    if (j.net === net) continue;
    if (samePoint(j, from) || samePoint(j, to)) continue;
    junctionBoxes.push({ minX: j.x - 0.4, minY: j.y - 0.4, maxX: j.x + 0.4, maxY: j.y + 0.4 });
  }
  const localObstacles = obstacles.filter((b) => boxHits(b, region));
  const localPins = pinBoxes.filter((b) => boxHits(b, region));
  const localJunctions = junctionBoxes.filter((b) => boxHits(b, region));
  const localRisk = risk.filter((r) => segHits(r.points, region));
  const allObstacles = [...obstacles, ...pinBoxes, ...junctionBoxes];
  const local = [...localObstacles, ...localPins, ...localJunctions];
  // Guía de desempate: conserva la dirección del tramo original (vertical u
  // horizontal) para que las salidas de bornes vecinos no compartan el carril
  // de la fila de bornes.
  const guide: Point[] = [];
  const old = preferred && preferred.length >= 2 ? { a: preferred[0]!, b: preferred[1]! } : null;
  if (old && Math.abs(old.a.x - old.b.x) < EPS && Math.abs(from.x - to.x) >= EPS) {
    guide.push({ ...from }, { x: from.x, y: to.y }, { ...to });
  } else if (old && Math.abs(old.a.y - old.b.y) < EPS && Math.abs(from.y - to.y) >= EPS) {
    guide.push({ ...from }, { x: to.x, y: from.y }, { ...to });
  } else {
    guide.push({ ...from }, { ...to });
  }
  const route = routeOrthogonal({
    from,
    to,
    obstacles: local,
    padding: 0,
    bendPenalty: 20,
    preferred: guide,
    keepBoundaryObstacles: true,
    avoid: localRisk.filter((r) => r.net !== net).map((r) => r.points),
  });
  if (!route.found) return null;
  let points: Point[] | null = route.waypoints;
  points = snapRoute(points, ctx.grid, local.filter((b) => !strictInsideBox(b, from) && !strictInsideBox(b, to)));
  const globalClear = allObstacles.filter((b) => !strictInsideBox(b, from) && !strictInsideBox(b, to));
  if (!routeClear(points, globalClear)) return null;
  points = separateRoute([...points], risk, net, ctx.grid, globalClear);
  if (!points) return null;
  return points;
}

const obstaclesOf = (ctx: CableMoveContext): Box[] =>
  ctx.boxes
    .filter((b) => !ctx.selection.has(b.id))
    .map((b) => ({ minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY }));

function tryRouter(ctx: CableMoveContext, dx: number, dy: number): MoveProposal | { reason: string } {
  const positions = new Map<number, { x: number; y: number }>();
  for (const rec of ctx.records) {
    if (rec.kind === 'component' && ctx.selection.has(rec.id)) {
      positions.set(rec.id, { x: rec.geometry[8]! + dx, y: rec.geometry[9]! + dy });
    }
  }

  const wires = new Map<number, WirePoints>();
  const added: AddedSegment[] = [];
  const removed = new Set<number>();
  const protect: Point[] = [];
  const handled = new Set<number>();
  const obstacles = obstaclesOf(ctx);
  let usedRouting = false;

  // Geometría que el gesto reemplaza: su versión vieja no debe bloquear las
  // rutas de los demás bornes. Los cables que quedan fijos (derivación
  // compartida) sí siguen siendo riesgo.
  const translated = new Map<number, WirePoints>();
  const replaced = new Set<number>();
  for (const rec of ctx.records) {
    if (rec.kind !== 'connection' || rec.code === JUNCTION_CODE || !ctx.selection.has(rec.id)) continue;
    const pts = wirePoints(rec);
    if (!pts) continue;
    translated.set(rec.id, { x1: pts.x1 + dx, y1: pts.y1 + dy, x2: pts.x2 + dx, y2: pts.y2 + dy });
    replaced.add(rec.id);
  }
  for (const wire of ctx.attached) {
    if (handled.has(wire.id) || ctx.selection.has(wire.id)) continue;
    if (wire.movedA && wire.movedB && !wire.sharedA && !wire.sharedB) {
      translated.set(wire.id, {
        x1: wire.a.x + dx,
        y1: wire.a.y + dy,
        x2: wire.b.x + dx,
        y2: wire.b.y + dy,
      });
      replaced.add(wire.id);
    } else if (!wire.sharedA && !wire.sharedB) {
      replaced.add(wire.id);
    }
  }

  const risk: { points: WirePoints; net: number }[] = ctx.segments
    .filter((s) => !replaced.has(s.id))
    .map((s) => ({ points: s.points, net: s.net }));
  for (const [id, points] of translated) risk.push({ points, net: sameNet(ctx, id) });

  const addRoute = (sourceId: number, points: readonly Point[]): boolean => {
    if (points.length < 2) return true;
    for (let i = 0; i + 1 < points.length; i++) {
      const pts = toWirePoints(points[i]!, points[i + 1]!);
      if (i === 0) wires.set(sourceId, pts);
      else added.push({ wireId: sourceId, points: pts });
      risk.push({ points: pts, net: sameNet(ctx, sourceId) });
    }
    for (const p of points) protect.push(p);
    return true;
  };

  /** Derivación fija: el cable original queda y se agrega un tramo nuevo. */
  const addStub = (sourceId: number, points: readonly Point[]): void => {
    for (let i = 0; i + 1 < points.length; i++) {
      const pts = toWirePoints(points[i]!, points[i + 1]!);
      added.push({ wireId: sourceId, points: pts });
      risk.push({ points: pts, net: sameNet(ctx, sourceId) });
    }
    for (const p of points) protect.push(p);
  };

  for (const [id, pts] of translated) {
    wires.set(id, pts);
    protect.push({ x: pts.x1, y: pts.y1 }, { x: pts.x2, y: pts.y2 });
    handled.add(id);
  }

  for (const wire of ctx.attached) {
    if (handled.has(wire.id)) continue;
    const net = sameNet(ctx, wire.id);

    if (wire.movedA && wire.movedB && !wire.sharedA && !wire.sharedB) {
      handled.add(wire.id);
      continue;
    }

    // Un extremo compartido queda fijo: el cable original no se toca y cada
    // borne nuevo se conecta a su punto viejo con un tramo. Así la derivación
    // conserva todas sus ramas.
    if ((wire.movedA && wire.sharedA) || (wire.movedB && wire.sharedB)) {
      if (wire.movedA) {
        const route = routeStub(ctx, translatePt(wire.a, dx, dy), wire.a, obstacles, risk, net);
        if (!route) return { reason: `no hay ruta válida desde el borne ${wire.id} hasta su derivación` };
        usedRouting = true;
        addStub(wire.id, route);
      }
      if (wire.movedB) {
        const route = routeStub(ctx, translatePt(wire.b, dx, dy), wire.b, obstacles, risk, net);
        if (!route) return { reason: `no hay ruta válida desde el borne ${wire.id} hasta su derivación` };
        usedRouting = true;
        addStub(wire.id, route);
      }
      handled.add(wire.id);
      continue;
    }

    if (wire.movedA && wire.movedB) {
      handled.add(wire.id);
      continue;
    }

    // Un solo extremo móvil: el anclaje externo (el otro extremo) queda fijo.
    const moving = wire.movedA ? wire.a : wire.b;
    const anchor = wire.movedA ? wire.b : wire.a;
    const from = translatePt(moving, dx, dy);
    const route = routeStub(ctx, from, anchor, obstacles, risk, net, [wire.a, wire.b]);
    if (!route) return { reason: `no hay ruta válida para el borne ${wire.id}` };
    usedRouting = true;
    addRoute(wire.id, route);
  }

  const proposal: MoveProposal = {
    positions,
    wires,
    added,
    removed,
    protect,
    dx,
    dy,
    strategy: usedRouting ? 'wybrow' : 'local',
  };
  const geom = validateProposalGeometry(ctx, proposal);
  return geom.ok ? proposal : { reason: geom.reason };
}

// --- plan -----------------------------------------------------------------

export interface PlanOptions {
  /** Comprueba además los grupos de bornes (confirmación). */
  validate?: boolean;
}

export function planCableMove(ctx: CableMoveContext, dx: number, dy: number, opts: PlanOptions = {}): CableMovePlan {
  const local = tryLocal(ctx, dx, dy);
  if (local) {
    if (opts.validate !== false) {
      const check = validateCableProposal(ctx, local);
      // Una deformación local geométricamente válida puede cambiar la
      // conectividad (por ejemplo, al arrastrar una derivación). En ese caso el
      // router todavía puede preservarla.
      if (check.ok) return { ok: true, proposal: local };
    } else {
      return { ok: true, proposal: local };
    }
  }

  const routed = tryRouter(ctx, dx, dy);
  if ('reason' in routed) return { ok: false, reason: routed.reason };
  if (opts.validate !== false) {
    const check = validateCableProposal(ctx, routed);
    if (!check.ok) return check;
  }
  return { ok: true, proposal: routed };
}

export function cablePlanToDelta(proposal: MoveProposal): MoveDelta {
  return {
    positions: proposal.positions,
    wires: proposal.wires,
    codos: proposal.added.map((a) => ({ wireId: a.wireId, moving: a.points })),
    dx: proposal.dx,
    dy: proposal.dy,
    protect: proposal.protect,
    hidden: proposal.removed,
    strategy: proposal.strategy,
  };
}

// --- validación -----------------------------------------------------------

interface GeometryResult {
  ok: boolean;
  reason: string;
}

const okGeom: GeometryResult = { ok: true, reason: '' };

interface ChangedSegment {
  key: string;
  points: WirePoints;
  net: number;
}

function validateProposalGeometry(ctx: CableMoveContext, proposal: MoveProposal): GeometryResult {
  const changed: ChangedSegment[] = [];
  for (const [id, points] of proposal.wires) {
    if (proposal.removed.has(id)) continue;
    changed.push({ key: `w:${id}`, points, net: sameNet(ctx, id) });
  }
  proposal.added.forEach((a, index) => {
    changed.push({ key: `a:${index}`, points: a.points, net: sameNet(ctx, a.wireId) });
  });
  if (changed.length === 0) return okGeom;

  const movedBoxes = ctx.boxes
    .filter((b) => ctx.selection.has(b.id))
    .map((b) => ({
      id: b.id,
      minX: b.minX + proposal.dx,
      minY: b.minY + proposal.dy,
      maxX: b.maxX + proposal.dx,
      maxY: b.maxY + proposal.dy,
    }));

  // La validación sólo necesita la zona afectada: cualquier tramo, borne o
  // símbolo que pueda chocar con lo nuevo está dentro de esta caja.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const seg of changed) {
    grow(seg.points.x1, seg.points.y1);
    grow(seg.points.x2, seg.points.y2);
  }
  for (const box of movedBoxes) {
    grow(box.minX, box.minY);
    grow(box.maxX, box.maxY);
  }
  const pad = Math.max(3, ctx.grid * 2);
  const region: Region = { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };

  const rest: { id: number; points: WirePoints; net: number }[] = ctx.segments
    .filter(
      (s) =>
        !proposal.removed.has(s.id) && !proposal.wires.has(s.id) && segHits(s.points, region),
    )
    .map((s) => ({ id: s.id, points: s.points, net: s.net }));
  const all = [...rest, ...changed.map((c) => ({ id: -1, points: c.points, net: c.net }))];

  for (const seg of changed) {
    if (!vertical(seg.points) && !horizontal(seg.points)) {
      return { ok: false, reason: `el tramo ${seg.key} quedó en diagonal` };
    }
    if (
      Math.abs(seg.points.x1 - seg.points.x2) < EPS &&
      Math.abs(seg.points.y1 - seg.points.y2) < EPS
    ) {
      return { ok: false, reason: `el tramo ${seg.key} quedó de longitud cero` };
    }
    for (const other of all) {
      if (other.points === seg.points) continue;
      if (other.net === seg.net) continue;
      if (collinearOverlap(seg.points, other.points)) {
        return { ok: false, reason: `el tramo ${seg.key} comparte carril con otra red` };
      }
    }
  }

  // Bornes y uniones no pueden quedar en el interior de un tramo nuevo: eso
  // sería un contacto accidental que el dibujo no declara.
  const pins = ctx.pinPoints
    .map((p) => (ctx.selection.has(p.componentId) ? translatePt(p.point, proposal.dx, proposal.dy) : p.point))
    .filter((p) => pointHits(p, region));
  const junctions = ctx.junctionPoints.filter((p) => pointHits(p, region));
  for (const seg of changed) {
    for (const p of pins) {
      if (pointInsideSegment(p, seg.points)) {
        return { ok: false, reason: `el tramo ${seg.key} toca un borne ajeno` };
      }
    }
    for (const p of junctions) {
      if (seg.net === p.net) continue;
      if (pointInsideSegment(p, seg.points)) {
        return { ok: false, reason: `el tramo ${seg.key} toca una unión de otra red` };
      }
    }
  }

  // Un extremo nuevo no puede caer en el interior de un tramo de otra red: sería
  // una unión en T no declarada.
  const changedEndpoints: Point[] = [];
  for (const seg of changed) {
    changedEndpoints.push({ x: seg.points.x1, y: seg.points.y1 }, { x: seg.points.x2, y: seg.points.y2 });
  }
  for (const p of changedEndpoints) {
    for (const other of all) {
      if (other.net === -1) continue;
      if (pointInsideSegment(p, other.points)) {
        const own = changed.some((c) => c.net === other.net && endsAt(c.points, p));
        if (!own) {
          return {
            ok: false,
            reason: `un extremo nuevo (${p.x},${p.y}) cae sobre el cable ${other.id} de otra red`,
          };
        }
      }
    }
  }

  // Las rutas nuevas no invaden otros símbolos (el propio componente se excluye).
  const boxes = ctx.boxes
    .filter((b) => !ctx.selection.has(b.id) && boxHits(b, region));
  for (const seg of changed) {
    for (const box of boxes) {
      const a = { x: seg.points.x1, y: seg.points.y1 };
      const b = { x: seg.points.x2, y: seg.points.y2 };
      if (boxContains(box, a) || boxContains(box, b)) continue;
      if (boxInteriorIntersects(box, seg.points)) {
        return { ok: false, reason: `el tramo ${seg.key} invade un símbolo` };
      }
    }
  }

  // El componente movido no puede cubrir un borne ajeno ni una unión que no
  // viaja con él: attachPoints las convertiría en bornes del componente y
  // cambiaría las identidades aunque la geometría sea ortogonal.
  const staticPins = ctx.pinPoints
    .filter((p) => !ctx.selection.has(p.componentId))
    .map((p) => p.point);
  for (const box of movedBoxes) {
    for (const p of staticPins) {
      if (boxContains(box, p)) {
        return { ok: false, reason: 'el componente movido cubre un borne ajeno' };
      }
    }
    for (const j of ctx.junctionPoints) {
      if (boxContains(box, j)) {
        return { ok: false, reason: 'el componente movido cubre una unión' };
      }
    }
  }

  // El componente movido no puede invadir cables que no se movieron.
  const changedIds = new Set<number>([...proposal.wires.keys(), ...proposal.removed]);
  for (const box of movedBoxes) {
    const boxRegion: Region = { minX: box.minX - pad, minY: box.minY - pad, maxX: box.maxX + pad, maxY: box.maxY + pad };
    for (const seg of ctx.segments) {
      if (changedIds.has(seg.id)) continue;
      if (!segHits(seg.points, boxRegion)) continue;
      const a = { x: seg.points.x1, y: seg.points.y1 };
      const b = { x: seg.points.x2, y: seg.points.y2 };
      if (boxContains(box, a) || boxContains(box, b)) continue;
      if (boxInteriorIntersects(box, seg.points)) {
        return { ok: false, reason: 'el componente movido invade un cable ajeno' };
      }
    }
  }

  return okGeom;
}

/** Aplica la propuesta a los registros (sin serializar) para validar/confirmar. */
export function applyProposalToRecords(
  records: readonly CadeRecordModel[],
  proposal: MoveProposal,
): CadeRecordModel[] {
  let next = records.reduce((max, r) => Math.max(max, r.id), 0) + 1;
  const byId = new Map(records.map((r) => [r.id, r] as const));
  const out: CadeRecordModel[] = [];
  for (const rec of records) {
    if (proposal.removed.has(rec.id)) continue;
    const pos = proposal.positions.get(rec.id);
    const pts = proposal.wires.get(rec.id);
    if (pos) {
      const g = [...rec.geometry];
      g[8] = pos.x;
      g[9] = pos.y;
      out.push({ ...rec, geometry: g });
    } else if (pts) {
      const g = [...rec.geometry];
      g[8] = pts.x1;
      g[9] = pts.y1;
      g[10] = pts.x2;
      g[11] = pts.y2;
      out.push({ ...rec, geometry: g });
    } else {
      out.push(rec);
    }
  }
  for (const add of proposal.added) {
    const source = byId.get(add.wireId);
    if (!source) continue;
    const g = [...source.geometry];
    g[8] = add.points.x1;
    g[9] = add.points.y1;
    g[10] = add.points.x2;
    g[11] = add.points.y2;
    out.push({ ...source, id: next++, geometry: g });
  }
  return out;
}

export function validateCableProposal(
  ctx: CableMoveContext,
  proposal: MoveProposal,
): { ok: true } | { ok: false; reason: string } {
  const geom = validateProposalGeometry(ctx, proposal);
  if (!geom.ok) return { ok: false, reason: geom.reason };
  const candidate = applyProposalToRecords(ctx.records, proposal);
  const groups = connectionGroups(candidate);
  if (groups.length !== ctx.groups.length) {
    return { ok: false, reason: 'el movimiento cambia la cantidad de grupos de bornes' };
  }
  for (let i = 0; i < groups.length; i++) {
    const a = groups[i]!;
    const b = ctx.groups[i]!;
    if (a.length !== b.length || a.some((id, j) => id !== b[j])) {
      return { ok: false, reason: 'el movimiento cambia las conexiones de los bornes' };
    }
  }
  return { ok: true };
}

/** Reexport para pruebas: el nodo de red en un punto, con su hoja. */
export const nodeAt = (network: Network, sheet: number, p: Point): NetNode | undefined =>
  network.nodes.get(netKey(sheet, p.x, p.y));

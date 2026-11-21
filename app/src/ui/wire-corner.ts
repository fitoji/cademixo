/**
 * Esquinas redondeadas de cable, sólo en el pintado.
 *
 * El formato guarda **un segmento por registro** (`M x1 y1 L x2 y2`): un codo no
 * existe en el modelo, son dos registros que comparten un vértice. Por eso el
 * redondeo no puede vivir en un registro suelto: hay que mirar el conjunto de
 * cables, juntar los extremos que caen en el mismo punto y recortarlos.
 *
 * Contrato (S1): es presentación pura. No escribe en los registros, no conoce el
 * parser ni el formato `.cade`, y con radio 0 devuelve exactamente el `d` que la
 * app pinta hoy.
 *
 * Cómo se redondea un vértice: cada tramo se recorta sobre su propia recta y los
 * dos recortes se unen con una cuadrática cuyo control es el vértice, así la
 * curva es tangente a los dos tramos. El arco lo dibuja **un solo** tramo (el de
 * id menor), para que la esquina no se pinte dos veces; el otro termina en su
 * punto recortado y la curva lo alcanza.
 *
 * Se redondea sólo cuando el vértice es un codo de verdad (S4): exactamente dos
 * extremos de cable, que no sean colineales y que no estén clavados. "Clavado"
 * lo decide el llamador con `isPinned`, porque depende de lo que el lienzo ya
 * sabe (bornes de componente, registros de unión 4001, derivaciones en T).
 */

import { dist } from '../editor/wiring/geometry.ts';
import type { Point } from '../editor/pins.ts';

/** Radio de esquina, en unidades de plano: escala con el zoom como el dibujo (S2). */
export const WIRE_CORNER_RADIUS = 1;

/**
 * Tolerancia para decidir "mismo punto", en unidades de plano.
 *
 * Convive con la del resto del editor (`EPS` en `wiring/geometry.ts`, `TOL` en
 * `network.ts`, ambos 0,01): las coordenadas viven en una grilla chica y 0,01
 * separa "mismo vértice" de "vértice distinto" sin comerse codos legítimos.
 */
export const WIRE_CORNER_TOL = 0.01;

export interface WireSegment {
  id: number;
  /** Hoja del registro: dos páginas no comparten punto aunque las coordenadas coincidan. */
  sheet?: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Un extremo de tramo que cae en un vértice, con el recorte que le toca. */
interface Trim {
  /** Vértice del codo: control de la cuadrática. */
  vx: number;
  vy: number;
  /** Punto recortado de ESTE extremo. */
  own: Point;
  /** Punto recortado del otro tramo: destino del arco. */
  other: Point;
  /** Este extremo es el que dibuja el arco. */
  owner: boolean;
}

interface End {
  id: number;
  end: 0 | 1;
  x: number;
  y: number;
}

/** Seno mínimo del ángulo entre los dos tramos: por debajo, el par no dobla. */
const SIN_TOL = 1e-6;

/**
 * Clave del vértice: la hoja más las coordenadas cuantizadas a 0,01, igual que
 * `netKey` en `editor/network.ts`. Se reusa esa cuantización a propósito, para
 * que el pase de pintura y la red coincidan en qué es "el mismo punto".
 */
const groupKey = (sheet: number, x: number, y: number): string =>
  `${sheet}|${Math.round(x * 100)},${Math.round(y * 100)}`;

/**
 * Número de plano para un `d`: 3 decimales. El recorte deja colas binarias
 * (`12.300000000000001`) y el `d` se compara en tests y en capturas.
 */
const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);

const pt = (p: Point): string => `${fmt(p.x)} ${fmt(p.y)}`;

const otherEnd = (s: WireSegment, end: 0 | 1): Point =>
  end === 0 ? { x: s.x2, y: s.y2 } : { x: s.x1, y: s.y1 };

/**
 * El `d` de cada cable: `id -> camino`. Con `radius <= 0` son los caminos de hoy;
 * los tramos que no forman codo conservan también el `d` de hoy (S6).
 *
 * `isPinned` responde si en ese punto hay algo que fija el empalme y por lo tanto
 * no se puede redondear.
 */
export function wireCornerPaths(
  segments: readonly WireSegment[],
  radius: number,
  isPinned: (x: number, y: number) => boolean = () => false,
): Map<number, string> {
  const out = new Map<number, string>();
  for (const s of segments) out.set(s.id, `M${s.x1} ${s.y1}L${s.x2} ${s.y2}`);
  // Clásico: quiebre seco de CADe_SIMU (S3). Nada que calcular.
  if (!(radius > 0)) return out;

  const byId = new Map<number, WireSegment>();
  const groups = new Map<string, End[]>();
  for (const s of segments) {
    byId.set(s.id, s);
    const sheet = s.sheet ?? 0;
    const ends: End[] = [
      { id: s.id, end: 0, x: s.x1, y: s.y1 },
      { id: s.id, end: 1, x: s.x2, y: s.y2 },
    ];
    for (const e of ends) {
      const key = groupKey(sheet, e.x, e.y);
      const list = groups.get(key) ?? [];
      list.push(e);
      groups.set(key, list);
    }
  }

  // Cada extremo cae en un solo grupo, así que un recorte no se pisa con otro.
  const trims = new Map<string, Trim>();

  for (const ends of groups.values()) {
    if (ends.length !== 2) continue;
    const [a, b] = ends;
    if (a.id === b.id) continue;
    const sa = byId.get(a.id);
    const sb = byId.get(b.id);
    if (!sa || !sb) continue;

    const v: Point = { x: a.x, y: a.y };
    const oa = otherEnd(sa, a.end);
    const ob = otherEnd(sb, b.end);
    const la = dist(v, oa);
    const lb = dist(v, ob);
    // Registro de longitud cero o tramo degenerado: no hay dirección que seguir.
    if (la <= WIRE_CORNER_TOL || lb <= WIRE_CORNER_TOL) continue;

    const ua: Point = { x: (oa.x - v.x) / la, y: (oa.y - v.y) / la };
    const ub: Point = { x: (ob.x - v.x) / lb, y: (ob.y - v.y) / lb };
    // Colineal: o sigue derecho, o se vuelve sobre sí mismo. Ninguno es un codo.
    if (Math.abs(ua.x * ub.y - ua.y * ub.x) <= SIN_TOL) continue;
    if (isPinned(v.x, v.y)) continue;

    // S5: el recorte nunca pasa de la mitad del tramo, así que un tramo corto
    // entre dos codos se acorta hasta su punto medio y jamás se invierte.
    const ta = Math.min(radius, la / 2);
    const tb = Math.min(radius, lb / 2);
    const ownA: Point = { x: v.x + ua.x * ta, y: v.y + ua.y * ta };
    const ownB: Point = { x: v.x + ub.x * tb, y: v.y + ub.y * tb };
    const aOwns = a.id <= b.id;

    trims.set(`${a.id}:${a.end}`, { vx: v.x, vy: v.y, own: ownA, other: ownB, owner: aOwns });
    trims.set(`${b.id}:${b.end}`, { vx: v.x, vy: v.y, own: ownB, other: ownA, owner: !aOwns });
  }

  for (const s of segments) {
    const start = trims.get(`${s.id}:0`);
    const end = trims.get(`${s.id}:1`);
    if (!start && !end) continue;

    const sPt: Point = start ? start.own : { x: s.x1, y: s.y1 };
    const ePt: Point = end ? end.own : { x: s.x2, y: s.y2 };
    // Un extremo sin recortar se escribe tal cual está en el registro: el `d` de
    // hoy no cambia por pasar por acá (S6).
    const sText = start ? pt(sPt) : `${s.x1} ${s.y1}`;
    const eText = end ? pt(ePt) : `${s.x2} ${s.y2}`;
    const collapsed =
      Math.abs(sPt.x - ePt.x) <= WIRE_CORNER_TOL && Math.abs(sPt.y - ePt.y) <= WIRE_CORNER_TOL;

    let d = start?.owner
      ? `M${pt(start.other)}Q${fmt(start.vx)} ${fmt(start.vy)} ${sText}`
      : `M${sText}`;
    // Sin resto recto no se emite un `L` de longitud cero: con `linecap: round`
    // el navegador lo pintaría como un punto.
    if (!collapsed) d += `L${eText}`;
    if (end?.owner) d += `Q${fmt(end.vx)} ${fmt(end.vy)} ${pt(end.other)}`;
    out.set(s.id, d);
  }

  return out;
}

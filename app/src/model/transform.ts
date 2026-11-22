/**
 * Transformación de un componente: giro y espejo, leídos del registro.
 *
 * El formato guarda la orientación en el slot 17 del bloque de geometría
 * (`geometry[17]`, campo 11 del registro, número 18 del bloque). Es un bitfield
 * de tres bits:
 *
 *   giro   = slot & 3   → 0 = 0°, 1 = 90°, 2 = 180°, 3 = 270° (horario)
 *   espejo = slot & 4   → espejo sobre el EJE VERTICAL, izquierda ↔ derecha
 *
 * La composición es **primero el giro y después el espejo**: `p' = Mx(R(p))`.
 * Con eso `slot = 5` resulta la reflexión sobre la diagonal principal y
 * `slot = 7` sobre la antihiagonal, que es lo que se midió con las sondas del
 * usuario (L4/L6/L9 de `odd/tasks/orientacion-componentes.md`): `t = 6` es
 * «rotada 180° y espejada», así que el dominio es un bitfield y no un enum.
 *
 * Este módulo es puro: no sabe de React, ni de SVG, ni del archivo. Sólo traduce
 * slot ↔ transformación y produce matrices para dibujar y para medir cajas.
 */

export type Rotation = 0 | 90 | 180 | 270;

export interface Transform {
  rotation: Rotation;
  mirror: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Matriz afín de SVG: `matrix(a b c d e f)`. */
export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/** Sin giro ni espejo: lo que trae todo registro que no fue transformado. */
export const IDENTITY: Transform = { rotation: 0, mirror: false };

/** Valor de `slot` con el que el archivo expresa cada orientación (0..7). */
export function slotFromTransform(transform: Transform): number {
  const quarter = ((transform.rotation / 90) | 0) & 3;
  return quarter + (transform.mirror ? 4 : 0);
}

/**
 * Lee el slot del registro. Un valor fuera de rango, negativo o no entero se
 * normaliza por bits: el archivo sólo usa 0..7, y ante un valor raro preferimos
 * una orientación coherente antes que un componente que no se puede dibujar.
 */
export function transformFromSlot(slot: number): Transform {
  if (!Number.isFinite(slot)) return IDENTITY;
  const bits = Math.trunc(slot) & 7;
  return { rotation: (((bits & 3) * 90) as Rotation), mirror: (bits & 4) !== 0 };
}

export function isIdentity(transform: Transform): boolean {
  return transform.rotation === 0 && !transform.mirror;
}

/**
 * Rotación horaria alrededor de `pivot`, con la convención del lienzo (y abajo).
 *
 * Los cuatro cuartos de vuelta se escriben exactos, sin `Math.cos`: con
 * `cos(90°) = 6.1e-17` la tinta quedaba corrida una fracción de unidad y las
 * cajas transformadas no cerraban al compararlas con las del archivo.
 */
export function rotationMatrix(rotation: Rotation, pivot: Point): Matrix {
  const { x, y } = pivot;
  switch (rotation) {
    case 90:
      // x' = -y + x + y ; y' = x + y - x
      return { a: 0, b: 1, c: -1, d: 0, e: x + y, f: y - x };
    case 180:
      return { a: -1, b: 0, c: 0, d: -1, e: 2 * x, f: 2 * y };
    case 270:
      // x' = y + x - y ; y' = -x + y + x
      return { a: 0, b: -1, c: 1, d: 0, e: x - y, f: y + x };
    default:
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }
}

/** Espejo sobre la recta vertical que pasa por `pivot`. */
export function mirrorMatrix(pivot: Point): Matrix {
  return { a: -1, b: 0, c: 0, d: 1, e: 2 * pivot.x, f: 0 };
}

/** `m ∘ n`: primero `n`, después `m`. */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

export function applyMatrix(matrix: Matrix, point: Point): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

/**
 * Matriz de la transformación del archivo: primero el giro, después el espejo,
 * los dos alrededor del mismo pivote.
 */
export function transformMatrix(transform: Transform, pivot: Point): Matrix {
  const turn = rotationMatrix(transform.rotation, pivot);
  return transform.mirror ? multiply(mirrorMatrix(pivot), turn) : turn;
}

/**
 * Caja del dibujo transformado: la envuelta mínima de la caja local girada y
 * espejada alrededor de su centro.
 *
 * El dibujo de un símbolo vive dentro de su caja declarada, así que la envolvente
 * de la caja transformada envuelve el dibujo transformado. Para una
 * transformación identidad devuelve la MISMA caja: los archivos sin orientación
 * no cambian de comportamiento (S7).
 */
/**
 * Caja de la envuelta mínima de `box` girada y espejada alrededor de `pivot`.
 *
 * `transformBox` es el caso con pivote en el centro de la caja. Un símbolo
 * anclado al origen tiene otro pivote —el centro de su tinta—, así que la caja
 * de impacto necesita poder pasar el pivote: si se usara el centro de la caja
 * declarada, la envuelta quedaría corrida respecto de lo que se dibuja.
 */
export function transformBoxAround(box: Box, transform: Transform, pivot: Point): Box {
  if (isIdentity(transform)) return box;
  const matrix = transformMatrix(transform, pivot);
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x, y: box.y + box.h },
    { x: box.x + box.w, y: box.y + box.h },
  ].map((corner) => applyMatrix(matrix, corner));

  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

export function transformBox(box: Box, transform: Transform): Box {
  return transformBoxAround(box, transform, { x: box.x + box.w / 2, y: box.y + box.h / 2 });
}

/** Giro normalizado de la capa visual del editor (siempre 0|90|180|270). */
export function normalizeRotation(degrees: number): Rotation {
  if (!Number.isFinite(degrees)) return 0;
  const quarter = Math.round(degrees / 90) % 4;
  return (((quarter + 4) % 4) * 90) as Rotation;
}

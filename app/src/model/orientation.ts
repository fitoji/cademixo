/**
 * Escritura de orientación en el registro (`geometry[17]`).
 *
 * Las fórmulas salen de la descompilación de CADe_SIMU V4 con Ghidra/REA:
 *
 * - `FUN_0043bce0` girar derecha
 * - `FUN_0043b4c0` girar izquierda
 * - `FUN_0043c500` espejo horizontal
 * - `FUN_0043cd20` espejo vertical
 *
 * Todas escriben el slot **y** las cuatro métricas `geometry[12..15]`, que por
 * lo tanto NO son una tabla por código: son la consecuencia de rotar/reflejar
 * el par (offset, tamaño). La tabla de `orientacion-8-variantes.cad` queda como
 * evidencia de verificación, no como límite. Escribir sólo el slot deja la
 * pieza in-seleccionable en CADe; escribir ambos la mantiene seleccionable.
 */

import { slotFromTransform, type Rotation, type Transform } from './transform.ts';

/** `geometry[12]`, `[13]`, `[14]`, `[15]`: offset X, offset Y, ancho, alto. */
export type OrientationMetrics = readonly [offsetX: number, offsetY: number, width: number, height: number];

export type OrientationAction = 'rotate-right' | 'rotate-left' | 'mirror-h' | 'mirror-v';

/**
 * Métricas que CADe guardó para el 6001 en los ocho slots. Se usan sólo en los
 * tests: verifican que las cuatro fórmulas reproducen el archivo real.
 */
export const REFERENCE_METRICS: readonly OrientationMetrics[] = [
  [-15, -3, 12, 15],   // t=0 identidad
  [-15, -15, 3, 12],   // t=1 90° horario
  [-12, -15, 15, 3],   // t=2 180°
  [-3, -12, 15, 15],   // t=3 270° horario
  [-12, -3, 15, 15],   // t=4 espejo
  [-15, -12, 3, 15],   // t=5 espejo + 90°
  [-15, -15, 12, 3],   // t=6 espejo + 180°
  [-3, -15, 15, 12],   // t=7 espejo + 270°
];

/** Transformación del bitfield leída literalmente de los cuatro handlers. */
export function nextSlot(action: OrientationAction, slot: number): number {
  const s = ((Math.trunc(slot) & 7) + 8) % 8;
  const rot = s & 3;
  const mirror = (s & 4) !== 0;
  switch (action) {
    case 'rotate-right':
      return (s & 4) | ((rot + 1) & 3);
    case 'rotate-left':
      return (s & 4) | ((rot + 3) & 3);
    case 'mirror-h':
      return ((2 - rot + 8) & 3) | (mirror ? 0 : 4);
    case 'mirror-v':
      return ((4 - rot + 8) & 3) | (mirror ? 0 : 4);
  }
}

/** Transformación de `geometry[12..15]` leída de los mismos handlers. */
export function nextMetrics(action: OrientationAction, m: OrientationMetrics): OrientationMetrics {
  const [a, b, c, d] = m;
  switch (action) {
    case 'rotate-right': return [-d, a, -b, c];
    case 'rotate-left':  return [b, -c, d, -a];
    case 'mirror-h':     return [a, -d, c, -b];
    case 'mirror-v':     return [-c, b, -a, d];
  }
}

/**
 * Transformación efectiva = archivo + capa visual del editor. El orden es
 * `R(visual) · Mx^m · R(archivo)`. Como `R(v) · Mx = Mx · R(−v)`, el resultado
 * vuelve a ser `Mx^m · R(rot)`, que es lo que sabe escribir el formato.
 */
export function effectiveTransform(file: Transform, visual: Rotation): Transform {
  if (file.mirror) {
    const rot = ((((file.rotation - visual) % 360) + 360) % 360) as Rotation;
    return { rotation: rot, mirror: true };
  }
  return { rotation: ((file.rotation + visual) % 360) as Rotation, mirror: false };
}

/** Slot resultante de aplicar una acción a lo que el usuario está viendo. */
export function nextWrittenSlot(action: OrientationAction, file: Transform, visual: Rotation): number {
  return nextSlot(action, slotFromTransform(effectiveTransform(file, visual)));
}

/** `true` si el registro tiene el bloque de geometría completo hasta el slot. */
export function hasOrientationFields(geometryLength: number): boolean {
  return geometryLength > 17;
}

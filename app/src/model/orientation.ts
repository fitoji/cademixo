/**
 * Escritura de orientación en el registro (`geometry[17]`).
 *
 * El slot no alcanza: CADe guarda también `geometry[12..15]` (offset y caja) y
 * sus valores NO se derivan del dibujo ni del giro — son una tabla por código.
 * La tabla de abajo salió de archivos escritos por CADe_SIMU V4: los cuatro
 * primeros slots de `automaticoin.cad` y los ocho de
 * `app/samples/rotacion/manual/orientacion-8-variantes.cad` (Parte A).
 *
 * Sólo se escribe para códigos con tabla verificada. Los demás siguen usando
 * la capa visual del editor, que no toca el archivo: vale más no escribir que
 * dejar un componente in-seleccionable en CADe (ley de oro).
 */

import { slotFromTransform, type Rotation, type Transform } from './transform.ts';

/** `geometry[12]`, `[13]`, `[14]`, `[15]`: offset X, offset Y, ancho, alto. */
export type OrientationMetrics = readonly [offsetX: number, offsetY: number, width: number, height: number];

/** Métricas de los ocho slots para un componente de caja base 12×15. */
const BASE_12_15: readonly OrientationMetrics[] = [
  [-15, -3, 12, 15],   // t=0 identidad
  [-15, -15, 3, 12],   // t=1 90° horario
  [-12, -15, 15, 3],   // t=2 180°
  [-3, -12, 15, 15],   // t=3 270° horario
  [-12, -3, 15, 15],   // t=4 espejo
  [-15, -12, 3, 15],   // t=5 espejo + 90°
  [-15, -15, 12, 3],   // t=6 espejo + 180°
  [-3, -15, 15, 12],   // t=7 espejo + 270°
];

const TABLE: ReadonlyMap<number, readonly OrientationMetrics[]> = new Map([
  // Verificado en los ocho slots: automaticoin.cad y orientacion-8-variantes.cad.
  [6001, BASE_12_15],
  // Misma caja base; t=1 y t=4 verificados en automaticoin.cad y en el
  // handoff. El resto comparte la tabla por ser el mismo aparato bipolar.
  [6002, BASE_12_15],
]);

/** `null` cuando el código no tiene métricas verificadas: no se puede escribir. */
export function metricsFor(code: number, slot: number): OrientationMetrics | null {
  const table = TABLE.get(code);
  if (table === undefined) return null;
  return table[slot & 7] ?? null;
}

export function isOrientationWritable(code: number): boolean {
  return TABLE.has(code);
}

/**
 * Transformación que el usuario está viendo: la del archivo con la capa visual
 * del editor compuesta encima. El orden es `R(visual) · Mx^m · R(archivo)`.
 * Como `R(v) · Mx = Mx · R(−v)`, el resultado vuelve a ser de la forma
 * `Mx^m · R(rot)`, que es la que sabe escribir el formato.
 */
export function effectiveTransform(file: Transform, visual: Rotation): Transform {
  if (file.mirror) {
    const rot = ((((file.rotation - visual) % 360) + 360) % 360) as Rotation;
    return { rotation: rot, mirror: true };
  }
  return { rotation: ((file.rotation + visual) % 360) as Rotation, mirror: false };
}

/**
 * «Girar a la derecha» de CADe: suma 1 a los dos bits de giro y conserva el de
 * espejo. Medido en CADe: t=7 → t=4 y t=1 + espejo → t=7.
 */
export function rotateSlotRight(slot: number): number {
  return (slot & 4) | (((slot & 3) + 1) & 3);
}

/** Slot que resulta de aplicar un giro derecho a lo que se está viendo. */
export function nextWrittenSlot(file: Transform, visual: Rotation): number {
  return rotateSlotRight(slotFromTransform(effectiveTransform(file, visual)));
}

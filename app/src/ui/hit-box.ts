/**
 * Caja de impacto de un componente colocado en el lienzo.
 *
 * El puntero sólo encuentra lo que está pintado: la tinta de un símbolo son
 * trazos con `fill: none` (`diagram.css`), así que los intersticios de la pieza
 * no existen para el hit-testing. De ahí el rectángulo invisible que cada
 * componente dibuja por debajo de su glifo.
 *
 * Ese rectángulo no puede salir de la caja declarada sola: en un símbolo anclado
 * al origen (`anchor: 'origin'`) la caja declarada es la **grilla de conexión**,
 * mientras la tinta vive en coordenadas absolutas del archivo y suele caer fuera
 * —el fusible 5000 declara 6×15 y dibuja su cuerpo a la izquierda del origen—.
 * El resultado era un halo que aparecía sobre los trazos y desaparecía en el
 * resto del bloque, porque el rectángulo cubría otro lugar.
 *
 * La caja de impacto es entonces la **unión** de la caja declarada y la
 * envolvente de la tinta, las dos transformadas alrededor del pivote que usa el
 * glifo: el centro de la tinta cuando el símbolo está anclado al origen, el
 * centro de la caja declarada cuando no. Unir y no reemplazar mantiene el área de
 * antes y le agrega la tinta, así que ningún componente se vuelve más difícil de
 * señalar que antes.
 *
 * Módulo puro: no sabe de React ni del DOM.
 */
import { transformBoxAround, type Box, type Point, type Transform } from '../model/transform.ts';

/** Envolvente de la tinta dibujada, en coordenadas del glifo (lo que da `shapesBounds`). */
export type InkBounds = {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
};

export type HitBoxInput = {
  /** Caja declarada del registro, en coordenadas del glifo. */
  readonly declared: Box;
  /** Tinta dibujada, en coordenadas del glifo. Sin tinta, `null` o no finita. */
  readonly ink: InkBounds | null;
  /** `true` si el símbolo se ancla al origen del registro (S7). */
  readonly anchored: boolean;
  readonly transform: Transform;
};

const centre = (box: Box): Point => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });

/** La envolvente como caja, o `null` si la tinta no tiene medidas utilizables. */
function boxOfInk(ink: InkBounds | null): Box | null {
  if (!ink) return null;
  const { minX, minY, maxX, maxY } = ink;
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function union(a: Box, b: Box | null): Box {
  if (!b) return a;
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.w, b.x + b.w);
  const maxY = Math.max(a.y + a.h, b.y + b.h);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Caja de impacto, en coordenadas del glifo (las del `<g data-id>` del registro). */
export function componentHitBox(input: HitBoxInput): Box {
  const inkBox = boxOfInk(input.ink);
  // El glifo anclado al origen gira alrededor de su tinta; el resto, alrededor
  // del centro de la caja declarada. Con la identidad el pivote no interviene.
  const pivot = input.anchored && inkBox ? centre(inkBox) : centre(input.declared);
  const declared = transformBoxAround(input.declared, input.transform, pivot);
  const ink = inkBox ? transformBoxAround(inkBox, input.transform, pivot) : null;
  return union(declared, ink);
}

/**
 * Navegación de bornes por teclado para cablear sin puntero.
 *
 * El cableado siempre se pudo hacer con dos clics, y sólo con eso: el lienzo no
 * era enfocable, los bornes no tenían foco y no había forma de elegir un extremo
 * sin arrastrar. Este módulo es la parte pura de esa capacidad —qué borne es el
 * siguiente en la dirección que se apretó— para poder probarla sin DOM; el
 * lienzo sólo aporta el estado de foco y el dibujo.
 *
 * La identidad del borne es `componente + índice`. Las coordenadas del punto no
 * sirven como identidad: dos bornes de componentes distintos pueden caer en el
 * mismo par (x, y) cuando están empalmados, y entonces el cursor no podría
 * distinguirlos.
 */

import type { Point } from '../pins.ts';

export interface PinRef {
  /** id del registro de componente dueño del borne. */
  componentId: number;
  /** Posición del borne dentro del componente; es su identidad estable. */
  pinIndex: number;
  /** Coordenadas del mundo. Copia: editar el ref no edita el modelo. */
  point: Point;
}

export type Direction = 'left' | 'right' | 'up' | 'down';

/** Misma tolerancia que el resto del cableado: el formato guarda enteros. */
const EPS = 0.01;

/**
 * Cuánto pesa desviarse del eje pedido, relativo a avanzar sobre él.
 *
 * El ojo espera que la flecha derecha vaya al borne de la misma fila, no al que
 * está más cerca en línea recta pero en diagonal: un borne a 3 de distancia y 3
 * de desvío no puede ganarle a uno a 6 en la misma fila. Con peso 3 el
 * desalineado paga el triple, y un vecino alineado gana hasta tres veces más
 * lejos.
 */
const CROSS_WEIGHT = 3;

/** Clave estable del borne, para `key` de React y para `data-*`. */
export const pinKey = (ref: PinRef): string => `${ref.componentId}:${ref.pinIndex}`;

/**
 * Lista plana de bornes con identidad, en orden determinista (componente y
 * después índice). El orden importa: desempata la navegación, y sin él dos
 * pulsaciones iguales podrían caer en bornes distintos.
 */
export function pinRefs(pins: Map<number, Point[]>): PinRef[] {
  const out: PinRef[] = [];
  for (const componentId of [...pins.keys()].sort((a, b) => a - b)) {
    const list = pins.get(componentId)!;
    for (let pinIndex = 0; pinIndex < list.length; pinIndex++) {
      const p = list[pinIndex]!;
      out.push({ componentId, pinIndex, point: { x: p.x, y: p.y } });
    }
  }
  return out;
}

/**
 * Dos referencias son el mismo borne. Se compara identidad y no coordenadas:
 * un empalme entre dos componentes comparte el punto, no el borne.
 */
export function samePin(a: PinRef | null, b: PinRef | null): boolean {
  return a !== null && b !== null && a.componentId === b.componentId && a.pinIndex === b.pinIndex;
}

/**
 * Primer borne en orden de lectura: la fila de arriba y, dentro de ella, el de
 * la izquierda. Es el punto de partida cuando el lienzo recibe el foco y todavía
 * no hay cursor.
 */
export function firstPin(refs: PinRef[]): PinRef | null {
  let best: PinRef | null = null;
  for (const ref of refs) {
    if (best === null) {
      best = ref;
      continue;
    }
    const higher = ref.point.y < best.point.y - EPS;
    const sameRow = Math.abs(ref.point.y - best.point.y) <= EPS;
    if (higher || (sameRow && ref.point.x < best.point.x)) best = ref;
  }
  return best;
}

/**
 * Borne siguiente al cursor en la dirección pedida, o `null` si no hay ninguno
 * de ese lado. El puntaje suma el avance sobre el eje pedido y el desvío
 * perpendicular ponderado; el empate lo gana el primero en el orden de `refs`.
 */
export function nextPin(refs: PinRef[], from: PinRef, dir: Direction): PinRef | null {
  let best: PinRef | null = null;
  let bestScore = Infinity;

  for (const ref of refs) {
    if (samePin(ref, from)) continue;
    const dx = ref.point.x - from.point.x;
    const dy = ref.point.y - from.point.y;
    const [along, cross] =
      dir === 'right'
        ? [dx, dy]
        : dir === 'left'
          ? [-dx, dy]
          : dir === 'down'
            ? [dy, dx]
            : [-dy, dx];

    // Sólo el semiespacio de la flecha: lo que está detrás no es candidato, ni
    // lo que está exactamente sobre el eje perpendicular.
    if (along <= EPS) continue;

    const score = along + Math.abs(cross) * CROSS_WEIGHT;
    if (score < bestScore) {
      best = ref;
      bestScore = score;
    }
  }

  return best;
}

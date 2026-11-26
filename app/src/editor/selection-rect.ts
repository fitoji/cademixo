/**
 * Selección por área del marquee.
 *
 * Antes sólo entraban componentes. Ahora entran también los cables, con una
 * regla que hace que "seleccionado" signifique "se mueve":
 *
 * - Componente: entra si su caja cruza el rectángulo (criterio de siempre).
 * - Cable: entra sólo si está **completo** dentro del rectángulo. Un cable que
 *   sale del área no se selecciona y se estira desde el extremo que se mueve,
 *   así no se desconecta del componente de afuera.
 *
 * `moveDelta` traslada entero todo cable seleccionado.
 */
import { boundsOf, wirePoints, type CadeRecordModel } from '../model/project.ts';

export interface SelectionRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Un punto cuenta si cae estrictamente adentro del rectángulo. */
function inside(x: number, y: number, rect: SelectionRect): boolean {
  return x > rect.x1 && x < rect.x2 && y > rect.y1 && y < rect.y2;
}

/** Cruce estricto entre dos rectángulos (un punto cuenta si cae adentro). */
function overlaps(ax1: number, ay1: number, ax2: number, ay2: number, rect: SelectionRect): boolean {
  return ax1 < rect.x2 && ax2 > rect.x1 && ay1 < rect.y2 && ay2 > rect.y1;
}

/**
 * Ids de los registros que el rectángulo selecciona, en el orden del documento.
 *
 * Sólo componentes y conexiones: los demás registros no se seleccionan.
 */
export function idsInRect(records: readonly CadeRecordModel[], rect: SelectionRect): number[] {
  const ids: number[] = [];
  for (const rec of records) {
    if (rec.kind === 'component') {
      const box = boundsOf(rec);
      if (box !== null && overlaps(box.x, box.y, box.x + box.w, box.y + box.h, rect)) ids.push(rec.id);
      continue;
    }
    if (rec.kind !== 'connection') continue;
    const pts = wirePoints(rec);
    if (pts === null) continue;
    if (inside(pts.x1, pts.y1, rect) && inside(pts.x2, pts.y2, rect)) ids.push(rec.id);
  }
  return ids;
}

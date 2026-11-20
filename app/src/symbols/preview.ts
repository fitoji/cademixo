/**
 * Encuadre de las vistas previas de la paleta: ajusta el viewBox a la tinta real
 * de cada símbolo en vez de usar una caja fija.
 *
 * `SymbolGlyph` dibuja cada componente con su geometría del lienzo, pero esa
 * geometría ocupa porciones muy distintas de la caja declarada: un contacto la
 * llena y una lámpara deja media caja vacía. Con un viewBox fijo unos símbolos
 * se veían grandes y otros diminutos. Acá el viewBox se calcula sobre trazos,
 * bornes y rótulos con un margen uniforme, así cada símbolo ocupa el máximo del
 * cuadrado sin recortarse ni deformarse.
 */
import { resolveSymbol } from './library.ts';
import { round, shapesBounds } from './draw.ts';

/** Caja nominal con que se calcula la geometría (la misma de antes del autoajuste). */
export const PREVIEW_W = 18;
export const PREVIEW_H = 15;

/** Margen alrededor de la tinta, como fracción del lado mayor. */
const PAD = 0.08;

/** Radio de borne usado al medir: el del tamaño de borne por defecto. */
const PIN_R = 1.4;

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const point = (x: number, y: number, r = 0): Bounds => ({
  minX: x - r,
  minY: y - r,
  maxX: x + r,
  maxY: y + r,
});

const union = (a: Bounds, b: Bounds): Bounds => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});

/**
 * ViewBox cuadrado y ajustado a la tinta. El `preserveAspectRatio` por defecto
 * (`xMidYMid meet`) centra y escala ese cuadrado dentro del SVG, que también es
 * cuadrado: el dibujo queda lo más grande posible y centrado, sin recorte.
 */
export function previewViewBox(code: number, pinNames: string[]): string {
  const sym = resolveSymbol(code, pinNames);
  const shapes = sym.shapes(PREVIEW_W, PREVIEW_H);
  let box = shapesBounds(shapes);

  // Si no hay trazos medibles, se cae al viewBox histórico: mejor eso que un
  // cuadrado sin sentido con `Infinity` en las cuentas.
  if (!Number.isFinite(box.minX) || !Number.isFinite(box.minY)) {
    return '-4 -6 26 24';
  }

  // Los símbolos anclados al origen se dibujan en unidades del archivo;
  // SymbolGlyph los centra en la caja con este mismo corrimiento.
  const anchored = sym.anchor === 'origin';
  const shift = anchored
    ? {
        x: PREVIEW_W / 2 - (box.minX + box.maxX) / 2,
        y: PREVIEW_H / 2 - (box.minY + box.maxY) / 2,
      }
    : { x: 0, y: 0 };

  if (anchored) {
    box = {
      minX: box.minX + shift.x,
      minY: box.minY + shift.y,
      maxX: box.maxX + shift.x,
      maxY: box.maxY + shift.y,
    };
  }

  // Bornes: el punto de conexión también es tinta y no debe quedar afuera.
  if (anchored) {
    for (const pin of sym.originPins ?? []) {
      box = union(box, point(pin.x + shift.x, pin.y + shift.y, PIN_R));
    }
  } else {
    for (const pin of sym.pins) {
      box = union(box, point(pin.nx * PREVIEW_W + shift.x, pin.ny * PREVIEW_H + shift.y, PIN_R));
    }
  }

  // Rótulos: caja aproximada alrededor del texto (mismo centro y alineación
  // que usa SymbolGlyph), para que una «M» o un designador no se corten.
  for (const label of sym.labels?.(PREVIEW_W, PREVIEW_H) ?? []) {
    const text = String(label.value);
    const halfW = (text.length * label.size * 0.6) / 2;
    const halfH = label.size * 0.6;
    const anchor = label.anchor ?? 'middle';
    const lx = label.x + shift.x + (anchor === 'start' ? halfW : anchor === 'end' ? -halfW : 0);
    const ly = label.y + shift.y;
    box = union(box, {
      minX: lx - halfW,
      minY: ly - halfH,
      maxX: lx + halfW,
      maxY: ly + halfH,
    });
  }

  const span = Math.max(box.maxX - box.minX, box.maxY - box.minY, 1);
  const half = (span * (1 + 2 * PAD)) / 2;
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;

  return `${round(cx - half)} ${round(cy - half)} ${round(half * 2)} ${round(half * 2)}`;
}

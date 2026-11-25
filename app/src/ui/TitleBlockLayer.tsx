/**
 * Capa SVG del cajetín. No decide nada: pinta el `SheetLayout` que calcula
 * `model/title-block-layout.ts`, adentro del mismo `g` transformado que el
 * resto del dibujo, así que respeta zoom y paneo sin cuentas propias.
 *
 * Sin interactividad (`pointer-events: none`) y sin fondo: es line art sobre el
 * lienzo, igual que el marco de la hoja.
 */

import type { JSX } from 'react';
import { TITLE_LAYOUT, type SheetLayout } from '@/model/title-block-layout';

/** Anclaje horizontal del texto de una celda según su alineación. */
function anchorOf(align: 0 | 1 | 2): 'start' | 'middle' | 'end' {
  if (align === 1) return 'middle';
  if (align === 2) return 'end';
  return 'start';
}

export function TitleBlockLayer({ layout }: { layout: SheetLayout | null }): JSX.Element | null {
  if (!layout) return null;

  return (
    <g className="title-block" pointerEvents="none" aria-hidden="true">
      {layout.lines.map((line, i) => (
        <line
          key={`l${i}`}
          className={line.weight === 2 ? 'tb-line tb-line-strong' : 'tb-line'}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {layout.labels.map((label, i) => (
        <text
          key={`t${i}`}
          className="tb-row-label"
          x={label.x}
          y={label.y}
          textAnchor={label.anchor === 'middle' ? 'middle' : 'start'}
          fontSize={label.anchor === 'middle' ? TITLE_LAYOUT.fontSize : TITLE_LAYOUT.rowLabelSize}
        >
          {label.text}
        </text>
      ))}

      {layout.cells.map((cell, i) => {
        const { rect } = cell;
        const textAnchor = anchorOf(cell.align);
        const inset = 2;
        const x =
          textAnchor === 'middle'
            ? rect.x + rect.w / 2
            : textAnchor === 'end'
              ? rect.x + rect.w - inset
              : rect.x + inset;

        return (
          <g key={`c${i}`}>
            {cell.caption !== undefined && (
              <text
                className="tb-caption"
                x={rect.x + inset}
                y={rect.y + TITLE_LAYOUT.captionSize + 0.6}
                fontSize={TITLE_LAYOUT.captionSize}
              >
                {cell.caption}
              </text>
            )}
            {cell.text !== '' && (
              <text
                className={cell.emphasis ? 'tb-value tb-value-strong' : 'tb-value'}
                x={x}
                y={rect.y + rect.h - 1.1}
                textAnchor={textAnchor}
                fontSize={TITLE_LAYOUT.fontSize}
              >
                {cell.text}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

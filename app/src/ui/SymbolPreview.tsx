import type { JSX } from 'react';
import { PREVIEW_H, PREVIEW_W, previewViewBox } from '../symbols/preview.ts';
import { SymbolGlyph } from './SymbolGlyph.tsx';

/**
 * Glifo autoajustado que llena su contenedor cuadrado.
 *
 * La clave por código fuerza un remontaje cuando cambia el símbolo, así el
 * nuevo preview entra con un fade corto en vez de aparecer de golpe: al pasar
 * de un componente a otro la transición se siente suave, sin deformar el trazo
 * ni tocar la tinta del dibujo.
 */
export function SymbolPreview({ code, pinNames }: { code: number; pinNames: string[] }): JSX.Element {
  return (
    <svg
      key={code}
      className="size-full animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
      viewBox={previewViewBox(code, pinNames)}
      aria-hidden="true"
    >
      <SymbolGlyph code={code} pinNames={pinNames} w={PREVIEW_W} h={PREVIEW_H} />
    </svg>
  );
}

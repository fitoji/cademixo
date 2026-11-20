import type { CSSProperties, JSX, ReactNode } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { SymbolDef } from '../symbols/library.ts';
import { SymbolGlyph } from './SymbolGlyph.tsx';

interface Props {
  sym: SymbolDef;
  /** Nombre visible de la familia, el mismo que usa la paleta. */
  label: string;
  /** Tono de la familia (`var(--tone-*)`), para teñir la miniatura. */
  tone: string;
  children: ReactNode;
}

/**
 * Tooltip de un componente de la paleta: reproduce el patrón "tooltip con
 * imagen" de shadcnblocks, pero la imagen es el propio `SymbolGlyph` del lienzo
 * en grande. Así la vista previa no se puede desincronizar del dibujo real y
 * no hay que publicar un SVG aparte por cada código.
 */
export function ComponentTooltip({ sym, label, tone, children }: Props): JSX.Element {
  const pinNames = sym.pins.map((pin) => pin.name);

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" className="p-0">
        <div className="flex flex-col gap-1 p-3">
          <span
            className="pal-tone grid size-28 place-items-center rounded-md border"
            style={{ '--ink': tone } as CSSProperties}
          >
            <svg className="size-24" viewBox="-4 -6 26 24" aria-hidden="true">
              <SymbolGlyph code={sym.code} pinNames={pinNames} w={18} h={15} />
            </svg>
          </span>
          <p className="font-semibold">{sym.name}</p>
          <p className="text-xs">
            Código {sym.code} · {label}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

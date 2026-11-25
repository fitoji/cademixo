/**
 * «Acerca de…»: la ficha del producto.
 *
 * Es el único lugar donde la mascota se dibuja grande. El resto es ficha
 * técnica —rótulo de 10px arriba, dato en mono abajo, separado por 1px— y no
 * una landing: el chrome de la app no admite tarjetas ni métricas.
 */

import type { JSX, RefObject } from 'react';
import mascotUrl from '../mascot.webp';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const REPOSITORY = 'https://github.com/fitoji/rea-ing-inversa';
const REPOSITORY_LABEL = 'github.com/fitoji/rea-ing-inversa';

/**
 * Marca de GitHub (trazado de Simple Icons, CC0): lucide no incluye logos de
 * marca. Va rellena a `currentColor` para heredar el tono del link.
 */
function GitHubMark({ className }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export function AboutDialog({
  open,
  onOpenChange,
  version,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: string;
  /** Botón de la marca: al cerrar, el foco vuelve ahí y no al `body`. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          const target = returnFocusTo?.current;
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
      >
        <DialogHeader className="gap-0">
          <DialogTitle className="text-[10px] font-semibold tracking-[0.7px] text-muted-foreground uppercase">
            Acerca de cadeMixo
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3.5">
          <img
            src={mascotUrl}
            alt=""
            aria-hidden="true"
            className="size-14 shrink-0 object-contain"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[19px] leading-none font-semibold tracking-tight">cadeMixo</span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">v{version}</span>
          </div>
        </div>

        <DialogDescription className="text-[13px] leading-relaxed text-foreground">
          Simulador eléctrico educativo y 100&nbsp;% open source. Abre, edita y simula esquemas de
          CADe_SIMU sin perder un byte: el archivo sale exactamente como entró.
        </DialogDescription>

        <dl className="divide-y divide-border border-y border-border">
          <div className="grid grid-cols-[84px_1fr] items-baseline gap-3 py-2">
            <dt className="text-[10px] font-semibold tracking-[0.5px] text-muted-foreground uppercase">
              Repositorio
            </dt>
            <dd className="min-w-0">
              <a
                href={REPOSITORY}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-1.5 rounded-[2px] font-mono text-[11px] break-all text-foreground underline decoration-muted-foreground underline-offset-2 transition-colors outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <GitHubMark className="size-3.5 shrink-0" />
                {REPOSITORY_LABEL}
                <span className="sr-only">(se abre en otra pestaña)</span>
              </a>
            </dd>
          </div>

          <div className="grid grid-cols-[84px_1fr] items-baseline gap-3 py-2">
            <dt className="text-[10px] font-semibold tracking-[0.5px] text-muted-foreground uppercase">
              Uso
            </dt>
            <dd className="text-[11px] leading-relaxed">
              Cátedras de electrotecnia, talleres y mantenimiento.
            </dd>
          </div>

          <div className="grid grid-cols-[84px_1fr] items-baseline gap-3 py-2">
            <dt className="text-[10px] font-semibold tracking-[0.5px] text-muted-foreground uppercase">
              Formato
            </dt>
            <dd className="text-[11px] leading-relaxed">
              <span className="font-mono">.cad</span> y <span className="font-mono">.cade</span> de
              CADe_SIMU, round-trip byte a byte.
            </dd>
          </div>
        </dl>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Proyecto independiente inspirado en CADe_SIMU. No está afiliado ni respaldado por sus
          autores, y no incluye código suyo: la aplicación, el parser y el solver están escritos
          desde cero. CADe_SIMU y las marcas asociadas pertenecen a sus respectivos titulares.
        </p>
      </DialogContent>
    </Dialog>
  );
}

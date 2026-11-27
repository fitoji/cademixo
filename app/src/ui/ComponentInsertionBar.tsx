import type { CSSProperties } from 'react';
import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  createCommandController,
} from '@ui-sdk/react/command';
import { CornerDownLeftIcon, SearchIcon } from 'lucide-react';
import type { PaletteScope } from '../symbols/scope.ts';
import { insertionMatches } from './insertion-matches.ts';
import { recordRecentUse } from './recent.ts';
import { GROUP_LABEL, GROUP_TONE } from './symbol-presentation.ts';
import { SymbolPreview } from './SymbolPreview.tsx';

export interface ComponentInsertionBarHandle {
  openWith(char: string): void;
}

interface Props {
  scope: PaletteScope;
  placing: number | null;
  // El callback de la paleta: arma la herramienta, no inserta.
  onPick: (code: number) => void;
  onFocusCanvas: () => void;
  canSearch: () => boolean;
}

export const ComponentInsertionBar = forwardRef<ComponentInsertionBarHandle, Props>(
  function ComponentInsertionBar({ scope, placing, onPick, onFocusCanvas, canSearch }, ref) {
    const controller = useMemo(() => createCommandController(), []);
    const [query, setQuery] = useState('');
    const matches = useMemo(() => insertionMatches(scope, query), [scope, query]);
    const searching = query.trim() !== '';

    const clear = (): void => {
      controller.setQuery('');
    };

    useImperativeHandle(
      ref,
      () => ({
        openWith(char) {
          if (!canSearch()) return;
          controller.setQuery(char);
          controller.focus();
        },
      }),
      [controller, canSearch],
    );

    const onAction = (value: string): void => {
      const code = Number(value);
      const sym = matches.find((candidate) => candidate.code === code);
      if (sym === undefined || !canSearch()) return;
      recordRecentUse(sym.code);
      clear();
      onPick(sym.code);
      onFocusCanvas();
    };

    return (
      <div
        data-component-insertion-bar=""
        className="relative z-20 shrink-0 border-t border-border bg-card px-2 py-1 shadow-chrome-up"
        onKeyDownCapture={(event) => {
          // La composición IME consume Enter antes que la lista: no confirmar
          // una fila con la tecla que termina de escribir el carácter.
          if (event.nativeEvent.isComposing) {
            if (event.key === 'Enter') event.stopPropagation();
            return;
          }
          if (event.key === 'Escape' && searching) {
            event.preventDefault();
            event.stopPropagation();
            clear();
            onFocusCanvas();
            return;
          }
          if (event.key === 'Tab' && searching) {
            // Salir sin confirmar: que Tab siga a su control y sin robar el foco.
            clear();
          }
        }}
        onBlurCapture={(event) => {
          const next = event.relatedTarget as Node | null;
          if (next !== null && event.currentTarget.contains(next)) return;
          // Clic fuera: cerrar sin confirmar y sin forzar el foco al lienzo.
          if (searching) clear();
        }}
      >
        <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2 focus-within:ring-2 focus-within:ring-ring/40">
          <SearchIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <Command
            controller={controller}
            filter={false}
            query={query}
            onQueryChange={setQuery}
            onAction={onAction}
            className="min-w-0 flex-1"
          >
            <CommandInput
              aria-label="Buscar componente para insertar"
              placeholder="Insertar componente: nombre o código…"
              className="h-7 w-full min-w-0 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            />
            {searching && (
              <>
                <CommandEmpty role="status" className="sr-only">
                  {(state) =>
                    state.empty && !state.loading
                      ? `Sin componentes para «${query.trim()}»`
                      : null
                  }
                </CommandEmpty>
                <CommandList className="absolute right-0 bottom-full left-0 mb-1 max-h-[min(260px,42vh)] overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-float">
                  {matches.map((sym) => (
                    <CommandItem
                      key={sym.code}
                      value={String(sym.code)}
                      data-code={sym.code}
                      aria-label={`${sym.name}, código ${sym.code}, ${GROUP_LABEL[sym.group]}`}
                      className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-xs data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[highlighted]:outline data-[highlighted]:outline-1 data-[highlighted]:outline-border"
                    >
                      {(state) => (
                        <>
                          <span
                            className="pal-tone grid size-7 shrink-0 place-items-center rounded border"
                            style={{ '--ink': GROUP_TONE[sym.group] } as CSSProperties}
                            aria-hidden="true"
                          >
                            <SymbolPreview code={sym.code} pinNames={sym.pins.map((pin) => pin.name)} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-left">{sym.name}</span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                            {sym.code}
                          </span>
                          {state.highlighted && (
                            <CornerDownLeftIcon aria-hidden="true" className="size-3 shrink-0" />
                          )}
                        </>
                      )}
                    </CommandItem>
                  ))}
                </CommandList>
              </>
            )}
          </Command>
          <span
            aria-hidden="true"
            className="hidden shrink-0 gap-2 font-mono text-[10px] text-muted-foreground sm:flex"
          >
            {placing === null ? (
              <>
                <span>↑↓ elegir</span>
                <span>Enter preparar</span>
                <span>Esc cancelar</span>
              </>
            ) : (
              <span>Clic en el lienzo para colocar</span>
            )}
          </span>
        </div>
      </div>
    );
  },
);

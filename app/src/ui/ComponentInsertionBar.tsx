import type { CSSProperties } from 'react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  createCommandController,
} from '@ui-sdk/react/command';
import {
  CornerDownLeftIcon,
  GripVerticalIcon,
  Maximize2Icon,
  MinusIcon,
  PanelBottomIcon,
  PlusIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
  onDockChange: (docked: boolean) => void;
  className?: string;
}

interface Offset {
  x: number;
  y: number;
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const HOME: Offset = { x: 0, y: 0 };
const STEP = 16;
const BIG_STEP = 48;
const THRESHOLD = 4;
const MARGIN = 8;
const DOCK_ZONE = 72;
const PRESETS = ['abajo al centro', 'abajo a la izquierda', 'abajo a la derecha', 'arriba al centro'] as const;

/** El mismo límite para puntero, teclado y presets: la barra no se pierde. */
function clamp(base: Offset, rect: Box, host: Box, next: Offset): Offset {
  const minX = Math.min(host.left + MARGIN - rect.left, host.right - MARGIN - rect.right);
  const maxX = Math.max(host.left + MARGIN - rect.left, host.right - MARGIN - rect.right);
  const minY = Math.min(host.top + MARGIN - rect.top, host.bottom - MARGIN - rect.bottom);
  const maxY = Math.max(host.top + MARGIN - rect.top, host.bottom - MARGIN - rect.bottom);
  return {
    x: base.x + Math.min(Math.max(next.x - base.x, minX), maxX),
    y: base.y + Math.min(Math.max(next.y - base.y, minY), maxY),
  };
}

export const ComponentInsertionBar = forwardRef<ComponentInsertionBarHandle, Props>(
  function ComponentInsertionBar({ scope, placing, onPick, onFocusCanvas, canSearch, onDockChange, className }, ref) {
    const controller = useMemo(() => createCommandController(), []);
    const [query, setQuery] = useState('');
    const matches = useMemo(() => insertionMatches(scope, query), [scope, query]);
    const searching = query.trim() !== '';

    const rootRef = useRef<HTMLDivElement | null>(null);
    const drag = useRef<{
      pointerId: number;
      startX: number;
      startY: number;
      offset: Offset;
      rect: Box;
      host: Box;
      moved: boolean;
    } | null>(null);
    const [offset, setOffset] = useState<Offset>(HOME);
    const [dragging, setDragging] = useState(false);
    const [preset, setPreset] = useState(0);
    const [announcement, setAnnouncement] = useState('');
    const [minimized, setMinimized] = useState(false);
    const [docked, setDocked] = useState(false);
    const floatingOffset = useRef<Offset>(HOME);
    const restoreRef = useRef<HTMLButtonElement | null>(null);

    const geometry = useCallback((): { rect: Box; host: Box } | null => {
      const root = rootRef.current;
      const host = root?.parentElement;
      if (!root || !host) return null;
      const a = root.getBoundingClientRect();
      const b = host.getBoundingClientRect();
      return { rect: a, host: b };
    }, []);

    const atHome = useCallback((rect: Box, current: Offset): Box => ({
      left: rect.left - current.x,
      right: rect.right - current.x,
      top: rect.top - current.y,
      bottom: rect.bottom - current.y,
    }), []);

    const moveBy = (dx: number, dy: number, label: string): void => {
      const box = geometry();
      if (box === null) return;
      setOffset(clamp(offset, box.rect, box.host, { x: offset.x + dx, y: offset.y + dy }));
      setAnnouncement(`Barra movida ${label}`);
    };

    useEffect(() => {
      const onResize = (): void => {
        if (docked) return;
        const box = geometry();
        if (box === null) return;
        setOffset((current) => clamp(HOME, atHome(box.rect, current), box.host, current));
      };
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }, [atHome, docked, geometry]);

    // El ancho cambia al plegar: re-clamp y foco en el botón que queda visible.
    useEffect(() => {
      const frame = requestAnimationFrame(() => {
        if (docked) return;
        const box = geometry();
        if (box !== null) {
          setOffset((current) => clamp(HOME, atHome(box.rect, current), box.host, current));
        }
        if (minimized) restoreRef.current?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(frame);
    }, [atHome, docked, geometry, minimized]);

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

    const cyclePreset = (): void => {
      const box = geometry();
      if (box === null) return;
      const rest = atHome(box.rect, offset);
      const next = (preset + 1) % PRESETS.length;
      const target: Offset =
        next === 1
          ? { x: box.host.left + MARGIN - rest.left, y: 0 }
          : next === 2
            ? { x: box.host.right - MARGIN - rest.right, y: 0 }
            : next === 3
              ? { x: 0, y: box.host.top + MARGIN - rest.top }
              : HOME;
      setOffset(clamp(HOME, rest, box.host, target));
      setPreset(next);
      setAnnouncement(`Barra ${PRESETS[next]}`);
    };

    const dock = (): void => {
      if (docked) return;
      floatingOffset.current = offset;
      setDocked(true);
      setMinimized(false);
      setOffset(HOME);
      onDockChange(true);
      setAnnouncement('Barra fijada abajo');
    };

    const float = (): void => {
      if (!docked) return;
      setDocked(false);
      setOffset(floatingOffset.current);
      onDockChange(false);
      setAnnouncement('Barra separada del borde');
    };

    return (
      <div
        ref={rootRef}
        data-component-insertion-bar=""
        data-docked={docked ? '' : undefined}
        style={docked ? undefined : { transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px)` }}
        className={cn(
          'z-30 h-9 bg-card text-foreground motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out',
          docked
            ? 'inset-x-0 bottom-0 w-full rounded-none border-x-0 border-t border-b-0 shadow-none'
            : 'bottom-32 left-1/2 rounded-sm border border-border shadow-float moderno:rounded-lg',
          !docked && (minimized ? 'w-[9.5rem]' : 'w-[min(720px,calc(100%-2rem))]'),
          className,
        )}
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
        <span role="status" aria-live="polite" className="sr-only">
          {announcement}
        </span>
        <div
          inert={minimized}
          className={cn(
            'absolute inset-0 flex h-9 items-center gap-2 px-2.5 transition-opacity focus-within:ring-2 focus-within:ring-ring/40 motion-safe:duration-200 moderno:focus-within:ring-primary/30',
            minimized && 'pointer-events-none opacity-0',
          )}
        >
          <button
            type="button"
            aria-label={docked ? 'Separar barra del borde' : 'Fijar barra abajo'}
            title={docked ? 'Separar del borde' : 'Fijar abajo'}
            className="grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            onClick={docked ? float : dock}
          >
            <PanelBottomIcon aria-hidden="true" className="size-3.5" />
          </button>
          {!docked && (
          <button
            type="button"
            data-drag-handle=""
            data-dragging={dragging ? '' : undefined}
            aria-label="Mover barra de inserción. Usá las flechas; con Mayús, pasos grandes; Inicio la centra."
            title="Arrastrar para mover"
            className="grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              const box = geometry();
              if (box === null) return;
              drag.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                offset,
                rect: box.rect,
                host: box.host,
                moved: false,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const active = drag.current;
              if (active === null || active.pointerId !== event.pointerId) return;
              const dx = event.clientX - active.startX;
              const dy = event.clientY - active.startY;
              if (!active.moved && Math.hypot(dx, dy) < THRESHOLD) return;
              active.moved = true;
              setDragging(true);
              setOffset(clamp(active.offset, active.rect, active.host, {
                x: active.offset.x + dx,
                y: active.offset.y + dy,
              }));
            }}
            onPointerUp={(event) => {
              const active = drag.current;
              drag.current = null;
              setDragging(false);
              if (active?.moved === true) {
                const next = clamp(active.offset, active.rect, active.host, {
                  x: active.offset.x + event.clientX - active.startX,
                  y: active.offset.y + event.clientY - active.startY,
                });
                const bottom = active.rect.bottom + next.y - active.offset.y;
                if (bottom >= active.host.bottom - DOCK_ZONE) dock();
                else setAnnouncement('Barra movida');
              }
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={() => {
              drag.current = null;
              setDragging(false);
            }}
            onLostPointerCapture={() => setDragging(false)}
            onKeyDown={(event) => {
              const step = event.shiftKey ? BIG_STEP : STEP;
              if (event.key === 'ArrowLeft') moveBy(-step, 0, 'a la izquierda');
              else if (event.key === 'ArrowRight') moveBy(step, 0, 'a la derecha');
              else if (event.key === 'ArrowUp') moveBy(0, -step, 'arriba');
              else if (event.key === 'ArrowDown') moveBy(0, step, 'abajo');
              else if (event.key === 'Home') {
                setOffset(HOME);
                setPreset(0);
                setAnnouncement('Barra abajo al centro');
              } else return;
              event.preventDefault();
            }}
          >
            <GripVerticalIcon aria-hidden="true" className="size-3.5" />
          </button>
          )}
          {!docked && (
          <button
            type="button"
            aria-label={`Mover barra ${PRESETS[(preset + 1) % PRESETS.length]}`}
            title="Mover a otra posición"
            className="grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            onClick={cyclePreset}
          >
            <Maximize2Icon aria-hidden="true" className="size-3" />
          </button>
          )}
          <span
            aria-hidden="true"
            className="shrink-0 font-mono text-[11px] font-medium text-ring moderno:text-primary"
          >
            Insertar:
          </span>
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
              placeholder="nombre o código…"
              className="h-full w-full min-w-0 bg-transparent font-mono text-xs text-foreground caret-ring outline-none placeholder:text-muted-foreground moderno:caret-primary"
            />
            {searching && (
              <>
                {matches.length === 0 && (
                  <CommandEmpty
                    role="status"
                    className="absolute right-0 bottom-full left-0 mb-1 rounded-sm border border-border bg-popover px-2.5 py-2 font-mono text-[11px] text-muted-foreground shadow-float moderno:rounded-lg"
                  >
                    {(state) =>
                      state.empty && !state.loading
                        ? `Sin componentes para «${query.trim()}»`
                        : null
                    }
                  </CommandEmpty>
                )}
                <CommandList
                  className={cn(
                    'absolute right-0 bottom-full left-0 mb-1 max-h-[min(260px,40vh)] overflow-y-auto rounded-sm border border-border bg-popover p-0 shadow-float moderno:rounded-lg',
                    matches.length === 0 && 'hidden',
                  )}
                >
                  {matches.map((sym) => (
                    <CommandItem
                      key={sym.code}
                      value={String(sym.code)}
                      data-code={sym.code}
                      aria-label={`${sym.name}, código ${sym.code}, ${GROUP_LABEL[sym.group]}`}
                      className="flex items-center gap-2 border-b border-border/60 px-2 py-1.5 text-xs last:border-b-0 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[highlighted]:outline-1 data-[highlighted]:outline-ring data-[highlighted]:-outline-offset-1"
                    >
                      {(state) => (
                        <>
                          <span
                            className="pal-tone grid size-7 shrink-0 place-items-center rounded-[2px] border"
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
            className="hidden shrink-0 gap-1.5 font-mono text-[10px] text-muted-foreground sm:flex"
          >
            {placing === null ? (
              <>
                <span>↑↓ elegir</span>
                <span aria-hidden="true">·</span>
                <span>Enter preparar</span>
                <span aria-hidden="true">·</span>
                <span>Esc cancelar</span>
              </>
            ) : (
              <span>Clic en el lienzo para colocar</span>
            )}
          </span>
          <button
            type="button"
            aria-label="Minimizar barra de inserción"
            title="Minimizar"
            className="grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            onClick={() => {
              clear();
              setMinimized(true);
              setAnnouncement('Barra minimizada');
            }}
          >
            <MinusIcon aria-hidden="true" className="size-3" />
          </button>
        </div>
        <div
          inert={!minimized}
          className={cn(
            'absolute inset-0 flex h-9 items-center gap-2 px-2.5 transition-opacity focus-within:ring-2 focus-within:ring-ring/40 motion-safe:duration-200 moderno:focus-within:ring-primary/30',
            !minimized && 'pointer-events-none opacity-0',
          )}
        >
          <button
            ref={restoreRef}
            type="button"
            aria-label="Restaurar barra de inserción"
            title="Restaurar"
            className="grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            onClick={() => {
              setMinimized(false);
              setAnnouncement('Barra restaurada');
              requestAnimationFrame(() => controller.focus());
            }}
          >
            <PlusIcon aria-hidden="true" className="size-3" />
          </button>
          <span
            aria-hidden="true"
            className="shrink-0 font-mono text-[11px] font-medium text-ring moderno:text-primary"
          >
            Insertar:
          </span>
        </div>
      </div>
    );
  },
);

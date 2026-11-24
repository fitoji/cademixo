import { useEffect, useState, useSyncExternalStore } from 'react';
import type { JSX, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import {
  ChevronRightIcon,
  InfoIcon,
  KeyboardIcon,
  MousePointerClickIcon,
  RotateCwIcon,
  StarIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import { GEOMETRY, boxOf, wirePoints, LAMP_COLORS, type CadeRecordModel, type LampColor } from '../model/project.ts';
import { isIdentity, type Transform } from '../model/transform.ts';
import { hasColorSlot } from '../model/component-spec.ts';
import { isApplePlatform, useShortcutHint } from './shortcuts.ts';
import { keyEventToKeys } from './shortcut-bindings.ts';
import { resolveSymbol } from '../symbols/library.ts';
import type { Rotation } from '../editor/state.ts';
import { cableLength, cableNumberOf, cableSegments, type Finding, type Network } from '../editor/network.ts';
import type { Point } from '../editor/pins.ts';
import { setSectionOpen, subscribeSections, getSectionsSnapshot, type SectionId } from './section-state.ts';
import { getFavorites, isFavorite, subscribeFavorites, toggleStoredFavorite } from './favorites.ts';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const DL = 'grid grid-cols-[88px_1fr] gap-x-2 gap-y-1 text-xs';
const DT = 'text-muted-foreground';
const DD = 'font-mono text-[11.5px] text-foreground/80 [overflow-wrap:anywhere]';

/**
 * Orientación leída del registro, en palabras: `0°`, `90° · espejo`, …
 *
 * Se muestra la del ARCHIVO (S6): es la que se ve al abrir el documento. Lo que
 * se gira con la tecla `R` es una capa visual encima y todavía no se guarda.
 */
function orientationLabel(transform: Transform): string {
  return isIdentity(transform) ? '0°' : `${transform.rotation}°${transform.mirror ? ' · espejo' : ''}`;
}

interface Props {
  selected: CadeRecordModel[];
  rotation: Record<number, Rotation>;
  network: Network;
  findings: Finding[];
  onDesignator: (id: number, value: string) => void;
  onPinName: (id: number, index: number, value: string) => void;
  onPinVisible: (id: number, index: number, visible: boolean) => void;
  onPinLabelsVisible: (id: number, visible: boolean) => void;
  onLampColor: (id: number, color: LampColor) => void;
  onRotate: () => void;
  onDelete: () => void;
  onCableNumber: (ids: number[], value: number) => void;
  onAddJunction: (x: number, y: number) => void;
  onRemoveJunction: (id: number) => void;
  /** Lleva el lienzo al lugar del aviso y lo resalta. */
  onFocusFinding: (finding: Finding) => void;
  vertex: Point | null;
  /** Sólo se puede unir si dos tramos terminan en el punto. */
  canDeleteVertex: boolean;
  onDeleteVertex: () => void;
  /** En simulación el circuito es de solo lectura. */
  readOnly: boolean;
  /**
   * El plegado de secciones es del mundo moderno. En el clásico cada grupo se
   * muestra entero, como en el panel de CADe_SIMU: ahí no se pliega nada.
   */
  collapsibleSections: boolean;
  /** El Drawer abre en modo avisos cuando se pulsa el contador del pie. */
  view?: 'propiedades' | 'avisos';
  /** Atajo del designador seleccionado (sidecar del plano). */
  componentShortcut?: string | null;
  /** Sólo los aparatos accionables pueden tener atajo. */
  canAssignShortcut?: boolean;
  onAssignShortcut: (keys: string | null) => void;
}

export function Inspector(props: Props): JSX.Element {
  const {
    selected,
    findings,
    onAddJunction,
    onRemoveJunction,
    onFocusFinding,
    vertex,
    canDeleteVertex,
    onDeleteVertex,
    readOnly,
    collapsibleSections,
    view = 'propiedades',
  } = props;

  if (view === 'avisos') {
    return (
      <InspectorShell>
        <Findings
          findings={findings}
          onAddJunction={onAddJunction}
          onRemoveJunction={onRemoveJunction}
          onFocusFinding={onFocusFinding}
          readOnly={readOnly}
          collapsible={collapsibleSections}
          forceOpen
          limit={findings.length}
        />
        {findings.length === 0 && (
          <Empty className="px-0 py-4">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InfoIcon />
              </EmptyMedia>
              <EmptyTitle>Sin avisos</EmptyTitle>
              <EmptyDescription className="text-xs">El esquema no tiene avisos pendientes.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </InspectorShell>
    );
  }

  const vertexBlock = vertex ? (
    <Section id="vertice" title="Vértice seleccionado" collapsible={collapsibleSections}>
      <dl className={DL}>
        <Row label="Posición" value={`${vertex.x}, ${vertex.y}`} />
      </dl>
      {!canDeleteVertex && (
        <p className="text-xs text-muted-foreground">
          No se puede unir: hacen falta dos tramos que terminen en este punto.
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={onDeleteVertex}
        disabled={readOnly || !canDeleteVertex}
      >
        <Trash2Icon data-icon="inline-start" />
        Eliminar vértice (⌫)
      </Button>
    </Section>
  ) : null;

  if (selected.length === 0) {
    return (
      <InspectorShell>
        {vertexBlock}
        <Empty className="px-0 py-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MousePointerClickIcon />
            </EmptyMedia>
            <EmptyTitle>Nada seleccionado</EmptyTitle>
            <EmptyDescription className="text-xs">
              Clic en un componente o en un cable. <b>Shift</b>+clic suma a la selección; arrastrar sobre el lienzo
              vacío selecciona varios. <b>Arrastrá un cable</b> para doblarlo; los cuadrados azules son sus vértices y se
              borran con <b>⌫</b>.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
        <Findings findings={findings} onAddJunction={onAddJunction} onRemoveJunction={onRemoveJunction} onFocusFinding={onFocusFinding} readOnly={readOnly} collapsible={collapsibleSections} />
      </InspectorShell>
    );
  }

  if (selected.length > 1) {
    const wires = selected.filter((r) => r.kind === 'connection');

    // Un cable son varios tramos y el lienzo los selecciona juntos. Si toda la
    // selección es el MISMO cable, se muestra el panel del cable (con
    // alimentación y vértices) en vez del panel de multi-selección: si no, un
    // cable de 3 tramos no se podía marcar como fase ni como neutro.
    const sameCable =
      wires.length === selected.length && wires.length > 0 && new Set(wires.map((w) => cableNumberOf(w))).size === 1;
    if (sameCable) {
      return <Single key={wires[0]!.id} rec={wires[0]!} vertexBlock={vertexBlock} {...props} />;
    }

    return (
      <InspectorShell>
        <SectionLabel>Selección</SectionLabel>
        <dl className={DL}>
          <Row label="Registros" value={selected.length} />
          {wires.length > 0 && (
            <>
              <Row label="Cable" value={`nº ${cableNumberOf(wires[0]!)}`} />
              <Row label="Longitud" value={`${cableLength(props.network, wires.map((w) => w.id))} u`} />
            </>
          )}
        </dl>
        {vertexBlock}
        <div className="flex flex-wrap gap-1">
          {selected.slice(0, 24).map((r) => (
            <Badge key={r.id} variant="outline" className="h-5 px-1.5 font-mono text-[10.5px] font-normal">
              {r.designator || `#${r.id}`}
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={props.onRotate}>
            <RotateCwIcon data-icon="inline-start" />
            Rotar
          </Button>
          <Button variant="outline" size="sm" onClick={props.onDelete}>
            <Trash2Icon data-icon="inline-start" />
            Borrar
          </Button>
        </div>
        <Findings findings={findings} onAddJunction={onAddJunction} onRemoveJunction={onRemoveJunction} onFocusFinding={onFocusFinding} readOnly={readOnly} collapsible={collapsibleSections} />
      </InspectorShell>
    );
  }

  const rec = selected[0]!;
  return <Single key={rec.id} rec={rec} vertexBlock={vertexBlock} {...props} />;
}

function InspectorShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 px-4 py-3">{children}</div>
      </ScrollArea>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="text-[10px] font-semibold tracking-[0.7px] text-muted-foreground uppercase">{children}</div>
  );
}

/**
 * Sección plegable del inspector. El rótulo es el mando y el contenido se pide.
 *
 * Sólo se pliegan los grupos secundarios -vértice, bornes, avisos-: lo que
 * describe al componente o a la selección se lee sin abrir nada, porque es el
 * motivo por el que está abierto el inspector.
 */
function Section({
  id,
  title,
  children,
  collapsible,
  groupInClassic = true,
  forceOpen = false,
}: {
  /** Clave con la que la sección recuerda si quedó plegada. */
  id: SectionId;
  title: ReactNode;
  children: ReactNode;
  collapsible: boolean;
  /** Abre el grupo sin importar el plegado recordado (modo avisos del Drawer). */
  forceOpen?: boolean;
  /**
   * En el clásico la sección era -o rótulo y contenido sueltos, o un grupo con
   * su propio gap. Se replica tal cual: el espaciado del panel de CADe_SIMU no
   * cambia porque el mundo moderno necesite otra cosa.
   */
  groupInClassic?: boolean;
}): JSX.Element {
  const open = useSyncExternalStore(subscribeSections, getSectionsSnapshot, getSectionsSnapshot);
  const expanded = forceOpen || !open.split(',').includes(id);

  /*
   * Un `<details>` que no se puede abrir sería una mentira del DOM, y frenar el
   * mouse no alcanza: el `summary` sigue siendo enfocable y Enter lo pliega.
   * En el clásico vuelve a ser el rótulo que era antes.
   */
  if (!collapsible) {
    return groupInClassic ? (
      <div className="flex flex-col gap-2">
        <SectionLabel>{title}</SectionLabel>
        {children}
      </div>
    ) : (
      <>
        <SectionLabel>{title}</SectionLabel>
        {children}
      </>
    );
  }
  return (
    <details
      open={expanded}
      onToggle={(event) => setSectionOpen(id, event.currentTarget.open)}
      className="group/section -mx-1"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-1 py-1 text-[10px] font-semibold tracking-[0.7px] text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronRightIcon className="size-3 shrink-0 transition-transform group-open/section:rotate-90" />
      </summary>
      <div className="flex flex-col gap-2 pt-1.5">{children}</div>
    </details>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <>
      <dt className={DT}>{label}</dt>
      <dd className={DD}>{value}</dd>
    </>
  );
}

function Findings({
  findings,
  onAddJunction,
  onRemoveJunction,
  onFocusFinding,
  readOnly,
  collapsible,
  forceOpen = false,
  limit = 10,
}: {
  findings: Finding[];
  onAddJunction: (x: number, y: number) => void;
  onRemoveJunction: (id: number) => void;
  onFocusFinding: (finding: Finding) => void;
  readOnly: boolean;
  collapsible: boolean;
  forceOpen?: boolean;
  limit?: number;
}): JSX.Element | null {
  if (findings.length === 0) return null;
  return (
    <Section id="avisos" title={`Avisos (${findings.length})`} collapsible={collapsible} forceOpen={forceOpen}>
      {findings.slice(0, limit).map((f, i) => (
        <Alert
          key={`${f.code}-${i}`}
          variant={f.level === 'error' ? 'destructive' : 'default'}
          role="button"
          tabIndex={0}
          title="Ir al lugar del aviso"
          className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          onClick={() => onFocusFinding(f)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onFocusFinding(f);
            }
          }}
        >
          <TriangleAlertIcon />
          <AlertDescription className="text-xs">
            {f.message}
            {f.code === 'tee-without-junction' && f.at && (
              <Button
                variant="secondary"
                size="xs"
                className="mt-1.5"
                disabled={readOnly}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddJunction(f.at!.x, f.at!.y);
                }}
              >
                Crear unión
              </Button>
            )}
            {f.code === 'orphan-junction' && f.ids.length > 0 && (
              <Button
                variant="secondary"
                size="xs"
                className="mt-1.5"
                disabled={readOnly}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveJunction(f.ids[0]!);
                }}
              >
                Quitar unión
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ))}
    </Section>
  );
}

/** Aviso informativo del panel (no es un error de red). */
function Note({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Alert>
      <InfoIcon />
      <AlertDescription className="text-xs">{children}</AlertDescription>
    </Alert>
  );
}

function Single({
  rec,
  rotation,
  onFocusFinding,
  network,
  findings,
  onDesignator,
  onPinName,
  onPinVisible,
  onPinLabelsVisible,
  onLampColor,
  onRotate,
  onDelete,
  onCableNumber,
  onAddJunction,
  onRemoveJunction,
  vertexBlock,
  readOnly,
  collapsibleSections,
  componentShortcut,
  canAssignShortcut = false,
  onAssignShortcut,
}: Props & { rec: CadeRecordModel; vertexBlock: JSX.Element | null }): JSX.Element {
  const [draft, setDraft] = useState(rec.designator);
  const [cableDraft, setCableDraft] = useState(String(cableNumberOf(rec)));
  const [pinDrafts, setPinDrafts] = useState(rec.pins);
  const [capturingShortcut, setCapturingShortcut] = useState(false);
  const [shortcutStatus, setShortcutStatus] = useState('');
  const shortcutHint = useShortcutHint(componentShortcut ?? 'space');
  const shortcutHelpId = `atajo-${rec.id}-ayuda`;
  const shortcutLabel = rec.designator === '' ? `componente #${rec.id}` : rec.designator;

  const captureShortcut = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (!capturingShortcut) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setCapturingShortcut(false);
      setShortcutStatus('Captura cancelada.');
      return;
    }
    const keys = keyEventToKeys(event.nativeEvent, isApplePlatform());
    if (keys === null) {
      setShortcutStatus('Combinación no válida o reservada.');
      return;
    }
    onAssignShortcut(keys);
    setCapturingShortcut(false);
    setShortcutStatus('');
  };
  useEffect(() => setDraft(rec.designator), [rec.designator]);
  useEffect(() => setCableDraft(String(cableNumberOf(rec))), [rec.raw]);
  useEffect(() => setPinDrafts(rec.pins), [rec.raw]);
  useEffect(() => {
    setCapturingShortcut(false);
    setShortcutStatus('');
  }, [rec.id]);

  const sym = resolveSymbol(rec.code, rec.pins);
  const box = boxOf(rec);
  const deg = rotation[rec.id] ?? 0;
  // La estrella de Propiedades comparte el store de la paleta: el favorito es
  // el código del catálogo, así sobrevive a los ids de cada documento.
  const favorites = useSyncExternalStore(subscribeFavorites, getFavorites, getFavorites);
  const favorite = isFavorite(favorites, rec.code);
  const favoriteLabel = favorite ? 'Quitar de favoritos' : 'Agregar a favoritos';

  return (
    <InspectorShell>
      {vertexBlock}

      {rec.kind === 'component' ? (
        <>
          <Field className="gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="designator" className="text-[10px] tracking-[0.6px] text-muted-foreground uppercase">
                Designador
              </FieldLabel>
              {rec.pins.length > 0 && (
                <Checkbox
                  checked={rec.pinLabelsVisible}
                  disabled={readOnly}
                  onCheckedChange={(checked) => onPinLabelsVisible(rec.id, checked === true)}
                  aria-label="Mostrar designador"
                  title="Mostrar designador"
                />
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                id="designator"
                className="h-7 min-w-0 flex-1 font-mono text-xs"
                disabled={readOnly}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  if (draft !== rec.designator) onDesignator(rec.id, draft);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
              {canAssignShortcut && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant={capturingShortcut ? 'secondary' : 'outline'}
                      disabled={readOnly}
                      data-slot="component-shortcut"
                      aria-pressed={capturingShortcut}
                      aria-label={
                        capturingShortcut
                          ? `Capturando atajo de ${shortcutLabel}. Presioná una combinación o Escape para cancelar`
                          : componentShortcut
                            ? `Cambiar atajo de ${shortcutLabel}: ${shortcutHint.text}`
                            : `Asignar atajo de teclado a ${shortcutLabel}`
                      }
                      aria-describedby={capturingShortcut || shortcutStatus !== '' ? shortcutHelpId : undefined}
                      onClick={() => {
                        if (capturingShortcut) {
                          setCapturingShortcut(false);
                          setShortcutStatus('');
                          return;
                        }
                        setCapturingShortcut(true);
                        setShortcutStatus('');
                      }}
                      onKeyDown={captureShortcut}
                      onBlur={() => {
                        if (!capturingShortcut) return;
                        setCapturingShortcut(false);
                        setShortcutStatus('');
                      }}
                      className={cn(
                        'h-7 shrink-0 gap-1 px-1.5 text-[11px]',
                        componentShortcut ? 'min-w-7' : capturingShortcut ? 'w-7 px-0' : '',
                        capturingShortcut && 'motion-safe:animate-pulse',
                      )}
                    >
                      {capturingShortcut ? (
                        <span aria-hidden="true">…</span>
                      ) : componentShortcut ? (
                        <kbd aria-hidden="true" className="font-mono">
                          {shortcutHint.text}
                        </kbd>
                      ) : (
                        <>
                          <KeyboardIcon className="size-3.5" aria-hidden="true" />
                          <span className="text-[10px]">Atajo</span>
                        </>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px]">
                    {capturingShortcut ? (
                      'Presioná la combinación. Escape cancela.'
                    ) : componentShortcut ? (
                      <>
                        Atajo <span className="font-mono">{shortcutHint.text}</span> · sólo en simulación
                      </>
                    ) : (
                      <>Asignar atajo de teclado · sólo en simulación</>
                    )}
                  </TooltipContent>
                </Tooltip>
              )}
              {canAssignShortcut && componentShortcut && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={readOnly}
                      aria-label={`Quitar atajo de ${shortcutLabel}`}
                      onClick={() => onAssignShortcut(null)}
                      className="size-7 shrink-0 px-0 text-muted-foreground"
                    >
                      <XIcon className="size-3.5" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Quitar atajo</TooltipContent>
                </Tooltip>
              )}
            </div>
            {(capturingShortcut || shortcutStatus !== '') && (
              <p
                id={shortcutHelpId}
                role="status"
                aria-live="polite"
                className={cn('text-[10px]', shortcutStatus !== '' ? 'text-warn' : 'text-muted-foreground')}
              >
                {shortcutStatus !== '' ? shortcutStatus : 'Presioná la combinación. Escape cancela.'}
              </p>
            )}
          </Field>

          {hasColorSlot(rec.code) && (
            <Field className="gap-1.5">
              <FieldLabel className="text-[10px] tracking-[0.6px] text-muted-foreground uppercase">
                Color
              </FieldLabel>
              {/* El menú "Indicador color" de CADe_SIMU: el índice se guarda en
                  la cabecera del registro y tiñe el vidrio de la lámpara. */}
              <div className="flex gap-1.5" role="group" aria-label="Color de la señalización óptica">
                {LAMP_COLORS.map((name, i) => (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    aria-label={name}
                    aria-pressed={rec.lampColor === i}
                    disabled={readOnly}
                    onClick={() => onLampColor(rec.id, i as LampColor)}
                    className={cn(
                      'size-6 rounded-full border-2 transition-[border-color,box-shadow] disabled:opacity-50',
                      rec.lampColor === i
                        ? 'border-foreground ring-1 ring-foreground/40'
                        : 'border-transparent hover:border-muted-foreground/50',
                    )}
                    style={{ background: `var(--lamp-${name})` }}
                  />
                ))}
              </div>
            </Field>
          )}

          <dl className={DL}>
            <Row label="Tipo" value={sym.name} />
            <Row label="Código" value={rec.code} />
            <Row label="Posición" value={`${rec.geometry[GEOMETRY.x]}, ${rec.geometry[GEOMETRY.y]}`} />
            {box && <Row label="Tamaño" value={`${box.width} × ${box.height}`} />}
            <Row label="Orientación" value={orientationLabel(rec.transform)} />
            <Row label="Registro" value={`#${rec.id}`} />
          </dl>

          <Section
            id="bornes"
            title={`Bornes (${rec.pins.length})`}
            collapsible={collapsibleSections}
            groupInClassic={false}
          >
            <div className="flex flex-col gap-3">
              {rec.pins.map((pin, i) => (
                <Field key={i} className="gap-1">
                  <div className="grid grid-cols-[80px_1fr_auto] items-center gap-2">
                    <FieldLabel
                      htmlFor={`pin-${rec.id}-${i}`}
                      className="text-[10px] tracking-[0.6px] text-muted-foreground uppercase"
                    >
                      Conexión {i + 1}
                    </FieldLabel>
                    <Input
                      id={`pin-${rec.id}-${i}`}
                      className="h-7 font-mono text-xs"
                      disabled={readOnly}
                      value={pinDrafts[i] ?? pin}
                      onChange={(event) =>
                        setPinDrafts((prev) => prev.map((value, j) => (j === i ? event.target.value : value)))
                      }
                      onBlur={() => {
                        const value = (pinDrafts[i] ?? pin).trim();
                        if (value !== '' && value !== pin) onPinName(rec.id, i, value);
                        else setPinDrafts((prev) => prev.map((old, j) => (j === i ? pin : old)));
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                      }}
                    />
                    <Checkbox
                      checked={rec.pinVisible[i] !== false}
                      disabled={readOnly}
                      onCheckedChange={(checked) => onPinVisible(rec.id, i, checked === true)}
                      aria-label={`Mostrar nombre de la conexión ${i + 1}${pin ? ` (${pin})` : ''}`}
                      title="Mostrar nombre de la conexión"
                    />
                  </div>
                </Field>
              ))}
              {rec.pins.length === 0 && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10.5px] font-normal">
                  sin bornes declarados
                </Badge>
              )}
            </div>
          </Section>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onRotate} disabled={readOnly}>
              <RotateCwIcon data-icon="inline-start" />
              Rotar 90° {deg > 0 && <span className="text-muted-foreground">({deg}°)</span>}
            </Button>
            <Button variant="outline" size="sm" onClick={onDelete} disabled={readOnly}>
              <Trash2Icon data-icon="inline-start" />
              Borrar
            </Button>
            {/* Favorito es una preferencia del navegador, no del documento: se
                puede marcar también en simulación. */}
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={`${favoriteLabel}: ${sym.name} (código ${rec.code})`}
              aria-pressed={favorite}
              title={favoriteLabel}
              onClick={() => toggleStoredFavorite(rec.code)}
            >
              <StarIcon className={favorite ? 'fill-current text-[var(--tone-senalizacion)]' : 'text-muted-foreground'} />
            </Button>
          </div>

          {deg > 0 && (
            <Note>
              El giro de acá es de pantalla y todavía no se guarda: escribir la orientación en el archivo está
              pendiente. La orientación que muestra esta ficha es la que trae el archivo.
            </Note>
          )}
        </>
      ) : (
        <CablePanel
          rec={rec}
          network={network}
          onDelete={onDelete}
          onCableNumber={onCableNumber}
          cableDraft={cableDraft}
          setCableDraft={setCableDraft}
          readOnly={readOnly}
        />
      )}

      <Findings findings={findings} onAddJunction={onAddJunction} onRemoveJunction={onRemoveJunction} onFocusFinding={onFocusFinding} readOnly={readOnly} collapsible={collapsibleSections} />
    </InspectorShell>
  );
}

function CablePanel({
  rec,
  network,
  onDelete,
  onCableNumber,
  cableDraft,
  setCableDraft,
  readOnly,
}: {
  rec: CadeRecordModel;
  network: Network;
  onDelete: () => void;
  onCableNumber: (ids: number[], value: number) => void;
  cableDraft: string;
  setCableDraft: (v: string) => void;
  readOnly: boolean;
}): JSX.Element {
  const pts = wirePoints(rec);
  const segments = cableSegments(network, rec.id);
  const cable = cableNumberOf(rec);
  const isJunction = rec.code === 4001;

  const commitNumber = (): void => {
    const n = Number.parseInt(cableDraft, 10);
    if (!Number.isFinite(n) || n < 0) {
      setCableDraft(String(cable));
      return;
    }
    if (n !== cable) onCableNumber(segments, n);
  };

  return (
    <>
      <dl className={DL}>
        <Row label="Tipo" value={isJunction ? 'Punto de unión' : rec.code === 4019 ? 'Cable (variante)' : 'Cable'} />
        <Row label="Código" value={rec.code} />
        <Row label="Tramos" value={segments.length} />
        <Row label="Longitud" value={`${cableLength(network, segments)} u`} />
        {pts && !isJunction && (
          <>
            <Row label="Desde" value={`${pts.x1}, ${pts.y1}`} />
            <Row label="Hasta" value={`${pts.x2}, ${pts.y2}`} />
          </>
        )}
        <Row label="Registro" value={`#${rec.id}`} />
      </dl>

      {!isJunction && (
        <Field className="gap-1.5">
          <FieldLabel htmlFor="cable-number" className="text-[10px] tracking-[0.6px] text-muted-foreground uppercase">
            Número de cable
          </FieldLabel>
          <Input
            id="cable-number"
            className="h-7 font-mono text-xs"
            disabled={readOnly}
            value={cableDraft}
            onChange={(e) => setCableDraft(e.target.value)}
            onBlur={commitNumber}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        </Field>
      )}

      {segments.length > 1 && (
        <Note>
          Este cable son {segments.length} tramos que comparten el número. Cambiar el número los mueve a todos.
        </Note>
      )}

      <Note>
        Arrastrá un cuadrado azul para mover ese vértice. Un clic lo enfoca y <b>⌫</b> lo elimina sin borrar el cable.
      </Note>

      <Button variant="outline" size="sm" className="self-start" onClick={onDelete} disabled={readOnly}>
        <Trash2Icon data-icon="inline-start" />
        Borrar cable
      </Button>
    </>
  );
}

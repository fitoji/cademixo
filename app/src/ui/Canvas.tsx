import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { JSX } from 'react';
import { Grid3x3Icon, KeyboardIcon, MagnetIcon, MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-react';
import { GEOMETRY, baseBoxOf, boundsOf, boxOf, wirePoints, type CadeRecordModel } from '../model/project.ts';
import { resolveSymbol } from '../symbols/library.ts';
import { shapesBounds } from '../symbols/draw.ts';
import { componentHitBox } from './hit-box.ts';
import { designatorAt, pinLabelAt } from './labels.ts';
import type { DragOp, Rotation } from '../editor/state.ts';
import { idle, startMarquee, startMove, startPan, startSegment, startVertex, step as advance, type Effect, type Gesture, type GestureEvent } from '../editor/wiring/controller.ts';
import { attachPoints, type Point } from '../editor/pins.ts';
import { buildNetwork, cableSegments } from '../editor/network.ts';
import { routeOrthogonal } from '../editor/wiring/router.ts';
import { snapContext, snapTarget, type SnapTarget } from '../editor/wiring/snap.ts';
import { firstPin, nextPin, pinRefs, samePin, type Direction, type PinRef } from '../editor/wiring/keyboard.ts';
import { dist } from '../editor/wiring/geometry.ts';
import { hitContext, hitTest, segmentAttachedTo } from '../editor/wiring/hitTest.ts';
import { WIRE_TEMPLATES } from '../symbols/templates.ts';
import { conductorToneOf, type ConductorTone } from '../editor/conductor.ts';
import { SymbolGlyph } from './SymbolGlyph.tsx';
import { attachPinRadius, getSettings, pinStroke, subscribeSettings } from './settings.ts';
import { isProtection } from '../model/component-spec.ts';
import type { VisualState } from '../sim/visual.ts';
import { WIRE_CORNER_TOL, wireCornerPaths, type WireSegment } from './wire-corner.ts';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface View {
  x: number;
  y: number;
  k: number;
}

interface Props {
  records: CadeRecordModel[];
  selection: Set<number>;
  rotation: Record<number, Rotation>;
  showGrid: boolean;
  snap: boolean;
  placing: number | null;
  fitToken: number;
  onSelect: (ids: number[], additive: boolean) => void;
  onDragPreview: (op: DragOp | null) => void;
  onDragCommit: (op: DragOp) => void;
  onPlace: (x: number, y: number) => void;
  /** Origen del cable que se está dibujando (primer clic). */
  wireStart: Point | null;
  /** Componentes energizados por la simulación. */
  live: Set<number>;
  /** Sentido de giro por id de motor: +1 horario, -1 antihorario. */
  motorDirection?: Map<number, 1 | -1>;
  /** Estado visual por registro de componente. */
  states: Map<number, VisualState>;
  /** ids de registro de cable con tensión durante la simulación */
  liveWires: Set<number>;
  /** ids de cables cuya corriente va contra el sentido del trazo */
  reversedWires?: Set<number>;
  /** ids de componentes cuyo contacto está cerrado durante la simulación */
  closedContacts: Set<number>;
  /** Durante la simulación, un clic sobre un pulsador ya seleccionado lo aprieta. */
  simulating: boolean;
  /**
   * Radio de esquina de los cables, en unidades de plano. Lo decide el estilo:
   * el moderno pasa `WIRE_CORNER_RADIUS` y el clásico 0, que deja el quiebre
   * seco de CADe_SIMU. El valor viaja como prop y no se lee del DOM.
   */
  cornerRadius: number;
  /** Registros y punto marcados como falla desde un aviso. */
  highlight: { ids: number[]; at: Point | null } | null;
  onZoom: (k: number) => void;
  onInsertVertex: (id: number, x: number, y: number) => void;
  onVertexSelect: (vertex: Point | null) => void;
  /** Cancela lo que esté en curso: selección, vértice enfocado y colocación. */
  onCancel: () => void;
  /** Vuelve a encuadrar el proyecto; el mismo efecto que el atajo de centrar. */
  onFit: () => void;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  /**
   * El estilo moderno flota el chrome sobre el dibujo; el clásico conserva las
   * barras fijas del editor, que es el look de CADe_SIMU. No lo decide el
   * lienzo: llega como prop, igual que `cornerRadius`.
   */
  floatingChrome: boolean;
}

const MIN_K = 0.25;
const MAX_K = 24;
/**
 * Radio de imán a un borne, en píxeles de pantalla.
 *
 * En unidades de plano era 6, pero en este esquema los bornes están cada 6: el
 * punto siempre quedaba cerca de alguno y saltaba entre ellos, sin poder
 * soltarlo donde uno quería. En píxeles el imán sólo actúa cuando el cursor está
 * realmente encima dell borne.
 */
const PIN_SNAP_PX = 11;

/**
 * Cuánto puede moverse el puntero entre apretar y soltar para que un clic siga
 * siendo un clic. Por debajo, el botón central centra el proyecto en vez de
 * desplazarlo.
 */
const PAN_CLICK_PX = 3;

/**
 * Radio del anillo de foco del cursor de bornes, en píxeles de pantalla.
 *
 * Va en pantalla y no en unidades de plano a propósito: es un indicador de foco,
 * y alejar el zoom no puede hacerlo desaparecer. El radio del borne sí escala
 * con el símbolo.
 */
const PIN_CURSOR_PX = 9;

/** Teclas que mueven el cursor de bornes. */
const ARROW_KEYS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

/** Dos puntos del plano son el mismo punto (tolerancia del formato). */
const samePoint = (a: Point, b: Point): boolean => dist(a, b) < 0.01;

export function Canvas(props: Props): JSX.Element {
  const {
    records,
    selection,
    rotation,
    showGrid,
    snap,
    placing,
    fitToken,
    onSelect,
    onDragPreview,
    onDragCommit,
    onPlace,
    wireStart,
    live,
    motorDirection,
    states,
    liveWires,
    reversedWires,
    closedContacts,
    simulating,
    cornerRadius,
    highlight,
    onZoom,
    onInsertVertex,
    onVertexSelect,
    onCancel,
    onFit,
    onToggleGrid,
    onToggleSnap,
    floatingChrome,
  } = props;

  const svgRef = useRef<SVGSVGElement | null>(null);
  /** Botón con el que arrancó el paneo: el central soltado sin arrastre centra. */
  const panButton = useRef<number | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 4 });
  /** Las pistas de teclado dejaron de ser una barra fija: se piden desde el dock. */
  const [hintsOpen, setHintsOpen] = useState(false);
  // Un solo estado de gesto (máquina de wiring/controller.ts): paneo, marquee,
  // arrastre de selección, de vértice y de doblez. Escape y pointercancel
  // cancelan; un gesto confirmado entra una sola vez al historial.
  const [gesture, setGesture] = useState<Gesture>(idle);
  const [hover, setHover] = useState<Point | null>(null);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current!.getBoundingClientRect();
      return {
        x: (clientX - rect.left - view.x) / view.k,
        y: (clientY - rect.top - view.y) / view.k,
      };
    },
    [view],
  );

  const fit = useCallback(() => {
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const push = (x: number, y: number): void => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };
    for (const rec of records) {
      if (rec.kind === 'component') {
        const b = boundsOf(rec);
        if (!b) continue;
        push(b.x, b.y);
        push(b.x + b.w, b.y + b.h);
      } else {
        const pts = wirePoints(rec);
        if (!pts) continue;
        push(pts.x1, pts.y1);
        push(pts.x2, pts.y2);
      }
    }
    if (!Number.isFinite(minX)) return;
    const pad = 40;
    const k = Math.min((rect.width - pad * 2) / Math.max(1, maxX - minX), (rect.height - pad * 2) / Math.max(1, maxY - minY), 16);
    const kk = Math.max(MIN_K, Math.min(MAX_K, k));
    setView({
      k: kk,
      x: rect.width / 2 - ((minX + maxX) / 2) * kk,
      y: rect.height / 2 - ((minY + maxY) / 2) * kk,
    });
    onZoom(kk);
  }, [records, onZoom]);

  useLayoutEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken]);

  useEffect(() => {
    onZoom(view.k);
  }, [view.k, onZoom]);

  const applyZoom = (factor: number, mx: number, my: number): void => {
    setView((v) => {
      const k = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
      return { k, x: mx - (mx - v.x) * (k / v.k), y: my - (my - v.y) * (k / v.k) };
    });
  };

  const onWheel = (e: React.WheelEvent): void => {
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    applyZoom(Math.exp(-e.deltaY * 0.0016), e.clientX - rect.left, e.clientY - rect.top);
  };

  /** Zoom por botón: escala alrededor del centro de la vista, igual que la rueda. */
  const zoomByStep = (direction: 1 | -1): void => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    applyZoom(direction > 0 ? 1.25 : 0.8, rect.width / 2, rect.height / 2);
  };

  const step = snap ? 3 : 1;
  const snapValue = (n: number): number => Math.round(n / step) * step;

  /** Punto del tramo más cercano al cursor, snapeado y entre los dos extremos. */
  const bendPoint = useCallback(
    (rec: CadeRecordModel, world: Point): Point | null => {
      const pts = wirePoints(rec);
      if (!pts) return null;
      const vertical = Math.abs(pts.x1 - pts.x2) < 0.01;
      const lo = vertical ? Math.min(pts.y1, pts.y2) : Math.min(pts.x1, pts.x2);
      const hi = vertical ? Math.max(pts.y1, pts.y2) : Math.max(pts.x1, pts.x2);
      const raw = vertical ? snapValue(world.y) : snapValue(world.x);
      const value = Math.max(lo + 1, Math.min(hi - 1, raw));
      if (value <= lo || value >= hi) return null;
      return vertical ? { x: pts.x1, y: value } : { x: value, y: pts.y1 };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap],
  );

  const pins = useMemo(() => attachPoints(records), [records]);
  const network = useMemo(() => buildNetwork(records), [records]);
  // Hoja que se está dibujando: los registros llegan recortados a esta página.
  const sheet = records[0]?.sheet ?? 0;
  // Bornes con identidad (componente + índice), para navegarlos con el teclado.
  const pinRefsList = useMemo(() => pinRefs(pins), [pins]);
  const pinList = useMemo(() => pinRefsList.map((r) => r.point), [pinRefsList]);
  // Cursor de bornes: sobre qué borne actúa Enter. Se valida contra los bornes
  // vigentes porque editar o deshacer puede borrar el que estaba enfocado.
  const [cursor, setCursor] = useState<PinRef | null>(null);
  const cursorPin = useMemo(
    () => (cursor === null ? null : (pinRefsList.find((r) => samePin(r, cursor)) ?? null)),
    [cursor, pinRefsList],
  );
  // La región viva repite el texto sólo para que el lector de pantalla vuelva a
  // anunciarlo: el mismo texto dos veces no es un cambio de nodo.
  const [notice, setNotice] = useState('');
  const announce = useCallback((text: string) => {
    setNotice((prev) => (prev === text ? `${text} ` : text));
  }, []);
  // Contexto de cableado de la hoja: alimenta el snap priorizado y el hit-test.
  const wiring = useMemo(() => snapContext(network, records, sheet), [network, records, sheet]);
  const hitCtx = useMemo(() => hitContext(network, records, sheet), [network, records, sheet]);

  /**
   * Puntos que no se pueden redondear: donde el empalme tiene que leerse recto.
   * Son los que el lienzo ya conoce —unión 4001, borne de componente y el punto
   * donde otro tramo pasa de largo (derivación en T)—, no una geometría nueva.
   */
  const hardPoints = useMemo<Point[]>(() => {
    const out: Point[] = [];
    for (const n of network.nodes.values()) {
      if (n.junction || n.pin || n.through.length > 0) out.push({ x: n.x, y: n.y });
    }
    return out;
  }, [network]);

  const isPinnedPoint = useCallback(
    (x: number, y: number): boolean =>
      hardPoints.some((p) => Math.abs(p.x - x) < WIRE_CORNER_TOL && Math.abs(p.y - y) < WIRE_CORNER_TOL),
    [hardPoints],
  );

  /**
   * El `d` de cada cable, con las esquinas redondeadas. Es sólo pintado (S1): se
   * calcula una vez por conjunto de cables y no toca los registros. Con radio 0
   * no hay pase y el cable usa el camino de siempre.
   */
  const wirePaths = useMemo(() => {
    if (!(cornerRadius > 0)) return null;
    const segments: WireSegment[] = [];
    for (const rec of records) {
      if (rec.kind !== 'connection') continue;
      const pts = wirePoints(rec);
      if (!pts) continue;
      segments.push({ id: rec.id, sheet: rec.sheet, ...pts });
    }
    return wireCornerPaths(segments, cornerRadius, isPinnedPoint);
  }, [records, cornerRadius, isPinnedPoint]);

  /**
   * Ruta del cable a medio dibujar. Usa el mismo router que el commit para que
   * el ghost y el resultado final coincidan, y es sólamente pintado: el gesto
   * sigue escribiendo registros 4xxx al soltar (S3, S5).
   */
  const ghostPath = useMemo(() => {
    if (!wireStart || !hover) return '';
    const obstacles = records
      .filter((rec) => rec.kind === 'component')
      .map((rec) => boundsOf(rec))
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .map((b) => ({ minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h }));
    const points = routeOrthogonal({ from: wireStart, to: hover, obstacles }).waypoints;
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join('');
  }, [wireStart, hover, records]);

  const [snapMark, setSnapMark] = useState<Point | null>(null);

  /** Snap priorizado del cableado: borne → junction → derivación en T → grilla. */
  const snapOf = useCallback(
    (world: Point, exclude: number[] = []): SnapTarget =>
      snapTarget(world, wiring, PIN_SNAP_PX / view.k, step, exclude),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wiring, snap, view.k],
  );

  /** Snap magnético simple (borne o grilla): el que usa la colocación de componentes. */
  const snapPoint = useCallback(
    (world: Point): Point => {
      let best: Point | null = null;
      let bestDist = PIN_SNAP_PX / view.k;
      for (const p of pinList) {
        const d = Math.hypot(p.x - world.x, p.y - world.y);
        if (d < bestDist) {
          bestDist = d;
          best = p;
        }
      }
      if (best) return { x: best.x, y: best.y };
      return { x: snapValue(world.x), y: snapValue(world.y) };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pinList, snap, view.k],
  );

  /**
   * Golpe sobre cable por distancia, no por orden de pintado.
   *
   * Las cajas de los componentes se pintan encima de los cables (un cable pasa
   * por detrás del símbolo al llegar a un borne), así que confiar en el orden
   * del DOM hacía que un clic sobre el cable seleccionara el componente.
   * El escaneo es el del módulo puro con los endpoints apagados: golpear la
   * punta del tramo sigue devolviendo el segmento.
   */
  const hitWire = useCallback(
    (world: Point, tolerance: number): number | null => {
      const out = hitTest(world, hitCtx, tolerance, { endpoints: false });
      return out.kind === 'segment' ? out.segmentId : null;
    },
    [hitCtx],
  );

  /** Aplica los efectos declarativos que la máquina de gestos emite. */
  const applyEffects = useCallback(
    (effects: Effect[]) => {
      for (const e of effects) {
        if (e.type === 'pan') {
          setView((v) => ({ ...v, x: e.x, y: e.y }));
        } else if (e.type === 'preview') {
          onDragPreview(e.op);
        } else if (e.type === 'commit') {
          onDragCommit(e.op);
        } else if (e.type === 'cancel') {
          onDragPreview(null);
          setSnapMark(null);
        } else if (e.type === 'select') {
          const { x1, y1, x2, y2 } = e.rect;
          const ids: number[] = [];
          for (const rec of records) {
            if (rec.kind !== 'component') continue;
            const b = boundsOf(rec);
            if (!b) continue;
            if (b.x < x2 && b.x + b.w > x1 && b.y < y2 && b.y + b.h > y1) ids.push(rec.id);
          }
          if (ids.length > 0) onSelect(ids, e.additive);
        }
      }
    },
    [onDragPreview, onDragCommit, onSelect, records],
  );

  /** Avanza la máquina de gestos y aplica sus efectos. */
  const dispatch = useCallback(
    (g: Gesture, ev: GestureEvent): void => {
      const out = advance(g, ev, { snap: (w, ex) => snapOf(w, ex).point, grid: snapValue });
      setGesture(out.next);
      applyEffects(out.effects);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapOf, snapValue, applyEffects],
  );

  /**
   * Nombre del borne para anunciarlo: el rótulo del pin y el designador del
   * componente, que es como el usuario lo lee en el plano.
   */
  const describePin = useCallback(
    (ref: PinRef): string => {
      const rec = records.find((r) => r.id === ref.componentId);
      const who = rec !== undefined && rec.designator !== '' ? rec.designator : `componente ${ref.componentId}`;
      const name = rec?.pins[ref.pinIndex];
      return name ? `borne ${name} de ${who}` : `borne ${ref.pinIndex + 1} de ${who}`;
    },
    [records],
  );

  /**
   * Cablear sin puntero.
   *
   * El lienzo era inalcanzable con el teclado: no era enfocable y los bornes no
   * tenían foco, así que quien no puede arrastrar no podía conectar nada. Acá
   * viven las flechas (mover el cursor de bornes) y Enter (marcar el primer
   * extremo y cerrar el tramo), sobre la misma ruta de dos pasos que usan los
   * clics: `onPlace` recibe el punto exacto del borne y App decide si arranca o
   * cierra el cable.
   *
   * Colocar un componente es un gesto del puntero y no tiene bornes a los que ir,
   * así que ahí las teclas no hacen nada.
   */
  const onCanvasKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      const wireArmed = placing !== null && WIRE_TEMPLATES[placing] !== undefined;
      if (simulating || (placing !== null && !wireArmed)) return;

      const dir = ARROW_KEYS[e.key];
      if (dir !== undefined) {
        e.preventDefault();
        const from = cursorPin ?? firstPin(pinRefsList);
        if (from === null) {
          announce('El esquema no tiene bornes');
          return;
        }
        const next = nextPin(pinRefsList, from, dir);
        if (next === null) return;
        setCursor(next);
        // El fantasma del cable sigue al cursor igual que sigue al puntero.
        if (wireStart !== null) setHover(next.point);
        announce(describePin(next));
        return;
      }

      if (e.key !== 'Enter') return;
      e.preventDefault();

      const at = cursorPin ?? firstPin(pinRefsList);
      if (at === null) {
        announce('El esquema no tiene bornes');
        return;
      }
      setCursor(at);
      if (!wireArmed) {
        announce(`${describePin(at)}. Elegí un cable en la paleta para conectarlo`);
        return;
      }

      if (wireStart !== null) {
        if (samePoint(at.point, wireStart)) {
          announce('Elegí otro borne: el cable no puede empezar y terminar en el mismo');
          return;
        }
        const from = pinRefsList.find((r) => samePoint(r.point, wireStart));
        onPlace(at.point.x, at.point.y);
        setHover(null);
        announce(from ? `Cable conectado: ${describePin(from)} con ${describePin(at)}` : `Cable conectado en ${describePin(at)}`);
        return;
      }

      setHover(at.point);
      onPlace(at.point.x, at.point.y);
      announce(`Cable desde ${describePin(at)}. Flechas para elegir el otro extremo, Enter para conectar`);
    },
    [simulating, placing, cursorPin, pinRefsList, wireStart, onPlace, announce, describePin],
  );

  const onPointerDown = (e: React.PointerEvent): void => {
    // El lienzo toma el foco al hacer clic: si no, cablear por teclado exigía
    // tabular a ciegas desde afuera.
    svgRef.current?.focus({ preventScroll: true });
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // El botón central no abre el autoscroll del navegador: acá centra.
      e.preventDefault();
      panButton.current = e.button;
      setGesture(startPan({ x: e.clientX, y: e.clientY }, { x: view.x, y: view.y }));
      svgRef.current!.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    const world = toWorld(e.clientX, e.clientY);
    const target = e.target as Element;
    // El cursor de bornes sigue al puntero: un clic sobre un borne lo deja ahí,
    // así se puede empezar con el mouse y seguir con las flechas.
    const snapped = snapOf(world);
    if (snapped.kind === 'pin')
      setCursor({ componentId: snapped.componentId, pinIndex: snapped.pinIndex, point: snapped.point });

    if (placing !== null) {
      // Durante la simulación no se insertan componentes.
      if (!simulating) {
        // Dibujar cable: snap priorizado (arrancar sobre un borne, una junction
        // o el interior de otro tramo). Colocar componente: snap simple.
        const wirePlacing = WIRE_TEMPLATES[placing] !== undefined;
        const s = wirePlacing || wireStart !== null ? snapped.point : snapPoint(world);
        onPlace(s.x, s.y);
      }
      return;
    }

    if (!target.closest('[data-endpoint]')) onVertexSelect(null);

    const handle = target.closest('[data-endpoint]') as HTMLElement | null;
    if (handle) {
      // Los tiradores de vértice solo existen para editar: en simulación no.
      if (simulating) return;
      e.stopPropagation();
      const id = Number(handle.dataset.wire);
      const end = Number(handle.dataset.endpoint) as 0 | 1;
      const rec = records.find((r) => r.id === id);
      const pts = rec ? wirePoints(rec) : null;
      if (!pts) return;
      const at = end === 0 ? { x: pts.x1, y: pts.y1 } : { x: pts.x2, y: pts.y2 };
      // Enfocar el vértice permite borrarlo con Suprimir sin borrar el cable.
      onVertexSelect(at);
      // Los tramos que comparten el punto arrastrado no derivan sobre sí mismos.
      const exclude = records
        .filter((r) => {
          const rp = wirePoints(r);
          if (!rp) return false;
          const atA = Math.abs(rp.x1 - at.x) < 0.01 && Math.abs(rp.y1 - at.y) < 0.01;
          const atB = Math.abs(rp.x2 - at.x) < 0.01 && Math.abs(rp.y2 - at.y) < 0.01;
          return atA || atB;
        })
        .map((r) => r.id);
      setGesture(startVertex(at, world, exclude, sheet));
      svgRef.current!.setPointerCapture(e.pointerId);
      return;
    }

    // En edición un cable manda sobre la caja que tapa. En simulación el
    // componente tiene prioridad: si no, los pulsadores y protecciones no se
    // pueden accionar cuando un cable pasa cerca.
    const wireHit = hitWire(world, 4 / view.k);
    const domHit = target.closest('[data-id]') as HTMLElement | null;
    const domId = domHit ? Number(domHit.dataset.id) : null;
    let hitId = simulating && domId !== null ? domId : (wireHit ?? domId);
    // Excepción con evidencia: el cable que llega POR BORNE a la tinta pulsada
    // no le roba el clic. En las terminales de alimentación (L/N, caja de 6×3)
    // el cable pasa exactamente por la tinta del símbolo: sin esto, cualquier
    // clic cerca de la letra agarra el cable y la terminal nunca se puede
    // mover. Un cable que solo pasa cerca (sin extremo en la caja) sigue
    // ganando, que era el defecto que este orden vino a arreglar.
    if (!simulating && wireHit !== null && domId !== null) {
      const inked = records.find((r) => r.id === domId);
      const box = inked && inked.kind === 'component' ? boundsOf(inked) : null;
      const seg = records.find((r) => r.id === wireHit);
      const pts = seg ? wirePoints(seg) : null;
      if (box && pts && segmentAttachedTo(pts, box)) hitId = domId;
    }
    if (hitId !== null) {
      const id = hitId;
      const rec = records.find((r) => r.id === id);
      const isWire = rec !== undefined && rec.kind === 'connection';
      const group = isWire ? cableSegments(network, id) : [id];
      const already = group.some((g) => selection.has(g));
      if (e.shiftKey) onSelect(group, true);
      // En simulación el clic sobre un pulsador ya seleccionado tiene que
      // llegar igual: el aparato aprieta/suelta y la selección no cambia.
      else if (!already || simulating) onSelect(group, false);
      // En simulación se puede seleccionar y accionar, pero no arrastrar.
      if (!e.shiftKey && !simulating) {
        const at = isWire && rec ? bendPoint(rec, world) : null;
        // Arrastrar el cuerpo mueve el tramo (F2). Si es extremo, moveSegment
        // inserta un codo sin tocar el borne. Los vértices se insertan con
        // doble-clic y se arrastran desde sus tiradores cuadrados.
        setGesture(at ? startSegment(id, at, world, sheet) : startMove(world));
        svgRef.current!.setPointerCapture(e.pointerId);
      }
      return;
    }

    if (!e.shiftKey) onSelect([], false);
    if (!simulating) {
      setGesture(startMarquee(world, e.shiftKey));
      svgRef.current!.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    const world = toWorld(e.clientX, e.clientY);
    const client = { x: e.clientX, y: e.clientY };

    // Marcador del objetivo magnético durante el dibujo y los arrastres de cable.
    if (wireStart) {
      const t = snapOf(world);
      setHover(t.point);
      setSnapMark(t.kind === 'grid' ? null : t.point);
    } else if (gesture.kind === 'vertex') {
      const t = snapOf(world, gesture.exclude);
      setSnapMark(t.kind === 'grid' ? null : t.point);
    } else if (gesture.kind === 'bend') {
      const t = snapOf(world, [gesture.id]);
      setSnapMark(t.kind === 'grid' ? null : t.point);
    } else {
      setSnapMark(null);
    }

    dispatch(gesture, { type: 'move', world, client });
  };

  const onPointerUp = (e: React.PointerEvent): void => {
    const world = toWorld(e.clientX, e.clientY);
    const client = { x: e.clientX, y: e.clientY };
    // Botón central sin arrastre: un clic, no un paneo. Centra el proyecto
    // (el mismo encuadre que el primer ajuste) en lugar de mover la vista unos
    // píxeles a la nada.
    const centering =
      gesture.kind === 'panning' &&
      panButton.current === 1 &&
      dist({ x: gesture.startClient.x, y: gesture.startClient.y }, client) <= PAN_CLICK_PX;
    panButton.current = null;
    dispatch(gesture, { type: 'up', world, client });
    if (centering) fit();
  };

  /**
   * `pointercancel` CANCELA: el gesto no entra al documento (antes delegaba en
   * `onPointerUp` y confirmaba lo que la interrupción dejó a medio hacer).
   */
  const onGestureCancel = (): void => {
    panButton.current = null;
    dispatch(gesture, { type: 'cancel' });
  };

  // Escape cancela el gesto del lienzo; App maneja su parte (selección,
  // vértice enfocado, cable a medio dibujar, componente a colocar).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || gesture.kind === 'idle') return;
      dispatch(gesture, { type: 'cancel' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gesture, dispatch]);

  const onDoubleClick = (e: React.MouseEvent): void => {
    const world = toWorld(e.clientX, e.clientY);
    const id = hitWire(world, 5 / view.k);
    if (id === null) return;
    const rec = records.find((r) => r.id === id);
    const at = rec ? bendPoint(rec, world) : null;
    if (at) onInsertVertex(id, at.x, at.y);
  };

  /**
   * Botón derecho: cancela la selección, igual que Escape.
   *
   * `preventDefault` es parte del pedido: sin él, cancelar la selección abría
   * además el menú del navegador encima del lienzo.
   */
  const onContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    // Igual que Escape: cancela el gesto del lienzo y lo de App.
    if (gesture.kind !== 'idle') dispatch(gesture, { type: 'cancel' });
    onCancel();
  };

  // Modo del puntero. Colocar un símbolo, arrastrar el lienzo y trazar un cable
  // son las tres situaciones en que el puntero elige un punto o un extremo y no
  // un objeto: el hover se apaga ahí para no competir con el gesto en curso.
  const pointerMode: 'placing' | 'panning' | 'wiring' | null =
    placing !== null ? 'placing' : gesture.kind === 'panning' ? 'panning' : wireStart !== null ? 'wiring' : null;
  const cursorClass = pointerMode === null ? 'canvas' : `canvas ${pointerMode}`;

  const selectedWires = records.filter((r) => r.kind === 'connection' && selection.has(r.id));

  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
      <svg
        ref={svgRef}
        className={cursorClass}
        tabIndex={0}
        role="application"
        aria-label="Lienzo del esquema. Flechas recorren los bornes, Enter conecta, Escape cancela."
        onKeyDown={onCanvasKeyDown}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onGestureCancel}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      >
        <defs>
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path className="grid-minor" d="M10 0H0V10" fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </pattern>
          <pattern id="grid-major" width="50" height="50" patternUnits="userSpaceOnUse">
            <path className="grid-major" d="M50 0H0V50" fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </pattern>
        </defs>

        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {showGrid && (
            <>
              <rect x={-10000} y={-10000} width={20000} height={20000} fill="url(#grid)" />
              <rect x={-10000} y={-10000} width={20000} height={20000} fill="url(#grid-major)" />
            </>
          )}

          {records.map((rec) => {
            if (rec.kind === 'connection')
              return (
                <Wire
                  key={rec.id}
                  rec={rec}
                  selected={selection.has(rec.id)}
                  live={liveWires.has(rec.id)}
                  reverse={reversedWires?.has(rec.id) ?? false}
                  tone={conductorToneOf(rec.code)}
                  path={wirePaths?.get(rec.id)}
                />
              );
            if (rec.kind !== 'component') return null;
            return (
              <Component
                key={rec.id}
                rec={rec}
                selected={selection.has(rec.id)}
                live={live.has(rec.id)}
                direction={motorDirection?.get(rec.id)}
                state={states.get(rec.id) ?? 'idle'}
                closed={closedContacts.has(rec.id)}
                bad={highlight?.ids.includes(rec.id) ?? false}
                rotation={rotation[rec.id] ?? 0}
                pins={pins.get(rec.id) ?? []}
                cursorIndex={cursorPin?.componentId === rec.id ? cursorPin.pinIndex : null}
                zoom={view.k}
              />
            );
          })}

          {[...network.nodes.values()]
            .filter((n) => n.junction || n.kind === 'tee')
            .map((n) => (
              // El punto de una T: un extremo que cae en el medio de otro tramo
              // es una conexión real aunque el archivo no traiga un 4001 ahí.
              <circle key={`j-${n.key}`} className="junction" cx={n.x} cy={n.y} r={1.15} />
            ))}

          {snapMark && <circle className="snap-mark" cx={snapMark.x} cy={snapMark.y} r={2.4} />}

          {selectedWires.map((rec) => {
            const pts = wirePoints(rec);
            if (!pts) return null;
            return (
              <g key={`h-${rec.id}`}>
                <rect
                  className="handle"
                  data-endpoint="0"
                  data-wire={rec.id}
                  x={pts.x1 - 1.1}
                  y={pts.y1 - 1.1}
                  width={2.2}
                  height={2.2}
                />
                <rect
                  className="handle"
                  data-endpoint="1"
                  data-wire={rec.id}
                  x={pts.x2 - 1.1}
                  y={pts.y2 - 1.1}
                  width={2.2}
                  height={2.2}
                />
              </g>
            );
          })}

          {highlight?.at && (
            <g>
              <circle className="mark" cx={highlight.at.x} cy={highlight.at.y} r={5} />
              <path
                className="mark"
                d={`M${highlight.at.x - 3} ${highlight.at.y}H${highlight.at.x + 3}M${highlight.at.x} ${highlight.at.y - 3}V${highlight.at.y + 3}`}
                style={{ animation: 'none', strokeWidth: 0.3 }}
              />
            </g>
          )}

          {wireStart && hover && (
            <g className="ghost">
              <path className="wire" d={ghostPath} />
              <circle className="junction" cx={wireStart.x} cy={wireStart.y} r={1.15} />
            </g>
          )}

          {gesture.kind === 'marquee' && (
            <rect
              className="marquee"
              x={Math.min(gesture.start.x, gesture.current.x)}
              y={Math.min(gesture.start.y, gesture.current.y)}
              width={Math.abs(gesture.current.x - gesture.start.x)}
              height={Math.abs(gesture.current.y - gesture.start.y)}
            />
          )}
        </g>
      </svg>

      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {notice}
      </div>

      {/*
       * Chrome flotante sobre el dibujo: el zoom en una esquina, las
       * herramientas del lienzo al centro. Así el chrome del editor queda
       * quieto y el área de dibujo no paga una barra más.
       */}
      {floatingChrome ? (
        <>
          <div className="absolute bottom-3 left-3 flex items-center rounded-lg border border-border bg-card shadow-float">
        <button
          type="button"
          aria-label="Alejar"
          title="Alejar"
          onClick={() => zoomByStep(-1)}
          className="grid size-7 place-items-center rounded-l-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <MinusIcon className="size-3.5" />
        </button>
        <button
          type="button"
          title="Ajustar a la ventana"
          onClick={onFit}
          className="min-w-11 px-1 font-mono text-[11px] tabular-nums text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {Math.round(view.k * 100)}%
        </button>
        <button
          type="button"
          aria-label="Acercar"
          title="Acercar"
          onClick={() => zoomByStep(1)}
          className="grid size-7 place-items-center rounded-r-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-float">
        <DockButton
          pressed={showGrid}
          onClick={onToggleGrid}
          label="Grilla"
          icon={<Grid3x3Icon className="size-3.5" />}
        />
        <DockButton
          pressed={snap}
          onClick={onToggleSnap}
          label="Imán a bornes"
          icon={<MagnetIcon className="size-3.5" />}
        />
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
        <DockButton
          onClick={onFit}
          label="Ajustar a la ventana"
          shortcut="⌘0"
          icon={<MaximizeIcon className="size-3.5" />}
        />
        <DockButton
          pressed={hintsOpen}
          onClick={() => setHintsOpen((open) => !open)}
          label="Atajos del lienzo"
          icon={<KeyboardIcon className="size-3.5" />}
        />
      </div>

      {hintsOpen && (
        <div className="absolute bottom-14 left-1/2 max-w-[min(640px,calc(100%-1.5rem))] -translate-x-1/2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-float">
          arrastrá componentes · <b>arrastrá un cable</b> para doblarlo · <b>tab</b> + <b>flechas</b> cablean ·{' '}
          <b>⌫</b> borra el vértice enfocado · <b>clic derecho</b> cancela · <b>alt</b>+arrastrar para desplazar ·{' '}
          <b>espacio</b> simula y detiene
        </div>
      )}
        </>
      ) : (
        <>
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-border/70 bg-background/85 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur-sm">
            arrastrá componentes · <b>arrastrá un cable</b> para doblarlo · <b>tab</b> + <b>flechas</b> cablean ·{' '}
            <b>⌫</b> borra el vértice enfocado · <b>clic derecho</b> cancela · <b>alt</b>+arrastrar para desplazar ·{' '}
            <b>espacio</b> simula y detiene
          </div>
          <div className="pointer-events-none absolute right-3 bottom-3 rounded-md border border-border/70 bg-background/85 px-2 py-0.5 font-mono text-[11px] text-muted-foreground backdrop-blur-sm">
            {Math.round(view.k * 100)}%
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Botón del dock flotante. `pressed` lo convierte en interruptor: grilla e imán
 * no son acciones sino estados, así que se anuncian con `aria-pressed` y se
 * pintan con la superficie de control, no con un borde.
 *
 * El nombre accesible va en `aria-label` y la pista visual en la tooltip: el
 * `title` nativo tardaba un segundo y no podía mostrar el atajo al costado.
 */
function DockButton({
  pressed,
  onClick,
  label,
  shortcut,
  icon,
}: {
  pressed?: boolean;
  onClick: () => void;
  label: string;
  /** Atajo real de la acción, si lo tiene. No se inventa uno por simetría. */
  shortcut?: string;
  icon: JSX.Element;
}): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          className={`grid size-7 place-items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none ${
            pressed === true
              ? 'bg-secondary text-secondary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          }`}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="flex items-center gap-1.5">
        {label}
        {shortcut !== undefined && <span className="font-mono text-[10px] text-muted-foreground">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

function Component({
  rec,
  selected,
  live,
  direction,
  state,
  closed,
  bad,
  rotation,
  pins,
  cursorIndex,
  zoom,
}: {
  rec: CadeRecordModel;
  selected: boolean;
  live: boolean;
  /** Sentido de giro del motor, si la simulación lo resolvió. */
  direction?: 1 | -1;
  state: VisualState;
  closed: boolean;
  bad: boolean;
  rotation: Rotation;
  pins: Point[];
  /** Índice del borne enfocado por el teclado, o null. */
  cursorIndex: number | null;
  /** Escala de la vista, para las marcas que no deben escalar con el zoom. */
  zoom: number;
}): JSX.Element | null {
  // Tamaño de borne elegido en Configuración → Apariencia; sin preferencia, 0,9.
  const { pinSize } = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  const box = boxOf(rec);
  if (!box) return null;
  const x = rec.geometry[GEOMETRY.x] ?? 0;
  const y = rec.geometry[GEOMETRY.y] ?? 0;
  const label = rec.designator;
  const sym = resolveSymbol(rec.code, rec.pins);
  // Protección y auxiliares térmicos: la única tinta que se atenúa al abrirse
  // (S7). Un pulsador en reposo también está `open`, pero no lo es.
  const protection = isProtection(rec.code);

  // El símbolo se dibuja con su caja apoyada en el ORIGEN del registro, que es
  // donde CADeSimu pone el primer borne: la grilla de conexión de 6 unidades
  // cuenta desde ahí, no desde un marco con margen. Antes se aplicaba un
  // `inset` y todos los símbolos quedaban corridos respecto de sus cables.
  //
  // El tamaño sale de `baseBoxOf`: la caja del registro sin orientación y el
  // tamaño canónico del símbolo cuando el registro está girado o espejado. CADe
  // guarda métricas por variante (3×12, 15×3, 15×15) que describen su caja de
  // conexión, no el dibujo: escalar a ellas aplastaba la pieza girada.
  const base = baseBoxOf(rec) ?? { x, y, w: box.width, h: box.height };
  const iw = base.w;
  const ih = base.h;

  // Un símbolo anclado al origen trae su geometría en unidades del archivo y se
  // dibuja en el origen del registro, como en CADeSimu: la caja declarada es la
  // grilla de conexión, no el marco del dibujo. Sin marco visible: CADeSimu
  // muestra sólo la tinta del símbolo; los estados viven en la tinta y los
  // cables, no en un recuadro.
  const anchored = sym.anchor === 'origin';
  // El designador va a la izquierda del dibujo: para los anclados el marco de
  // referencia es la caja de la tinta; para el resto, la caja declarada.
  const ink = shapesBounds(sym.shapes(iw, ih));

  // Lo que el puntero puede alcanzar es la unión de la caja declarada y la
  // tinta, porque la tinta son trazos con `fill: none`: sin el rectángulo
  // invisible, los intersticios de la pieza no existen para el hit-testing y el
  // halo sólo aparecía sobre los trazos. En un símbolo anclado al origen la caja
  // declarada es la grilla de conexión y la tinta vive en otras coordenadas, así
  // que unirlas es lo que hace que el bloque entero responda (S7).
  const hitBox = componentHitBox({
    declared: { x: base.x - x, y: base.y - y, w: iw, h: ih },
    ink,
    anchored,
    transform: rec.transform,
  });
  const labelFrame = anchored
    ? { x: ink.minX, y: ink.minY, w: ink.maxX - ink.minX, h: ink.maxY - ink.minY }
    : { x: 0, y: 0, w: iw, h: ih };

  return (
    // `data-sel` marca el grupo entero como seleccionado: el designador y los
    // rótulos de borne viven fuera del glifo, y sin esto la selección no los
    // alcanzaba.
    <g
      data-id={rec.id}
      data-state={state}
      data-protection={protection ? '' : undefined}
      data-bad={bad || undefined}
      data-sel={selected || undefined}
      transform={`translate(${x} ${y})`}
      style={{ cursor: 'move' }}
    >
      <rect className="hitbox" x={hitBox.x} y={hitBox.y} width={hitBox.w} height={hitBox.h} />
      {anchored ? (
        <SymbolGlyph
          code={rec.code}
          pinNames={rec.pins}
          pinVisible={rec.pinVisible}
          w={iw}
          h={ih}
          place="origin"
          rotation={rotation}
          transform={rec.transform}
          selected={selected}
          closed={closed}
          pressed={state === 'pressed'}
          lampColor={rec.lampColor}
          live={live}
          direction={direction}
        />
      ) : (
        <SymbolGlyph code={rec.code} pinNames={rec.pins} pinVisible={rec.pinVisible} w={iw} h={ih} rotation={rotation} transform={rec.transform} selected={selected} closed={closed} pressed={state === 'pressed'} lampColor={rec.lampColor} live={live} direction={direction} />
      )}

      {pins.map((p, i) =>
        rec.pinVisible[i] === false ? null : (
          <circle key={`pin-${i}`} className={selected ? 'pin sel' : 'pin'} cx={p.x - x} cy={p.y - y} r={attachPinRadius(pinSize)} strokeWidth={pinStroke(pinSize)} />
        ),
      )}

      {cursorIndex !== null && pins[cursorIndex] && (
        // Marca del cursor de bornes: dice sobre qué borne actúa Enter sin
        // depender del puntero, que acá no está. Se divide por el zoom para
        // conservar el tamaño en pantalla a cualquier escala.
        <circle
          className="pin-cursor"
          cx={pins[cursorIndex]!.x - x}
          cy={pins[cursorIndex]!.y - y}
          r={PIN_CURSOR_PX / zoom}
          strokeWidth={1 / zoom}
        />
      )}

      {/* Rótulo del borne: a la derecha del punto de conexión, como en CADeSimu. */}
      {pins.map((p, i) => {
        const name = rec.pins[i];
        if (!rec.pinLabelsVisible || rec.pinVisible[i] === false || !name) return null;
        const at = pinLabelAt(p);
        return (
          <text key={`pinlabel-${i}`} className="pinlabel" x={at.x - x} y={at.y - y}>
            {name}
          </text>
        );
      })}

      {label !== '' && (
        <text className="designator left" x={designatorAt(labelFrame).x} y={designatorAt(labelFrame).y} dominantBaseline="middle">
          {label}
        </text>
      )}
    </g>
  );
}

function Wire({
  rec,
  selected,
  live,
  reverse,
  tone,
  path,
}: {
  rec: CadeRecordModel;
  selected: boolean;
  live: boolean;
  reverse?: boolean;
  tone: ConductorTone;
  /** Camino con esquinas redondeadas; ausente en el estilo clásico. */
  path?: string;
}): JSX.Element | null {
  const pts = wirePoints(rec);
  if (!pts) return null;
  if (pts.x1 === pts.x2 && pts.y1 === pts.y2) {
    // Registro de unión (4001): geometría de longitud cero.
    return <circle className={selected ? 'junction sel' : live ? 'junction live' : 'junction'} cx={pts.x1} cy={pts.y1} r={1.15} />;
  }
  // El tono va siempre en la clase: es el color con que CADeSimu pinta el
  // conductor. Cuando el cable está seleccionado o energizado, mandan los
  // colores de estado.
  const cls = ['wire', tone];
  if (selected) cls.push('sel');
  else if (live) {
    cls.push('live');
    if (reverse) cls.push('rev');
  }
  return (
    <path
      data-id={rec.id}
      data-wire={rec.id}
      className={cls.join(' ')}
      d={path ?? `M${pts.x1} ${pts.y1}L${pts.x2} ${pts.y2}`}
    />
  );
}

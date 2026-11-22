import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { JSX } from 'react';
import {
  BookOpenIcon,
  ClipboardPasteIcon,
  CopyIcon,
  FolderOpenIcon,
  FilePlusIcon,
  Grid3x3Icon,
  LayersIcon,
  MagnetIcon,
  Maximize2Icon,
  MoonIcon,
  PaletteIcon,
  PlayIcon,
  SparklesIcon,
  SquareIcon,
  FlipHorizontal2Icon,
  FlipVertical2Icon,
  Redo2Icon,
  RotateCcwIcon,
  RotateCwIcon,
  SaveAllIcon,
  SaveIcon,
  SunIcon,
  Trash2Icon,
  Undo2Icon,
  Volume2Icon,
  VolumeXIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import pkg from '../../package.json';
import {
  createEditor,
  projectOf,
  select,
  deleteSelection,
  copySelection,
  paste,
  addComponent,
  mirrorSelection,
  rotateLeftSelection,
  rotateSelection,
  setDesignator,
  setLampColor,
  setCableNumber,
  insertVertex,
  deleteVertex,
  canDeleteVertex,
  selectVertex,
  addJunction,
  addRoutedWire,
  removeJunction,
  applyDrag,
  undo,
  redo,
  markSaved,
  type DragOp,
  type EditorState,
} from '../editor/state.ts';
import { buildNetwork, validate } from '../editor/network.ts';
import { boundsOf, roundTrips } from '../model/project.ts';
import {
  SIMULATION_TICK_MS,
  MOMENTARY_PULSE_MS,
  applyClick,
  isChangeover,
  isMomentary,
  isPushable,
  specOf,
  startsOpen,
} from '../model/component-spec.ts';
import { changeoverPositions, linkedProtection } from '../sim/apparatus.ts';
import type { Point } from '../editor/pins.ts';
import { Canvas } from './Canvas.tsx';
// Esquinas redondeadas: sólo pintado, y sólo en el estilo moderno (S3).
import { WIRE_CORNER_RADIUS } from './wire-corner.ts';
import { Palette } from './Palette.tsx';
import { Inspector } from './Inspector.tsx';
import { SAMPLES, loadSample, loadFile, downloadCade } from './samples.ts';
import {
  hasFileSystemAccess,
  normalizeSaveName,
  pickOpenHandle,
  pickSaveHandle,
  planSaveAction,
  suggestedSaveName,
  writeHandle,
} from './files.ts';
import { isTypingTarget, ownsSpaceKey, useShortcut, useShortcutHint } from './shortcuts.ts';
import { JUNCTION_TEMPLATE, WIRE_TEMPLATES } from '../symbols/templates.ts';
import { templateForPlacement } from '../symbols/place.ts';
import { blankDocument } from '../format/blank.ts';
import { DEFAULT_FILE_NAME, cadFileName } from '../format/filename.ts';
import { circuitFrom } from '../sim/circuit.ts';
import { simulate } from '../sim/solver.ts';
import { motorDirections } from '../sim/direction.ts';
import { currentFlow } from '../sim/flow.ts';
import { visualStatesOf } from '../sim/visual.ts';
import { isProtectionCode, partKey } from '../sim/netlist.ts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Menubar,
  MenubarLabel,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@/components/ui/menubar';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Resizable, ResizableHandle, ResizablePanel, layoutStorage } from '@/components/ui/resizable';
import { Toaster } from '@/components/ui/sonner';
import { SettingsDialog } from './SettingsDialog.tsx';
import { SaveAsDialog } from './SaveAsDialog.tsx';
import { getScope, setScope, subscribeScope } from '../symbols/scope.ts';
import { resolveSymbol } from '../symbols/library.ts';
import { getSettings, setSettings, subscribeSettings, wireStroke } from './settings.ts';
import {
  applyAppearance,
  panelesForStyle,
  persistMode,
  persistStyle,
  readMode,
  readStyle,
  wireWidthForStyle,
  type Mode,
  type StyleMode,
} from './appearance.ts';
import { armAudio, cue, unlockAudio, type SoundEvent } from './sound.ts';
import { setMotorHum } from './motor-hum.ts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Layout de la paleta y el Inspector.
 *
 * La librería guarda bajo `ui-sdk-resizable:<autoSaveId>`; el adaptador le pone
 * delante el prefijo del proyecto (`simuelectro:`). El `autoSaveId` es uno solo
 * para las dos orientaciones: la librería guarda un layout por conjunto de
 * paneles, así que vertical (paleta, lienzo, inspector) y horizontal (lienzo,
 * inspector) recuerdan su propio ancho por separado.
 */
const LAYOUT_AUTOSAVE_ID = 'paneles';
const LAYOUT_STORAGE = layoutStorage();

/**
 * Estado de una protección: `'closed'` conduce, `'open'` corta. Sin acción del
 * usuario vale el del código: los automáticos y disyuntores arrancan abiertos
 * (`startsOpen`), como en CADeSimu.
 */
function protectionStateOf(code: number, state?: 'closed' | 'open'): 'closed' | 'open' {
  return state ?? (startsOpen(code) ? 'open' : 'closed');
}

/** Conjunto vacío de identidad estable: sin paso de simulación nadie cumple el retardo. */
const NO_TIMER_READY: ReadonlySet<number> = new Set<number>();

export function App(): JSX.Element {
  const [state, setState] = useState<EditorState | null>(null);
  const [fileName, setFileName] = useState('');
  const [activeSheet, setActiveSheet] = useState(0);
  const [placing, setPlacing] = useState<number | null>(null);
  const [preview, setPreview] = useState<DragOp | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [snap, setSnap] = useState(true);
  const [fitToken, setFitToken] = useState(0);
  const [zoom, setZoom] = useState(4);
  const [mode, setMode] = useState<Mode>(readMode);
  const [styleMode, setStyleMode] = useState<StyleMode>(readStyle);
  const scope = useSyncExternalStore(subscribeScope, getScope, getScope);
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /**
   * «Guardar como…» sin File System Access API: el navegador no tiene selector
   * donde pedir el nombre, así que se pide acá antes de descargar.
   */
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  /** Primer clic de un cable: origen. El segundo clic lo cierra. */
  const [wireStart, setWireStart] = useState<{ x: number; y: number } | null>(null);
  // Drop de archivos: profundidad de `dragenter` para que el aviso no parpadee
  // al pasar sobre los hijos del layout.
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [running, setRunning] = useState(false);
  /** El aviso de arranque espera al primer paso calculado (ver el efecto). */
  const [startPending, setStartPending] = useState(false);
  /** Aparatos accionados durante la simulación (ids de registro). Un pulsador
   * momentáneo entra acá mientras dura su pulso y sale solo. */
  const [pressedRecords, setPressedRecords] = useState<number[]>([]);
  /**
   * Estado de las protecciones durante la simulación, por id de registro:
   * `'closed'` conduce, `'open'` corta. Sin entrada, vale el del código: en
   * CADeSimu los automáticos, disyuntores y diferenciales arrancan **abiertos**
   * y el usuario los cierra con un clic (`startsOpen`).
   *
   * `trippedProtections` son las que el usuario volvió a abrir después de
   * cerrarlas: ésas se pintan de rojo.
   */
  const [protectionStates, setProtectionStates] = useState<Record<number, 'closed' | 'open'>>({});
  const [trippedProtections, setTrippedProtections] = useState<number[]>([]);
  /** Posición de cada conmutador de dos posiciones, por id de registro. */
  const [changeovers, setChangeovers] = useState<Record<string, number>>({});
  /** Reloj de simulación para temporizadores (ms desde que arrancó). */
  const [tick, setTick] = useState(0);
  const timerStartRef = useRef(new Map<string, number>());
  const timerDeStartRef = useRef(new Map<string, number>());
  /**
   * Pulsos momentáneos en curso, por id de registro. Un pulsador (8000-8007)
   * se acciona y vuelve solo, así que su soltada es un `setTimeout`; el handle
   * vive acá —claveado por registro, así se pueden pulsar dos botones a la
   * vez— para poder reiniciar el pulso con un segundo clic y para cancelarlo
   * cuando la simulación se detiene (S5) o la app se desmonta.
   */
  const pulseTimers = useRef(new Map<number, number>());

  useEffect(() => {
    if (!running) {
      timerStartRef.current.clear();
      timerDeStartRef.current.clear();
      setTick(0);
      return;
    }
    const id = window.setInterval(() => setTick((t) => t + SIMULATION_TICK_MS), SIMULATION_TICK_MS);
    return () => window.clearInterval(id);
  }, [running]);

  /**
   * Cancela los pulsos pendientes. Se llama al detener la simulación y al
   * desmontar: un `setTimeout` vivo después de parar volvería a accionar el
   * componente en una corrida que ya terminó (S5), y al desmontar apuntaría al
   * `setState` de un componente que ya no existe.
   */
  const clearPulses = useCallback(() => {
    for (const handle of pulseTimers.current.values()) window.clearTimeout(handle);
    pulseTimers.current.clear();
  }, []);

  // Desmontaje: ningún timer sobrevive a la app.
  useEffect(() => clearPulses, [clearPulses]);

  /**
   * Acciona un pulsador momentáneo y agenda su vuelta. Un segundo clic durante
   * el pulso lo reinicia —no lo apaga— porque el aparato es un pulsador y no un
   * interruptor: se cancela el handle anterior y se vuelve a agendar.
   *
   * La duración es `MOMENTARY_PULSE_MS`, que se deriva del paso del reloj de
   * simulación justamente para que el solver alcance a muestrear el contacto:
   * el razonamiento completo está junto a la constante
   * (`model/component-spec.ts`).
   */
  const strikeMomentary = useCallback((id: number, code: number) => {
    const pending = pulseTimers.current.get(id);
    if (pending !== undefined) {
      // El segundo clic reinicia el pulso: el anterior se suelta antes de que
      // suene la nueva apretada, así el par press/release queda balanceado.
      window.clearTimeout(pending);
      cue('pulsador suelta');
    }
    setPressedRecords((prev) => [...applyClick(prev, id, code)]);
    cue('pulsador aprieta');
    pulseTimers.current.set(
      id,
      window.setTimeout(() => {
        pulseTimers.current.delete(id);
        setPressedRecords((prev) => prev.filter((p) => p !== id));
        cue('pulsador suelta');
      }, MOMENTARY_PULSE_MS),
    );
  }, []);

  /** Aviso enfocado: se resalta en rojo en el lienzo. */
  const [highlight, setHighlight] = useState<{ ids: number[]; at: Point | null } | null>(null);
  /** Estado retenido: un contactor no olvida entre pasos (enclavamientos). */
  const lastEnergized = useRef<Set<string>>(new Set());
  /**
   * Último frame que sonó (S5). La simulación se recalcula cada 100 ms aunque
   * nada cambie, así que los cues de simulación salen de comparar contra este
   * ref —bobinas que se energizan o se desenergizan, protecciones que
   * disparan— y nunca de un re-render (S4).
   */
  const audioFrame = useRef<{ energized: ReadonlySet<string>; tripped: ReadonlySet<number> }>({
    energized: new Set<string>(),
    tripped: new Set<number>(),
  });
  const fileInput = useRef<HTMLInputElement | null>(null);
  /**
   * Archivo abierto, si el navegador permite elegir archivo con handle. Es lo
   * que permite que «Guardar» reescriba ese mismo archivo en vez de pedir un
   * destino nuevo. Ni «Nuevo» ni un ejemplo tienen archivo detrás.
   */
  const fileHandle = useRef<FileSystemFileHandle | null>(null);

  // El grosor de cable es una variable CSS: el lienzo la consume en `diagram.css`.
  useEffect(() => {
    document.documentElement.style.setProperty('--wire-w', String(wireStroke(settings.wireWidth)));
  }, [settings.wireWidth]);

  useEffect(() => {
    applyAppearance(mode, styleMode);
    persistMode(mode);
    persistStyle(styleMode);
  }, [mode, styleMode]);

  // Cada estilo carga su paleta en la orientación natural y su grosor de cable:
  // clásico imita el plano de obra de CADe_SIMU (paleta arriba, cable fino) y
  // moderno usa la columna lateral con el trazo legible. Se aplica al entrar y
  // al cambiar de estilo; el ajuste manual de Configuración manda hasta el
  // próximo cambio de estilo.
  useEffect(() => {
    setSettings({
      paneles: panelesForStyle(styleMode),
      wireWidth: wireWidthForStyle(styleMode),
    });
  }, [styleMode]);

  /**
   * Aviso al pie, con el cue opcional de S3: el mensaje de error, el rechazo y
   * las confirmaciones del camino de archivo son los mismos puntos que suenan.
   */
  const flash = useCallback((message: string, sonido?: SoundEvent) => {
    if (sonido) cue(sonido);
    toast(message, { duration: 2200 });
  }, []);

  /**
   * Desbloqueo temprano del audio (S8, bug #22 de `cuelume`): el primer clic o
   * tecla real carga el motor dentro del gesto. `unlock()` fuera de un gesto
   * resuelve `false` y el audio queda mudo para siempre.
   */
  useEffect(() => {
    armAudio();
  }, []);

  const openText = useCallback((text: string, name: string, handle: FileSystemFileHandle | null = null) => {
    setState(createEditor(text));
    setFileName(name);
    // El handle se reemplaza siempre: el documento que entra manda. Se pasa
    // sólo al abrir un archivo; Nuevo y los ejemplos lo dejan en `null`.
    fileHandle.current = handle;
    setActiveSheet(0);
    setPlacing(null);
    setPreview(null);
    setFitToken((t) => t + 1);
  }, []);

  /** Proyecto nuevo: si hay cambios sin guardar, primero pregunta. */
  const newProject = useCallback(() => {
    if (!state) return;
    if (state.dirty && !window.confirm('Hay cambios sin guardar. ¿Empezar un proyecto nuevo igual?')) return;
    openText(blankDocument(), DEFAULT_FILE_NAME);
    flash('proyecto nuevo', 'proyecto nuevo');
  }, [state, openText, flash]);

  /**
   * Escribe `text` en `handle` y deja la aplicación conforme: ese archivo pasa a
   * ser el actual, la cabecera muestra su nombre y el documento queda limpio.
   * Si la escritura falla no se adopta nada: el documento sigue sucio.
   *
   * Limpio sólo si el texto en pantalla es todavía el que se escribió: una
   * edición tipeada mientras la escritura estaba en vuelo no está en el archivo,
   * y bendecirla como guardada sería mentir sobre lo que hay en disco.
   *
   * Devuelve si el archivo se escribió: el drop de un `.cad` necesita saber si el
   * proyecto quedó guardado antes de reemplazarlo.
   */
  const writeDocument = useCallback(
    async (handle: FileSystemFileHandle, text: string): Promise<boolean> => {
      try {
        await writeHandle(handle, text);
      } catch {
        flash('no se guardó: no se pudo escribir el archivo', 'error');
        return false;
      }
      fileHandle.current = handle;
      setFileName(handle.name);
      setState((s) => (s && s.text === text ? markSaved(s) : s));
      cue('guardar');
      return true;
    },
    [flash],
  );

  /**
   * «Guardar» y «Guardar como…».
   *
   * `'save'` puede reescribir el archivo abierto; `'save-as'` siempre pide
   * destino (o descarga). La validación va primero: escribir sobre el archivo
   * del usuario es irreversible, así que un documento que no re-parsea igual no
   * se escribe por ningún camino.
   */
  const saveDocument = useCallback(
    async (mode: 'save' | 'save-as'): Promise<boolean> => {
      if (!state) return false;
      if (!roundTrips(state.text)) {
        flash('no se guardó: el documento no re-parsea igual', 'error');
        return false;
      }
      const text = state.text;
      const openHandle = mode === 'save' ? fileHandle.current : null;
      const action = planSaveAction({
        hasHandle: openHandle !== null,
        browserSupportsPickers: hasFileSystemAccess(),
      });
      if (action === 'write-in-place' && openHandle) {
        return writeDocument(openHandle, text);
      }
      if (action === 'pick-location') {
        // Se sugiere el `.cad` normalizado; el nombre que queda en pantalla es
        // el del archivo que el usuario eligió.
        let picked: FileSystemFileHandle | null;
        try {
          picked = await pickSaveHandle(suggestedSaveName(fileName));
        } catch {
          flash('no se guardó: no se pudo abrir el selector de destino', 'error');
          return false;
        }
        // `null` es cancelación: el usuario decidió no escribir en ningún lado.
        if (!picked) {
          flash('no se guardó: no se eligió destino', 'error');
          return false;
        }
        return writeDocument(picked, text);
      }
      // Sin selectores: se descarga, con el `.cad` normalizado como nombre. La
      // diferencia entre «Guardar» y «Guardar como…» es el nombre: «Guardar» usa
      // el del documento y «Guardar como…» lo pregunta en un diálogo, porque acá
      // el navegador no tiene selector propio al que pedírselo. El archivo
      // abierto no se toca, así que la extensión es la del nombre sugerido;
      // reescribir el original es cosa de la File System Access API, no de este
      // camino.
      if (mode === 'save-as') {
        setSaveAsOpen(true);
        return false;
      }
      const name = suggestedSaveName(fileName);
      downloadCade(text, name);
      setFileName(name);
      setState((s) => (s && s.text === text ? markSaved(s) : s));
      cue('guardar');
      return true;
    },
    [state, fileName, flash, writeDocument],
  );

  const canOpenFile = useCallback(
    async (name: string): Promise<boolean> => {
      if (state !== null && state.dirty) {
        const wantsSave = window.confirm(
          `Hay cambios sin guardar en «${fileName}». ¿Guardar antes de abrir «${name}»?`,
        );
        if (!wantsSave) return false;
        if (!(await saveDocument('save'))) {
          flash('no se cargó: el proyecto no se guardó', 'error');
          return false;
        }
      }
      return true;
    },
    [state, fileName, saveDocument, flash],
  );

  /**
   * Abrir: con selectores se conserva el handle para poder reescribir después
   * ese mismo archivo. Sin soporte queda el input oculto de siempre.
   *
   * Cancelar es silencio; que el selector no se pueda abrir es otra cosa y se
   * avisa, porque si no el usuario ve que no pasa nada y no sabe por qué.
   */
  const openDocument = useCallback(async (): Promise<void> => {
    if (!hasFileSystemAccess()) {
      fileInput.current?.click();
      return;
    }
    let picked: Awaited<ReturnType<typeof pickOpenHandle>>;
    try {
      picked = await pickOpenHandle();
    } catch {
      flash('no se pudo abrir el selector de archivos', 'error');
      return;
    }
    if (!picked) return;
    if (!(await canOpenFile(picked.file.name))) return;
    const { text, name } = await loadFile(picked.file);
    openText(text, name, picked.handle);
    cue('abrir archivo');
  }, [openText, flash, canOpenFile]);

  /**
   * Drop de un `.cad` sobre la app (S1).
   *
   * Si el documento abierto tiene cambios sin guardar, primero se pregunta por
   * guardarlo: reemplazarlo sin más tiraría trabajo que el usuario no eligió
   * descartar. Cancelar deja todo como estaba, y si el guardado no se pudo
   * hacer, el archivo arrastrado tampoco se abre, porque abrirlo es justamente
   * lo que destruye.
   */
  const openDropped = useCallback(
    async (file: File): Promise<void> => {
      if (!/\.(cad|cade)$/i.test(file.name)) {
        flash('no se cargó: tiene que ser un archivo .cad', 'error');
        return;
      }
      if (!(await canOpenFile(file.name))) return;
      const { text, name } = await loadFile(file);
      openText(text, name);
      cue('abrir archivo');
      toast(`abierto ${name}`);
    },
    [flash, canOpenFile, openText],
  );

  /**
   * El nombre ya elegido en el diálogo: se descarga con ése y se adopta como
   * nombre del documento.
   *
   * La validación se repite acá y no se delega en `saveDocument`: el diálogo
   * puede haber quedado abierto mientras el documento cambiaba, y escribir sin
   * validar es irreversible. Tampoco se vuelve a llamar a `saveDocument` con
   * `'save-as'`, que reabriría el diálogo en un bucle. Limpio sólo si el texto
   * en pantalla sigue siendo el que se descargó.
   */
  const saveAsConfirmed = useCallback(
    (chosen: string): void => {
      setSaveAsOpen(false);
      if (!state) return;
      if (!roundTrips(state.text)) {
        flash('no se guardó: el documento no re-parsea igual', 'error');
        return;
      }
      const name = normalizeSaveName(chosen);
      if (name === null) return;
      const text = state.text;
      downloadCade(text, name);
      setFileName(name);
      setState((s) => (s && s.text === text ? markSaved(s) : s));
      flash(`guardado como ${name}`, 'guardar como');
    },
    [state, flash],
  );

  useEffect(() => {
    void loadSample(SAMPLES[0]!).then((text) => openText(text, SAMPLES[0]!.name));
  }, [openText]);

  const project = useMemo(() => (state ? projectOf(state) : null), [state]);

  const display = useMemo(() => {
    if (!state || !preview) return project;
    return projectOf(applyDrag(state, preview));
  }, [state, preview, project]);

  const sheet = display?.sheets[Math.min(activeSheet, display.sheets.length - 1)];
  const records = useMemo(() => {
    if (!display || !sheet) return [];
    return display.records.slice(sheet.startRecord, sheet.endRecord);
  }, [display, sheet]);

  const selection = useMemo(() => new Set(state?.selection ?? []), [state]);

  const network = useMemo(() => buildNetwork(project?.records ?? []), [project]);
  const findings = useMemo(() => validate(project?.records ?? []), [project]);

  /**
   * Circuito armado desde el dibujo: la alimentación sale de los símbolos de
   * alimentación (3000/3001/…) y de los tipos de cable, como en CADe_SIMU.
   * No hay marcas manuales de fase/neutro.
   *
   * Las protecciones que el usuario no cerró quedan fuera del circuito: en
   * CADeSimu arrancan abiertas.
   */
  const built = useMemo(() => {
    if (!project) return null;
    const open = new Set<number>();
    for (const rec of project.records) {
      if (rec.kind !== 'component') continue;
      if (!isProtectionCode(rec.code)) continue;
      if (protectionStateOf(rec.code, protectionStates[rec.id]) === 'open') open.add(rec.id);
    }
    return circuitFrom(project.records, { openRecords: open });
  }, [project, protectionStates]);

  /**
   * Posición de cada conmutador. Un conmutador que comparte designador con una
   * protección es su contacto auxiliar: no se acciona por separado, sigue al
   * disyuntor (`sim/apparatus.ts`).
   */
  const positions = useMemo(() => {
    if (!project) return {};
    return changeoverPositions(project.records, protectionStates, changeovers);
  }, [project, protectionStates, changeovers]);

  const pressed = useMemo(() => {
    const out = new Set<string>();
    if (!built) return out;
    for (const device of built.circuit.devices) {
      const recordId = Number(device.id.split(':')[0]);
      if (pressedRecords.includes(recordId)) out.add(device.id);
    }
    return out;
  }, [built, pressedRecords]);

  /**
   * Un paso de simulación: el estado del solver más los temporizadores que ya
   * cumplieron el retardo. Ese segundo dato vivía en un ref que se escribía en
   * pleno render y sólo lo leía `visualStates`; ahora viaja con el paso, así el
   * render no muta nada y el lienzo no se queda un paso atrás.
   *
   * Las dependencias son exactamente lo que el callback lee: `running`, `built`,
   * `pressed`, `positions` y `tick`. Sin `positions`, accionar un conmutador (o
   * el auxiliar de una protección) no llegaba al solver hasta el tick siguiente.
   */
  const step = useMemo(() => {
    if (!running || !built) return null;

    // Temporizadores: se acumula el tiempo mientras el coil está energizado.
    const timerParts = new Set(built.circuit.devices.filter((d) => d.timer).map((d) => d.part));
    const timers = new Map<string, { onReady: boolean; offReady: boolean }>();
    for (const part of timerParts) {
      const coilOn = lastEnergized.current.has(part);
      if (coilOn) {
        if (!timerStartRef.current.has(part)) {
          timerStartRef.current.set(part, tick);
          timerDeStartRef.current.delete(part);
        }
        const elapsed = tick - (timerStartRef.current.get(part) ?? tick);
        timers.set(part, { onReady: elapsed >= 1000, offReady: false });
      } else {
        timerStartRef.current.delete(part);
        if (!timerDeStartRef.current.has(part)) timerDeStartRef.current.set(part, tick);
        const elapsed = tick - (timerDeStartRef.current.get(part) ?? tick);
        timers.set(part, { onReady: false, offReady: elapsed < 1000 });
      }
    }

    const timerReady = new Set<number>();
    for (const d of built.circuit.devices) {
      if (d.timer && timers.get(d.part)?.onReady) timerReady.add(Number(d.id.split(':')[0]));
    }

    const state = simulate(built.circuit, {
      pressed,
      initialEnergized: lastEnergized.current,
      timers,
      latched: lastEnergized.current,
      changeovers: new Map(Object.entries(positions)),
    });
    return { state, timerReady };
  }, [running, built, pressed, positions, tick]);

  const simulation = step === null ? null : step.state;
  const timerReady = step === null ? NO_TIMER_READY : step.timerReady;

  /**
   * Estado retenido del paso anterior: se avanza en un efecto, no durante el
   * render, para que un doble render (StrictMode) no lo adelante dos pasos.
   * El solver igual lee el paso ANTERIOR: el efecto se aplica después del commit
   * y React vacía los efectos pendientes antes del próximo render, así que la
   * secuencia de conjuntos energizados es la misma que antes.
   *
   * El reinicio también vive acá (`step === null` cuando se detiene): así el
   * último efecto del último commit es siempre el que deja el valor, y un efecto
   * pendiente del tick anterior no puede reponer el estado de una corrida vieja.
   */
  useEffect(() => {
    const energized: ReadonlySet<string> = step ? step.state.energized : new Set<string>();
    const tripped: ReadonlySet<number> = new Set(trippedProtections);
    const previous = audioFrame.current;
    audioFrame.current = { energized, tripped };
    lastEnergized.current = step ? step.state.energized : new Set<string>();
    // Detener la simulación no es un flanco: sin paso no hay nada que sonar.
    if (!step) return;
    for (const part of energized) {
      if (!previous.energized.has(part)) cue('bobina energizada');
    }
    for (const part of previous.energized) {
      if (!energized.has(part)) cue('bobina desenergizada');
    }
    for (const id of tripped) {
      if (!previous.tripped.has(id)) cue('protección disparada');
    }
  }, [step, trippedProtections]);

  /**
   * Aviso de arranque: usa el MISMO resultado que el badge (este `step`), no un
   * `simulate()` aparte que no veía `pressed`, `timers`, `changeovers` ni
   * `latched` y podía contradecirlo. Por eso espera al primer paso calculado.
   */
  useEffect(() => {
    if (!startPending || !simulation) return;
    setStartPending(false);
    const count = simulation.energized.size;
    flash(
      simulation.stable
        ? `simulando · ${count} aparato${count === 1 ? '' : 's'} energizado${count === 1 ? '' : 's'}`
        : 'la maniobra no converge: revisá los enclavamientos',
      simulation.stable ? undefined : 'error',
    );
  }, [startPending, simulation, flash]);

  /** Registros cuyo aparato quedó energizado: bobina, lámpara o motor. */
  const live = useMemo(() => {
    const out = new Set<number>();
    if (!simulation || !project) return out;
    const loaded = new Set<number>();
    for (const id of simulation.loads) loaded.add(Number(id.split(':')[0]));
    for (const rec of project.records) {
      if (rec.kind !== 'component') continue;
      if (simulation.energized.has(partKey(rec.designator)) || loaded.has(rec.id)) out.add(rec.id);
    }
    return out;
  }, [simulation, project]);

  /** Sentido de giro por motor, leído de la topología trifásica (no del contactor). */
  const motorDirection = useMemo(
    () => (simulation && built ? motorDirections(built, simulation) : new Map<number, 1 | -1>()),
    [simulation, built],
  );

  /**
   * Motores energizados (S10): los mismos que el lienzo dibuja girando.
   *
   * El zumbido es uno solo para todos, así que lo único que hace falta es la
   * cantidad: la amplitud sale de ella y tiene techo.
   */
  const motoresEnergizados = useMemo(() => {
    if (!project) return 0;
    let motores = 0;
    for (const rec of project.records) {
      if (rec.kind !== 'component') continue;
      if (!live.has(rec.id)) continue;
      if (resolveSymbol(rec.code, rec.pins).group === 'motor') motores += 1;
    }
    return motores;
  }, [project, live]);

  /**
   * Zumbido del motor (S10): se enciende en el flanco de un motor que pasa a
   * estar energizado y baja a 0 cuando deja de haber alguno, cuando se detiene
   * la simulación, con el mute maestro y con el interruptor propio apagado. La
   * pestaña oculta la resuelve `motor-hum.ts`.
   *
   * `setMotorHum` es idempotente: repetir el mismo estado no reinicia el ataque
   * ni hace clic, así que este efecto puede correr en cada frame sin sonar de
   * más. No toca los cues ni pasa por el coalescer.
   */
  useEffect(() => {
    setMotorHum({
      motoresEnergizados,
      simulando: running,
      ajustes: { silenciado: settings.silenciado, sonidoMotor: settings.sonidoMotor },
    });
  }, [motoresEnergizados, running, settings.silenciado, settings.sonidoMotor]);

  /**
   * Contactos cerrados en este estado: la hoja se dibuja apoyada.
   *
   * El solver informa los dispositivos que conducen, pero un contacto auxiliar
   * no está entre ellos: su estado lo manda el aparato del mismo designador.
   * Por eso además se miran los contactos NA (7000/2001) de un aparato
   * energizado y se abren los NC (7001) del mismo aparato.
   *
   * El conmutador (8018) es el caso aparte: de sus dos salidas sólo una
   * conduce, y "apoyada" es la de la posición de reposo. El lienzo rota las dos
   * cuchillas al revés, así que hay que decirle cuál está apoyada.
   */
  const closedContacts = useMemo(() => {
    const out = new Set<number>();
    if (!simulation || !project) return out;
    const byId = new Map(project.records.map((r) => [r.id, r]));
    // Conmutados de tres bornes: tienen dos tiros (0-1 en reposo, 0-2 al
    // accionar) y el símbolo está dibujado en una de las dos poses, así que el
    // registro cuenta con el tiro que le toca según su polaridad: para un
    // aparato de reposo abierto (8003) la pose activa es el 0-2, y para uno de
    // reposo cerrado (8015) es el 0-1. Sin esto el símbolo se dibujaría al
    // revés en uno de los dos casos.
    const twoThrow = new Set<number>();
    for (const device of built?.circuit.devices ?? []) {
      if (device.id.endsWith(':0-2')) twoThrow.add(Number(device.id.split(':')[0]));
    }
    for (const id of simulation.closed) {
      const [head, pair] = id.split(':');
      const recordId = Number(head);
      const rec = byId.get(recordId);
      if (rec && isChangeover(rec.code)) {
        if ((positions[String(recordId)] ?? 0) === 0) out.add(recordId);
        continue;
      }
      if (rec && twoThrow.has(recordId)) {
        const wants = specOf(rec.code).rest === 'closed' ? '0-1' : '0-2';
        if (pair !== wants) continue;
      }
      out.add(recordId);
    }
    for (const rec of project.records) {
      if (rec.kind !== 'component') continue;
      if (rec.code !== 7000 && rec.code !== 7001 && rec.code !== 2001) continue;
      const live = simulation.energized.has(partKey(rec.designator));
      if (rec.code === 7001) {
        if (!live) out.add(rec.id);
        else out.delete(rec.id);
      } else if (live) {
        out.add(rec.id);
      }
    }
    return out;
  }, [simulation, project, positions, built]);

  /**
   * Tramos con tensión y sentido de la corriente: lazo completo desde la fase,
   * a través de la carga energizada, de vuelta por el retorno hasta el neutro.
   * `reversed` marca los tramos cuya corriente va contra el sentido del trazo,
   * para que el dibujo lea "fase -> carga -> neutro" y no dos flujos que
   * entran a la carga desde los dos lados.
   */
  const { carrying: liveWires, reversed: reversedWires } = useMemo(() => {
    if (!simulation || !built) return { carrying: new Set<number>(), reversed: new Set<number>() };
    return currentFlow(project?.records ?? [], built, simulation);
  }, [simulation, built, project]);

  /** Estado visual por componente para animar el lienzo. */
  const visualStates = useMemo(
    () =>
      visualStatesOf(project?.records ?? [], {
        simulating: running,
        live,
        closed: closedContacts,
        pressed: new Set(pressedRecords),
        tripped: new Set(trippedProtections),
        timerReady,
      }),
    [project, running, live, closedContacts, pressedRecords, trippedProtections, timerReady],
  );

  const toggleSimulation = (): void => {
    // El botón es un gesto real: sirve para desbloquear el audio aunque el
    // usuario haya llegado hasta acá sin tocar nada más.
    unlockAudio();
    if (running) {
      setRunning(false);
      cue('simulación detiene');
      setStartPending(false);
      // Primero los timers: soltar un pulso que quedó agendado no puede
      // sobrevivir a la parada (S5).
      clearPulses();
      setPressedRecords([]);
      setProtectionStates({});
      setTrippedProtections([]);
      setChangeovers({});
      lastEnergized.current = new Set();
      return;
    }
    if (!built) {
      flash('el dibujo no tiene alimentación: agregá un símbolo de fase y otro de neutro', 'error');
      return;
    }
    setRunning(true);
    cue('simulación inicia');
    // El aviso lo da el efecto, con el primer paso del `useMemo`: el mismo
    // resultado que muestra el badge del pie.
    setStartPending(true);
  };

  const selectedRecords = useMemo(() => {
    if (!project || !state) return [];
    const ids = new Set(state.selection);
    return project.records.filter((r) => ids.has(r.id));
  }, [project, state]);

  const onSelect = useCallback((ids: number[], additive: boolean) => {
    // Con la simulación activa, un clic sobre un pulsador lo acciona —el
    // momentáneo vuelve solo, el interruptor se queda accionado— y sobre una
    // protección la abre/dispara (o la rearma).
    if (running && ids.length === 1) {
      const id = ids[0]!;
      const code = projectOf(state!).records.find((r) => r.id === id)?.code ?? -1;
      if (isPushable(code)) {
        // Pulsador momentáneo (8000-8007, «Contacto pulsador»): el clic lo
        // acciona y agenda la vuelta. Interruptores (8008-8011) y selectores
        // siguen alternando: se quedan donde el usuario los deja.
        if (isMomentary(code)) {
          strikeMomentary(id, code);
        } else {
          setPressedRecords((prev) => [...applyClick(prev, id, code)]);
          cue('accionar');
        }
        return;
      }
      if (isChangeover(code)) {
        const rec = projectOf(state!).records.find((r) => r.id === id);
        const protection = rec ? linkedProtection(projectOf(state!).records, rec) : undefined;
        if (protection) {
          // Es el contacto auxiliar de un disyuntor: el clic acciona el aparato.
          const current = protectionStateOf(protection.code, protectionStates[protection.id]);
          const next = current === 'closed' ? 'open' : 'closed';
          setProtectionStates((prev) => ({ ...prev, [protection.id]: next }));
          setTrippedProtections((prev) =>
            next === 'open' && current === 'closed' ? [...new Set([...prev, protection.id])] : prev,
          );
          return;
        }
        // Conmutador suelto: el clic lo pasa de una salida a la otra.
        setChangeovers((prev) => ({ ...prev, [String(id)]: prev[String(id)] === 1 ? 0 : 1 }));
        cue('accionar');
        return;
      }
      if (isProtectionCode(code)) {
        // La protección arranca abierta (los automáticos); el clic la cierra y
        // el siguiente la vuelve a abrir (disparo).
        const current = protectionStateOf(code, protectionStates[id]);
        const next = current === 'closed' ? 'open' : 'closed';
        setProtectionStates((prev) => ({ ...prev, [id]: next }));
        setTrippedProtections((prev) =>
          next === 'open' && current === 'closed' ? [...new Set([...prev, id])] : prev,
        );
        return;
      }
    }
    setState((s) => (s ? select(s, ids, additive) : s));
    setPlacing(null);
  }, [running, state, protectionStates, strikeMomentary]);

  const onDragPreview = useCallback((op: DragOp | null) => {
    setPreview(op);
  }, []);

  const onDragCommit = useCallback((op: DragOp) => {
    setState((s) => (s ? applyDrag(s, op) : s));
    setPreview(null);
  }, []);

  const onInsertVertex = useCallback((id: number, x: number, y: number) => {
    setState((s) => (s ? insertVertex(s, id, x, y) : s));
  }, []);

  const onVertexSelect = useCallback((vertex: { x: number; y: number } | null) => {
    setState((s) => (s ? selectVertex(s, vertex) : s));
  }, []);

  /**
   * Cancelar lo que esté en curso: selección, vértice enfocado, cable a medio
   * dibujar y componente a medio colocar. Lo usan Escape y el botón derecho.
   */
  const cancel = useCallback(() => {
    setPlacing(null);
    setWireStart(null);
    setState((s) => (s ? selectVertex(select(s, [], false), null) : s));
  }, []);

  const onPlace = useCallback(
    (x: number, y: number) => {
      if (placing === null) return;
      const wire = WIRE_TEMPLATES[placing];
      if (wire) {
        // Dos clics: el primero marca el origen, el segundo cierra el tramo.
        if (!wireStart) {
          setWireStart({ x, y });
          return;
        }
        const from = wireStart;
        setWireStart(null);
        setState((s) => {
          if (!s) return s;
          const obstacles = projectOf(s)
            .records.filter((rec) => rec.kind === 'component')
            .map((rec) => boundsOf(rec))
            .filter((b): b is NonNullable<typeof b> => b !== null)
            .map((b) => ({ minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h }));
          return addRoutedWire(s, from, { x, y }, obstacles, wire, JUNCTION_TEMPLATE ?? undefined);
        });
        return;
      }
      const template = templateForPlacement(placing);
      if (!template) {
        flash(`sin plantilla para el código ${placing}`);
        return;
      }
      setState((s) => (s ? addComponent(s, template, x, y) : s));
      // Sólo el componente colocado suena: el commit de cada cable es de S4.
      cue('colocar');
    },
    [placing, flash, wireStart],
  );

  // --- atajos ---------------------------------------------------------------

  // Todos los atajos globales se registran en el registro compartido de ui-sdk
  // (`./shortcuts.ts` es la puerta). Los handlers y los `when` se leen siempre
  // frescos, así que pueden ser flechas inline: no hay que volver a registrar
  // nada cuando cambia el estado.
  //
  // Reparto de guardas, el de siempre: guardar, cancelar y espacio valen también
  // con la simulación en marcha —no escriben el circuito, y espacio es
  // justamente el atajo que la corta—; el resto es sólo de edición, y ninguna
  // tecla que escriba le gana al campo de texto que tiene el foco.
  const editable = (): boolean => !running && !isTypingTarget(document.activeElement);

  const deleteSelected = (): void =>
    setState((s) => {
      if (!s) return s;
      // Con un vértice enfocado se borra el vértice; si no, la selección.
      return s.vertex ? deleteVertex(s, s.vertex) : deleteSelection(s);
    });

  useShortcut('escape', cancel, {
    allowInInput: true,
    description: 'Cancelar lo que esté en curso',
  });
  useShortcut('space', () => toggleSimulation(), {
    // Un control con foco ya usa la barra espaciadora: se deja pasar para que la
    // resuelva él, una sola vez.
    when: () => !ownsSpaceKey(document.activeElement),
    description: 'Simular o detener la simulación',
  });
  useShortcut('mod+s', () => void saveDocument('save'), { description: 'Guardar' });
  useShortcut('mod+shift+s', () => void saveDocument('save-as'), { description: 'Guardar como…' });
  useShortcut('mod+z', () => setState((s) => (s ? undo(s) : s)), {
    when: editable,
    description: 'Deshacer',
  });
  useShortcut('mod+shift+z', () => setState((s) => (s ? redo(s) : s)), {
    when: editable,
    description: 'Rehacer',
  });
  useShortcut(
    'mod+c',
    () => {
      setState((s) => (s ? copySelection(s) : s));
      flash('copiado');
    },
    { when: editable, description: 'Copiar la selección' },
  );
  useShortcut('mod+v', () => setState((s) => (s ? paste(s) : s)), {
    when: editable,
    description: 'Pegar',
  });
  useShortcut('mod+0', () => setFitToken((t) => t + 1), {
    when: editable,
    description: 'Encuadrar el dibujo',
  });
  useShortcut('delete', deleteSelected, { when: editable, description: 'Borrar la selección' });
  useShortcut('backspace', deleteSelected, { when: editable, description: 'Borrar la selección' });
  useShortcut('r', () => setState((s) => (s ? rotateSelection(s) : s)), {
    when: editable,
    description: 'Rotar 90°',
  });
  useShortcut('shift+r', () => setState((s) => (s ? rotateLeftSelection(s) : s)), {
    when: editable,
    description: 'Rotar −90°',
  });

  // Hints por plataforma —⌘S en Apple, Ctrl+S en el resto— derivados de las
  // mismas teclas que registran los atajos: no pueden desincronizarse.
  const hintSave = useShortcutHint('mod+s').text;
  const hintSaveAs = useShortcutHint('mod+shift+s').text;
  const hintUndo = useShortcutHint('mod+z').text;
  const hintRedo = useShortcutHint('mod+shift+z').text;
  const hintCopy = useShortcutHint('mod+c').text;
  const hintPaste = useShortcutHint('mod+v').text;
  const hintRotateLeft = useShortcutHint('shift+r').text;
  const hintFit = useShortcutHint('mod+0').text;

  if (!state || !project) {
    return (
      <div className="grid h-full place-items-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Cargando…
        </div>
      </div>
    );
  }

  const componentCount = project.records.filter((r) => r.kind === 'component').length;
  const wireCount = project.records.filter((r) => r.kind === 'connection').length;

  const palette = (
    <Palette
      placing={placing}
      onPick={(code) => {
        if (running) {
          flash('detené la simulación para editar el circuito', 'rechazo');
          return;
        }
        setWireStart(null);
        setPlacing(code);
      }}
      sheets={project.sheets}
      activeSheet={activeSheet}
      onSheet={setActiveSheet}
    />
  );

  return (
    <TooltipProvider delayDuration={400}>
      <div
        className="relative flex h-full flex-col"
        data-pack="cadesimu"
        onDragEnter={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => {
          // Sin `preventDefault` el navegador abre el archivo y la app se va.
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void openDropped(file);
        }}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-background/80 text-sm font-medium">
            soltá el archivo .cad para abrirlo
          </div>
        )}
        <header className="relative z-10 flex h-[46px] shrink-0 items-center gap-2 border-b border-border bg-card px-3 shadow-chrome-down">
          <div className="mr-0.5 flex shrink-0 items-baseline gap-1.5">
            <strong className="text-[13.5px] font-semibold tracking-tight">Electro-Simulador</strong>
            <span className="font-mono text-[10.5px] text-muted-foreground">v{pkg.version}</span>
          </div>

          <Menubar>
            <MenubarMenu>
              <MenubarTrigger>Archivo</MenubarTrigger>
              <MenubarContent>
                <MenubarGroup>
                  <MenubarItem onSelect={newProject}>
                    <FilePlusIcon />
                    Nuevo
                  </MenubarItem>
                  <MenubarItem onSelect={() => void openDocument()}>
                    <FolderOpenIcon />
                    Abrir…
                  </MenubarItem>
                  <MenubarSub>
                    <MenubarSubTrigger>
                      <BookOpenIcon />
                      Ejemplos
                    </MenubarSubTrigger>
                    <MenubarSubContent>
                      <MenubarGroup>
                        {SAMPLES.map((s) => (
                          <MenubarItem
                            key={s.name}
                            onSelect={() => {
                              void loadSample(s).then((text) => openText(text, s.name));
                            }}
                          >
                            {s.label}
                            {cadFileName(fileName) === cadFileName(s.name) && <MenubarShortcut>actual</MenubarShortcut>}
                          </MenubarItem>
                        ))}
                      </MenubarGroup>
                    </MenubarSubContent>
                  </MenubarSub>
                </MenubarGroup>
                <MenubarSeparator />
                <MenubarGroup>
                  <MenubarItem onSelect={() => void saveDocument('save')}>
                    <SaveIcon />
                    Guardar
                    <MenubarShortcut>{hintSave}</MenubarShortcut>
                  </MenubarItem>
                  <MenubarItem onSelect={() => void saveDocument('save-as')}>
                    <SaveAllIcon />
                    Guardar como…
                    <MenubarShortcut>{hintSaveAs}</MenubarShortcut>
                  </MenubarItem>
                </MenubarGroup>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Editar</MenubarTrigger>
              <MenubarContent>
                <MenubarGroup>
                  <MenubarItem disabled={running || state.past.length === 0} onSelect={() => setState(undo(state))}>
                    <Undo2Icon />
                    Deshacer
                    <MenubarShortcut>{hintUndo}</MenubarShortcut>
                  </MenubarItem>
                  <MenubarItem disabled={running || state.future.length === 0} onSelect={() => setState(redo(state))}>
                    <Redo2Icon />
                    Rehacer
                    <MenubarShortcut>{hintRedo}</MenubarShortcut>
                  </MenubarItem>
                </MenubarGroup>
                <MenubarSeparator />
                <MenubarGroup>
                  <MenubarItem
                    disabled={running || state.selection.length === 0}
                    onSelect={() => {
                      setState((s) => (s ? copySelection(s) : s));
                      flash('copiado');
                    }}
                  >
                    <CopyIcon />
                    Copiar
                    <MenubarShortcut>{hintCopy}</MenubarShortcut>
                  </MenubarItem>
                  <MenubarItem disabled={running} onSelect={() => setState((s) => (s ? paste(s) : s))}>
                    <ClipboardPasteIcon />
                    Pegar
                    <MenubarShortcut>{hintPaste}</MenubarShortcut>
                  </MenubarItem>
                </MenubarGroup>
                <MenubarSeparator />
                <MenubarGroup>
                  <MenubarItem disabled={running} onSelect={() => setState(rotateSelection(state))}>
                    <RotateCwIcon />
                    Girar a la derecha
                    <MenubarShortcut>R</MenubarShortcut>
                  </MenubarItem>
                  <MenubarItem disabled={running} onSelect={() => setState((s) => (s ? rotateLeftSelection(s) : s))}>
                    <RotateCcwIcon />
                    Girar a la izquierda
                    <MenubarShortcut>{hintRotateLeft}</MenubarShortcut>
                  </MenubarItem>
                  <MenubarItem disabled={running} onSelect={() => setState((s) => (s ? mirrorSelection(s, 'v') : s))}>
                    <FlipVertical2Icon />
                    Espejo vertical
                  </MenubarItem>
                  <MenubarItem disabled={running} onSelect={() => setState((s) => (s ? mirrorSelection(s, 'h') : s))}>
                    <FlipHorizontal2Icon />
                    Espejo horizontal
                  </MenubarItem>
                  <MenubarItem variant="destructive" disabled={running || state.selection.length === 0} onSelect={() => setState(deleteSelection(state))}>
                    <Trash2Icon />
                    Borrar selección
                    <MenubarShortcut>⌫</MenubarShortcut>
                  </MenubarItem>
                </MenubarGroup>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Ver</MenubarTrigger>
              <MenubarContent>
                <MenubarGroup>
                  <MenubarCheckboxItem checked={showGrid} onCheckedChange={(checked) => setShowGrid(checked === true)}>
                    <Grid3x3Icon />
                    Grilla
                  </MenubarCheckboxItem>
                  <MenubarCheckboxItem checked={snap} onCheckedChange={(checked) => setSnap(checked === true)}>
                    <MagnetIcon />
                    Snap (paso de 3)
                  </MenubarCheckboxItem>
                  <MenubarItem onSelect={() => setFitToken((t) => t + 1)}>
                    <Maximize2Icon />
                    Encuadrar
                    <MenubarShortcut>{hintFit}</MenubarShortcut>
                  </MenubarItem>
                </MenubarGroup>
                <MenubarSeparator />
                <MenubarGroup>
                  <MenubarItem onSelect={() => setSettingsOpen(true)}>
                    <PaletteIcon />
                    Configuración…
                  </MenubarItem>
                </MenubarGroup>
                <MenubarSeparator />
                <MenubarLabel>Estilo</MenubarLabel>
                <MenubarRadioGroup
                  value={styleMode}
                  onValueChange={(value) => setStyleMode(value as StyleMode)}
                >
                  <MenubarRadioItem value="clasico">
                    <LayersIcon />
                    Clásico
                  </MenubarRadioItem>
                  <MenubarRadioItem value="moderno">
                    <SparklesIcon />
                    Moderno
                  </MenubarRadioItem>
                </MenubarRadioGroup>
                <MenubarSeparator />
                <MenubarLabel>Tema</MenubarLabel>
                <MenubarRadioGroup value={mode} onValueChange={(value) => setMode(value as Mode)}>
                  <MenubarRadioItem value="light">
                    <SunIcon />
                    Modo día
                  </MenubarRadioItem>
                  <MenubarRadioItem value="dark">
                    <MoonIcon />
                    Modo noche
                  </MenubarRadioItem>
                </MenubarRadioGroup>
                <MenubarSeparator />
                <MenubarCheckboxItem
                  checked={scope === 'cadesimu'}
                  onCheckedChange={(checked) => setScope(checked === true ? 'cadesimu' : 'all')}
                >
                  Solo componentes CADe_SIMU
                </MenubarCheckboxItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Simulación</MenubarTrigger>
              <MenubarContent>
                <MenubarGroup>
                  <MenubarItem
                    onSelect={toggleSimulation}
                    className={cn(
                      running
                        ? 'text-red-600 focus:text-red-700 dark:text-red-400 dark:focus:text-red-300'
                        : 'text-green-600 focus:text-green-700 dark:text-green-400 dark:focus:text-green-300'
                    )}
                  >
                    {running ? <SquareIcon /> : <PlayIcon />}
                    {running ? 'Detener simulación' : 'Simular'}
                    <span className="ml-auto pl-4 font-mono text-[11px] text-muted-foreground">espacio</span>
                  </MenubarItem>
                </MenubarGroup>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>

          <input
            ref={fileInput}
            type="file"
            accept=".cade,.cad"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void (async () => {
                if (!(await canOpenFile(file.name))) return;
                const { text, name } = await loadFile(file);
                openText(text, name);
                cue('abrir archivo');
              })();
              e.target.value = '';
            }}
          />

          <span className="max-w-[200px] shrink-0 truncate font-mono text-[11px] text-muted-foreground">{fileName}</span>

          <div className="flex-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Deshacer"
                disabled={state.past.length === 0}
                onClick={() => setState(undo(state))}
              >
                <Undo2Icon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Deshacer ({hintUndo})</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Rehacer"
                disabled={state.future.length === 0}
                onClick={() => setState(redo(state))}
              >
                <Redo2Icon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Rehacer ({hintRedo})</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-0.5 h-5" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size={styleMode === 'moderno' ? 'sm' : 'icon-sm'}
                className={cn(
                  running
                    ? 'bg-red-500/15 text-red-700 hover:bg-red-500/25 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300'
                    : 'bg-green-500/15 text-green-700 hover:bg-green-500/25 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300'
                )}
                aria-pressed={running}
                aria-label={running ? 'Detener simulación' : 'Simular'}
                onClick={toggleSimulation}
              >
                {/* En clásico el chrome imita CADe: el control es sólo el icono y el
                    rótulo lo da el tooltip + aria-label. En moderno lleva texto. */}
                {styleMode === 'moderno' ? (
                  <>
                    {running ? <SquareIcon data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
                    {running ? 'Detener' : 'Simular'}
                  </>
                ) : running ? (
                  <SquareIcon />
                ) : (
                  <PlayIcon />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{running ? 'Detener la simulación (espacio)' : 'Simular con la alimentación indicada (espacio)'}</TooltipContent>
          </Tooltip>

          {/* S9: mute maestro de todo el sonido, pegado al botón Simular. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-pressed={settings.silenciado}
                aria-label={settings.silenciado ? 'Activar sonido' : 'Silenciar'}
                onClick={() => {
                  // El clic es un gesto real: reactivar también desbloquea.
                  unlockAudio();
                  setSettings({ silenciado: !settings.silenciado });
                }}
              >
                {settings.silenciado ? <VolumeXIcon /> : <Volume2Icon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{settings.silenciado ? 'Activar sonido' : 'Silenciar'}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={
                  styleMode === 'clasico' ? 'Activar estilo moderno' : 'Activar estilo clásico'
                }
                aria-pressed={styleMode === 'moderno'}
                onClick={() => setStyleMode(styleMode === 'clasico' ? 'moderno' : 'clasico')}
              >
                {styleMode === 'clasico' ? <SparklesIcon /> : <LayersIcon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{styleMode === 'clasico' ? 'Estilo moderno' : 'Estilo clásico'}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={mode === 'dark' ? 'Cambiar a modo día' : 'Cambiar a modo noche'}
                aria-pressed={mode === 'light'}
                onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
              >
                {mode === 'dark' ? <SunIcon /> : <MoonIcon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{mode === 'dark' ? 'Modo día' : 'Modo noche'}</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-0.5 h-5" />

          <Button size="sm" onClick={() => void saveDocument('save')}>
            <SaveIcon data-icon="inline-start" />
            Guardar
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          {/* La paleta va arriba en horizontal y a la izquierda del lienzo en
              vertical: es la misma pieza, cambia sólo dónde se monta. */}
          {settings.paneles === 'horizontal' && palette}
          <Resizable
            orientation="horizontal"
            autoSaveId={LAYOUT_AUTOSAVE_ID}
            storage={LAYOUT_STORAGE}
            className="min-h-0 flex-1"
          >
            {/* En vertical la paleta es un panel más; en horizontal la barra de
                arriba conserva su alto y el grupo empieza en la fila del lienzo. */}
            {settings.paneles === 'vertical' && (
              <>
                <ResizablePanel id="paleta" defaultSize="232px" minSize="160px" maxSize="420px">
                  {palette}
                </ResizablePanel>
                <ResizableHandle aria-label="Redimensionar paleta" />
              </>
            )}

            {/* Sin `defaultSize`: el lienzo se queda con lo que dejan los otros dos. */}
            <ResizablePanel id="lienzo">
              <Canvas
                records={records}
                selection={selection}
                rotation={state.rotation}
                showGrid={showGrid}
                snap={snap}
                placing={placing}
                fitToken={fitToken}
                onSelect={onSelect}
                onDragPreview={onDragPreview}
                onDragCommit={onDragCommit}
                onPlace={onPlace}
                wireStart={wireStart}
                live={live}
                motorDirection={motorDirection}
                states={visualStates}
                liveWires={liveWires}
                reversedWires={reversedWires}
                closedContacts={closedContacts}
                simulating={running}
                cornerRadius={styleMode === 'moderno' ? WIRE_CORNER_RADIUS : 0}
                highlight={highlight}
                onZoom={setZoom}
                onInsertVertex={onInsertVertex}
                onVertexSelect={onVertexSelect}
                onCancel={cancel}
                onFit={() => setFitToken((t) => t + 1)}
                onToggleGrid={() => setShowGrid((on) => !on)}
                onToggleSnap={() => setSnap((on) => !on)}
                floatingChrome={styleMode === 'moderno'}
              />
            </ResizablePanel>

            <ResizableHandle aria-label="Redimensionar inspector" />

            <ResizablePanel id="inspector" defaultSize="268px" minSize="240px" maxSize="520px">
              <Inspector
                selected={selectedRecords}
                rotation={state.rotation}
                network={network}
                findings={findings}
                vertex={state.vertex}
                canDeleteVertex={state && state.vertex ? canDeleteVertex(state, state.vertex) : false}
                onDeleteVertex={() => setState((s) => (s && s.vertex ? deleteVertex(s, s.vertex) : s))}
                onDesignator={(id, value) => setState(setDesignator(state, id, value))}
                onLampColor={(id, color) => setState(setLampColor(state, id, color))}
                onRotate={() => setState(rotateSelection(state))}
                onDelete={() => setState(deleteSelection(state))}
                onCableNumber={(ids, n) => setState(setCableNumber(state, ids, n))}
                readOnly={running}
                onAddJunction={(x, y) => setState(addJunction(state, x, y, JUNCTION_TEMPLATE ?? undefined))}
                onRemoveJunction={(id) => setState((s) => (s ? removeJunction(s, id) : s))}
                onFocusFinding={(f) => setHighlight({ ids: f.ids, at: f.at ?? null })}
                collapsibleSections={styleMode === 'moderno'}
              />
            </ResizablePanel>
          </Resizable>
        </div>

        <footer className="relative z-10 flex h-[26px] shrink-0 items-center gap-3.5 border-t border-border bg-card px-3 font-mono text-[11px] tabular-nums text-muted-foreground shadow-chrome-up">
          <span
            className={cn('size-1.5 shrink-0 rounded-full', state.dirty ? 'bg-warn' : 'bg-wire')}
            aria-hidden="true"
          />
          <span>{fileName}</span>
          <span>{project.records.length} registros</span>
          <span>{componentCount} componentes</span>
          <span>{wireCount} cables</span>
          <span>
            {project.sheets.length} hoja{project.sheets.length === 1 ? '' : 's'}
          </span>
          <span className="flex-1" />
          {built ? (
            <span>alimentación detectada</span>
          ) : (
            <span>sin alimentación en el dibujo</span>
          )}
          {simulation && (
            <Badge variant={simulation.stable ? 'secondary' : 'destructive'} className="h-4 px-1.5 text-[10px]">
              {simulation.stable ? 'simulación estable' : 'oscila'} · {simulation.energized.size}
            </Badge>
          )}
          {findings.length > 0 && (
            <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
              {findings.length} aviso{findings.length === 1 ? '' : 's'}
            </Badge>
          )}
          {state.selection.length > 0 && <span>{state.selection.length} seleccionados</span>}
          <span>{Math.round(zoom * 100)}%</span>
          {placing !== null && <span>colocando código {placing} · esc para salir</span>}
        </footer>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <SaveAsDialog
        open={saveAsOpen}
        initialName={fileName}
        onCancel={() => setSaveAsOpen(false)}
        onConfirm={saveAsConfirmed}
      />

      <Toaster theme={mode} position="top-center" />
    </TooltipProvider>
  );
}

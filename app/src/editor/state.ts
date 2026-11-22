/**
 * Estado del editor.
 *
 * Decisión central: la fuente de verdad es el TEXTO. Todo estado editable se
 * deriva de él, y cada operación produce un texto nuevo. Ventajas:
 *
 *  - el invariante de round-trip sigue siendo ejecutable: si una operación
 *    puede producir un texto que no re-parsea igual, es un bug del editor;
 *  - undo/redo es guardar textos, no un log de operaciones inversas que puede
 *    desincronizarse del modelo;
 *  - ninguna edición puede "inventar" campos: sólo reescribe el registro que
 *    tocó.
 *
 * La rotación visual del editor (`rotation`, por id) es una capa ENCIMA de la
 * orientación que trae el archivo (S6). Al girar, esa capa se pliega en el slot
 * `geometry[17]` y se escriben también las métricas `geometry[12..15]` de la
 * fórmulas verificadas por descompilación (`model/orientation.ts`). Se escribe
 * el slot junto con sus métricas: un slot sin éstas deja la pieza
 * in-seleccionable en CADe.
 */

import { parse } from '../format/cade.ts';
import {
  buildProject,
  modelOfRecord,
  nextId,
  serializeProject,
  serializeWith,
  withGeometry,
  withId,
  withLampColor,
  withPosition,
  withWirePoints,
  wirePoints,
  type LampColor,
  type WirePoints,
  boundsOf,
  GEOMETRY,
  type CadeRecordModel,
  type Project,
} from '../model/project.ts';
import { hasColorSlot } from '../model/component-spec.ts';
import {
  hasOrientationFields,
  type OrientationAction,
  type OrientationMetrics,
  nextMetrics,
  nextSlot,
} from '../model/orientation.ts';
import type { Rotation } from '../model/transform.ts';
import { CABLE_NUMBER_INDEX, JUNCTION_CODE, buildNetwork, cableNumberOf, cableSegments, netKey, nodeXY } from './network.ts';
import { attachPoints, type Point } from './pins.ts';
import { routeOrthogonal, type Box } from './wiring/router.ts';
import { normalizeOrthogonal, projectOnSegment } from './wiring/geometry.ts';
import { pathPoints, wirePathsOf } from './wiring/types.ts';

export type { Rotation };

export interface EditorState {
  text: string;
  past: string[];
  future: string[];
  /** ids de registros seleccionados */
  selection: number[];
  /**
   * Rotación visual por id, sumada a la del archivo. Se pliega en `geometry[17]`
   * al aplicar giro o espejo; en registros sin bloque de geometría completo
   * sigue sin guardarse.
   */
  rotation: Record<number, Rotation>;
  clipboard: string[];
  /** vértice enfocado para borrar, independiente de la selección de cables */
  vertex: Point | null;
  dirty: boolean;
}

/**
 * El documento quedó guardado: deja de figurar como sucio.
 *
 * No toca el texto, la selección ni el historial: guardar no edita nada. Es
 * sólo la marca que apaga el punto del pie, y la pone el guardado confirmado,
 * nunca un intento fallido.
 */
export function markSaved(state: EditorState): EditorState {
  return state.dirty ? { ...state, dirty: false } : state;
}

const HISTORY_LIMIT = 100;

export function createEditor(text: string): EditorState {
  return {
    text,
    past: [],
    future: [],
    selection: [],
    rotation: {},
    clipboard: [],
    vertex: null,
    dirty: false,
  };
}

// Memo de un solo registro: el editor construye el Project muchas veces sobre
// el mismo texto (cambiar la selección no cambia el documento). `Project` se
// trata como inmutable en todo el editor, así que reusar la instancia es seguro.
let projectCache: { text: string; project: Project } | null = null;

export function projectOf(state: EditorState): Project {
  if (projectCache !== null && projectCache.text === state.text) return projectCache.project;
  const project = buildProject(parse(state.text));
  projectCache = { text: state.text, project };
  return project;
}

function commit(state: EditorState, text: string, selection = state.selection): EditorState {
  if (text === state.text) return state;
  // Guarda de cordura: un texto que no re-parsea a ningún registro es una
  // edición corrupta y no debe entrar al historial. El conteo no se compara
  // porque borrar un cable de varios tramos quita varios registros de una vez.
  if (text.length === 0 || parse(text).records.length === 0) {
    throw new Error('edición inválida: el resultado no contiene registros');
  }
  const past = [...state.past, state.text].slice(-HISTORY_LIMIT);
  return { ...state, text, past, future: [], selection, dirty: true };
}

/**
 * Quita ramales muertos: puntos que antes tenían al menos dos conductores y
 * ahora uno solo, es decir el resto de un codo que el gesto dejó colgado. Los
 * puntos protegidos son los que el usuario está arrastrando: ahí una punta
 * suelta es parte del gesto, no un descuido.
 */
function pruneDeadStubs(before: CadeRecordModel[], text: string, protectPoints: Point[]): string {
  const afterProject = buildProject(parse(text));
  const afterNet = buildNetwork(afterProject.records);
  const beforeNet = buildNetwork(before);
  // Las claves llevan la hoja adelante (`0|42,486`); acá se comparan por
  // coordenada, que es lo que el usuario mueve.
  const protect = new Set(protectPoints.map((p) => `${p.x},${p.y}`));
  const deadIds = new Set<number>();
  const degreeAt = (net: ReturnType<typeof buildNetwork>, key: string): number => {
    const n = net.nodes.get(key);
    return n ? n.ends.length + n.through.length : 0;
  };
  for (const node of afterNet.nodes.values()) {
    if (node.pin || node.junction) continue;
    if (degreeAt(afterNet, node.key) !== 1) continue;
    if (protect.has(nodeXY(node.key))) continue;
    if (degreeAt(beforeNet, node.key) < 2) continue;
    const segId = node.ends[0];
    if (segId === undefined || deadIds.has(segId)) continue;
    const seg = afterNet.segments.get(segId);
    if (!seg) continue;
    const otherKey = seg.a === node.key ? seg.b : seg.a;
    const other = afterNet.nodes.get(otherKey);
    const otherDegree = other ? other.ends.length + other.through.length : 0;
    if (otherDegree < 2 && !other?.pin && !other?.junction) continue;
    deadIds.add(segId);
  }
  if (deadIds.size === 0) return text;
  return serializeProject({ ...afterProject, records: afterProject.records.filter((r) => !deadIds.has(r.id)) });
}

/**
 * Quita los 4001 que el gesto dejó sin cruce: tenían dos conductores antes y
 * ahora menos de dos. La comparación es ANTES/DESPUÉS, no un umbral absoluto,
 * porque un punto suelto puede ser una derivación puesta a propósito y el snap
 * la usa como imán. Se devuelve texto nuevo para entrar en el MISMO commit.
 */
function pruneOrphanJunctions(before: CadeRecordModel[], text: string): string {
  const after = buildProject(parse(text));
  const beforeNet = buildNetwork(before);
  const afterNet = buildNetwork(after.records);
  const dead = new Set<number>();

  for (const j of afterNet.junctionPoints) {
    const key = netKey(j.sheet, j.x, j.y);
    const now = afterNet.nodes.get(key);
    const was = beforeNet.nodes.get(key);
    // Sólo importa el pin AHORA: si el borne se movió, el 4001 quedó colgado.
    if (!now || !was || now.pin) continue;
    if (was.ends.length + was.through.length < 2) continue;
    if (now.ends.length + now.through.length >= 2) continue;
    for (const rec of after.records) {
      if (rec.code !== JUNCTION_CODE || rec.sheet !== j.sheet) continue;
      if (rec.geometry[8] !== j.x || rec.geometry[9] !== j.y) continue;
      dead.add(rec.id);
    }
  }

  if (dead.size === 0) return text;
  return serializeProject({ ...after, records: after.records.filter((r) => !dead.has(r.id)) });
}

/**
 * Encadena pasos de edición en UNA entrada de historial (transacción de
 * gesto). Cada paso corre sobre un borrador con el historial limpio; si algún
 * paso no cambia el documento, el gesto entero queda sin efecto. Con esto un
 * gesto confirmado genera un solo paso de deshacer sin limpiar
 * `past`/`future` a mano en cada llamada.
 */
function runSteps(state: EditorState, steps: Array<(s: EditorState) => EditorState>): EditorState {
  let draft: EditorState = { ...state, past: [], future: [] };
  for (const run of steps) {
    const next = run(draft);
    if (next.text === draft.text) return state;
    draft = next;
  }
  return commit(state, draft.text);
}

// --- historial ---------------------------------------------------------------

export function undo(state: EditorState): EditorState {
  const prev = state.past.at(-1);
  if (prev === undefined) return state;
  return {
    ...state,
    text: prev,
    past: state.past.slice(0, -1),
    future: [state.text, ...state.future].slice(0, HISTORY_LIMIT),
    selection: state.selection.filter((id) => parseRecordIds(prev).has(id)),
  };
}

export function redo(state: EditorState): EditorState {
  const next = state.future[0];
  if (next === undefined) return state;
  return {
    ...state,
    text: next,
    past: [...state.past, state.text].slice(-HISTORY_LIMIT),
    future: state.future.slice(1),
    selection: state.selection.filter((id) => parseRecordIds(next).has(id)),
  };
}

function parseRecordIds(text: string): Set<number> {
  return new Set(parse(text).records.map((r) => r.id));
}

// --- selección ---------------------------------------------------------------

export function select(state: EditorState, ids: number[], additive = false): EditorState {
  if (!additive) return { ...state, selection: [...new Set(ids)] };
  const set = new Set(state.selection);
  for (const id of ids) {
    if (set.has(id)) set.delete(id);
    else set.add(id);
  }
  return { ...state, selection: [...set] };
}

/** Enfoca un vértice (o lo suelta con `null`) sin tocar la selección de cables. */
export function selectVertex(state: EditorState, vertex: Point | null): EditorState {
  return { ...state, vertex };
}

export function clearSelection(state: EditorState): EditorState {
  return state.selection.length === 0 ? state : { ...state, selection: [] };
}

export function selectedRecords(state: EditorState): CadeRecordModel[] {
  const set = new Set(state.selection);
  return projectOf(state).records.filter((r) => set.has(r.id));
}

// --- operaciones sobre registros --------------------------------------------

interface IndexedRecord {
  index: number;
  rec: CadeRecordModel;
}

function indexed(project: Project): IndexedRecord[] {
  return project.records.map((rec, index) => ({ index, rec }));
}

/**
 * Mueve la selección. Los extremos de cable que coinciden exactamente con un
 * borne de un componente movido viajan con él: se acabó la regla provisional de
 * proximidad ±4, que arrastraba cables que sólo pasaban cerca de la caja.
 */
export function moveSelection(state: EditorState, dx: number, dy: number): EditorState {
  if (state.selection.length === 0 || (dx === 0 && dy === 0)) return state;
  const project = projectOf(state);
  const selected = new Set(state.selection);
  const pins = attachPoints(project.records);
  const movedPins = new Set<string>();
  for (const rec of project.records) {
    if (!selected.has(rec.id) || rec.kind !== 'component') continue;
    for (const p of pins.get(rec.id) ?? []) movedPins.add(`${p.x},${p.y}`);
  }
  const anchored = (x: number, y: number): boolean => movedPins.has(`${x},${y}`);

  const edits = new Map<number, string>();
  const appended: string[] = [];
  const protect: Point[] = [];
  let next = nextId(project);
  for (const { index, rec } of indexed(project)) {
    if (selected.has(rec.id) && rec.kind === 'component') {
      // El ancla del registro es su `x,y`: con orientación, el origen de la caja
      // dibujada no coincide con ella, así que mover toma la posición guardada.
      edits.set(index, withPosition(rec, rec.geometry[GEOMETRY.x]! + dx, rec.geometry[GEOMETRY.y]! + dy));
      continue;
    }
    if (rec.kind !== 'connection') continue;
    const pts = wirePoints(rec);
    if (!pts) continue;

    const moveA = anchored(pts.x1, pts.y1);
    const moveB = anchored(pts.x2, pts.y2);
    if (!moveA && !moveB) continue;
    const ax = moveA ? pts.x1 + dx : pts.x1;
    const ay = moveA ? pts.y1 + dy : pts.y1;
    const bx = moveB ? pts.x2 + dx : pts.x2;
    const by = moveB ? pts.y2 + dy : pts.y2;
    if (moveA) protect.push({ x: ax, y: ay });
    if (moveB) protect.push({ x: bx, y: by });

    const orthogonal = Math.abs(ax - bx) < AXIS_TOL || Math.abs(ay - by) < AXIS_TOL;
    if (orthogonal) {
      edits.set(index, withWirePoints(rec, { x1: ax, y1: ay, x2: bx, y2: by }));
      continue;
    }

    // El extremo que se movió quedó fuera de eje: se inserta un codo junto al
    // extremo QUIETO, conservando la orientación original de ese lado.
    const wasVertical = Math.abs(pts.x1 - pts.x2) < AXIS_TOL;
    const corner = moveB
      ? wasVertical
        ? { x: pts.x1, y: by }
        : { x: bx, y: pts.y1 }
      : wasVertical
        ? { x: pts.x2, y: ay }
        : { x: ax, y: pts.y2 };
    const fixedLeg = { x1: ax, y1: ay, x2: corner.x, y2: corner.y };
    const movingLeg = { x1: corner.x, y1: corner.y, x2: bx, y2: by };
    edits.set(index, withWirePoints(rec, fixedLeg));
    appended.push(
      withWirePoints({ ...rec, id: next, raw: withId(rec, next), geometry: [...rec.geometry] }, movingLeg),
    );
    next++;
  }

  return commit(
    state,
    pruneOrphanJunctions(
      project.records,
      pruneDeadStubs(project.records, serializeWith(project, edits) + appended.join(''), protect),
    ),
  );
}

/**
 * Materializa la capa visual en slot + métricas. La capa visual gira en el
 * espacio de la pantalla: sobre un componente con espejo eso equivale a girar
 * a la IZQUIERDA en el archivo, porque `R(v)·Mx = Mx·R(−v)`.
 */
function materializeVisual(rec: CadeRecordModel, visual: Rotation): { slot: number; metrics: OrientationMetrics } {
  let slot = Math.trunc(rec.geometry[GEOMETRY.transform] ?? 0) & 7;
  let metrics: OrientationMetrics = [
    rec.geometry[GEOMETRY.offsetX] ?? 0,
    rec.geometry[GEOMETRY.offsetY] ?? 0,
    rec.geometry[GEOMETRY.width] ?? 0,
    rec.geometry[GEOMETRY.height] ?? 0,
  ];
  const steps = ((Math.round(visual / 90) % 4) + 4) % 4;
  const fold: OrientationAction = (slot & 4) !== 0 ? 'rotate-left' : 'rotate-right';
  for (let i = 0; i < steps; i++) {
    slot = nextSlot(fold, slot);
    metrics = nextMetrics(fold, metrics);
  }
  return { slot, metrics };
}

/** Aplica giro o espejo a la selección y lo escribe como lo haría CADe. */
export function applyOrientation(state: EditorState, action: OrientationAction): EditorState {
  if (state.selection.length === 0) return state;
  const project = projectOf(state);
  const selected = new Set(state.selection);
  const rotation = { ...state.rotation };
  const edits = new Map<number, string>();

  for (const { index, rec } of indexed(project)) {
    if (!selected.has(rec.id) || rec.kind !== 'component') continue;
    if (!hasOrientationFields(rec.geometry.length)) {
      // Sin bloque de geometría completo no hay nada que escribir. Sólo el giro
      // tiene representación visual; el espejo no se puede dibujar sin slot.
      if (action === 'rotate-right' || action === 'rotate-left') {
        const step = action === 'rotate-right' ? 90 : -90;
        rotation[rec.id] = ((((rotation[rec.id] ?? 0) + step) % 360 + 360) % 360) as Rotation;
      }
      continue;
    }
    const current = materializeVisual(rec, rotation[rec.id] ?? 0);
    const slot = nextSlot(action, current.slot);
    const metrics = nextMetrics(action, current.metrics);
    const geometry = [...rec.geometry];
    geometry[GEOMETRY.offsetX] = metrics[0];
    geometry[GEOMETRY.offsetY] = metrics[1];
    geometry[GEOMETRY.width] = metrics[2];
    geometry[GEOMETRY.height] = metrics[3];
    geometry[GEOMETRY.transform] = slot;
    edits.set(index, withGeometry(rec, geometry));
    delete rotation[rec.id];
  }

  if (edits.size === 0) return { ...state, rotation, dirty: true };
  return commit({ ...state, rotation }, serializeWith(project, edits));
}

/** Giro horario (tecla R): mismo resultado que «Girar a la derecha» de CADe. */
export function rotateSelection(state: EditorState): EditorState {
  return applyOrientation(state, 'rotate-right');
}

/** Giro antihorario. */
export function rotateLeftSelection(state: EditorState): EditorState {
  return applyOrientation(state, 'rotate-left');
}

/** Espejo sobre el eje vertical / horizontal de CADe. */
export function mirrorSelection(state: EditorState, axis: 'h' | 'v'): EditorState {
  return applyOrientation(state, axis === 'h' ? 'mirror-h' : 'mirror-v');
}

export function deleteSelection(state: EditorState): EditorState {
  if (state.selection.length === 0) return state;
  const project = projectOf(state);
  const selected = new Set(state.selection);
  const removable = new Set(
    project.records
      .filter((r) => selected.has(r.id) && (r.kind === 'component' || r.kind === 'connection'))
      .map((r) => r.id),
  );
  if (removable.size === 0) return state;

  const magic = project.hasMagic ? 'CADe_SIMU' : '';
  const text = magic + project.prefix + project.records.filter((r) => !removable.has(r.id)).map((r) => r.raw).join('');
  const rotation = { ...state.rotation };
  for (const id of removable) delete rotation[id];
  return { ...commit(state, pruneOrphanJunctions(project.records, text), []), rotation };
}

export function copySelection(state: EditorState): EditorState {
  const selected = new Set(state.selection);
  const clipboard = projectOf(state)
    .records.filter((r) => selected.has(r.id) && (r.kind === 'component' || r.kind === 'connection'))
    .map((r) => r.raw);
  return { ...state, clipboard };
}

/**
 * Pega al final del archivo.
 *
 * El formato exige ids estrictamente crecientes en orden de archivo, así que no
 * se puede insertar en el medio sin renumerar todo lo posterior. Pegar al final
 * es la única posición segura; el registro nuevo queda en la última hoja.
 */
export function paste(state: EditorState, dx = 8, dy = 8): EditorState {
  if (state.clipboard.length === 0) return state;
  const project = projectOf(state);
  let id = nextId(project);
  const appended: string[] = [];
  const added: number[] = [];

  for (const raw of state.clipboard) {
    const template = project.records.find((r) => r.raw === raw) ?? parseOne(raw);
    if (!template) continue;
    let next = withId(template, id);
    if (template.kind === 'component') {
      // Igual que al mover: el desplazamiento se aplica sobre el ancla guardada.
      const b = boundsOf(template);
      if (b) {
        next = withPosition(
          { ...template, raw: next },
          template.geometry[GEOMETRY.x]! + dx,
          template.geometry[GEOMETRY.y]! + dy,
        );
      }
    } else {
      const pts = wirePoints(template);
      if (pts) {
        next = withWirePoints({ ...template, raw: next }, {
          x1: pts.x1 + dx,
          y1: pts.y1 + dy,
          x2: pts.x2 + dx,
          y2: pts.y2 + dy,
        });
      }
    }
    appended.push(next);
    added.push(id);
    id += 1;
  }

  if (appended.length === 0) return state;
  const magic = project.hasMagic ? 'CADe_SIMU' : '';
  const text = magic + project.prefix + project.records.map((r) => r.raw).join('') + appended.join('');
  return commit(state, text, added);
}

/**
 * Modela UN registro a partir de su texto completo.
 *
 * No alcanza con `parse(raw).records[0]`: la cola de la geometría puede imitar
 * una cabecera (`*15*16#`), y el parser cortaría el registro ahí perdiendo los
 * últimos campos. Cuando el llamador ya sabe que `raw` ES un registro entero,
 * se modela esa totalidad.
 */
function parseOne(raw: string): CadeRecordModel | null {
  const first = parse(raw).records[0];
  if (!first) return null;
  const fields = raw.split('#');
  return modelOfRecord({
    ...first,
    at: 0,
    raw,
    fields,
    designator: fields[1] ?? '',
  });
}

/** Siguiente designador libre para una plantilla: -M1, -M2, … */
function freeDesignator(used: Set<string>, template: string): string {
  const m = /^(.*?)(\d*)$/.exec(template);
  const prefix = m?.[1] ?? template;
  let n = Number.parseInt(m?.[2] ?? '', 10);
  if (!Number.isFinite(n)) n = 1;
  let candidate = `${prefix}${n}`;
  while (used.has(candidate)) candidate = `${prefix}${++n}`;
  return candidate;
}

/** Inserta un componente nuevo a partir de una plantilla real del archivo. */
export function addComponent(state: EditorState, templateRaw: string, x: number, y: number): EditorState {
  const project = projectOf(state);
  const id = nextId(project);
  const template = parseOne(templateRaw);
  if (!template || template.kind !== 'component') return state;
  // El designador no puede repetirse: si -M1 ya existe, entra como -M2.
  const used = new Set(project.records.map((r) => r.designator).filter((d) => d !== ''));
  const fields = template.raw.split('#');
  if (fields[1]) fields[1] = freeDesignator(used, fields[1]);
  const named = { ...template, raw: fields.join('#'), designator: fields[1] ?? '' };
  const raw = withPosition({ ...named, raw: withId(named, id) }, Math.round(x), Math.round(y));
  const magic = project.hasMagic ? 'CADe_SIMU' : '';
  const text = magic + project.prefix + project.records.map((r) => r.raw).join('') + raw;
  return commit(state, text, [id]);
}

/** Renombra el designador del único registro seleccionado. */
export function setDesignator(state: EditorState, id: number, designator: string): EditorState {
  const project = projectOf(state);
  const entry = indexed(project).find(({ rec }) => rec.id === id);
  if (!entry || entry.rec.kind === 'text') return state;
  const fields = entry.rec.raw.split('#');
  if (fields.length < 2) return state;
  fields[1] = designator;
  const edits = new Map([[entry.index, fields.join('#')]]);
  return commit(state, serializeWith(project, edits));
}

/**
 * Cambia el color de la señalización óptica (el menú "Indicador color" de
 * CADe_SIMU). Sólo aplica a los códigos con slot de color; el resto de las
 * lámparas no escribe nada.
 */
export function setLampColor(state: EditorState, id: number, color: LampColor): EditorState {
  const project = projectOf(state);
  const entry = indexed(project).find(({ rec }) => rec.id === id);
  if (!entry || entry.rec.kind !== 'component' || !hasColorSlot(entry.rec.code)) return state;
  const raw = withLampColor(entry.rec, color);
  if (raw === entry.rec.raw) return state;
  const edits = new Map([[entry.index, raw]]);
  return commit(state, serializeWith(project, edits));
}

// --- cables (fase 3) ---------------------------------------------------------

/**
 * Un cable lógico con quiebres son varios registros que comparten número.
 * Seleccionar uno selecciona el cable entero: es lo que el usuario ve como
 * "un cable", no como tres tramos sueltos.
 */
export function selectCable(state: EditorState, segmentId: number): EditorState {
  const network = buildNetwork(projectOf(state).records);
  const ids = cableSegments(network, segmentId);
  return select(state, ids.length > 0 ? ids : [segmentId]);
}

/** Devuelve `raw` con el número de cable reemplazado. */
export function withCableNumber(rec: CadeRecordModel, cable: number): string {
  const g = [...rec.geometry];
  if (g.length <= CABLE_NUMBER_INDEX) return rec.raw;
  g[CABLE_NUMBER_INDEX] = cable;
  return withGeometry(rec, g);
}

export function setCableNumber(state: EditorState, ids: number[], cable: number): EditorState {
  const project = projectOf(state);
  const edits = new Map<number, string>();
  project.records.forEach((rec, index) => {
    if (ids.includes(rec.id) && rec.kind === 'connection') edits.set(index, withCableNumber(rec, cable));
  });
  if (edits.size === 0) return state;
  return commit(state, serializeWith(project, edits));
}

const AXIS_TOL = 0.01;
const isOrthogonal = (a: { x: number; y: number }, b: { x: number; y: number }): boolean =>
  Math.abs(a.x - b.x) < AXIS_TOL || Math.abs(a.y - b.y) < AXIS_TOL;

/**
 * Mueve un extremo de cable.
 *
 * Si el destino deja el tramo ortogonal, se reescribe el registro. Si no, el
 * tramo se parte en un codo: el registro original conserva la orientación que
 * tenía y el segundo tramo se agrega al final del archivo, con el mismo número
 * de cable. Así el resultado sigue siendo un cable legible por CADe_SIMU.
 */
export function moveEndpoint(state: EditorState, id: number, end: 0 | 1, x: number, y: number): EditorState {
  const project = projectOf(state);
  const index = project.records.findIndex((r) => r.id === id);
  if (index === -1) return state;
  const rec = project.records[index]!;
  const pts = wirePoints(rec);
  if (!pts) return state;

  const fixed = end === 0 ? { x: pts.x2, y: pts.y2 } : { x: pts.x1, y: pts.y1 };
  const target = { x, y };
  if (Math.abs(fixed.x - target.x) < AXIS_TOL && Math.abs(fixed.y - target.y) < AXIS_TOL) return state;

  const edits = new Map<number, string>();
  if (isOrthogonal(fixed, target)) {
    const next =
      end === 0
        ? { x1: target.x, y1: target.y, x2: pts.x2, y2: pts.y2 }
        : { x1: pts.x1, y1: pts.y1, x2: target.x, y2: target.y };
    edits.set(index, withWirePoints(rec, next));
    return commit(
      state,
      pruneOrphanJunctions(
        project.records,
        pruneDeadStubs(project.records, serializeWith(project, edits), [target]),
      ),
    );
  }

  // El codo va junto al extremo que NO se mueve, para que el tramo que se
  // arrastra conserve su orientación y el cable se vea desplazarse.
  const wasVertical = Math.abs(pts.x1 - pts.x2) < AXIS_TOL;
  const corner = wasVertical ? { x: target.x, y: fixed.y } : { x: fixed.x, y: target.y };
  if (!isOrthogonal(fixed, corner) || !isOrthogonal(corner, target)) return state;

  const leg1 =
    end === 0
      ? { x1: corner.x, y1: corner.y, x2: pts.x2, y2: pts.y2 }
      : { x1: pts.x1, y1: pts.y1, x2: corner.x, y2: corner.y };
  edits.set(index, withWirePoints(rec, leg1));

  const newId = nextId(project);
  const clone: CadeRecordModel = { ...rec, id: newId, raw: withId(rec, newId), geometry: [...rec.geometry] };
  const leg2 = withWirePoints({ ...clone, raw: withCableNumber(clone, cableNumberOf(rec)) }, {
    x1: corner.x,
    y1: corner.y,
    x2: target.x,
    y2: target.y,
  });
  const text =
    (project.hasMagic ? 'CADe_SIMU' : '') +
    project.prefix +
    project.records.map((r, i) => edits.get(i) ?? r.raw).join('') +
    leg2;
  return commit(state, pruneOrphanJunctions(project.records, pruneDeadStubs(project.records, text, [target])), [
    id,
    newId,
  ]);
}

/**
 * Mueve un VÉRTICE de la red, no el extremo de un registro.
 *
 * Un vértice interior lo comparten dos tramos. Mover sólo uno los desconecta:
 * el otro queda clavado en el punto viejo y aparece un tramo suelto, que es
 * exactamente lo que se ve como "se agregó otro vértice en vez de moverse".
 *
 * Acá se mueven todos los extremos que caen en el punto, cada uno conservando
 * su orientación: si el destino rompe la ortogonalidad, ese tramo se parte en
 * un codo. Todo entra en una sola operación de deshacer.
 */
export function moveVertex(state: EditorState, from: Point, to: Point, sheet = 0): EditorState {
  if (Math.abs(from.x - to.x) < AXIS_TOL && Math.abs(from.y - to.y) < AXIS_TOL) return state;
  const project = projectOf(state);
  let id = nextId(project);

  const signature = (a: Point, b: Point): string => {
    const [p, q] = a.x < b.x || (a.x === b.x && a.y <= b.y) ? [a, b] : [b, a];
    return `${p.x},${p.y},${q.x},${q.y}`;
  };
  const point = (x: number, y: number): Point => ({ x, y });

  interface Built {
    index: number | null;
    newId: number | null;
    raw: string;
    sig: string;
  }
  const built: Built[] = [];
  const used = new Set<string>();

  project.records.forEach((rec, index) => {
    const pts = wirePoints(rec);
    if (!pts) return;

    const atA = Math.abs(pts.x1 - from.x) < AXIS_TOL && Math.abs(pts.y1 - from.y) < AXIS_TOL;
    const atB = Math.abs(pts.x2 - from.x) < AXIS_TOL && Math.abs(pts.y2 - from.y) < AXIS_TOL;
    if (!atA && !atB) return;

    const fixed = atA ? point(pts.x2, pts.y2) : point(pts.x1, pts.y1);
    if (Math.abs(fixed.x - to.x) < AXIS_TOL && Math.abs(fixed.y - to.y) < AXIS_TOL) return;

    const wasVertical = Math.abs(pts.x1 - pts.x2) < AXIS_TOL;
      const pushLeg = (leg: WirePoints, isExtra: boolean): void => {
      const sig = signature(point(leg.x1, leg.y1), point(leg.x2, leg.y2));
      if (isExtra && used.has(sig)) return;
      used.add(sig);
      if (!isExtra) {
        built.push({ index, newId: null, raw: withWirePoints(rec, leg), sig });
        return;
      }
      const clone: CadeRecordModel = { ...rec, id, raw: withId(rec, id), geometry: [...rec.geometry] };
      built.push({
        index: null,
        newId: id,
        raw: withWirePoints({ ...clone, raw: withCableNumber(clone, cableNumberOf(rec)) }, leg),
        sig,
      });
      id += 1;
    };

    if (isOrthogonal(fixed, to)) {
      pushLeg({ x1: fixed.x, y1: fixed.y, x2: to.x, y2: to.y }, false);
      return;
    }

    // Dos codos posibles. Se prefiere el que deja el codo junto al extremo
    // quieto, así el tramo que se arrastra mantiene su orientación y el cable
    // se ve moverse en vez de sólo aparecer una línea.
    //
    // Con el codo del otro lado, arrastrar hacia la derecha el extremo inferior
    // de un cable vertical dejaba la vertical intacta y agregaba un tramo
    // horizontal abajo: parecía que no había pasado nada.
    const preferred = wasVertical ? point(to.x, fixed.y) : point(fixed.x, to.y);
    const alternate = wasVertical ? point(fixed.x, to.y) : point(to.x, fixed.y);
    let corner: Point | null = null;
    for (const candidate of [preferred, alternate]) {
      if (!isOrthogonal(fixed, candidate) || !isOrthogonal(candidate, to)) continue;
      if (Math.abs(candidate.x - to.x) < AXIS_TOL && Math.abs(candidate.y - to.y) < AXIS_TOL) continue;
      if (!used.has(signature(candidate, to))) {
        corner = candidate;
        break;
      }
    }
    corner ??= preferred;
    pushLeg({ x1: fixed.x, y1: fixed.y, x2: corner.x, y2: corner.y }, false);
    pushLeg({ x1: corner.x, y1: corner.y, x2: to.x, y2: to.y }, true);
  });

  if (built.length === 0) return state;

  // Descarte final. Se compara contra TODOS los tramos del archivo, no sólo los
  // generados acá: al volver un extremo a su lugar se genera un tramo idéntico
  // al que ya existía, y dejarlo produce dos cables superpuestos.
  const seen = new Set<string>();
  for (const [index, rec] of project.records.entries()) {
    if (built.some((b) => b.index === index)) continue;
    const pts = wirePoints(rec);
    if (!pts) continue;
    seen.add(signature(point(pts.x1, pts.y1), point(pts.x2, pts.y2)));
  }

  const edits = new Map<number, string>();
  const removed = new Set<number>();
  const appended: { id: number; raw: string }[] = [];
  for (const item of built) {
    if (seen.has(item.sig)) {
      if (item.index !== null) removed.add(item.index);
      continue;
    }
    seen.add(item.sig);
    if (item.index === null && item.newId !== null) appended.push({ id: item.newId, raw: item.raw });
    else edits.set(item.index!, item.raw);
  }

  const compose = (dead: Set<number>): string =>
    (project.hasMagic ? 'CADe_SIMU' : '') +
    project.prefix +
    project.records
      .map((r, i) => ({ r, i }))
      .filter(({ r, i }) => !removed.has(i) && !dead.has(r.id))
      .map(({ r, i }) => edits.get(i) ?? r.raw)
      .join('') +
    appended
      .filter((a) => !dead.has(a.id))
      .map((a) => a.raw)
      .join('');

  const firstPass = compose(new Set());

  const finalText = pruneOrphanJunctions(
    project.records,
    simplifyCollinear(pruneDeadStubs(project.records, firstPass, [from, to])),
  );
  const next = commit(state, finalText);

  // La selección tiene que seguir al cable: si no, después de mover un extremo
  // los handles quedan en los lugares viejos y el siguiente arrastre agarra
  // otra cosa. Se seleccionan todos los tramos del cable que toca el destino.
  const net = buildNetwork(buildProject(parse(finalText)).records);
  const target = netKey(sheet, to.x, to.y);
  const cables = new Set<number>();
  const loose = new Set<number>();
  for (const seg of net.segments.values()) {
    if (seg.a !== target && seg.b !== target) continue;
    if (seg.cable === 0) loose.add(seg.id);
    else cables.add(seg.cable);
  }
  const selected = [...net.segments.values()]
    .filter((seg) => seg.sheet === sheet)
    .filter((seg) => (seg.cable === 0 ? loose.has(seg.id) : cables.has(seg.cable)))
    .map((seg) => seg.id);
  return selected.length > 0 ? { ...next, selection: selected } : next;
}

/**
 * Disuelve vértices que quedaron sobre una recta: dos tramos colineales que se
 * tocan en un punto sin borne ni unión son, en realidad, un solo tramo.
 *
 * Sin esto, al devolver un doblez a la recta el vértice quedaba plantado aunque
 * ya no doblara nada, y seguía mostrando un handle en el medio del cable.
 */
function simplifyCollinear(text: string): string {
  let current = text;
  for (let guard = 0; guard < 64; guard++) {
    const project = buildProject(parse(current));
    const net = buildNetwork(project.records);
    let merged = false;

    for (const node of net.nodes.values()) {
      if (node.pin || node.junction) continue;
      if (node.ends.length !== 2 || node.through.length > 0) continue;
      const a = net.segments.get(node.ends[0]!);
      const b = net.segments.get(node.ends[1]!);
      if (!a || !b || a.cable !== b.cable) continue;

      const aV = Math.abs(a.points.x1 - a.points.x2) < AXIS_TOL;
      const bV = Math.abs(b.points.x1 - b.points.x2) < AXIS_TOL;
      const aH = Math.abs(a.points.y1 - a.points.y2) < AXIS_TOL;
      const bH = Math.abs(b.points.y1 - b.points.y2) < AXIS_TOL;
      const collinear =
        (aV && bV && Math.abs(a.points.x1 - b.points.x1) < AXIS_TOL) ||
        (aH && bH && Math.abs(a.points.y1 - b.points.y1) < AXIS_TOL);
      if (!collinear) continue;

      const far = (seg: typeof a, key: string): Point =>
        seg.a === key ? { x: seg.points.x2, y: seg.points.y2 } : { x: seg.points.x1, y: seg.points.y1 };
      const pa = far(a, node.key);
      const pb = far(b, node.key);

      const indexA = project.records.findIndex((r) => r.id === a.id);
      const indexB = project.records.findIndex((r) => r.id === b.id);
      if (indexA === -1 || indexB === -1) continue;

      const raw = withWirePoints(project.records[indexA]!, { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y });
      current =
        (project.hasMagic ? 'CADe_SIMU' : '') +
        project.prefix +
        project.records
          .map((r, i) => (i === indexA ? raw : r.raw))
          .filter((_, i) => i !== indexB)
          .join('');
      merged = true;
      break;
    }

    if (!merged) break;
  }
  return current;
}

/** ¿Se puede borrar este vértice uniendo sus dos tramos en una sola recta? */
export function canDeleteVertex(state: EditorState, point: Point): boolean {
  return vertexMergeOf(state, point.x, point.y) !== null;
}

/** Borra el vértice indicado, uniendo los tramos que lo tocaban. */
export function deleteVertex(state: EditorState, point: Point): EditorState {
  const merged = mergeVertex(state, point.x, point.y);
  // Si no se pudo unir, conservar el foco: el Inspector tiene que poder mostrar
  // por qué. Antes se limpiaba igual y parecía que había borrado algo.
  if (merged.text === state.text) return state;
  return { ...merged, vertex: null };
}

/** Inserta un vértice partiendo el tramo en dos. */
export function insertVertex(state: EditorState, id: number, x: number, y: number): EditorState {
  const project = projectOf(state);
  const index = project.records.findIndex((r) => r.id === id);
  if (index === -1) return state;
  const rec = project.records[index]!;
  const pts = wirePoints(rec);
  if (!pts) return state;

  const onLine =
    (Math.abs(pts.x1 - pts.x2) < AXIS_TOL && Math.abs(x - pts.x1) < AXIS_TOL) ||
    (Math.abs(pts.y1 - pts.y2) < AXIS_TOL && Math.abs(y - pts.y1) < AXIS_TOL);
  if (!onLine) return state;

  const edits = new Map<number, string>();
  edits.set(index, withWirePoints(rec, { x1: pts.x1, y1: pts.y1, x2: x, y2: y }));

  const newId = nextId(project);
  const clone: CadeRecordModel = { ...rec, id: newId, raw: withId(rec, newId), geometry: [...rec.geometry] };
  const tail = withWirePoints(clone, { x1: x, y1: y, x2: pts.x2, y2: pts.y2 });
  const text =
    (project.hasMagic ? 'CADe_SIMU' : '') +
    project.prefix +
    project.records.map((r, i) => edits.get(i) ?? r.raw).join('') +
    tail;
  return commit(state, text, [id, newId]);
}

/**
 * Elimina un vértice interior uniendo los dos tramos colineales que lo tocan.
 * Si los tramos no son colineales no hay nada que unir: unirlos crearía una
 * diagonal que el formato no usa.
 */
interface VertexMerge {
  a: Point;
  b: Point;
  first: { rec: CadeRecordModel; index: number };
  second: { rec: CadeRecordModel; index: number };
}

/** Analiza el punto y describe cómo se unirían sus dos tramos, o `null`. */
function vertexMergeOf(state: EditorState, x: number, y: number): VertexMerge | null {
  const project = projectOf(state);
  const touching = project.records
    .map((rec, index) => ({ rec, index }))
    .filter(({ rec }) => {
      const pts = wirePoints(rec);
      return (
        pts !== null &&
        ((Math.abs(pts.x1 - x) < AXIS_TOL && Math.abs(pts.y1 - y) < AXIS_TOL) ||
          (Math.abs(pts.x2 - x) < AXIS_TOL && Math.abs(pts.y2 - y) < AXIS_TOL))
      );
    });

  if (touching.length !== 2) return null;
  const [first, second] = touching as [typeof touching[0], typeof touching[0]];
  const p1 = wirePoints(first.rec)!;
  const p2 = wirePoints(second.rec)!;

  const outer = (pts: typeof p1): Point =>
    Math.abs(pts.x1 - x) < AXIS_TOL && Math.abs(pts.y1 - y) < AXIS_TOL
      ? { x: pts.x2, y: pts.y2 }
      : { x: pts.x1, y: pts.y1 };

  const a = outer(p1);
  const b = outer(p2);
  // Una esquina en L también se une: el resultado es un tramo diagonal, que el
  // formato admite. Exigir ortogonalidad hacía que 'borrar vértice' no hiciera
  // nada justo en los vértices que el propio editor crea al doblar un cable.
  return { a, b, first, second };
}

export function mergeVertex(state: EditorState, x: number, y: number): EditorState {
  const plan = vertexMergeOf(state, x, y);
  if (!plan) return state;
  const { a, b, first, second } = plan;
  const project = projectOf(state);
  const merged = withWirePoints(first.rec, { x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  // Se reemplaza ANTES de filtrar: al revés, sacar un registro corre los índices
  // y el tramo unido se escribía sobre otro registro, borrando la línea.
  const text =
    (project.hasMagic ? 'CADe_SIMU' : '') +
    project.prefix +
    project.records
      .map((r, i) => (i === first.index ? merged : r.raw))
      .filter((_, i) => i !== second.index)
      .join('');
  return commit(state, pruneOrphanJunctions(project.records, text), [first.rec.id]);
}

/**
 * Plan de reescritura de una polilínea. Los tramos existentes se reescriben
 * **en su lugar** (mismo id y misma posición en el archivo); sólo los tramos
 * nuevos se anexan al final con ids `max+1`. Es obligatorio: el formato exige
 * ids estrictamente crecientes y el parser descarta lo que no encaja, así que
 * re-anexar ids viejos borraba el cable movido y corrompía el último registro.
 */
interface PolylineEdit {
  /** raw nuevo por índice original: registros reutilizados en su posición */
  edits: Map<number, string>;
  /** tramos nuevos, al final del archivo, con ids mayores que todos */
  appended: string[];
  /** ids de los tramos que sobran y se quitan */
  removed: Set<number>;
  /** ids de la polilínea nueva, en orden */
  ids: number[];
}

function polylineEdit(
  project: Project,
  segmentIds: number[],
  points: Point[],
  allocId: () => number,
): PolylineEdit | null {
  const byId = new Map(project.records.map((r, index) => [r.id, { rec: r, index }]));
  const existing = segmentIds
    .map((id) => byId.get(id))
    .filter((entry): entry is { rec: CadeRecordModel; index: number } => entry !== undefined);
  if (existing.length === 0 || points.length < 2) return null;

  const needed = points.length - 1;
  const edits = new Map<number, string>();
  const appended: string[] = [];
  const removed = new Set<number>();
  const ids: number[] = [];
  for (let i = 0; i < needed; i++) {
    const geometry = {
      x1: points[i]!.x,
      y1: points[i]!.y,
      x2: points[i + 1]!.x,
      y2: points[i + 1]!.y,
    };
    const reuse = existing[i];
    if (reuse) {
      edits.set(reuse.index, withWirePoints(reuse.rec, geometry));
      ids.push(reuse.rec.id);
      continue;
    }
    const template = existing[0]!.rec;
    const id = allocId();
    const clone: CadeRecordModel = { ...template, id, raw: withId(template, id), geometry: [...template.geometry] };
    appended.push(withWirePoints(clone, geometry));
    ids.push(id);
  }
  for (let i = needed; i < existing.length; i++) removed.add(existing[i]!.rec.id);
  return { edits, appended, removed, ids };
}

function writePolyline(state: EditorState, segmentIds: number[], points: Point[]): EditorState {
  const project = projectOf(state);
  let next = nextId(project);
  const edit = polylineEdit(project, segmentIds, points, () => next++);
  if (!edit) return state;
  const text =
    (project.hasMagic ? 'CADe_SIMU' : '') +
    project.prefix +
    project.records
      .map((rec, index) => ({ rec, index }))
      .filter(({ rec }) => !edit.removed.has(rec.id))
      .map(({ rec, index }) => edit.edits.get(index) ?? rec.raw)
      .join('') +
    edit.appended.join('');
  return commit(state, text, edit.ids);
}

const nearPoint = (a: Point, b: Point): boolean =>
  Math.abs(a.x - b.x) < AXIS_TOL && Math.abs(a.y - b.y) < AXIS_TOL;

/**
 * Raws de los `4001` que hacen falta donde un extremo cae en el INTERIOR de
 * otro tramo (T). Un cruce sin extremo no genera unión: en eléctrico cruzar sin
 * punto no conecta.
 */
function teeJunctionRaws(
  project: Project,
  points: Point[],
  templateRaw: string | undefined,
  allocId: () => number,
): string[] {
  if (!templateRaw) return [];
  const template = parseOne(templateRaw);
  if (!template) return [];
  const existing = new Set(buildNetwork(project.records).junctionPoints.map((p) => `${p.x},${p.y}`));
  const raws: string[] = [];
  for (const point of points) {
    const key = `${point.x},${point.y}`;
    if (existing.has(key)) continue;
    const onInterior = project.records.some((rec) => {
      if (rec.kind !== 'connection') return false;
      const pts = wirePoints(rec);
      if (!pts || (pts.x1 === pts.x2 && pts.y1 === pts.y2)) return false;
      const projection = projectOnSegment(point, {
        a: { x: pts.x1, y: pts.y1 },
        b: { x: pts.x2, y: pts.y2 },
      });
      return projection.t > 0.01 && projection.t < 0.99 && projection.distance < AXIS_TOL;
    });
    if (!onInterior) continue;
    existing.add(key);
    const g = [...template.geometry];
    g[GEOMETRY.x] = point.x;
    g[GEOMETRY.y] = point.y;
    if (g.length > GEOMETRY.x2) g[GEOMETRY.x2] = point.x;
    if (g.length > GEOMETRY.y2) g[GEOMETRY.y2] = point.y;
    raws.push(withGeometry({ ...template, raw: withId(template, allocId()) }, g));
  }
  return raws;
}

/**
 * Mueve un tramo. Si es interior, desplaza sus dos vértices en perpendicular e
 * inserta los codos de entrada/salida para que los tramos vecinos sigan siendo
 * ortogonales. Si es extremo, delega en `bendCable`: inserta un codo sin mover
 * el borne. Patrón `moveSegment` de Excalidraw, adaptado al formato CADe.
 */
export function moveSegment(state: EditorState, id: number, at: Point, to: Point, sheet = 0): EditorState {
  const project = projectOf(state);
  const net = buildNetwork(project.records);
  const path = wirePathsOf(net).find((p) => p.segmentIds.includes(id));
  if (!path) return state;
  const points = pathPoints(net, path);
  const index = path.segmentIds.indexOf(id);
  const p = points[index]!;
  const q = points[index + 1]!;
  if (!p || !q) return state;

  const vertical = Math.abs(p.x - q.x) < AXIS_TOL;
  const newValue = vertical ? to.x : to.y;
  const oldValue = vertical ? p.x : p.y;
  if (Math.abs(newValue - oldValue) < AXIS_TOL) return state;

  // Tramo extremo: el borne no se mueve, se inserta un codo (S2).
  if (index === 0 || index === points.length - 2) return bendCable(state, id, at, to, sheet);

  const movedP = vertical ? { x: newValue, y: p.y } : { x: p.x, y: newValue };
  const movedQ = vertical ? { x: newValue, y: q.y } : { x: q.x, y: newValue };
  const out: Point[] = points.slice(0, index);
  const a = points[index - 1]!;
  const bendA = vertical ? { x: a.x, y: movedP.y } : { x: movedP.x, y: a.y };
  if (!nearPoint(bendA, a) && !nearPoint(bendA, movedP)) out.push(bendA);
  out.push(movedP, movedQ);
  const b = points[index + 2]!;
  const bendB = vertical ? { x: b.x, y: movedQ.y } : { x: movedQ.x, y: b.y };
  if (!nearPoint(bendB, movedQ) && !nearPoint(bendB, b)) out.push(bendB);
  out.push(...points.slice(index + 2));
  return writePolyline(state, path.segmentIds, normalizeOrthogonal(out));
}

/** Inserta un tramo de cable entre dos puntos. */
export function addWire(
  state: EditorState,
  from: Point,
  to: Point,
  templateRaw: string,
  junctionTemplateRaw?: string,
): EditorState {
  if (from.x === to.x && from.y === to.y) return state;
  const project = projectOf(state);
  const template = parseOne(templateRaw);
  if (!template || template.kind === 'component') return state;
  let next = nextId(project);
  const id = next++;
  const g = [...template.geometry];
  g[GEOMETRY.x] = Math.round(from.x);
  g[GEOMETRY.y] = Math.round(from.y);
  if (g.length > GEOMETRY.x2) g[GEOMETRY.x2] = Math.round(to.x);
  if (g.length > GEOMETRY.y2) g[GEOMETRY.y2] = Math.round(to.y);
  const raw = withGeometry({ ...template, raw: withId(template, id) }, g);
  const junctions = teeJunctionRaws(project, [from, to], junctionTemplateRaw, () => next++).join('');
  const text =
    (project.hasMagic ? 'CADe_SIMU' : '') +
    project.prefix +
    project.records.map((r) => r.raw).join('') +
    raw +
    junctions;
  return commit(state, pruneOrphanJunctions(project.records, text), [id]);
}

/**
 * Dibuja un cable ortogonal entre dos puntos usando el router (F1). Escribe un
 * registro 4xxx por tramo, todos con el mismo número de cable nuevo, y entra
 * al historial como una sola operación. Los extremos son exactos.
 */
export function addRoutedWire(
  state: EditorState,
  from: Point,
  to: Point,
  obstacles: readonly Box[],
  templateRaw: string,
  junctionTemplateRaw?: string,
): EditorState {
  const project = projectOf(state);
  const template = parseOne(templateRaw);
  if (!template || template.kind === 'component') return state;
  const route = routeOrthogonal({ from, to, obstacles });
  if (route.waypoints.length < 2) return state;

  const cable = Math.max(0, ...project.records.filter((r) => r.kind === 'connection').map(cableNumberOf)) + 1;
  let next = nextId(project);
  const raws: string[] = [];
  const addedIds: number[] = [];
  for (let i = 0; i + 1 < route.waypoints.length; i++) {
    const a = route.waypoints[i]!;
    const b = route.waypoints[i + 1]!;
    const record: CadeRecordModel = {
      ...template,
      id: next,
      raw: withId(template, next),
      geometry: [...template.geometry],
    };
    const numbered = parseOne(withCableNumber(record, cable)) ?? record;
    raws.push(withWirePoints(numbered, { x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
    addedIds.push(next);
    next++;
  }
  const ends = [route.waypoints[0]!, route.waypoints.at(-1)!];
  const junctions = teeJunctionRaws(project, ends, junctionTemplateRaw, () => next++).join('');
  const text =
    (project.hasMagic ? 'CADe_SIMU' : '') +
    project.prefix +
    project.records.map((r) => r.raw).join('') +
    raws.join('') +
    junctions;
  return commit(state, pruneOrphanJunctions(project.records, text), addedIds);
}

/** Borra el registro 4001 indicado (acción del aviso `orphan-junction`). */
export function removeJunction(state: EditorState, id: number): EditorState {
  const project = projectOf(state);
  const rec = project.records.find((r) => r.id === id);
  if (!rec || rec.code !== JUNCTION_CODE) return state;
  const text =
    (project.hasMagic ? 'CADe_SIMU' : '') +
    project.prefix +
    project.records
      .filter((r) => r.id !== id)
      .map((r) => r.raw)
      .join('');
  return commit(state, text, []);
}

/** Agrega un registro de unión (4001) en el punto indicado. */
export function addJunction(state: EditorState, x: number, y: number, templateRaw: string | undefined): EditorState {
  if (!templateRaw) return state;
  const project = projectOf(state);
  const template = parseOne(templateRaw);
  if (!template) return state;
  const id = nextId(project);
  const g = [...template.geometry];
  g[GEOMETRY.x] = x;
  g[GEOMETRY.y] = y;
  if (g.length > GEOMETRY.x2) g[GEOMETRY.x2] = x;
  if (g.length > GEOMETRY.y2) g[GEOMETRY.y2] = y;
  const raw = withGeometry({ ...template, raw: withId(template, id) }, g);
  const text =
    (project.hasMagic ? 'CADe_SIMU' : '') + project.prefix + project.records.map((r) => r.raw).join('') + raw;
  return commit(state, text, [id]);
}

/** Operación de arrastre, para previsualizar y confirmar con el mismo código. */
/**
 * Arrastrar el cuerpo de un cable: inserta un vértice en el punto agarrado y lo
 * mueve con el cursor, en UNA sola operación de deshacer.
 *
 * Es la interacción que hace que un cable se sienta un cable: agarrás en
 * cualquier punto y el cable se dobla ahí. Sin esto, arrastrar el cable no hacía
 * nada y parecía que la app estaba rota.
 */
/**
 * Doblaza el cable: inserta un vértice en `at` y lo mueve a `to`. La
 * transacción formal deja un solo paso de deshacer para todo el gesto.
 */
export function bendCable(state: EditorState, id: number, at: Point, to: Point, sheet = 0): EditorState {
  return runSteps(state, [
    (s) => insertVertex(s, id, at.x, at.y),
    (s) => moveVertex(s, at, to, sheet),
  ]);
}

export type DragOp =
  | { kind: 'move'; dx: number; dy: number }
  | { kind: 'vertex'; from: Point; to: Point; sheet?: number }
  | { kind: 'bend'; id: number; at: Point; to: Point; sheet?: number }
  | { kind: 'segment'; id: number; at: Point; to: Point; sheet?: number };

export function applyDrag(state: EditorState, op: DragOp): EditorState {
  if (op.kind === 'move') return moveSelection(state, op.dx, op.dy);
  if (op.kind === 'vertex') return moveVertex(state, op.from, op.to, op.sheet ?? 0);
  if (op.kind === 'segment') return moveSegment(state, op.id, op.at, op.to, op.sheet ?? 0);
  return bendCable(state, op.id, op.at, op.to, op.sheet ?? 0);
}

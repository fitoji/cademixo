/**
 * Modelo de dominio de Electro-Simulador.
 *
 * Principio: el `Project` es una VISTA sobre los registros crudos del archivo,
 * no una reconstrucción. Cada registro conserva su texto original, y la
 * serialización concatena esos raw en orden. Consecuencias:
 *
 *  - abrir → modelar → serializar devuelve los mismos bytes siempre;
 *  - editar es reemplazar un registro, no regenerar el archivo;
 *  - un código desconocido nunca se pierde: sigue siendo un registro opaco.
 *
 * Layout de un registro de componente (12 campos al partir el raw por '#'):
 *   [0]  *<id>*<código>
 *   [1]  designador (texto libre: "-KM1", "KM1", "RELE", "ITM")
 *   [2]  vacío
 *   [3..] bornes, cantidad variable (6 en un contactor, U1/V1/W1/PE en un motor)
 *   [n]  geometría: 24 números, primer campo con '*' inicial
 *   [n+1] vacío (el raw termina en '#')
 */

import { parse } from '../format/cade.ts';
import type { CadeDocument, CadeRecord } from '../format/cade.ts';
import { hasColorSlot } from './component-spec.ts';
import { transformFromSlot, transformBox, isIdentity, IDENTITY, type Transform } from './transform.ts';
import { CATALOG } from '../symbols/catalog.ts';
import { symbolFor } from '../symbols/library.ts';

export type RecordKind = 'component' | 'connection' | 'text' | 'sheet-title' | 'config' | 'unknown';

/** Posiciones verificadas dentro del bloque de geometría (24 números). */
export const GEOMETRY = {
  x: 8,
  y: 9,
  x2: 10,
  y2: 11,
  offsetX: 12,
  offsetY: 13,
  width: 14,
  height: 15,
  /**
   * Orientación del componente: bitfield `giro | espejo` (ver `transform.ts`).
   * Es el campo 11 del registro y el número 18 del bloque. Sólo se LEE: escribir
   * este slot está bloqueado por S3 mientras no se conozcan las métricas de
   * `geometry[12..15]` que CADe_SIMU guarda por variante.
   */
  transform: 17,
} as const;

/**
 * Color de la señalización óptica (códigos 9008 y 9009).
 *
 * El archivo guarda un índice, no un nombre: la cabecera del registro lleva un
 * token numérico justo después de los bornes (`#X1#X2#2#####`). El mapeo se
 * verificó sobre diez archivos de una sola lámpara guardados desde CADe_SIMU:
 * cada valor coincide con el color elegido en la app, en las dos familias.
 */
export const LAMP_COLORS = ['verde', 'rojo', 'amarillo', 'azul', 'gris'] as const;

export type LampColor = 0 | 1 | 2 | 3 | 4;

export interface CadeRecordModel {
  id: number;
  code: number;
  kind: RecordKind;
  /** designador tal cual aparece, sin normalizar. Vacío si no tiene. */
  designator: string;
  /** bornes en orden de aparición, sin vacíos. Puede estar vacío. */
  pins: string[];
  /**
   * Color guardado de una lámpara con slot de color (`hasColorSlot`). `null`
   * en todo lo demás, y también cuando el archivo trae un valor fuera de
   * rango: preferimos no pintar antes que inventar un color.
   */
  lampColor: LampColor | null;
  /**
   * Orientación guardada en el registro (`geometry[17]`), ya interpretada.
   * Se deriva del texto en `modelOfRecord`: nunca es un valor inventado por la
   * app, y no se reescribe al modelar ni al serializar.
   */
  transform: Transform;
  /** 24 números de geometría; [] si el registro no tiene bloque de geometría */
  geometry: number[];
  /** texto libre de las etiquetas (código 8) */
  text: string;
  /** texto original exacto del registro */
  raw: string;
  /** índice de la hoja a la que pertenece el registro; la geometría es por hoja */
  sheet: number;
}

export interface Sheet {
  index: number;
  /** rango de registros [start, end) dentro de project.records */
  startRecord: number;
  endRecord: number;
  /** registro del bloque de título, si la hoja lo tiene */
  titleBlock: CadeRecordModel | null;
}

export interface Project {
  hasMagic: boolean;
  prefix: string;
  /** registros en orden: fuente de verdad para serializar */
  records: CadeRecordModel[];
  sheets: Sheet[];
}

const WIRE_CODES = new Set([4000, 4001, 4002, 4003, 4004, 4009, 4010, 4018, 4019]);

const COMPONENT_CODES = new Set([
  1000, 2001, 3000, 3001, 3003, 3005, 6001, 6002, 6003, 6007, 6009, 7000, 7001, 8000, 8001, 8012,
  8013, 8016, 8017, 8018, 9000, 9003,
]);

export function classify(code: number): RecordKind {
  if (code === 8) return 'text';
  if (code === 20000) return 'sheet-title';
  if (code === 10501) return 'config';
  // Los cables viven en 4xxx, pero no todo 4xxx es un cable: las regletas y
  // conectores (4011-4017) son componentes con bornes.
  if (WIRE_CODES.has(code)) return 'connection';
  // El resto del catálogo (extraído del binario) son componentes dibujables.
  if (CATALOG[code] !== undefined) return 'component';
  if (COMPONENT_CODES.has(code)) return 'component';
  return 'unknown';
}

function splitNumbers(field: string): number[] {
  return field
    .split('*')
    .map((t) => t.trim())
    .filter((t) => t !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

export function modelOfRecord(rec: CadeRecord, sheet = 0): CadeRecordModel {
  const kind = classify(rec.code);
  const fields = rec.raw.split('#');
  const base: CadeRecordModel = {
    id: rec.id,
    code: rec.code,
    kind,
    designator: kind === 'text' ? '' : (fields[1] ?? ''),
    pins: [],
    lampColor: null,
    transform: IDENTITY,
    geometry: [],
    text: '',
    raw: rec.raw,
    sheet,
  };

  if (kind === 'text') {
    // el texto libre cierra el registro, pegado tras el último '#'
    base.text = rec.raw.slice(rec.raw.lastIndexOf('#') + 1);
    return base;
  }

  // El bloque de geometría empieza con '*', pero en los códigos con layout
  // extendido (11 textos, p. ej. 1052/10500..10550) el último texto queda
  // pegado al primer número: `...#EV1*1*1*...`. Buscamos el primer '*' dentro
  // del campo, no solo al inicio.
  let geoIdx = -1;
  let geoPrefix = '';
  for (let i = 1; i < fields.length; i++) {
    const star = fields[i].indexOf('*');
    if (star !== -1) {
      geoIdx = i;
      geoPrefix = fields[i].slice(0, star);
      break;
    }
  }
  if (geoIdx === -1) return base;

  const headerFields = fields.slice(2, geoIdx);
  if (geoPrefix !== '') headerFields.push(geoPrefix);
  const header = headerFields.filter((p) => p !== '');

  // Las lámparas con slot de color cierran su cabecera con el índice de color
  // (lo declara ComponentSpec): ese token no es un borne. Si se deja en `pins`,
  // el editor dibuja un pin fantasma al lado de X1 y X2. El mínimo de tres
  // tokens protege a un registro sin bornes.
  if (hasColorSlot(rec.code) && header.length >= 3) {
    const last = header.at(-1)!.trim();
    if (/^\d+$/.test(last)) {
      const color = Number(last);
      if (color >= 0 && color < LAMP_COLORS.length) {
        base.lampColor = color as LampColor;
        header.pop();
      }
    }
  }

  base.pins = header;
  base.geometry = splitNumbers(fields[geoIdx].slice(fields[geoIdx].indexOf('*')));
  // La orientación se lee del slot 17; si el bloque no llega hasta ahí, el
  // registro no declara transformación y se dibuja como vino (S7).
  const slot = base.geometry[GEOMETRY.transform];
  if (slot !== undefined) base.transform = transformFromSlot(slot);
  return base;
}

export function buildProject(doc: CadeDocument): Project {
  // Los rangos de hoja se calculan sobre los códigos, antes de construir los
  // modelos: cada registro necesita saber a qué hoja pertenece porque la
  // geometría (y por lo tanto las redes) es por hoja.
  const titleIndexes: number[] = [];
  doc.records.forEach((rec, i) => {
    if (classify(rec.code) === 'sheet-title') titleIndexes.push(i);
  });

  const ranges: { start: number; end: number; title: number | null }[] = [];
  let start = 0;
  for (const title of titleIndexes) {
    ranges.push({ start, end: title + 1, title });
    start = title + 1;
  }

  // Lo que queda después del último bloque de título pertenece a ESA hoja, no a
  // una nueva. Evidencia: `ej0def.cad` tiene su bloque de título en el registro
  // 14 y dieciséis registros dibujados después, sobre la misma página. El bloque
  // de título se escribe al guardar; seguir dibujando después es lo normal.
  //
  // Sin esto, cualquier registro agregado caía en una hoja sin título que no se
  // estaba mirando, y la edición parecía no haber hecho nada.
  if (start < doc.records.length) {
    const last = ranges.at(-1);
    if (last) last.end = doc.records.length;
    else ranges.push({ start: 0, end: doc.records.length, title: null });
  }

  const sheetOf = new Array<number>(doc.records.length).fill(0);
  ranges.forEach((range, index) => {
    for (let i = range.start; i < range.end; i++) sheetOf[i] = index;
  });

  const records = doc.records.map((rec, i) => modelOfRecord(rec, sheetOf[i] ?? 0));
  const sheets: Sheet[] = ranges.map((range, index) => ({
    index,
    startRecord: range.start,
    endRecord: range.end,
    titleBlock: range.title === null ? null : (records[range.title] ?? null),
  }));
  return { hasMagic: doc.hasMagic, prefix: doc.prefix, records, sheets };
}

export function serializeProject(project: Project): string {
  const magic = project.hasMagic ? 'CADe_SIMU' : '';
  return magic + project.prefix + project.records.map((r) => r.raw).join('');
}

/** Registros dibujables de una hoja: componentes y conexiones. */
export function drawablesOf(project: Project, sheet?: Sheet): CadeRecordModel[] {
  const slice = sheet ? project.records.slice(sheet.startRecord, sheet.endRecord) : project.records;
  return slice.filter((r) => r.kind === 'component' || r.kind === 'connection');
}

/** Solo componentes (sin cables ni uniones). */
export function componentsOf(project: Project, sheet?: Sheet): CadeRecordModel[] {
  return drawablesOf(project, sheet).filter((r) => r.kind === 'component');
}

export function componentsByCode(project: Project): Map<number, CadeRecordModel[]> {
  const byCode = new Map<number, CadeRecordModel[]>();
  for (const rec of project.records) {
    if (rec.kind !== 'component' && rec.kind !== 'connection') continue;
    const list = byCode.get(rec.code) ?? [];
    list.push(rec);
    byCode.set(rec.code, list);
  }
  return byCode;
}

export interface WirePoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Puntos de un cable/segmento. `null` si el registro no define un segundo punto. */
export function wirePoints(rec: CadeRecordModel): WirePoints | null {
  if (rec.kind !== 'connection') return null;
  const g = rec.geometry;
  if (g.length <= GEOMETRY.y2) return null;
  const pts = { x1: g[GEOMETRY.x], y1: g[GEOMETRY.y], x2: g[GEOMETRY.x2], y2: g[GEOMETRY.y2] };
  if (pts.x1 === pts.x2 && pts.y1 === pts.y2) return null;
  return pts;
}

/** Anchura y altura declaradas de un componente. `null` si no aplica. */
export function boxOf(rec: CadeRecordModel): { width: number; height: number } | null {
  const g = rec.geometry;
  if (g.length <= GEOMETRY.height) return null;
  const width = g[GEOMETRY.width];
  const height = g[GEOMETRY.height];
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

// --- edición -----------------------------------------------------------------
//
// Editar es reescribir UN registro, nunca regenerar el archivo. Estas funciones
// devuelven el `raw` nuevo y dejan intacto todo lo que no tocaron.

/** Índice del campo de geometría dentro de la lista de campos separada por `#`. */
function geometryFieldIndex(raw: string): number {
  const fields = raw.split('#');
  return fields.findIndex((f, i) => i > 0 && f.includes('*'));
}

/** Devuelve `raw` con el bloque de geometría reemplazado por `geometry`. */
export function withGeometry(rec: CadeRecordModel, geometry: number[]): string {
  const idx = geometryFieldIndex(rec.raw);
  if (idx === -1) return rec.raw;
  const fields = rec.raw.split('#');
  const star = fields[idx].indexOf('*');
  // Preserva el texto que precede al bloque en el layout extendido.
  fields[idx] = fields[idx].slice(0, star) + '*' + geometry.join('*');
  return fields.join('#');
}

/**
 * Devuelve `raw` con el índice de color de la lámpara.
 *
 * El token vive al final de la cabecera (después de los bornes, antes de la
 * geometría). Si la cabecera todavía no lo tiene —una lámpara insertada desde
 * la paleta— se agrega en el primer hueco libre, sin tocar ningún otro campo.
 */
export function withLampColor(rec: CadeRecordModel, color: LampColor): string {
  if (!hasColorSlot(rec.code)) return rec.raw;
  const idx = geometryFieldIndex(rec.raw);
  if (idx === -1) return rec.raw;
  const fields = rec.raw.split('#');
  // En el layout extendido el bloque de geometría viene pegado a un texto;
  // las lámparas no lo usan y no hay forma segura de ubicar el token.
  if (fields[idx]!.indexOf('*') > 0) return rec.raw;
  let last = -1;
  for (let i = 2; i < idx; i++) if (fields[i] !== '') last = i;
  if (last === -1) return rec.raw;
  // Sólo se reemplaza el token que el parser ya reconoció como color: un
  // último token numérico fuera de rango es un borne (97/98 de la paleta).
  if (rec.lampColor !== null && /^\d+$/.test(fields[last]!)) {
    fields[last] = String(color);
  } else {
    let pos = last + 1;
    while (pos < idx && fields[pos] !== '') pos++;
    if (pos < idx) fields[pos] = String(color);
    else fields.splice(idx, 0, String(color));
  }
  return fields.join('#');
}

/** Devuelve `raw` con el id reemplazado. */
export function withId(rec: CadeRecordModel, id: number): string {
  const m = /^\*(\d+)\*/.exec(rec.raw);
  if (!m) return rec.raw;
  return '*'.concat(String(id), rec.raw.slice(m[0].length - 1));
}

export function withPosition(rec: CadeRecordModel, x: number, y: number): string {
  const g = [...rec.geometry];
  if (g.length <= GEOMETRY.y) return rec.raw;
  g[GEOMETRY.x] = x;
  g[GEOMETRY.y] = y;
  return withGeometry(rec, g);
}

export function withWirePoints(rec: CadeRecordModel, pts: WirePoints): string {
  const g = [...rec.geometry];
  if (g.length <= GEOMETRY.y2) return rec.raw;
  g[GEOMETRY.x] = pts.x1;
  g[GEOMETRY.y] = pts.y1;
  g[GEOMETRY.x2] = pts.x2;
  g[GEOMETRY.y2] = pts.y2;
  return withGeometry(rec, g);
}

/**
 * Serializa reemplazando los registros indicados.
 *
 * Se indexa por posición dentro de `project.records`, que es 1:1 con el orden
 * del archivo. Todo registro ausente del mapa se escribe tal cual.
 */
export function serializeWith(project: Project, edits: Map<number, string>): string {
  const magic = project.hasMagic ? 'CADe_SIMU' : '';
  const parts: string[] = [];
  project.records.forEach((rec, i) => parts.push(edits.get(i) ?? rec.raw));
  return magic + project.prefix + parts.join('');
}

/** Id libre siguiente: los ids del archivo son estrictamente crecientes. */
export function nextId(project: Project): number {
  return project.records.reduce((max, r) => Math.max(max, r.id), 0) + 1;
}

/**
 * Caja BASE del dibujo: el tamaño con el que se dibuja el símbolo ANTES de
 * aplicarle la orientación del registro. Está anclada en el origen del registro
 * (`geometry[8..9]`), que es donde CADe_SIMU pone el primer borne.
 *
 * Sin orientación la base es la caja declarada del registro: todo queda
 * exactamente igual que antes (S7).
 *
 * Con orientación la base es el tamaño CANÓNICO del símbolo (`symbolFor(code).size`).
 * Las métricas que el archivo guarda por variante (12×15 → 3×12 / 15×3 / 15×15)
 * son de CADe_SIMU, no describen el dibujo: con ellas la pieza girada salía
 * aplastada a 3 de ancho, mientras que la captura `samples/rotacion/
 * automaticoin.png` muestra las cinco piezas del mismo tamaño y sólo la
 * orientación distinta. El valor guardado en `geometry[12..15]` no se toca.
 *
 * Un código sin `size` declarado (símbolo genérico) no tiene tamaño canónico:
 * cae a la caja del registro, que es lo que hacía antes.
 */
export function baseBoxOf(rec: CadeRecordModel): { x: number; y: number; w: number; h: number } | null {
  const declared = declaredBoxOf(rec);
  if (declared === null) return null;
  if (isIdentity(rec.transform)) return declared;
  const size = symbolFor(rec.code)?.size;
  if (!size) return declared;
  return { x: declared.x, y: declared.y, w: size.w, h: size.h };
}

/** Caja declarada del registro (`geometry[8..9]` + `geometry[14..15]`). */
function declaredBoxOf(rec: CadeRecordModel): { x: number; y: number; w: number; h: number } | null {
  const box = boxOf(rec);
  if (!box) return null;
  return { x: rec.geometry[GEOMETRY.x]!, y: rec.geometry[GEOMETRY.y]!, w: box.width, h: box.height };
}

/**
 * Caja que ocupa un componente en coordenadas de hoja, ya transformada.
 *
 * El dibujo sale de la caja base cuando el registro trae orientación, así que la
 * caja que usan la selección, el encuadre y el enganche de cables es la del
 * DIBUJO transformado, no la del registro. Sin transformación devuelve
 * exactamente la caja declarada, que es lo que hacía antes (S7). El valor
 * guardado en el archivo (`geometry[12..15]`) no se toca.
 */
export function boundsOf(rec: CadeRecordModel): { x: number; y: number; w: number; h: number } | null {
  const base = baseBoxOf(rec);
  return base === null ? null : transformBox(base, rec.transform);
}

/**
 * Invariante de compatibilidad: el texto se puede abrir y volver a serializar
 * sin cambiar un byte. Es la garantía que sostiene el ida y vuelta con
 * CADe_SIMU; si falla, guardar rompería el archivo.
 */
export function roundTrips(text: string): boolean {
  try {
    return serializeProject(buildProject(parse(text))) === text;
  } catch {
    return false;
  }
}

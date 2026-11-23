/**
 * Metadata de atajos por componente dentro de un `.cad`.
 *
 * Estrategia del spike: un registro opaco al final del archivo, con un código
 * que CADe_SIMU no usa (`99999`) y un id mayor que todos los existentes. El
 * parser de la app conserva el raw de cualquier registro desconocido y lo
 * reescribe idéntico, así que el ida y vuelta byte a byte sigue valiendo.
 *
 * El payload va en base64url para no meter `*` ni `#` (delimitadores del
 * formato) y para sobrevivir a designadores con acentos (Latin-1).
 *
 * Compatibilidad con CADe_SIMU: pendiente de verificar en Windows si CADe
 * conserva este registro al abrir y volver a guardar. Hasta entonces el spike
 * se prueba aparte y la app no escribe metadata en archivos del usuario.
 */

import { MAGIC, parse, serialize, type CadeRecord } from './cade.ts';

export const SHORTCUT_RECORD_CODE = 99999;
export const SHORTCUT_MARKER = 'SIMKEYS1:';

export interface ComponentShortcuts {
  version: 1;
  /** designador -> combinación en notación ui-sdk (`mod+q`, `shift+a`, …) */
  bindings: Record<string, string>;
}

const MAX_PAYLOAD = 16_384;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): string | null {
  if (value.length > MAX_PAYLOAD * 2) return null;
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Valida la forma del payload; cualquier basura devuelve `null`. */
export function parseShortcutPayload(value: string): ComponentShortcuts | null {
  if (value.length > MAX_PAYLOAD) return null;
  let data: unknown;
  try {
    data = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const record = data as { version?: unknown; bindings?: unknown };
  if (record.version !== 1) return null;
  if (typeof record.bindings !== 'object' || record.bindings === null || Array.isArray(record.bindings)) {
    return null;
  }
  const bindings: Record<string, string> = {};
  for (const [designator, keys] of Object.entries(record.bindings as Record<string, unknown>)) {
    if (designator === '' || typeof keys !== 'string' || keys === '') continue;
    bindings[designator] = keys;
  }
  return { version: 1, bindings };
}

/** Serializa la metadata al payload base64url que va dentro del registro. */
export function encodeShortcutPayload(metadata: ComponentShortcuts): string {
  return toBase64Url(JSON.stringify(metadata));
}

/** Registro crudo con el marcador y el payload. Siempre trae los `#` que el parser exige. */
export function shortcutRecordRaw(id: number, metadata: ComponentShortcuts): string {
  return `*${id}*${SHORTCUT_RECORD_CODE}#${SHORTCUT_MARKER}${encodeShortcutPayload(metadata)}##`;
}

function isShortcutRecord(record: CadeRecord): boolean {
  return record.code === SHORTCUT_RECORD_CODE && (record.fields[1] ?? '').startsWith(SHORTCUT_MARKER);
}

/** Lee la metadata del primer registro de atajos; `null` si no hay o está rota. */
export function readComponentShortcuts(text: string): ComponentShortcuts | null {
  const doc = parse(text);
  const record = doc.records.find(isShortcutRecord);
  if (!record) return null;
  const payload = (record.fields[1] ?? '').slice(SHORTCUT_MARKER.length);
  const decoded = fromBase64Url(payload);
  return decoded === null ? null : parseShortcutPayload(decoded);
}

/**
 * Devuelve el texto con la metadata aplicada. No toca ningún byte existente:
 * reemplaza el registro de atajos si ya estaba, o lo agrega al final con un id
 * mayor. Sin bindings, borra el registro y deja el archivo como vino.
 */
export function withComponentShortcuts(text: string, metadata: ComponentShortcuts): string {
  const doc = parse(text);
  const index = doc.records.findIndex(isShortcutRecord);
  const hasBindings = Object.keys(metadata.bindings).length > 0;

  if (!hasBindings) {
    if (index === -1) return text;
    const records = doc.records.filter((_, i) => i !== index);
    return serialize({ ...doc, records });
  }

  const id = index === -1 ? doc.records.reduce((max, record) => Math.max(max, record.id), 0) + 1 : doc.records[index]!.id;
  const raw = shortcutRecordRaw(id, metadata);

  if (index !== -1) {
    const records = doc.records.map((record, i) =>
      i === index ? { ...record, raw, fields: raw.split('#') } : record,
    );
    return serialize({ ...doc, records });
  }

  const appended: CadeRecord = {
    index: doc.records.length,
    id,
    code: SHORTCUT_RECORD_CODE,
    at: text.length,
    raw,
    fields: raw.split('#'),
    designator: '',
  };
  return serialize({ ...doc, records: [...doc.records, appended] });
}

/** ¿El texto ya viene con el magic del formato? Lo usa el generador del spike. */
export function hasMagic(text: string): boolean {
  return text.startsWith(MAGIC);
}

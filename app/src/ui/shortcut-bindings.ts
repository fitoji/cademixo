/**
 * Atajos editables del usuario.
 *
 * Viven fuera de React, igual que `settings.ts`: el registro de ui-sdk lee la
 * tecla en cada pulsación (acepta `keys` como función), así que un cambio acá
 * vale al instante sin volver a registrar nada. `localStorage` es la fuente de
 * persistencia de esta primera versión; sin storage todo cae a los defaults.
 */

export const SHORTCUT_STORAGE_KEY = 'simuelectro:atajos';

/** Escape queda fuera: es la salida de los diálogos y el cancel global. */
export const BINDING_IDS = [
  'save',
  'saveAs',
  'undo',
  'redo',
  'copy',
  'paste',
  'fit',
  'delete',
  'backspace',
  'rotateRight',
  'rotateLeft',
  'simulate',
] as const;

export type ShortcutId = (typeof BINDING_IDS)[number];
export type Bindings = Record<ShortcutId, string>;

/** Las mismas teclas que había registradas en `App.tsx`. */
export const DEFAULT_BINDINGS: Bindings = {
  save: 'mod+s',
  saveAs: 'mod+shift+s',
  undo: 'mod+z',
  redo: 'mod+shift+z',
  copy: 'mod+c',
  paste: 'mod+v',
  fit: 'mod+0',
  delete: 'delete',
  backspace: 'backspace',
  rotateRight: 'r',
  rotateLeft: 'shift+r',
  simulate: 'space',
};

const MODIFIER_ALIASES: Record<string, string> = {
  mod: 'mod',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
  win: 'meta',
  ctrl: 'control',
  control: 'control',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
  shift: 'shift',
};

const MODIFIER_ORDER = ['mod', 'meta', 'control', 'alt', 'shift'];

const NAMED_KEYS = new Set([
  'space',
  'escape',
  'backspace',
  'delete',
  'enter',
  'tab',
  'home',
  'end',
  'pageup',
  'pagedown',
  'left',
  'right',
  'up',
  'down',
  ...Array.from({ length: 12 }, (_, i) => `f${i + 1}`),
]);

/** Teclas que el navegador se queda: no se pueden reclamar desde la página. */
const RESERVED = new Set([
  'escape',
  'f5',
  'mod+w',
  'mod+t',
  'mod+q',
  'mod+n',
  'mod+r',
  'mod+shift+w',
  'mod+shift+t',
  'mod+shift+n',
  'mod+shift+i',
]);

const EVENT_KEYS: Record<string, string> = {
  ' ': 'space',
  Escape: 'escape',
  Backspace: 'backspace',
  Delete: 'delete',
  Enter: 'enter',
  Tab: 'tab',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

const MODIFIER_EVENT_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

/** Orden canónico para comparar combinaciones sin importar cómo se escribieron. */
export function canonicalKeys(keys: string): string | null {
  if (typeof keys !== 'string' || keys.length === 0) return null;
  const parts = keys.split('+');
  const main = parts.at(-1)?.toLowerCase() ?? '';
  if (parts.length > MODIFIER_ORDER.length + 1) return null;

  const modifiers = new Set<string>();
  for (const part of parts.slice(0, -1)) {
    const mapped = MODIFIER_ALIASES[part.toLowerCase()];
    if (mapped === undefined || modifiers.has(mapped)) return null;
    modifiers.add(mapped);
  }
  if (!isMainKey(main)) return null;
  const ordered = MODIFIER_ORDER.filter((name) => modifiers.has(name));
  return [...ordered, main].join('+');
}

function isMainKey(main: string): boolean {
  return /^[a-z0-9]$/.test(main) || NAMED_KEYS.has(main);
}

export function isValidBinding(keys: string): boolean {
  const canonical = canonicalKeys(keys);
  return canonical !== null && !RESERVED.has(canonical);
}

export type KeyEventLike = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'> & {
  isComposing?: boolean;
};

/**
 * Convierte un `keydown` a la notación de ui-sdk. `apple` se pasa explícito
 * para que la regla sea pura y se pueda probar sin DOM.
 */
export function keyEventToKeys(event: KeyEventLike, apple: boolean): string | null {
  // IME: una coma pospuesta no es una tecla; el evento de composición no cuenta.
  if (event.isComposing === true || event.key === 'Process') return null;
  if (MODIFIER_EVENT_KEYS.has(event.key)) return null;

  const main = EVENT_KEYS[event.key] ?? event.key.toLowerCase();
  if (!isMainKey(main)) return null;

  const modifiers: string[] = [];
  if (apple) {
    if (event.metaKey) modifiers.push('mod');
    if (event.ctrlKey) modifiers.push('control');
  } else {
    if (event.ctrlKey) modifiers.push('mod');
    if (event.metaKey) modifiers.push('meta');
  }
  if (event.altKey) modifiers.push('alt');
  if (event.shiftKey) modifiers.push('shift');

  const keys = [...modifiers, main].join('+');
  return isValidBinding(keys) ? canonicalKeys(keys) : null;
}

export type BindingResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'reserved' | 'conflict'; conflictWith?: ShortcutId };

/** Parseo tolerante: un campo inventado o en conflicto cae al default. */
export function parseBindings(raw: string | null): Bindings {
  const result: Bindings = { ...DEFAULT_BINDINGS };
  if (!raw) return result;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return result;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return result;
  const stored = data as { version?: unknown; bindings?: unknown };
  if (stored.version !== 1 || typeof stored.bindings !== 'object' || stored.bindings === null) return result;

  const incoming = stored.bindings as Record<string, unknown>;
  const accepted = new Set<string>();
  const take = (keys: string): boolean => {
    const canonical = canonicalKeys(keys);
    if (canonical === null || !isValidBinding(canonical) || accepted.has(canonical)) return false;
    accepted.add(canonical);
    return true;
  };

  for (const id of BINDING_IDS) {
    const storedKeys = incoming[id];
    const candidate = typeof storedKeys === 'string' ? canonicalKeys(storedKeys) : null;
    if (candidate !== null && take(candidate)) {
      result[id] = candidate;
      continue;
    }
    const ownDefault = DEFAULT_BINDINGS[id];
    const fallback = take(ownDefault)
      ? ownDefault
      : Object.values(DEFAULT_BINDINGS).find((keys) => take(keys));
    if (fallback) result[id] = fallback;
  }
  return result;
}

export function serializeBindings(bindings: Bindings): string {
  return JSON.stringify({ version: 1, bindings });
}

const listeners = new Set<() => void>();

function read(): Bindings {
  try {
    return parseBindings(localStorage.getItem(SHORTCUT_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_BINDINGS };
  }
}

let current: Bindings = read();

export function getBindings(): Bindings {
  return current;
}

export function getBinding(id: ShortcutId): string {
  return current[id];
}

function publish(next: Bindings): void {
  current = next;
  try {
    localStorage.setItem(SHORTCUT_STORAGE_KEY, serializeBindings(next));
  } catch {
    // Sin storage: el cambio vale sólo para esta sesión.
  }
  for (const listener of listeners) listener();
}

export function setBinding(id: ShortcutId, keys: string): BindingResult {
  const canonical = canonicalKeys(keys);
  if (canonical === null) return { ok: false, reason: 'invalid' };
  if (!isValidBinding(canonical)) return { ok: false, reason: 'reserved' };
  const conflictWith = BINDING_IDS.find(
    (other) => other !== id && canonicalKeys(current[other]) === canonical,
  );
  if (conflictWith) return { ok: false, reason: 'conflict', conflictWith };
  if (current[id] === canonical) return { ok: true };
  publish({ ...current, [id]: canonical });
  return { ok: true };
}

export function resetBindings(): void {
  publish({ ...DEFAULT_BINDINGS });
}

export function subscribeBindings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

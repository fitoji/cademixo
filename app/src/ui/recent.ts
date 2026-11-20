/**
 * Últimos componentes insertados desde la paleta: atajo para no volver a
 * buscarlos.
 *
 * Igual que los favoritos, guarda `code` del catálogo (los ids cambian en cada
 * documento) y la parte pura recibe el `storage` como parámetro, así los tests
 * de node pasan un doble sin `jsdom`. Sin storage disponible (modo privado,
 * tests) la lista vale sólo para esta sesión.
 */

export const RECENT_KEY = 'simuelectro:recientes';

/** Cuántos se recuerdan: más que esto es scroll, no atajo. */
export const RECENT_MAX = 8;

/** Lo único que el módulo usa del storage del navegador. */
export type RecentStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** Lee una lista de códigos tolerando basura: sin duplicados y sólo enteros. */
export function parseRecent(raw: string | null): number[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: number[] = [];
  for (const value of data) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) continue;
    if (!out.includes(value)) out.push(value);
  }
  return out.slice(0, RECENT_MAX);
}

/** Suma un uso al frente, sin duplicar y recortando al tope. */
export function pushRecent(codes: readonly number[], code: number): number[] {
  return [code, ...codes.filter((c) => c !== code)].slice(0, RECENT_MAX);
}

/** `localStorage` del navegador, o `null` si no hay (tests en node, SSR). */
function browserStorage(): RecentStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readRecent(storage: RecentStorage | null = browserStorage()): number[] {
  if (!storage) return [];
  try {
    return parseRecent(storage.getItem(RECENT_KEY));
  } catch {
    return [];
  }
}

export function writeRecent(codes: readonly number[], storage: RecentStorage | null = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(RECENT_KEY, JSON.stringify(codes));
  } catch {
    // Modo privado o storage bloqueado: los recientes valen para esta sesión.
  }
}

const listeners = new Set<() => void>();

let current: number[] = readRecent();

export function getRecent(): number[] {
  return current;
}

export function subscribeRecent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Anota una inserción y avisa a la paleta. */
export function recordRecentUse(code: number): void {
  const next = pushRecent(current, code);
  if (next.length === current.length && next.every((value, i) => value === current[i])) return;
  current = next;
  writeRecent(current);
  for (const listener of listeners) listener();
}

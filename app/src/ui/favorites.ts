/**
 * Favoritos de la paleta: se guardan como lista de códigos en el navegador.
 *
 * Un favorito es el `code` del catálogo, no el id de registro: los ids cambian
 * en cada documento. La parte pura no toca el DOM; el acceso a `localStorage`
 * entra como parámetro, así los tests de node pasan un doble sin `jsdom`.
 *
 * Sin storage disponible (modo privado, tests) todo cae a una lista vacía sin
 * romper la aplicación, y la elección vale sólo para esta sesión. El store
 * vive fuera de React para que Propiedades y la paleta compartan el valor.
 */

export const FAVORITES_KEY = 'simuelectro:favoritos';

/** Lo único que el módulo usa del storage del navegador. */
export type FavoritesStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** Lee una lista de códigos tolerando basura: sin duplicados y sólo enteros. */
export function parseFavorites(raw: string | null): number[] {
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
  return out;
}

/** ¿El componente ya está marcado? */
export function isFavorite(codes: readonly number[], code: number): boolean {
  return codes.includes(code);
}

/** Alta si falta, baja si está; devuelve una lista nueva, sin mutar la recibida. */
export function toggleFavorite(codes: readonly number[], code: number): number[] {
  return isFavorite(codes, code) ? codes.filter((c) => c !== code) : [...codes, code];
}

/** `localStorage` del navegador, o `null` si no hay (tests en node, SSR). */
function browserStorage(): FavoritesStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readFavorites(storage: FavoritesStorage | null = browserStorage()): number[] {
  if (!storage) return [];
  try {
    return parseFavorites(storage.getItem(FAVORITES_KEY));
  } catch {
    return [];
  }
}

export function writeFavorites(codes: readonly number[], storage: FavoritesStorage | null = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(FAVORITES_KEY, JSON.stringify(codes));
  } catch {
    // Modo privado o storage bloqueado: los favoritos valen para esta sesión.
  }
}

const listeners = new Set<() => void>();

let current: number[] = readFavorites();

export function getFavorites(): number[] {
  return current;
}

export function subscribeFavorites(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Marca o desmarca un código, lo persiste y avisa a la paleta y a Propiedades. */
export function toggleStoredFavorite(code: number): void {
  current = toggleFavorite(current, code);
  writeFavorites(current);
  for (const listener of listeners) listener();
}

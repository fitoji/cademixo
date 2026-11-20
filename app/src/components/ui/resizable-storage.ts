/**
 * Persistencia del layout de los paneles redimensionables.
 *
 * `autoSaveId` de ui-sdk guarda el layout bajo su propia clave
 * (`ui-sdk-resizable:<autoSaveId>`). El proyecto guarda todo bajo
 * `simuelectro:` (`simuelectro:ajustes`, favoritos), así que este adaptador es
 * el puente: prefija la clave y normaliza lo que lee y lo que escribe, para que
 * un valor viejo o roto no arrastre el arranque.
 *
 * El `localStorage` se resuelve acá y no en la librería: si no hay storage (modo
 * privado, tests) el adaptador queda inerte y la librería no cae a su clave
 * suelta, que es justo la que S5 pide evitar.
 */
import type { ResizableStorage } from '@ui-sdk/react/resizable';

/** Prefijo de todas las claves del proyecto. */
export const LAYOUT_PREFIX = 'simuelectro:';

/** Mismo contrato que `localStorage`, para poder inyectar uno de mentira. */
export type LayoutStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

/** Lo que guarda la librería: un layout por conjunto de paneles, en %. */
export type Layouts = Record<string, number[]>;

/** Clave del proyecto para la clave que pide la librería; no prefija dos veces. */
export function layoutKey(key: string): string {
  return key.startsWith(LAYOUT_PREFIX) ? key : `${LAYOUT_PREFIX}${key}`;
}

function isLayout(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((size) => typeof size === 'number' && Number.isFinite(size))
  );
}

/**
 * Lee el mapa de layouts tolerando basura.
 *
 * Ausente, JSON roto, un array suelto o entradas con tamaños que no son números
 * finitos devuelven `null` (o descartan la entrada): los paneles arrancan con
 * sus tamaños por defecto y la aplicación no se rompe.
 */
export function readLayouts(raw: string | null): Layouts | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const layouts: Layouts = {};
  let found = false;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (!isLayout(value)) continue;
    layouts[key] = value;
    found = true;
  }
  return found ? layouts : null;
}

export function serializeLayouts(layouts: Layouts): string {
  return JSON.stringify(layouts);
}

/**
 * Adaptador `ResizableStorage` sobre `store`, o inerte si no hay `store`.
 *
 * El layout guardado se normaliza en los dos sentidos: al leer, la librería
 * recibe `null` cuando no hay nada usable; al escribir, sólo se guardan layouts
 * con tamaños numéricos.
 */
export function createLayoutStorage(store: LayoutStore | null): ResizableStorage {
  return {
    getItem: (key) => {
      if (!store) return null;
      try {
        const layouts = readLayouts(store.getItem(layoutKey(key)));
        return layouts === null ? null : serializeLayouts(layouts);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      if (!store) return;
      try {
        const layouts = readLayouts(value);
        if (layouts === null) return;
        store.setItem(layoutKey(key), serializeLayouts(layouts));
      } catch {
        // Sin storage o sin cuota: la elección vale sólo para esta sesión.
      }
    },
  };
}

/** El adaptador de la aplicación, sobre el `localStorage` del navegador. */
export function layoutStorage(): ResizableStorage {
  let store: LayoutStore | null = null;
  try {
    store = typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    store = null;
  }
  return createLayoutStorage(store);
}

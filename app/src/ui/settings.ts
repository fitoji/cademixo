/**
 * Ajustes de apariencia del simulador.
 *
 * Tres preferencias que sólo cambian cómo se dibuja el esquema: el tamaño de
 * los bornes, el grosor de los cables y el auto cierre de los paneles de la
 * paleta. Viven fuera de React para que el diálogo de configuración, el lienzo
 * y la paleta compartan el valor; la UI se suscribe con `useSyncExternalStore`.
 *
 * Sin `localStorage` disponible (tests en node, modo privado) todo cae a los
 * valores por defecto sin romper la aplicación.
 */

export type PinSize = 'chico' | 'normal' | 'grande';
export type WireWidth = 'fino' | 'normal' | 'grueso';

export type Settings = {
  pinSize: PinSize;
  wireWidth: WireWidth;
  autoCierre: boolean;
};

/** Defaults elegidos para no cambiar nada mientras nadie toque la preferencia. */
export const DEFAULT_SETTINGS: Settings = {
  pinSize: 'normal',
  wireWidth: 'normal',
  autoCierre: false,
};

export const SETTINGS_KEY = 'simuelectro:ajustes';

const PIN_SIZES: readonly PinSize[] = ['chico', 'normal', 'grande'];
const WIRE_WIDTHS: readonly WireWidth[] = ['fino', 'normal', 'grueso'];

function isPinSize(value: unknown): value is PinSize {
  return typeof value === 'string' && (PIN_SIZES as readonly string[]).includes(value);
}

function isWireWidth(value: unknown): value is WireWidth {
  return typeof value === 'string' && (WIRE_WIDTHS as readonly string[]).includes(value);
}

/** Lee un objeto de ajustes tolerando basura: campo inválido, default del campo. */
export function parseSettings(raw: string | null): Settings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ...DEFAULT_SETTINGS };
  }
  const record = data as Record<string, unknown>;
  return {
    pinSize: isPinSize(record.pinSize) ? record.pinSize : DEFAULT_SETTINGS.pinSize,
    wireWidth: isWireWidth(record.wireWidth) ? record.wireWidth : DEFAULT_SETTINGS.wireWidth,
    autoCierre:
      typeof record.autoCierre === 'boolean' ? record.autoCierre : DEFAULT_SETTINGS.autoCierre,
  };
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify({
    pinSize: settings.pinSize,
    wireWidth: settings.wireWidth,
    autoCierre: settings.autoCierre,
  });
}

const listeners = new Set<() => void>();

function read(): Settings {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_KEY));
  } catch {
    // Sin storage (SSR, modo privado, tests): solo los defaults.
    return { ...DEFAULT_SETTINGS };
  }
}

let current: Settings = read();

export function getSettings(): Settings {
  return current;
}

/** Mezcla un cambio parcial, lo persiste y avisa; sin cambios reales no hace nada. */
export function setSettings(patch: Partial<Settings>): void {
  const next: Settings = { ...current, ...patch };
  if (
    next.pinSize === current.pinSize &&
    next.wireWidth === current.wireWidth &&
    next.autoCierre === current.autoCierre
  ) {
    return;
  }
  current = next;
  try {
    localStorage.setItem(SETTINGS_KEY, serializeSettings(next));
  } catch {
    // Sin storage: la elección vale sólo para esta sesión.
  }
  for (const listener of listeners) listener();
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Radio de los puntos de borne del glifo del símbolo. */
export function pinRadius(size: PinSize): number {
  if (size === 'chico') return 1.1;
  if (size === 'grande') return 1.9;
  return 1.4;
}

/** Radio de los puntos de conexión dibujados en el lienzo. */
export function attachPinRadius(size: PinSize): number {
  if (size === 'chico') return 0.7;
  if (size === 'grande') return 1.2;
  return 0.9;
}

/** Ancho de trazo de todos los conductores del lienzo. */
export function wireStroke(width: WireWidth): number {
  if (width === 'fino') return 0.12;
  if (width === 'grueso') return 0.24;
  return 0.17;
}

/**
 * Reducer de los paneles de la paleta.
 *
 * Con auto cierre prendido sólo queda abierto el último panel elegido y volver
 * a tocar el abierto lo cierra; apagado es el comportamiento de siempre, con
 * varios paneles abiertos a la vez.
 */
export function nextOpenCats(prev: string[], key: string, autoCierre: boolean): string[] {
  const abierto = prev.includes(key);
  if (autoCierre) return abierto ? [] : [key];
  return abierto ? prev.filter((k) => k !== key) : [...prev, key];
}

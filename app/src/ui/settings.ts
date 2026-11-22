/**
 * Ajustes de apariencia del simulador.
 *
 * Ocho preferencias: cómo se dibuja el esquema y cómo se comporta la paleta —el
 * tamaño de los bornes, el grosor de los cables, la orientación de los paneles
 * de componentes y el auto cierre— y qué suena (`sonidosInterfaz`,
 * `sonidosSimulacion`, S7), con su mute maestro (`silenciado`, S9) y el zumbido
 * del motor (`sonidoMotor`, S10). Viven fuera de React para que el diálogo de
 * configuración, el lienzo, la paleta y el motor de sonido compartan el valor;
 * la UI se suscribe con `useSyncExternalStore`.
 *
 * Sin `localStorage` disponible (tests en node, modo privado) todo cae a los
 * valores por defecto sin romper la aplicación.
 */

export type PinSize = 'chico' | 'normal' | 'grande';
export type WireWidth = 'fino' | 'normal' | 'grueso';
/** Orientación de la barra de componentes: arriba (horizontal) o al costado. */
export type Paneles = 'horizontal' | 'vertical';

export type Settings = {
  pinSize: PinSize;
  wireWidth: WireWidth;
  paneles: Paneles;
  autoCierre: boolean;
  /** Cues de la interfaz: abrir, guardar, errores, aparatos, colocar (S7). */
  sonidosInterfaz: boolean;
  /** Cues de la simulación: flancos de bobinas y protecciones (S7). */
  sonidosSimulacion: boolean;
  /**
   * Mute maestro de la barra (S9): apaga todo el sonido sin tocar los dos
   * interruptores por canal, que conservan su preferencia y vuelven a valer al
   * reactivar.
   */
  silenciado: boolean;
  /**
   * Zumbido continuo del motor (S10). Interruptor propio y encendido por
   * defecto: nunca es la única señal, el motor ya se ve girando.
   */
  sonidoMotor: boolean;
};

/**
 * Defaults con los tres canales sonando de entrada (S7, S10): interfaz,
 * simulación y motor. El mute maestro arranca apagado, así que silenciar sigue
 * siendo una decisión del usuario, y cada interruptor conserva su preferencia.
 * Los defaults son globales: moderno y clásico comparten el mismo store.
 */
export const DEFAULT_SETTINGS: Settings = {
  pinSize: 'normal',
  // El estilo manda: clásico (el de arranque) dibuja el cable fino. La raíz
  // aplica `wireWidthForStyle` al entrar y en cada cambio de estilo.
  wireWidth: 'fino',
  paneles: 'horizontal',
  autoCierre: false,
  sonidosInterfaz: true,
  sonidosSimulacion: true,
  silenciado: false,
  sonidoMotor: true,
};

export const SETTINGS_KEY = 'simuelectro:ajustes';

const PIN_SIZES: readonly PinSize[] = ['chico', 'normal', 'grande'];
const WIRE_WIDTHS: readonly WireWidth[] = ['fino', 'normal', 'grueso'];
const PANELES: readonly Paneles[] = ['horizontal', 'vertical'];

function isPinSize(value: unknown): value is PinSize {
  return typeof value === 'string' && (PIN_SIZES as readonly string[]).includes(value);
}

function isWireWidth(value: unknown): value is WireWidth {
  return typeof value === 'string' && (WIRE_WIDTHS as readonly string[]).includes(value);
}

function isPaneles(value: unknown): value is Paneles {
  return typeof value === 'string' && (PANELES as readonly string[]).includes(value);
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
    paneles: isPaneles(record.paneles) ? record.paneles : DEFAULT_SETTINGS.paneles,
    autoCierre:
      typeof record.autoCierre === 'boolean' ? record.autoCierre : DEFAULT_SETTINGS.autoCierre,
    sonidosInterfaz:
      typeof record.sonidosInterfaz === 'boolean'
        ? record.sonidosInterfaz
        : DEFAULT_SETTINGS.sonidosInterfaz,
    sonidosSimulacion:
      typeof record.sonidosSimulacion === 'boolean'
        ? record.sonidosSimulacion
        : DEFAULT_SETTINGS.sonidosSimulacion,
    silenciado:
      typeof record.silenciado === 'boolean' ? record.silenciado : DEFAULT_SETTINGS.silenciado,
    sonidoMotor:
      typeof record.sonidoMotor === 'boolean' ? record.sonidoMotor : DEFAULT_SETTINGS.sonidoMotor,
  };
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify({
    pinSize: settings.pinSize,
    wireWidth: settings.wireWidth,
    paneles: settings.paneles,
    autoCierre: settings.autoCierre,
    sonidosInterfaz: settings.sonidosInterfaz,
    sonidosSimulacion: settings.sonidosSimulacion,
    silenciado: settings.silenciado,
    sonidoMotor: settings.sonidoMotor,
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
    next.paneles === current.paneles &&
    next.autoCierre === current.autoCierre &&
    next.sonidosInterfaz === current.sonidosInterfaz &&
    next.sonidosSimulacion === current.sonidosSimulacion &&
    next.silenciado === current.silenciado &&
    next.sonidoMotor === current.sonidoMotor
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

/**
 * Ancho del aro de los puntos de borne.
 *
 * Proporcional al radio (misma razón para el glifo y el lienzo): con un ancho
 * fijo el punto chico se lee como un aro pesado. Normal conserva el 0,42 de
 * siempre, que es el valor del fallback de `.pin` en `diagram.css`.
 */
export function pinStroke(size: PinSize): number {
  if (size === 'chico') return 0.33;
  if (size === 'grande') return 0.57;
  return 0.42;
}

/**
 * Ancho de trazo de todos los conductores del lienzo.
 *
 * Normal y grueso duplican su valor anterior (0,17 → 0,34 y 0,24 → 0,48): los
 * cables se leían demasiado finos al lado de la tinta del símbolo. Fino queda
 * en 0,12, que es el piso para no perder el hilo en documentos densos.
 */
export function wireStroke(width: WireWidth): number {
  if (width === 'fino') return 0.12;
  if (width === 'grueso') return 0.48;
  return 0.34;
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

/**
 * Valor controlado del acordeón vertical de la paleta.
 *
 * Radix entrega el conjunto de paneles abiertos después del clic, no cuál se
 * tocó; con auto cierre prendido sólo sobrevive el panel recién abierto, y
 * cerrar sigue cerrando. Apagado, el acordeón hace lo que el usuario abrió
 * (varios paneles a la vez), igual que la barra horizontal.
 */
export function nextOpenAccordion(
  prev: string[],
  values: string[],
  autoCierre: boolean,
): string[] {
  if (!autoCierre) return values;
  const nuevo = values.find((value) => !prev.includes(value));
  return nuevo === undefined ? values : nextOpenCats(prev, nuevo, autoCierre);
}

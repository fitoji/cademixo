/**
 * Qué suena y cada cuánto: la parte pura del audio (S3-S6).
 *
 * Un tipo de evento de la aplicación mapea a un cue —el preset de `cuelume`, el
 * canal por el que sale y la capa con que se emite— y el `Coalescer` decide si
 * ese cue llega a sonar. Nada de esto toca el DOM ni importa `cuelume`: el motor
 * entra en `sound.ts`, así que todo se puede testear con `node --test`.
 *
 * El silencio también es contrato (S4): los eventos que no suenan no están en la
 * tabla, y como `SoundEvent` sale de sus claves, agregarlos es un error de
 * compilación, no un descuido silencioso.
 */

/** Los dos canales: cada uno tiene su propia ventana de coalescencia. */
export type SoundChannel = 'interfaz' | 'simulacion';

/** Los presets de `cuelume@0.2.8`; con otra versión cambian los nombres (S8). */
export type SoundPreset =
  | 'tap'
  | 'type'
  | 'select'
  | 'toggle'
  | 'open'
  | 'close'
  | 'success'
  | 'error'
  | 'navigate'
  | 'warning'
  | 'loading'
  | 'ready'
  | 'attention'
  | 'count';

/**
 * Cómo se emite: `play` es un cue suelto; `press` y `release` son las dos mitades
 * de un control que se aprieta y se suelta (el pulsador momentáneo), que
 * `cuelume` empareja con `press()` / `release()`.
 */
export type CueLayer = 'play' | 'press' | 'release';

export type SoundCue = {
  readonly preset: SoundPreset;
  readonly channel: SoundChannel;
  readonly layer: CueLayer;
};

/**
 * La tabla semántica de S3.
 *
 * El nombre del evento dice qué pasó en la aplicación; el preset, qué suena.
 */
export const CUES = {
  'abrir archivo': { preset: 'open', channel: 'interfaz', layer: 'play' },
  guardar: { preset: 'success', channel: 'interfaz', layer: 'play' },
  'guardar como': { preset: 'success', channel: 'interfaz', layer: 'play' },
  'proyecto nuevo': { preset: 'success', channel: 'interfaz', layer: 'play' },
  error: { preset: 'error', channel: 'interfaz', layer: 'play' },
  rechazo: { preset: 'warning', channel: 'interfaz', layer: 'play' },
  accionar: { preset: 'toggle', channel: 'interfaz', layer: 'play' },
  'pulsador aprieta': { preset: 'tap', channel: 'interfaz', layer: 'press' },
  'pulsador suelta': { preset: 'tap', channel: 'interfaz', layer: 'release' },
  colocar: { preset: 'tap', channel: 'interfaz', layer: 'play' },
  'simulación inicia': { preset: 'ready', channel: 'interfaz', layer: 'play' },
  'simulación detiene': { preset: 'close', channel: 'interfaz', layer: 'play' },
  'bobina energizada': { preset: 'close', channel: 'simulacion', layer: 'play' },
  'bobina desenergizada': { preset: 'open', channel: 'simulacion', layer: 'play' },
  'protección disparada': { preset: 'warning', channel: 'simulacion', layer: 'play' },
} as const satisfies Record<string, SoundCue>;

/** Un evento que suena. Los de S4 quedan afuera por construcción. */
export type SoundEvent = keyof typeof CUES;

/**
 * Lo que NO suena (S4): selección, hover, snap, paneo, zoom, marquesina,
 * deshacer, rehacer, copiar y el commit de cada cable. Vive acá para que la
 * lista quede escrita al lado de la tabla y los tests la fijen.
 */
export const SILENT_EVENTS = [
  'seleccionar',
  'deseleccionar',
  'hover',
  'snap',
  'paneo',
  'zoom',
  'marquesina',
  'deshacer',
  'rehacer',
  'copiar',
  'commit de cable',
] as const;

export type SilentEvent = (typeof SILENT_EVENTS)[number];

/** Busca el cue de un evento por nombre, sin suponer que el nombre existe. */
export function cueOf(name: string): SoundCue | undefined {
  if (!Object.hasOwn(CUES, name)) return undefined;
  return (CUES as Record<string, SoundCue>)[name];
}

/**
 * Ventana mínima entre dos cues del mismo canal (S6).
 *
 * El canal de simulación es uno solo, así que esta misma ventana es además el
 * tope total de simulación: dos bobinas que se energizan en el mismo paso son un
 * único cue.
 */
export const MIN_GAP_MS = 50;

/**
 * Coalescer de cues: `accept` dice si un cue puede sonar ahora y, si sí, lo
 * anota. El reloj entra por parámetro para poder testear la ventana sin dormir
 * el proceso y para que el módulo no dependa del reloj del sistema.
 */
export class Coalescer {
  readonly #last = new Map<SoundChannel, number>();

  accept(channel: SoundChannel, now: number): boolean {
    const previous = this.#last.get(channel);
    if (previous !== undefined && now - previous < MIN_GAP_MS) return false;
    this.#last.set(channel, now);
    return true;
  }
}

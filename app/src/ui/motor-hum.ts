/**
 * Zumbido continuo del motor (S10).
 *
 * `cuelume` no tiene sonidos continuos —sus catorce presets son golpes con
 * decaimiento y no expone loop ni stop—, así que el zumbido se sintetiza con
 * WebAudio: dos osciladores desafinados alrededor de 50 Hz (el batido sale de
 * los 0,6 Hz de diferencia), un armónico bajo y un pasabajos, con envolvente de
 * ataque y de relajación. Sin dependencias nuevas y sin archivo de audio.
 *
 * Hay **un solo** zumbido para todos los motores: la amplitud sale de la
 * cantidad de motores energizados y tiene techo, y se enciende por transición,
 * nunca por tick ni por re-render. `humLevel` es la parte pura y testeable; el
 * resto es plomería de WebAudio, toda en `try/catch`: sin `AudioContext` o en
 * modo privado la aplicación sigue igual, muda.
 *
 * Este módulo no toca los cues: el zumbido no es un cue y no pasa por el
 * coalescer ni por la tabla de `sound-cues.ts`.
 */

import { getSettings } from './settings.ts';

/** Frecuencia base del zumbido y su desafinación: el batido lento de un motor. */
const BASE_HZ = 50;
const DETUNE_HZ = 0.6;
/** Armónico bajo: da cuerpo sin volverse un zumbido eléctrico agudo. */
const HARMONIC_HZ = BASE_HZ * 2;
/**
 * Pasabajos del conjunto.
 *
 * Estaba en 320 Hz, y con eso el zumbido quedaba entero por debajo del rango de
 * un parlante de notebook. Medido en el navegador: la ganancia maestra llegaba
 * a 0,06 con el motor energizado —sonaba— y no se oía, porque 50 Hz a ese nivel
 * un altavoz chico no lo mueve. Ahora deja pasar los parciales que sí mueve.
 */
const FILTER_HZ = 1200;
/**
 * Ganancia del techo: el nivel 1 de `humLevel` suena a esto, no a fondo.
 *
 * Subió de 0,12 a 0,22 al abrir el filtro: el pico teórico de las voces
 * (suma 1,87) queda en ~0,41, con margen contra el recorte.
 */
const HUM_GAIN = 0.22;
/**
 * Las voces del zumbido, con su ganancia relativa.
 *
 * La fundamental de 50 Hz y su batido son lo que hace sentirse un motor, pero
 * un parlante chico no los reproduce: el sonido tiene que viajar también en los
 * parciales. No es un truco para audífonos flojos — un motor real tiene serie
 * armónica, y son los parciales de 100 a 300 Hz los que le dan el timbre.
 */
const VOICES: readonly (readonly [hz: number, level: number])[] = [
  [BASE_HZ, 0.35], // fundamental: el cuerpo
  [BASE_HZ + DETUNE_HZ, 0.35], // batido lento contra la fundamental
  [HARMONIC_HZ, 0.35], // octava
  [BASE_HZ * 3, 0.4], // el que se oye en un parlante de notebook
  [BASE_HZ * 3 + 1, 0.3], // batido en la banda audible
  [BASE_HZ * 6, 0.12], // aire mecánico
];
/** Envolvente de entrada y de salida, en milisegundos (S10). */
export const ATTACK_MS = 250;
export const RELEASE_MS = 200;
/** A partir de esta cantidad de motores el nivel no sube más. */
export const MAX_MOTORS = 3;
/** Nivel por cantidad de motores energizados, indexado 0..MAX_MOTORS. */
const LEVELS = [0, 0.5, 0.8, 1] as const;

/** Los dos ajustes que cortan el zumbido. */
export type HumSettings = {
  /** Mute maestro de la barra (S9). */
  silenciado: boolean;
  /** Interruptor propio «Sonido del motor» (S10), apagado por defecto. */
  sonidoMotor: boolean;
};

/** Lo que la aplicación informa en cada frame. */
export type HumFrame = {
  /** Cantidad de motores energizados en este frame. */
  motoresEnergizados: number;
  /** La simulación está corriendo. */
  simulando: boolean;
  ajustes: HumSettings;
};

/** El frame más el estado de la pestaña, que resuelve este módulo. */
export type HumInput = HumFrame & {
  /** Pestaña oculta: el navegador suspende el audio en segundo plano (L10). */
  oculta: boolean;
};

/**
 * Nivel del zumbido, de 0 a 1.
 *
 * Recibe la cantidad de motores energizados y los ajustes —mute maestro e
 * interruptor propio— junto con los otros dos cortes de estado: la simulación
 * tiene que estar corriendo y la pestaña visible. Devuelve 0 en cualquiera de
 * los cinco cortes de S10.
 */
export function humLevel(input: HumInput): number {
  if (input.ajustes.silenciado) return 0;
  if (!input.ajustes.sonidoMotor) return 0;
  if (!input.simulando) return 0;
  if (input.oculta) return 0;
  const motores = Number.isFinite(input.motoresEnergizados)
    ? Math.max(0, Math.floor(input.motoresEnergizados))
    : 0;
  if (motores === 0) return 0;
  return LEVELS[Math.min(motores, MAX_MOTORS)] ?? 0;
}

type Graph = { context: AudioContext; master: GainNode };

let graph: Graph | null = null;
/** Último frame que informó la aplicación. */
let frame: HumFrame | null = null;
/** Nivel ya aplicado: si no cambia, no se reinicia la envolvente ni hace clic. */
let applied = 0;
/** Pestaña oculta, resuelta acá porque es este módulo el que escucha el evento. */
let oculta = false;
let watching = false;

/** El constructor de `AudioContext` del navegador, si lo hay. */
function audioContextCtor(): typeof AudioContext | null {
  try {
    if (typeof AudioContext !== 'undefined') return AudioContext;
    const legacy = (globalThis as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
    return legacy ?? null;
  } catch {
    return null;
  }
}

/**
 * Arma el grafo una sola vez: las tres voces, el filtro y la ganancia maestra.
 *
 * Los osciladores quedan andando para siempre con la ganancia en 0 cuando no
 * hay nada que sonar: arrancarlos y frenarlos en cada flanco haría clic, y un
 * oscilador mudo no cuesta nada.
 */
function ensureGraph(): Graph | null {
  if (graph) return graph;
  try {
    const Ctor = audioContextCtor();
    if (!Ctor) return null;
    const context = new Ctor();
    const master = context.createGain();
    master.gain.value = 0;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = FILTER_HZ;
    filter.connect(master);
    master.connect(context.destination);
    const voice = (hz: number, level: number): void => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = hz;
      const gain = context.createGain();
      gain.gain.value = level;
      oscillator.connect(gain);
      gain.connect(filter);
      oscillator.start();
    };
    for (const [hz, level] of VOICES) voice(hz, level);
    graph = { context, master };
    return graph;
  } catch {
    return null;
  }
}

/**
 * Escucha `visibilitychange` una sola vez y reaplica el último frame: al
 * ocultarse la pestaña el nivel baja a 0 y al volver se restaura si corresponde.
 */
function watchVisibility(): void {
  if (watching) return;
  watching = true;
  try {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      oculta = document.visibilityState === 'hidden';
      apply();
    });
  } catch {
    // Sin documento no hay pestaña que ocultar.
  }
}

/** Pasa el nivel del último frame a la ganancia maestra con su envolvente. */
function apply(): void {
  const actual = frame;
  if (!actual) return;
  try {
    const level = humLevel({ ...actual, oculta });
    // Idempotente: el mismo estado no reinicia el ataque ni vuelve a rampar.
    if (level === applied) return;
    const audio = graph;
    // Sin contexto no hay nada que mover: crearlo fuera de un gesto dejaría el
    // audio mudo igual, así que se espera al `unlockAudio()` del próximo gesto.
    if (!audio) return;
    const now = audio.context.currentTime;
    const from = audio.master.gain.value;
    const target = level * HUM_GAIN;
    const ms = target > from ? ATTACK_MS : RELEASE_MS;
    audio.master.gain.cancelScheduledValues(now);
    audio.master.gain.setValueAtTime(from, now);
    audio.master.gain.linearRampToValueAtTime(target, now + ms / 1000);
    applied = level;
  } catch {
    // Un contexto cerrado no puede tumbar la simulación.
  }
}

/**
 * Crea o reanuda el `AudioContext` del zumbido. Se llama desde `unlockAudio()`,
 * que ya corre dentro de un gesto real (primer clic o tecla, y el botón de
 * simular), y desde el interruptor «Sonido del motor», cuyo clic también es un
 * gesto válido.
 *
 * Con el mute maestro puesto o el interruptor apagado no despierta nada: no hay
 * zumbido que desbloquear.
 */
export function resumeMotorHum(): void {
  try {
    const settings = getSettings();
    if (settings.silenciado || !settings.sonidoMotor) return;
    const audio = ensureGraph();
    if (!audio) return;
    if (audio.context.state === 'suspended') void audio.context.resume().catch(() => {});
    // Si ya había un frame pidiendo zumbido, ahora sí puede sonar.
    apply();
  } catch {
    // Sin Web Audio la aplicación sigue muda y funcionando.
  }
}

/**
 * Informa el estado del frame: cuántos motores están energizados, si la
 * simulación corre y los dos ajustes que cortan.
 *
 * Es idempotente: llamarlo con el mismo estado no reinicia el ataque ni hace
 * clic, así que la aplicación puede llamarlo en cada cambio de frame sin miedo.
 */
export function setMotorHum(next: HumFrame): void {
  frame = next;
  watchVisibility();
  apply();
}

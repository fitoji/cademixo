/**
 * El motor de sonido de la aplicación: la capa impura (S3-S8).
 *
 * `cuelume` entra por import diferido —son ~205 KB de síntesis— así que el
 * bundle inicial no lo paga: llega cuando el usuario hace el primer gesto. Ese
 * mismo gesto lo desbloquea, porque `unlock()` sólo vale dentro de uno y fuera
 * de él resuelve `false` y el audio queda mudo (S8). Desbloquear temprano
 * también mitiga el bug #22: cues pedidos mientras el `AudioContext` despierta
 * suenan todos juntos y más fuerte.
 *
 * Todo lo de acá está en `try/catch`: sin Web Audio, en modo privado o con el
 * motor caído, la aplicación no se rompe, no avisa y sigue funcionando muda.
 */

import { Coalescer, cueOf, type SoundEvent } from './sound-cues.ts';
import { getSettings } from './settings.ts';

export type { SoundEvent } from './sound-cues.ts';

/** El módulo tal como lo entrega el import diferido. */
type Engine = typeof import('cuelume');

/** Tema elegido por el usuario (S2). */
const THEME = 'mech';
/** Un poco por debajo del máximo: los presets ya vienen balanceados. */
const VOLUME = 0.6;

/** Un cue de cada dos por ventana de cada canal, y una carga por sesión. */
const coalescer = new Coalescer();

let engine: Engine | null = null;
let loading: Promise<Engine | null> | null = null;
/** El desbloqueo se arma una sola vez, aunque la app se monte dos veces. */
let armed = false;

/** Reloj de la coalescencia: monótono si el navegador lo da. */
function now(): number {
  try {
    return typeof performance === 'object' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  } catch {
    return Date.now();
  }
}

/**
 * Carga `cuelume` una sola vez y lo deja configurado.
 *
 * Devuelve `null` si el módulo no llega: el que llama decide qué hacer, que en
 * todos los casos es nada.
 */
function load(): Promise<Engine | null> {
  if (engine) return Promise.resolve(engine);
  loading ??= (async (): Promise<Engine | null> => {
    try {
      const module = await import('cuelume');
      try {
        module.setTheme(THEME);
        module.setVolume(VOLUME);
      } catch {
        // El tema y el volumen son cosmética: sin ellos el motor sigue sonando.
      }
      engine = module;
      return module;
    } catch {
      // Sin chunk, sin Web Audio o bloqueado por el navegador: la app va muda.
      return null;
    }
  })();
  return loading;
}

/**
 * Pide audio ya. Se llama desde un gesto real: el primer clic o tecla, y el
 * botón de simular.
 *
 * El `await` del import no pierde el gesto en los navegadores que importan: la
 * activación del documento queda pegada y `resume()` sigue valiendo. Si no,
 * `unlock()` resuelve `false`, que es justo lo que ya contempla `cuelume`.
 */
export function unlockAudio(): void {
  void load().then((module) => {
    if (!module) return;
    try {
      void module.unlock();
    } catch {
      // Nunca rechaza, pero un motor roto tampoco puede tumbar la app.
    }
  });
}

/**
 * Arma el desbloqueo temprano (S8): el primer `pointerdown` o `keydown` real
 * carga el motor y lo desbloquea, en captura para que valga también con el foco
 * adentro del lienzo. Se arma una vez por sesión.
 */
export function armAudio(): void {
  if (armed) return;
  armed = true;
  try {
    if (typeof window === 'undefined') return;
    window.addEventListener('pointerdown', unlockAudio, { capture: true, once: true });
    window.addEventListener('keydown', unlockAudio, { capture: true, once: true });
  } catch {
    // Sin `window` (o con listeners bloqueados) la app sigue funcionando muda.
  }
}

/**
 * Emite el cue de un evento, si corresponde.
 *
 * Cuatro filtros, en orden. El mute maestro de la barra (S9) corta primero:
 * silenciado no consulta el coalescer —no gasta turnos— ni toca `cuelume` —no
 * despierta el `AudioContext`—, así que al reactivar nada quedó encolado ni
 * sonando de más. Después el motor tiene que haber llegado (si no, el cue se
 * descarta: no se encola), el interruptor de su canal tiene que estar prendido
 * (S7) y el coalescer tiene que dejar pasar la ventana (S6).
 */
export function cue(event: SoundEvent): void {
  try {
    const spec = cueOf(event);
    if (!spec) return;
    const settings = getSettings();
    if (settings.silenciado) return;
    if (spec.channel === 'interfaz' ? !settings.sonidosInterfaz : !settings.sonidosSimulacion) {
      return;
    }
    const module = engine;
    if (!module) return;
    if (!coalescer.accept(spec.channel, now())) return;
    if (spec.layer === 'press') module.press(spec.preset);
    else if (spec.layer === 'release') module.release(spec.preset);
    else module.play(spec.preset);
  } catch {
    // Cualquier falla del audio es silencio, nunca un error de la aplicación.
  }
}

/**
 * Cues de sonido (S3-S6): la tabla semántica de eventos, el silencio de S4 y la
 * coalescencia. `sound-cues.ts` es puro —sin DOM y sin `cuelume`— así que se
 * importa directo, igual que el resto de las piezas del editor.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CUES,
  Coalescer,
  MIN_GAP_MS,
  SILENT_EVENTS,
  cueOf,
  type SoundEvent,
} from '../src/ui/sound-cues.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Los presets de `cuelume@0.2.8` que usa la app, con quién los dispara. */
const ESPERADOS: Readonly<Record<string, string>> = {
  'abrir archivo': 'open',
  guardar: 'success',
  'guardar como': 'success',
  'proyecto nuevo': 'success',
  error: 'error',
  rechazo: 'warning',
  accionar: 'toggle',
  'pulsador aprieta': 'tap',
  'pulsador suelta': 'tap',
  colocar: 'tap',
  'simulación inicia': 'ready',
  'simulación detiene': 'close',
  'bobina energizada': 'close',
  'bobina desenergizada': 'open',
  'protección disparada': 'warning',
};

// --- Tabla de S3 ----------------------------------------------------------

test('cada evento de la app mapea al preset que dice la spec', () => {
  for (const [evento, preset] of Object.entries(ESPERADOS)) {
    assert.equal(cueOf(evento)?.preset, preset, `«${evento}» tiene que sonar ${preset}`);
  }
});

test('la tabla no tiene ni un evento de más ni uno de menos', () => {
  assert.deepEqual(Object.keys(CUES).sort(), Object.keys(ESPERADOS).sort());
});

test('interfaz y simulación van por canales distintos', () => {
  const interfaz = [
    'abrir archivo',
    'guardar',
    'guardar como',
    'proyecto nuevo',
    'error',
    'rechazo',
    'accionar',
    'pulsador aprieta',
    'pulsador suelta',
    'colocar',
  ] as const;
  const simulacion = ['bobina energizada', 'bobina desenergizada', 'protección disparada'] as const;

  for (const evento of interfaz) assert.equal(CUES[evento].channel, 'interfaz', evento);
  for (const evento of simulacion) assert.equal(CUES[evento].channel, 'simulacion', evento);
});

test('el pulsador aprieta con press, suelta con release y el resto es un play', () => {
  assert.equal(CUES['pulsador aprieta'].layer, 'press');
  assert.equal(CUES['pulsador suelta'].layer, 'release');
  for (const evento of Object.keys(CUES) as SoundEvent[]) {
    if (evento === 'pulsador aprieta' || evento === 'pulsador suelta') continue;
    assert.equal(CUES[evento].layer, 'play', `«${evento}» se emite con play`);
  }
});

// --- S4: lo que no suena --------------------------------------------------

test('los eventos de S4 no tienen cue', () => {
  assert.ok(SILENT_EVENTS.length >= 11, 'la lista cubre todo S4');
  for (const nombre of SILENT_EVENTS) {
    assert.equal(cueOf(nombre), undefined, `«${nombre}» no debe sonar`);
    assert.equal(Object.hasOwn(CUES, nombre), false, `«${nombre}» no está en la tabla`);
  }
});

test('un evento mudo no entra al tipo de evento: no compila', () => {
  // @ts-expect-error — «zoom» es de S4: el tipo de evento no lo acepta.
  const evento: SoundEvent = 'zoom';
  assert.equal(cueOf(evento), undefined);
});

// --- S6: coalescencia -----------------------------------------------------

test('entre dos cues del mismo canal pasan al menos 50 ms', () => {
  assert.equal(MIN_GAP_MS, 50);
  const coalescer = new Coalescer();
  assert.equal(coalescer.accept('interfaz', 1_000), true);
  assert.equal(coalescer.accept('interfaz', 1_010), false);
  assert.equal(coalescer.accept('interfaz', 1_049), false);
  assert.equal(coalescer.accept('interfaz', 1_050), true, 'a los 50 ms vuelve a sonar');
});

test('el tope global de simulación deja pasar un solo cue por ventana', () => {
  const coalescer = new Coalescer();
  assert.equal(coalescer.accept('simulacion', 0), true, 'el primer flanco suena');
  // Dos bobinas en el mismo paso son un solo cue: el canal ya es el tope total.
  assert.equal(coalescer.accept('simulacion', 0), false);
  assert.equal(coalescer.accept('simulacion', 10), false);
  assert.equal(coalescer.accept('simulacion', 49), false);
  assert.equal(coalescer.accept('simulacion', 50), true);
  assert.equal(coalescer.accept('simulacion', 51), false);
});

test('los dos canales no se bloquean entre sí', () => {
  const coalescer = new Coalescer();
  assert.equal(coalescer.accept('interfaz', 0), true);
  assert.equal(coalescer.accept('simulacion', 0), true);
  assert.equal(coalescer.accept('interfaz', 20), false);
  assert.equal(coalescer.accept('simulacion', 20), false);
  assert.equal(coalescer.accept('interfaz', 50), true);
  assert.equal(coalescer.accept('simulacion', 60), true);
});

test('el reloj entra por parámetro y no se lee del sistema', () => {
  const coalescer = new Coalescer();
  // Dos instantes arbitrarios, lejos de cualquier reloj real: manda el número.
  assert.equal(coalescer.accept('interfaz', 5_000_000), true);
  assert.equal(coalescer.accept('interfaz', 5_000_000), false);
  assert.equal(coalescer.accept('interfaz', 5_000_050), true);

  // Un reloj que arranca en 0 no se lee como «hace una eternidad».
  const nuevo = new Coalescer();
  assert.equal(nuevo.accept('interfaz', 0), true);
  assert.equal(nuevo.accept('interfaz', 49), false);
  assert.equal(nuevo.accept('interfaz', 50), true);
});

// --- El módulo es puro ----------------------------------------------------

test('sound-cues no toca el reloj real, ni el DOM, ni el motor de audio', () => {
  const fuente = readFileSync(join(HERE, '..', 'src', 'ui', 'sound-cues.ts'), 'utf8');
  assert.equal(fuente.includes('Date.now'), false, 'el reloj se inyecta por parámetro');
  assert.equal(/from\s+['"]cuelume['"]/.test(fuente), false, 'la tabla no importa el motor');
  assert.equal(/\bdocument\.|\bwindow\./.test(fuente), false, 'el módulo no toca el DOM');
});

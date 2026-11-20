/**
 * Pulsadores momentáneos: la parte pura de T2.
 *
 * El clic durante la simulación decide entre dos comportamientos que no se
 * pueden confundir: un pulsador (8000-8007, «Contacto pulsador» en el catálogo)
 * se acciona y vuelve solo; un interruptor (8008-8011) o un selector se quedan
 * donde el usuario los deja. La decisión y la transformación del conjunto de
 * aparatos accionados son funciones puras, así que se testean acá sin React.
 *
 * Lo que NO se testea acá, porque es cableado de React y no hay entorno de
 * navegador en la suite: el `setTimeout` que suelta el pulso, su cancelación al
 * detener la simulación (S5) y al desmontar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOMENTARY_PULSE_MS,
  SIMULATION_TICK_MS,
  applyClick,
  clickActionOf,
} from '../src/model/component-spec.ts';

test('el pulso dura varios pasos de simulación, no un flanco', () => {
  // El reloj de simulación avanza de a `SIMULATION_TICK_MS` y cada tick es un
  // paso del solver: un pulso de un solo tick podría nacer y morir entre dos
  // pasos. Con tres ticks, cualquier instante del clic respecto del reloj deja
  // al menos dos pasos con el contacto accionado.
  assert.equal(MOMENTARY_PULSE_MS, SIMULATION_TICK_MS * 3);
  assert.ok(MOMENTARY_PULSE_MS >= SIMULATION_TICK_MS * 2, 'un pulso de un tick no es un pulso');
});

test('clic sobre un pulsador momentáneo: siempre pulso, nunca apagado', () => {
  for (let code = 8000; code <= 8007; code++) {
    assert.equal(clickActionOf(code, false), 'pulse', `${code} suelto`);
    // Un segundo clic durante el pulso lo REINICIA: jamás lo apaga.
    assert.equal(clickActionOf(code, true), 'pulse', `${code} ya accionado`);
  }
});

test('clic sobre un interruptor o un selector: alterna como hoy', () => {
  for (const code of [8008, 8009, 8010, 8011, 8012, 8014, 8100]) {
    assert.equal(clickActionOf(code, false), 'press', `${code} suelto`);
    assert.equal(clickActionOf(code, true), 'release', `${code} ya accionado`);
  }
});

test('clic sobre un código no presionable no toca nada', () => {
  // El conmutador 8018 tiene su propio camino (posición libre) y las
  // protecciones también: acá no se decide nada por ellos.
  for (const code of [8018, 7000, 6000, 9000, 12345]) {
    assert.equal(clickActionOf(code, false), 'none', `${code}`);
    assert.equal(clickActionOf(code, true), 'none', `${code}`);
  }
});

test('applyClick: el momento acciona sin duplicar y reinicia sin soltar', () => {
  assert.deepEqual(applyClick([], 5, 8000), [5]);
  // Segundo clic durante el pulso: sigue accionado, una sola vez, sin duplicar.
  assert.deepEqual(applyClick([5], 5, 8000), [5]);
  // El pulso de un pulsador no arrastra a los otros registros.
  assert.deepEqual(applyClick([5], 9, 8001), [5, 9]);
});

test('applyClick: interruptores alternan y el cierre es estable', () => {
  assert.deepEqual(applyClick([], 5, 8008), [5]);
  assert.deepEqual(applyClick([5], 5, 8008), []);
  // Idempotente al aplicarlo dos veces desde el mismo estado de partida.
  assert.deepEqual(applyClick([], 5, 8008), applyClick([], 5, 8008));
});

test('applyClick: presionar un interruptor no suelta un pulsador en curso', () => {
  // Dos botones a la vez: cada handle vive por su id, y el conjunto los lleva
  // a los dos.
  assert.deepEqual(applyClick([7], 5, 8010), [7, 5]);
  assert.deepEqual(applyClick([7, 5], 8, 8003), [7, 5, 8]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotorArrow } from '../src/symbols/draw.ts';
import { resolveSymbol } from '../src/symbols/library.ts';

/**
 * Reporte: «al simular el motor 1000, el giro no está centrado».
 *
 * La causa fue el pivote, no el mecanismo: `.motor-rotor` giraba sobre
 * `transform-origin: 12px 12px`, el centro de la caja declarada del registro
 * (24×24), mientras que la tinta del 1000 está anclada al origen y dibuja el
 * cuerpo en (6,6) con radio 9. La flecha rotaba sobre sí misma, 8,485 unidades
 * corrida del eje del motor.
 *
 * El contrato que arregla esto: la flecha devuelve como pivote el centro del
 * cuerpo dibujado, no el centro de la caja.
 */

/** Punto de arranque del arco: el `M` del `d`. */
const start = (d: string): { x: number; y: number } => {
  const m = /^M (-?[\d.]+) (-?[\d.]+)/.exec(d.trim());
  assert.ok(m, `el arco no empieza con M x y: ${d}`);
  return { x: Number(m![1]), y: Number(m![2]) };
};

test('el motor 1000 gira sobre el centro de su cuerpo, no sobre el de su caja', () => {
  // Se consulta por la interfaz pública, no por la constante interna del
  // símbolo: lo que importa es el cuerpo que el 1000 declara y dibuja.
  const body = resolveSymbol(1000, []).motorBody;
  assert.ok(body, 'el 1000 declara el cuerpo que dibuja `shapes`');

  // La tinta del 1000 está anclada al origen: el cuerpo no cae en el centro de
  // la caja declarada (24×24), que es donde giraba la flecha.
  const drift = Math.hypot(body!.x - 12, body!.y - 12);
  assert.ok(drift > 8, `el cuerpo no está en el centro de la caja (desvío ${drift})`);

  const rotor = rotorArrow(body, 24, 24);
  assert.deepEqual([rotor.x, rotor.y], [body!.x, body!.y], 'el pivote es el centro del cuerpo');
  assert.equal(rotor.r, body!.r, 'y el radio de la flecha sale del mismo cuerpo');
});

test('un motor sin cuerpo declarado gira sobre el centro de su caja', () => {
  const rotor = rotorArrow(undefined, 18, 15);

  assert.equal(rotor.x, 9);
  assert.equal(rotor.y, 7.5);
  assert.equal(rotor.r, 15 * 0.42, 'el radio de reserva es el 42% del lado menor');
});

test('la flecha se dibuja alrededor del pivote, a una distancia fija del centro', () => {
  const rotor = rotorArrow(resolveSymbol(1000, []).motorBody, 24, 24);
  const a = start(rotor.arrow);

  // El arco pasa por encima del pivote, de −0,55 a +0,55 radios en x y a 1,12
  // radios en y: si alguien cambia el centro de la flecha sin cambiar el pivote,
  // la animación vuelve a descentrarse.
  assert.ok(
    Math.abs(a.x - (rotor.x - rotor.r * 0.55)) < 1e-9,
    `el arco arranca a 0,55 radios a la izquierda del pivote: ${a.x} vs ${rotor.x}`,
  );
  assert.ok(
    Math.abs(a.y - (rotor.y - rotor.r * 1.12)) < 1e-9,
    `el arco arranca a 1,12 radios por encima del pivote: ${a.y}`,
  );
});

test('los motores de caja conservan su pivote', () => {
  // Los códigos 1001-1010 no declaran cuerpo: su tinta sí está centrada en la
  // caja, así que su pivote no cambia. Este test los protege de un arrastre.
  for (const [w, h] of [
    [24, 24],
    [18, 15],
    [12, 15],
    [6, 24],
    [24, 15],
  ]) {
    const rotor = rotorArrow(undefined, w!, h!);
    assert.deepEqual([rotor.x, rotor.y], [w! / 2, h! / 2], `pivote del motor de caja ${w}×${h}`);
  }
});

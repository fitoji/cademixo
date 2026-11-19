import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isProtection, specOf } from '../src/model/component-spec.ts';
import type { CadeRecordModel } from '../src/model/project.ts';
import { visualStateOf, type VisualContext } from '../src/sim/visual.ts';

/**
 * Alcance de la atenuación de protecciones (S7) y su estado en simulación (S6).
 *
 * La regla del lienzo `[data-protection][data-state='open']` pinta la tinta al
 * ~45%: una protección abierta se lee «apagada» y una cerrada con tinta plena.
 * El riesgo que esto vigila es que la atenuación se dispare sobre algo que sólo
 * está `open` porque está en reposo — un pulsador, por ejemplo — y el usuario
 * vea el aparato apagado sin haber simulado nada. Sin DOM: se prueban las dos
 * piezas puras que deciden el atributo (`isProtection`) y el estado
 * (`visualStateOf`).
 */

const rec = (id: number, code: number, pins: string[] = []): Pick<CadeRecordModel, 'id' | 'code' | 'pins'> => ({
  id,
  code,
  pins,
});

const ctx = (over: Partial<VisualContext> = {}): VisualContext => ({
  simulating: true,
  live: new Set(),
  closed: new Set(),
  pressed: new Set(),
  ...over,
});

/** Protecciones y auxiliares térmicos: los únicos que se atenúan. */
const PROTECTIONS = [6000, 6002, 6003, 6007, 8017];
/** Todo lo que NO lleva el atributo, aunque su estado sea `open`. */
const NO_PROTECTIONS = [8003, 8014, 8100, 8018, 7001, 9000, 1000];

test('sólo las protecciones y sus auxiliares térmicos llevan el atributo de atenuación', () => {
  for (const code of PROTECTIONS) assert.equal(isProtection(code), true, `el ${code} es una protección`);
  for (const code of NO_PROTECTIONS) assert.equal(isProtection(code), false, `el ${code} no se atenúa`);
});

test('un pulsador en reposo está abierto y aun así no se atenúa', () => {
  // Los pulsadores NA en reposo devuelven `open`, igual que una protección
  // abierta: lo que los separa es el atributo, no el estado.
  for (const code of [8003, 8100]) {
    const r = rec(1, code);
    assert.equal(visualStateOf(r, ctx()), 'open', `el ${code} en reposo está abierto`);
    assert.equal(isProtection(code), false, `el ${code} no lleva \`data-protection\``);
  }
  // Y al revés: ninguna protección es presionable, así que el clic nunca le
  // pone `data-state='pressed'` ni la saca de la regla por la puerta de atrás.
  for (const code of PROTECTIONS) {
    assert.equal(specOf(code).pressable, false, `el ${code} no es presionable`);
  }
});

test('una protección abierta y una cerrada se distinguen por su estado (S6)', () => {
  for (const code of PROTECTIONS) {
    const r = rec(7, code);
    assert.equal(visualStateOf(r, ctx()), 'open', `el ${code} abierta`);
    assert.equal(visualStateOf(r, ctx({ closed: new Set([7]) })), 'closed', `el ${code} cerrada`);
  }
});

test('sin simular nada queda atenuado: las protecciones resuelven `idle`', () => {
  const rest = ctx({ simulating: false });
  for (const code of [...PROTECTIONS, ...NO_PROTECTIONS]) {
    assert.equal(visualStateOf(rec(3, code), rest), 'idle', `el ${code} en reposo no se pinta`);
  }
});

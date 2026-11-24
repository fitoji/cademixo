/**
 * El nombre con el que se guarda un esquema.
 *
 * Regla del producto: se guarda **siempre** `.cad`. Los `.cade` se abren sin
 * problema y al guardarlos quedan como `.cad`, que es el mismo formato con otra
 * extensión. Este test fija esa regla antes de que exista la función.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NATIVE_EXTENSION,
  SAVE_EXTENSION,
  cadFileName,
  isMixoFileName,
  mixoFileName,
  suggestedSaveName,
} from '../src/format/filename.ts';

test('la extensión de guardado es .cad', () => {
  assert.equal(SAVE_EXTENSION, '.cad');
});

test('un .cade se guarda como .cad', () => {
  assert.equal(cadFileName('inversion-giro-cej.cade'), 'inversion-giro-cej.cad');
  assert.equal(cadFileName('luz-con-interruptor.cade'), 'luz-con-interruptor.cad');
});

test('un .cad conserva su nombre', () => {
  assert.equal(cadFileName('arranque-paro-motor-3f.cad'), 'arranque-paro-motor-3f.cad');
  assert.equal(cadFileName('luz_verde.cad'), 'luz_verde.cad');
});

test('la extensión se normaliza sin importar mayúsculas', () => {
  assert.equal(cadFileName('ESQUEMA.CADE'), 'ESQUEMA.cad');
  assert.equal(cadFileName('ESQUEMA.CAD'), 'ESQUEMA.cad');
});

test('un nombre sin extensión recibe .cad', () => {
  assert.equal(cadFileName('esquema'), 'esquema.cad');
  assert.equal(cadFileName('mi.tablero'), 'mi.tablero.cad');
});

test('un nombre vacío cae en el nombre por defecto', () => {
  assert.equal(cadFileName(''), 'sin título.cad');
  assert.equal(cadFileName('   '), 'sin título.cad');
  assert.equal(cadFileName('sin título.cade'), 'sin título.cad');
});

test('sólo se toca la extensión final', () => {
  assert.equal(cadFileName('a.b.cade'), 'a.b.cad');
  assert.equal(cadFileName('panel.cad.viejo'), 'panel.cad.viejo.cad');
});

test('el proyecto nativo usa .mixo', () => {
  assert.equal(NATIVE_EXTENSION, '.mixo');
  assert.equal(mixoFileName('plano.cad'), 'plano.mixo');
  assert.equal(mixoFileName('plano.cade'), 'plano.mixo');
  assert.equal(mixoFileName('plano.mixo'), 'plano.mixo');
  assert.equal(mixoFileName(''), 'sin título.mixo');
  assert.equal(isMixoFileName('plano.mixo'), true);
  assert.equal(isMixoFileName('PLANO.MIXO'), true);
  assert.equal(isMixoFileName('plano.cad'), false);
});

test('el nombre sugerido respeta el destino', () => {
  assert.equal(suggestedSaveName('plano.mixo', false), 'plano.cad');
  assert.equal(suggestedSaveName('plano.cad', true), 'plano.mixo');
  assert.equal(suggestedSaveName('plano'), 'plano.cad');
});

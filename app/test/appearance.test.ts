/**
 * Apariencia: los dos ejes (día/noche y clásico/moderno) se leen de claves
 * distintas y caen a noche + clásico cuando no hay storage o hay basura.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  MODE_KEY,
  STYLE_KEY,
  panelesForStyle,
  wireWidthForStyle,
  parseMode,
  parseStyle,
  readMode,
  readStyle,
} from '../src/ui/appearance.ts';

test('las claves de los dos ejes no colisionan', () => {
  assert.notEqual(MODE_KEY, STYLE_KEY);
  assert.equal(MODE_KEY, 'simuelectro:mode');
  assert.equal(STYLE_KEY, 'simuelectro:estilo');
});

test('sólo light enciende el día', () => {
  assert.equal(parseMode('light'), 'light');
  assert.equal(parseMode('dark'), 'dark');
  assert.equal(parseMode('moderno'), 'dark');
  assert.equal(parseMode('LIGHT'), 'dark');
  assert.equal(parseMode(null), 'dark');
});

test('sólo moderno enciende el estilo moderno', () => {
  assert.equal(parseStyle('moderno'), 'moderno');
  assert.equal(parseStyle('clasico'), 'clasico');
  assert.equal(parseStyle('light'), 'clasico');
  assert.equal(parseStyle('Moderno'), 'clasico');
  assert.equal(parseStyle(null), 'clasico');
});

test('sin localStorage valen noche y clásico', () => {
  assert.equal(readMode(), 'dark');
  assert.equal(readStyle(), 'clasico');
});

test('los cuatro looks son combinaciones independientes', () => {
  const modos = ['dark', 'light'] as const;
  const estilos = ['clasico', 'moderno'] as const;
  const looks = new Set<string>();
  for (const modo of modos) {
    for (const estilo of estilos) looks.add(`${parseMode(modo)}:${parseStyle(estilo)}`);
  }
  assert.deepEqual([...looks].sort(), [
    'dark:clasico',
    'dark:moderno',
    'light:clasico',
    'light:moderno',
  ]);
});

test('cada estilo carga la paleta en su orientación natural', () => {
  assert.equal(panelesForStyle('clasico'), 'horizontal');
  assert.equal(panelesForStyle('moderno'), 'vertical');
  assert.equal(wireWidthForStyle('clasico'), 'fino');
  assert.equal(wireWidthForStyle('moderno'), 'normal');
});

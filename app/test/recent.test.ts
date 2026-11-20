/**
 * Recientes de la paleta: últimos códigos insertados, sin duplicados y con
 * tope. Guarda códigos del catálogo, no ids de registro.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  RECENT_KEY,
  RECENT_MAX,
  parseRecent,
  pushRecent,
  readRecent,
  writeRecent,
} from '../src/ui/recent.ts';

test('el último insertado va primero y no se duplica', () => {
  assert.deepEqual(pushRecent([], 1000), [1000]);
  assert.deepEqual(pushRecent([1000], 6007), [6007, 1000]);
  assert.deepEqual(pushRecent([6007, 1000], 1000), [1000, 6007]);
});

test('respeta el tope descartando el más viejo', () => {
  let list: number[] = [];
  for (let code = 1; code <= RECENT_MAX + 3; code++) list = pushRecent(list, code);
  assert.equal(list.length, RECENT_MAX);
  assert.equal(list[0], RECENT_MAX + 3);
  assert.equal(list.includes(1), false);
});

test('parsea tolerando basura y duplicados', () => {
  assert.deepEqual(parseRecent(null), []);
  assert.deepEqual(parseRecent('no es json'), []);
  assert.deepEqual(parseRecent('{"a":1}'), []);
  assert.deepEqual(parseRecent('[1000,"x",null,1.5,0,-2,1000]'), [1000]);
});

test('lee y escribe contra un storage cualquiera', () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
  writeRecent([1000, 6007], storage);
  assert.equal(data.get(RECENT_KEY), '[1000,6007]');
  assert.deepEqual(readRecent(storage), [1000, 6007]);
});

test('sin storage no rompe', () => {
  assert.deepEqual(readRecent(null), []);
  assert.doesNotThrow(() => writeRecent([1000], null));
});

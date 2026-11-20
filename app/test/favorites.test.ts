/**
 * Favoritos de la paleta: lectura tolerante de lo guardado en el navegador,
 * toggle puro y el store que comparten Propiedades y la paleta. Sin DOM: el
 * storage entra como parámetro, como en `settings.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FAVORITES_KEY,
  getFavorites,
  isFavorite,
  parseFavorites,
  readFavorites,
  subscribeFavorites,
  toggleFavorite,
  toggleStoredFavorite,
  writeFavorites,
} from '../src/ui/favorites.ts';

// --- Codec tolerante ------------------------------------------------------

test('sin nada guardado no hay favoritos', () => {
  assert.deepEqual(parseFavorites(null), []);
  assert.deepEqual(parseFavorites(''), []);
});

test('un JSON roto no rompe la paleta', () => {
  assert.deepEqual(parseFavorites('{no es json'), []);
  assert.deepEqual(parseFavorites('"1000"'), []);
  assert.deepEqual(parseFavorites('{"a":1}'), []);
});

test('descarta valores que no son códigos y quita duplicados', () => {
  assert.deepEqual(parseFavorites('[1000,"2001",-3,0,1000,1.5,6003]'), [1000, 6003]);
});

// --- Toggle puro ---------------------------------------------------------

test('agregar un código que falta lo suma al final sin tocar la lista original', () => {
  const prev = [1000];
  assert.deepEqual(toggleFavorite(prev, 6003), [1000, 6003]);
  assert.deepEqual(prev, [1000]);
  assert.deepEqual(toggleFavorite([], 2001), [2001]);
});

test('volver a agregar el mismo código no lo duplica', () => {
  assert.deepEqual(toggleFavorite([1000, 6003], 6003), [1000]);
});

test('tocar un favorito lo quita y conserva el orden del resto', () => {
  assert.deepEqual(toggleFavorite([1000, 6003, 2001], 6003), [1000, 2001]);
  assert.deepEqual(toggleFavorite([1000], 1000), []);
});

test('isFavorite responde sobre la lista guardada', () => {
  assert.equal(isFavorite([1000, 6003], 6003), true);
  assert.equal(isFavorite([1000, 6003], 2001), false);
  assert.equal(isFavorite([], 1000), false);
});

// --- Storage defensivo ---------------------------------------------------

/** Doble de storage en memoria: cada test decide con qué arranca. */
function fakeStorage(raw: string | null): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  peek: () => string | null;
} {
  let value = raw;
  return {
    getItem: (key: string) => (key === FAVORITES_KEY ? value : null),
    setItem: (_key: string, next: string) => {
      value = next;
    },
    peek: () => value,
  };
}

test('readFavorites lee la clave de favoritos y tolera un JSON roto', () => {
  assert.deepEqual(readFavorites(fakeStorage('[1000,6003]')), [1000, 6003]);
  assert.deepEqual(readFavorites(fakeStorage(null)), []);
  assert.deepEqual(readFavorites(fakeStorage('{no es json')), []);
});

test('writeFavorites guarda la lista bajo la clave y readFavorites la devuelve', () => {
  const storage = fakeStorage(null);
  writeFavorites([1000, 6003], storage);
  assert.equal(storage.peek(), '[1000,6003]');
  assert.deepEqual(readFavorites(storage), [1000, 6003]);

  writeFavorites([], storage);
  assert.deepEqual(readFavorites(storage), []);
});

test('un storage que tira no rompe la lectura, la escritura ni el favorito en memoria', () => {
  const roto = {
    getItem: (): string | null => {
      throw new Error('sin acceso de lectura');
    },
    setItem: (): void => {
      throw new Error('sin acceso de escritura');
    },
  };
  assert.deepEqual(readFavorites(roto), []);
  assert.doesNotThrow(() => writeFavorites([1000], roto));
});

test('sin storage (modo privado) leer y escribir no rompen', () => {
  assert.deepEqual(readFavorites(null), []);
  assert.doesNotThrow(() => writeFavorites([1000], null));
});

// --- Store compartido ----------------------------------------------------

test('el store comparte el favorito y avisa sólo cuando cambia', () => {
  assert.deepEqual(getFavorites(), []);
  assert.equal(getFavorites(), getFavorites());

  let avisos = 0;
  const unsubscribe = subscribeFavorites(() => {
    avisos += 1;
  });

  toggleStoredFavorite(1000);
  assert.deepEqual(getFavorites(), [1000]);
  assert.equal(isFavorite(getFavorites(), 1000), true);
  assert.equal(avisos, 1);

  toggleStoredFavorite(6003);
  assert.deepEqual(getFavorites(), [1000, 6003]);
  assert.equal(avisos, 2);

  toggleStoredFavorite(1000);
  assert.deepEqual(getFavorites(), [6003]);
  assert.equal(avisos, 3);

  unsubscribe();
  toggleStoredFavorite(6003);
  assert.deepEqual(getFavorites(), []);
  assert.equal(avisos, 3);
});

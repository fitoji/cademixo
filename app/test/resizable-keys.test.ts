/**
 * Persistencia del ancho de los paneles redimensionables.
 *
 * ui-sdk guarda el layout bajo su propia clave (`ui-sdk-resizable:<autoSaveId>`).
 * El adaptador la traduce al prefijo del proyecto (`simuelectro:`) y tolera
 * basura: sin layout guardado, JSON roto o una forma inesperada, los paneles
 * arrancan con sus tamaños por defecto en vez de romper el arranque.
 *
 * Es la única parte de la isla `resizable` verificable sin navegador: el
 * arrastre, el teclado y la persistencia entre recargas se prueban a mano.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  LAYOUT_PREFIX,
  createLayoutStorage,
  layoutKey,
  readLayouts,
  serializeLayouts,
} from '../src/components/ui/resizable-storage.ts';

/** Store en memoria con la misma forma que `localStorage`. */
function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string): string | null => data.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      data.set(key, value);
    },
  };
}

test('la clave guardada lleva el prefijo del proyecto y no se duplica', () => {
  assert.equal(LAYOUT_PREFIX, 'simuelectro:');
  assert.equal(layoutKey('ui-sdk-resizable:paneles'), 'simuelectro:ui-sdk-resizable:paneles');
  assert.equal(layoutKey('simuelectro:ui-sdk-resizable:paneles'), 'simuelectro:ui-sdk-resizable:paneles');
});

test('sin layout guardado o con basura se arranca sin layout', () => {
  assert.equal(readLayouts(null), null);
  assert.equal(readLayouts(''), null);
  assert.equal(readLayouts('{'), null);
  assert.equal(readLayouts('null'), null);
  assert.equal(readLayouts('[25,75]'), null);
  assert.equal(readLayouts('{"paleta,lienzo,inspector":"25"}'), null);
});

test('un layout válido se lee y se descartan las entradas inválidas', () => {
  assert.deepEqual(readLayouts('{"lienzo,inspector":[72.5,27.5]}'), { 'lienzo,inspector': [72.5, 27.5] });
  assert.deepEqual(readLayouts('{"a,b":[25,75],"c,d":["25",75],"e,f":[null,1]}'), { 'a,b': [25, 75] });
});

test('serializar y leer es ida y vuelta', () => {
  const layouts = { 'paleta,lienzo,inspector': [22.5, 55.5, 22] };
  assert.deepEqual(readLayouts(serializeLayouts(layouts)), layouts);
});

test('el adaptador escribe bajo el prefijo del proyecto, nunca bajo la clave suelta', () => {
  const store = memoryStore();
  const storage = createLayoutStorage(store);

  storage.setItem('ui-sdk-resizable:paneles', '{"lienzo,inspector":[70,30]}');

  assert.deepEqual([...store.data.keys()], ['simuelectro:ui-sdk-resizable:paneles']);
  assert.deepEqual(readLayouts(storage.getItem('ui-sdk-resizable:paneles')), { 'lienzo,inspector': [70, 30] });
});

test('el adaptador tolera un valor guardado ilegible y un store que falla', () => {
  const roto = createLayoutStorage(memoryStore({ 'simuelectro:ui-sdk-resizable:paneles': 'no es json' }));
  assert.equal(roto.getItem('ui-sdk-resizable:paneles'), null);

  const ausente = createLayoutStorage(memoryStore());
  assert.equal(ausente.getItem('ui-sdk-resizable:paneles'), null);

  const sinStorage = createLayoutStorage(null);
  assert.equal(sinStorage.getItem('ui-sdk-resizable:paneles'), null);
  assert.doesNotThrow(() => sinStorage.setItem('ui-sdk-resizable:paneles', '{"a,b":[50,50]}'));
});

test('el adaptador no propaga el error de un store lleno', () => {
  const storage = createLayoutStorage({
    getItem: () => {
      throw new Error('sin permiso');
    },
    setItem: () => {
      throw new Error('cuota');
    },
  });
  assert.equal(storage.getItem('ui-sdk-resizable:paneles'), null);
  assert.doesNotThrow(() => storage.setItem('ui-sdk-resizable:paneles', '{"a,b":[50,50]}'));
});

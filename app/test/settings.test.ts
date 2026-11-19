/** Ajustes de apariencia: codec tolerante, store, derivaciones y auto cierre. */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  DEFAULT_SETTINGS,
  attachPinRadius,
  getSettings,
  nextOpenCats,
  parseSettings,
  pinRadius,
  serializeSettings,
  setSettings,
  subscribeSettings,
  wireStroke,
} from '../src/ui/settings.ts';

// --- Codec tolerante -------------------------------------------------------

test('sin nada guardado valen los ajustes por defecto', () => {
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings(''), DEFAULT_SETTINGS);
  assert.deepEqual(DEFAULT_SETTINGS, { pinSize: 'normal', wireWidth: 'normal', autoCierre: false });
});

test('la basura y el JSON roto caen a los valores por defecto', () => {
  assert.deepEqual(parseSettings('{no es json'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('null'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('"normal"'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('42'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('[1,2,3]'), DEFAULT_SETTINGS);
});

test('un objeto parcial completa cada campo con su default', () => {
  assert.deepEqual(parseSettings('{"pinSize":"grande"}'), {
    pinSize: 'grande',
    wireWidth: 'normal',
    autoCierre: false,
  });
  assert.deepEqual(parseSettings('{"autoCierre":true}'), {
    pinSize: 'normal',
    wireWidth: 'normal',
    autoCierre: true,
  });
});

test('un valor desconocido cae sólo al default de su campo', () => {
  const parsed = parseSettings('{"pinSize":"enorme","wireWidth":"gigante","autoCierre":true}');
  assert.deepEqual(parsed, { pinSize: 'normal', wireWidth: 'normal', autoCierre: true });
  assert.deepEqual(parseSettings('{"pinSize":"chico","wireWidth":"fino"}'), {
    pinSize: 'chico',
    wireWidth: 'fino',
    autoCierre: false,
  });
});

test('un tipo equivocado cae sólo al default de su campo', () => {
  const parsed = parseSettings('{"pinSize":3,"wireWidth":null,"autoCierre":"si"}');
  assert.deepEqual(parsed, DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{"pinSize":["grande"],"wireWidth":"grueso","autoCierre":0}'), {
    pinSize: 'normal',
    wireWidth: 'grueso',
    autoCierre: false,
  });
});

test('serializar y volver a parsear devuelve los mismos ajustes', () => {
  const values = [
    DEFAULT_SETTINGS,
    { pinSize: 'chico', wireWidth: 'fino', autoCierre: true },
    { pinSize: 'grande', wireWidth: 'grueso', autoCierre: true },
  ] as const;
  for (const settings of values) {
    assert.deepEqual(parseSettings(serializeSettings(settings)), settings);
  }
  const text = serializeSettings({ pinSize: 'grande', wireWidth: 'fino', autoCierre: true });
  assert.deepEqual(JSON.parse(text), { pinSize: 'grande', wireWidth: 'fino', autoCierre: true });
});

// --- Reducer del auto cierre ----------------------------------------------

test('con auto cierre abrir otro panel cierra el anterior', () => {
  const uno = nextOpenCats([], 'alimentacion', true);
  assert.deepEqual(uno, ['alimentacion']);
  assert.deepEqual(nextOpenCats(uno, 'motores', true), ['motores']);
});

test('sin auto cierre los paneles conviven', () => {
  const uno = nextOpenCats([], 'alimentacion', false);
  assert.deepEqual(uno, ['alimentacion']);
  assert.deepEqual(nextOpenCats(uno, 'motores', false), ['alimentacion', 'motores']);
});

test('tocar el panel abierto lo cierra en los dos modos', () => {
  assert.deepEqual(nextOpenCats(['alimentacion'], 'alimentacion', true), []);
  assert.deepEqual(nextOpenCats(['alimentacion'], 'alimentacion', false), []);
  assert.deepEqual(nextOpenCats(['motores', 'alimentacion'], 'alimentacion', false), ['motores']);
});

test('el reducer no modifica el arreglo que recibe', () => {
  const prev = ['alimentacion'];
  nextOpenCats(prev, 'motores', false);
  nextOpenCats(prev, 'alimentacion', false);
  nextOpenCats(prev, 'motores', true);
  assert.deepEqual(prev, ['alimentacion']);
});

// --- Derivaciones ---------------------------------------------------------

test('Normal reproduce las geometrías de hoy', () => {
  assert.equal(pinRadius('normal'), 1.4);
  assert.equal(attachPinRadius('normal'), 0.9);
  assert.equal(wireStroke('normal'), 0.17);
});

test('el tamaño y el grosor crecen en los dos sentidos', () => {
  assert.ok(pinRadius('chico') < pinRadius('normal'));
  assert.ok(pinRadius('normal') < pinRadius('grande'));
  assert.ok(attachPinRadius('chico') < attachPinRadius('normal'));
  assert.ok(attachPinRadius('normal') < attachPinRadius('grande'));
  assert.ok(wireStroke('fino') < wireStroke('normal'));
  assert.ok(wireStroke('normal') < wireStroke('grueso'));
  assert.equal(pinRadius('chico'), 1.1);
  assert.equal(pinRadius('grande'), 1.9);
  assert.equal(attachPinRadius('chico'), 0.7);
  assert.equal(attachPinRadius('grande'), 1.2);
  assert.equal(wireStroke('fino'), 0.12);
  assert.equal(wireStroke('grueso'), 0.24);
});

// --- Store ---------------------------------------------------------------

test('sin storage el store arranca en los defaults y avisa sólo al cambiar', () => {
  assert.deepEqual(getSettings(), DEFAULT_SETTINGS);

  let avisos = 0;
  const unsubscribe = subscribeSettings(() => {
    avisos += 1;
  });

  setSettings({ pinSize: 'normal' });
  assert.equal(avisos, 0);

  setSettings({ pinSize: 'grande' });
  assert.deepEqual(getSettings(), { pinSize: 'grande', wireWidth: 'normal', autoCierre: false });
  assert.equal(avisos, 1);

  setSettings({ wireWidth: 'grueso', autoCierre: true });
  assert.deepEqual(getSettings(), { pinSize: 'grande', wireWidth: 'grueso', autoCierre: true });
  assert.equal(avisos, 2);

  unsubscribe();
  setSettings(DEFAULT_SETTINGS);
  assert.equal(avisos, 2);
  assert.deepEqual(getSettings(), DEFAULT_SETTINGS);
});

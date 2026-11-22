/**
 * Ajustes de apariencia: codec tolerante (incluida la orientación de los
 * paneles), store, derivaciones y auto cierre en las dos orientaciones.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  attachPinRadius,
  getSettings,
  nextOpenAccordion,
  nextOpenCats,
  parseSettings,
  pinRadius,
  pinStroke,
  serializeSettings,
  setSettings,
  subscribeSettings,
  wireStroke,
} from '../src/ui/settings.ts';

// --- Codec tolerante -------------------------------------------------------

test('sin nada guardado valen los ajustes por defecto', () => {
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings(''), DEFAULT_SETTINGS);
  assert.deepEqual(DEFAULT_SETTINGS, {
    pinSize: 'normal',
    wireWidth: 'fino',
    paneles: 'horizontal',
    autoCierre: false,
    sonidosInterfaz: true,
    sonidosSimulacion: true,
    silenciado: false,
    sonidoMotor: true,
  });
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
    wireWidth: 'fino',
    paneles: 'horizontal',
    autoCierre: false,
    sonidosInterfaz: true,
    sonidosSimulacion: true,
    silenciado: false,
    sonidoMotor: true,
  });
  assert.deepEqual(parseSettings('{"autoCierre":true}'), {
    pinSize: 'normal',
    wireWidth: 'fino',
    paneles: 'horizontal',
    autoCierre: true,
    sonidosInterfaz: true,
    sonidosSimulacion: true,
    silenciado: false,
    sonidoMotor: true,
  });
});

test('un valor desconocido cae sólo al default de su campo', () => {
  const parsed = parseSettings('{"pinSize":"enorme","wireWidth":"gigante","autoCierre":true}');
  assert.deepEqual(parsed, {
    pinSize: 'normal',
    wireWidth: 'fino',
    paneles: 'horizontal',
    autoCierre: true,
    sonidosInterfaz: true,
    sonidosSimulacion: true,
    silenciado: false,
    sonidoMotor: true,
  });
  assert.deepEqual(parseSettings('{"pinSize":"chico","wireWidth":"fino"}'), {
    pinSize: 'chico',
    wireWidth: 'fino',
    paneles: 'horizontal',
    autoCierre: false,
    sonidosInterfaz: true,
    sonidosSimulacion: true,
    silenciado: false,
    sonidoMotor: true,
  });
});

test('un tipo equivocado cae sólo al default de su campo', () => {
  const parsed = parseSettings('{"pinSize":3,"wireWidth":null,"autoCierre":"si"}');
  assert.deepEqual(parsed, DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{"pinSize":["grande"],"wireWidth":"grueso","autoCierre":0}'), {
    pinSize: 'normal',
    wireWidth: 'grueso',
    paneles: 'horizontal',
    autoCierre: false,
    sonidosInterfaz: true,
    sonidosSimulacion: true,
    silenciado: false,
    sonidoMotor: true,
  });
});

test('un objeto o un número en lugar del valor cae al default del campo', () => {
  assert.deepEqual(parseSettings('{"wireWidth":{"v":"fino"}}'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{"autoCierre":1}'), DEFAULT_SETTINGS);
});

test('serializar y volver a parsear devuelve los mismos ajustes', () => {
  const values = [
    DEFAULT_SETTINGS,
    {
      pinSize: 'chico',
      wireWidth: 'fino',
      paneles: 'vertical',
      autoCierre: true,
      sonidosInterfaz: false,
      sonidosSimulacion: true,
      silenciado: true,
      sonidoMotor: true,
    },
    {
      pinSize: 'grande',
      wireWidth: 'grueso',
      paneles: 'horizontal',
      autoCierre: true,
      sonidosInterfaz: true,
      sonidosSimulacion: false,
      silenciado: false,
      sonidoMotor: false,
    },
  ] as const;
  for (const settings of values) {
    assert.deepEqual(parseSettings(serializeSettings(settings)), settings);
  }
  const text = serializeSettings({
    pinSize: 'grande',
    wireWidth: 'fino',
    paneles: 'vertical',
    autoCierre: true,
    sonidosInterfaz: false,
    sonidosSimulacion: true,
    silenciado: true,
    sonidoMotor: true,
  });
  assert.deepEqual(JSON.parse(text), {
    pinSize: 'grande',
    wireWidth: 'fino',
    paneles: 'vertical',
    autoCierre: true,
    sonidosInterfaz: false,
    sonidosSimulacion: true,
    silenciado: true,
    sonidoMotor: true,
  });
});

// --- Orientación de los paneles de componentes ----------------------------

test('sin preferencia los paneles de componentes son horizontales', () => {
  assert.equal(DEFAULT_SETTINGS.paneles, 'horizontal');
  assert.equal(parseSettings(null).paneles, 'horizontal');
  assert.equal(parseSettings('{}').paneles, 'horizontal');
});

test('la orientación vertical guardada vuelve a leerse', () => {
  assert.equal(parseSettings('{"paneles":"vertical"}').paneles, 'vertical');
  const guardado = serializeSettings({ ...DEFAULT_SETTINGS, paneles: 'vertical' });
  assert.equal(parseSettings(guardado).paneles, 'vertical');
  assert.equal(JSON.parse(guardado).paneles, 'vertical');
});

test('una orientación inválida cae a horizontal sin tocar los otros campos', () => {
  assert.deepEqual(parseSettings('{"paneles":"diagonal"}'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{"paneles":null}'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{"paneles":["vertical"]}'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{"paneles":3,"pinSize":"grande"}'), {
    pinSize: 'grande',
    wireWidth: 'fino',
    paneles: 'horizontal',
    autoCierre: false,
    sonidosInterfaz: true,
    sonidosSimulacion: true,
    silenciado: false,
    sonidoMotor: true,
  });
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

test('sin auto cierre el panel que queda conserva el orden de los que sobreviven', () => {
  const prev = ['alimentacion', 'motores', 'fav'];
  assert.deepEqual(nextOpenCats(prev, 'motores', false), ['alimentacion', 'fav']);
});

test('el acordeón vertical con auto cierre deja abierto sólo el último panel', () => {
  assert.deepEqual(nextOpenAccordion([], ['motor'], true), ['motor']);
  assert.deepEqual(nextOpenAccordion(['motor'], ['proteccion'], true), ['proteccion']);
  // Radix devuelve los dos valores cuando el usuario abre un segundo panel.
  assert.deepEqual(nextOpenAccordion(['motor'], ['motor', 'proteccion'], true), ['proteccion']);
  // Cerrar el abierto sigue cerrando en el modo con auto cierre.
  assert.deepEqual(nextOpenAccordion(['motor'], [], true), []);
});

test('el acordeón vertical sin auto cierre respeta lo que abrió el usuario', () => {
  assert.deepEqual(nextOpenAccordion(['motor'], ['motor', 'proteccion'], false), [
    'motor',
    'proteccion',
  ]);
  assert.deepEqual(nextOpenAccordion(['motor', 'proteccion'], ['proteccion'], false), ['proteccion']);
  assert.deepEqual(nextOpenAccordion(['motor'], [], false), []);
});

test('el reducer no modifica el arreglo que recibe', () => {
  const prev = ['alimentacion'];
  nextOpenCats(prev, 'motores', false);
  nextOpenCats(prev, 'alimentacion', false);
  nextOpenCats(prev, 'motores', true);
  assert.deepEqual(prev, ['alimentacion']);
});

// --- Derivaciones ---------------------------------------------------------

test('Normal conserva los radios de hoy', () => {
  assert.equal(pinRadius('normal'), 1.4);
  assert.equal(attachPinRadius('normal'), 0.9);
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
  assert.equal(wireStroke('normal'), 0.34);
  assert.equal(wireStroke('grueso'), 0.48);
});

test('el trazo del borne crece con el radio y en Normal conserva 0,42', () => {
  assert.equal(pinStroke('normal'), 0.42);
  assert.equal(pinStroke('chico'), 0.33);
  assert.equal(pinStroke('grande'), 0.57);
  assert.ok(pinStroke('chico') < pinStroke('normal'));
  assert.ok(pinStroke('normal') < pinStroke('grande'));
});

test('el ancho duplicado de tensión y selección sale del ancho normal', () => {
  assert.equal(wireStroke('normal') * 2, 0.68);
  assert.equal(wireStroke('fino') * 2, 0.24);
  assert.equal(wireStroke('grueso') * 2, 0.96);
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
  assert.deepEqual(getSettings(), {
    pinSize: 'grande',
    wireWidth: 'fino',
    paneles: 'horizontal',
    autoCierre: false,
    sonidosInterfaz: true,
    sonidosSimulacion: true,
    silenciado: false,
    sonidoMotor: true,
  });
  assert.equal(avisos, 1);

  setSettings({ wireWidth: 'grueso', paneles: 'vertical', autoCierre: true });
  assert.deepEqual(getSettings(), {
    pinSize: 'grande',
    wireWidth: 'grueso',
    paneles: 'vertical',
    autoCierre: true,
    sonidosInterfaz: true,
    sonidosSimulacion: true,
    silenciado: false,
    sonidoMotor: true,
  });
  assert.equal(avisos, 2);

  unsubscribe();
  setSettings(DEFAULT_SETTINGS);
  assert.equal(avisos, 2);
  assert.deepEqual(getSettings(), DEFAULT_SETTINGS);
});

test('setSettings persiste el objeto mezclado bajo la clave y no escribe si nada cambia', () => {
  const store = new Map<string, string>();
  let escrituras = 0;
  const fake = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      escrituras += 1;
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      value: fake,
      configurable: true,
      writable: true,
    });

    setSettings({ pinSize: 'grande', wireWidth: 'fino', autoCierre: true });
    assert.equal(escrituras, 1);
    assert.deepEqual(getSettings(), {
      pinSize: 'grande',
      wireWidth: 'fino',
      paneles: 'horizontal',
      autoCierre: true,
      sonidosInterfaz: true,
      sonidosSimulacion: true,
      silenciado: false,
      sonidoMotor: true,
    });
    assert.equal(store.get(SETTINGS_KEY), serializeSettings(getSettings()));

    setSettings({ pinSize: 'grande' });
    assert.equal(escrituras, 1);
    assert.equal(store.get(SETTINGS_KEY), serializeSettings(getSettings()));

    // Cambiar sólo la orientación no es un cambio nulo: se persiste.
    setSettings({ paneles: 'vertical' });
    assert.equal(escrituras, 2);
    assert.equal(getSettings().paneles, 'vertical');
    assert.equal(store.get(SETTINGS_KEY), serializeSettings(getSettings()));
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
    setSettings(DEFAULT_SETTINGS);
  }
  assert.deepEqual(getSettings(), DEFAULT_SETTINGS);
});

test('un storage que tira no rompe el store ni la elección en memoria', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('sin acceso de lectura');
        },
        setItem: () => {
          throw new Error('sin acceso de escritura');
        },
      },
      configurable: true,
      writable: true,
    });

    const actual = getSettings();
    assert.deepEqual(actual, DEFAULT_SETTINGS);
    assert.equal(typeof actual.pinSize, 'string');
    assert.equal(typeof actual.wireWidth, 'string');
    assert.equal(actual.paneles, 'horizontal');
    assert.equal(typeof actual.autoCierre, 'boolean');

    assert.doesNotThrow(() => setSettings({ wireWidth: 'grueso' }));
    assert.deepEqual(getSettings(), { ...DEFAULT_SETTINGS, wireWidth: 'grueso' });
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
    setSettings(DEFAULT_SETTINGS);
  }
  assert.deepEqual(getSettings(), DEFAULT_SETTINGS);
});

// --- Sonidos (S7) ---------------------------------------------------------

test('un localStorage viejo sin los sonidos sigue funcionando con los defaults', () => {
  const viejo = '{"pinSize":"grande","wireWidth":"grueso","paneles":"vertical","autoCierre":true}';
  assert.deepEqual(parseSettings(viejo), {
    pinSize: 'grande',
    wireWidth: 'grueso',
    paneles: 'vertical',
    autoCierre: true,
    sonidosInterfaz: true,
    sonidosSimulacion: true,
    silenciado: false,
    sonidoMotor: true,
  });
  // Interfaz, simulación y motor suenan de entrada.
  assert.equal(parseSettings('{}').sonidosInterfaz, true);
  assert.equal(parseSettings('{}').sonidosSimulacion, true);
});

test('un valor que no es booleano cae sólo al default de su campo de sonido', () => {
  assert.deepEqual(parseSettings('{"sonidosInterfaz":"si"}'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{"sonidosSimulacion":1}'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{"sonidosInterfaz":false,"sonidosSimulacion":true}'), {
    pinSize: 'normal',
    wireWidth: 'fino',
    paneles: 'horizontal',
    autoCierre: false,
    sonidosInterfaz: false,
    sonidosSimulacion: true,
    silenciado: false,
    sonidoMotor: true,
  });
  // El campo inválido no arrastra al otro: el que vale, se respeta.
  assert.deepEqual(parseSettings('{"sonidosInterfaz":null,"sonidosSimulacion":true}'), {
    ...DEFAULT_SETTINGS,
    sonidosSimulacion: true,
  });
});

// --- Mute maestro (S9) ----------------------------------------------------

test('un localStorage sin el mute parsea con el sonido prendido', () => {
  assert.equal(parseSettings(null).silenciado, false);
  assert.equal(parseSettings('{}').silenciado, false);
  const sinMute =
    '{"pinSize":"grande","wireWidth":"grueso","paneles":"vertical","autoCierre":true,"sonidosInterfaz":false,"sonidosSimulacion":true}';
  assert.deepEqual(parseSettings(sinMute), {
    pinSize: 'grande',
    wireWidth: 'grueso',
    paneles: 'vertical',
    autoCierre: true,
    sonidosInterfaz: false,
    sonidosSimulacion: true,
    silenciado: false,
    sonidoMotor: true,
  });
});

test('un valor que no es booleano en el mute cae sólo al default de ese campo', () => {
  assert.deepEqual(parseSettings('{"silenciado":"si"}'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{"silenciado":1}'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{"silenciado":null}'), DEFAULT_SETTINGS);
  // El mute se lee solo: el valor guardado vuelve tal cual.
  assert.equal(parseSettings('{"silenciado":true}').silenciado, true);
  // Y un mute inválido no arrastra a los interruptores de canal.
  assert.deepEqual(parseSettings('{"silenciado":"si","sonidosInterfaz":false,"sonidosSimulacion":true}'), {
    pinSize: 'normal',
    wireWidth: 'fino',
    paneles: 'horizontal',
    autoCierre: false,
    sonidosInterfaz: false,
    sonidosSimulacion: true,
    silenciado: false,
    sonidoMotor: true,
  });
});

// --- Zumbido del motor (S10) ----------------------------------------------

test('un localStorage sin el zumbido del motor lo deja prendido', () => {
  assert.equal(parseSettings(null).sonidoMotor, true);
  assert.equal(parseSettings('{}').sonidoMotor, true);
  const viejo =
    '{"pinSize":"grande","wireWidth":"grueso","paneles":"vertical","autoCierre":true,"sonidosInterfaz":true,"sonidosSimulacion":false,"silenciado":false}';
  assert.deepEqual(parseSettings(viejo), {
    pinSize: 'grande',
    wireWidth: 'grueso',
    paneles: 'vertical',
    autoCierre: true,
    sonidosInterfaz: true,
    sonidosSimulacion: false,
    silenciado: false,
    sonidoMotor: true,
  });
  // Y el interruptor guardado vuelve tal cual.
  assert.equal(parseSettings('{"sonidoMotor":true}').sonidoMotor, true);
});

test('un valor que no es booleano en el zumbido cae sólo al default de ese campo', () => {
  assert.deepEqual(parseSettings('{"sonidoMotor":"si"}'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{"sonidoMotor":1}'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{"sonidoMotor":null}'), DEFAULT_SETTINGS);
  // El campo inválido no arrastra a los demás: el mute y los canales se respetan.
  assert.deepEqual(parseSettings('{"sonidoMotor":"si","silenciado":true,"sonidosInterfaz":false}'), {
    pinSize: 'normal',
    wireWidth: 'fino',
    paneles: 'horizontal',
    autoCierre: false,
    sonidosInterfaz: false,
    sonidosSimulacion: true,
    silenciado: true,
    sonidoMotor: true,
  });
});

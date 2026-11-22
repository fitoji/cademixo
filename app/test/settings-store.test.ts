/**
 * El store de ajustes avisa y persiste **cualquier** campo que cambie.
 *
 * `setSettings` comparaba los campos uno por uno a mano, así que un campo nuevo
 * del tipo `Settings` quedaba fuera de la comparación y su cambio se descartaba
 * como «sin cambios»: el interruptor no se movía y no se guardaba nada.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  getSettings,
  serializeSettings,
  setSettings,
  subscribeSettings,
  type Settings,
} from '../src/ui/settings.ts';

/** Valores alternativos para los campos que no son booleanos. */
const OTRO: Record<string, string> = {
  pinSize: 'grande',
  wireWidth: 'grueso',
  paneles: 'vertical',
};

function cambiado<K extends keyof Settings>(key: K): Settings[K] {
  const actual = DEFAULT_SETTINGS[key];
  if (typeof actual === 'boolean') return !actual as Settings[K];
  const alterno = OTRO[String(key)];
  assert.ok(alterno, `falta un valor alternativo para el campo ${String(key)}`);
  return alterno as Settings[K];
}

function conStorageFalso(): { store: Map<string, string>; restaurar: () => void } {
  const store = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    },
    configurable: true,
    writable: true,
  });
  const restaurar = () => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
    setSettings(DEFAULT_SETTINGS);
  };
  return { store, restaurar };
}

test('cambiar cualquier campo del store avisa, cambia y persiste', () => {
  const { store, restaurar } = conStorageFalso();
  try {
    for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
      setSettings(DEFAULT_SETTINGS);

      let avisos = 0;
      const unsubscribe = subscribeSettings(() => {
        avisos += 1;
      });

      setSettings({ [key]: cambiado(key) } as Partial<Settings>);
      unsubscribe();

      assert.equal(avisos, 1, `${String(key)} no avisó a los suscriptores`);
      assert.notEqual(getSettings()[key], DEFAULT_SETTINGS[key], `${String(key)} no cambió en el store`);
      assert.equal(
        store.get(SETTINGS_KEY),
        serializeSettings(getSettings()),
        `${String(key)} no se persistió`,
      );
    }
  } finally {
    restaurar();
  }
});

test('volver al mismo valor no avisa ni escribe', () => {
  const { store, restaurar } = conStorageFalso();
  try {
    setSettings(DEFAULT_SETTINGS);
    let avisos = 0;
    const unsubscribe = subscribeSettings(() => {
      avisos += 1;
    });
    const escrituras = store.size;
    setSettings(DEFAULT_SETTINGS);
    unsubscribe();
    assert.equal(avisos, 0);
    assert.equal(store.size, escrituras);
  } finally {
    restaurar();
  }
});

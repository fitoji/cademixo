import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BINDING_IDS,
  DEFAULT_BINDINGS,
  SHORTCUT_STORAGE_KEY,
  canonicalKeys,
  getBinding,
  getBindings,
  isValidBinding,
  keyEventToKeys,
  parseBindings,
  resetBindings,
  serializeBindings,
  setBinding,
  subscribeBindings,
  type KeyEventLike,
} from '../src/ui/shortcut-bindings.ts';

beforeEach(() => resetBindings());

const event = (key: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

test('los defaults son los atajos registrados y la versión viaja en el storage', () => {
  assert.equal(BINDING_IDS.length, 12);
  assert.equal(DEFAULT_BINDINGS.save, 'mod+s');
  const raw = serializeBindings(DEFAULT_BINDINGS);
  assert.equal(JSON.parse(raw).version, 1);
  assert.equal(SHORTCUT_STORAGE_KEY, 'simuelectro:atajos');
});

test('parse tolera basura, versión desconocida y campos fuera del catálogo', () => {
  assert.deepEqual(parseBindings(null), DEFAULT_BINDINGS);
  assert.deepEqual(parseBindings('{'), DEFAULT_BINDINGS);
  assert.deepEqual(parseBindings('[]'), DEFAULT_BINDINGS);
  assert.deepEqual(parseBindings(JSON.stringify({ version: 2, bindings: { save: 't' } })), DEFAULT_BINDINGS);
  const parsed = parseBindings(
    JSON.stringify({ version: 1, bindings: { save: 't', invento: 'x', undo: 7 } }),
  );
  assert.equal(parsed.save, 't');
  assert.equal(parsed.undo, DEFAULT_BINDINGS.undo);
});

test('parse resuelve conflictos guardados sin dejar dos atajos iguales', () => {
  const parsed = parseBindings(
    JSON.stringify({ version: 1, bindings: { save: 'mod+z', undo: 'mod+z' } }),
  );
  const values = BINDING_IDS.map((id) => parsed[id]);
  assert.equal(new Set(values).size, values.length);
  assert.equal(parsed.save, 'mod+z');
});

test('canonicalKeys normaliza alias, orden y mayúsculas', () => {
  assert.equal(canonicalKeys('shift+mod+S'), 'mod+shift+s');
  assert.equal(canonicalKeys('ctrl+alt+k'), 'control+alt+k');
  assert.equal(canonicalKeys('SPACE'), 'space');
  assert.equal(canonicalKeys('mod+mod+s'), null);
  assert.equal(canonicalKeys('shift'), null);
  assert.equal(canonicalKeys(''), null);
});

test('la captura distingue Apple del resto y respeta IME', () => {
  const combo = event('s', { metaKey: true, shiftKey: true });
  assert.equal(keyEventToKeys(combo, true), 'mod+shift+s');
  assert.equal(keyEventToKeys(combo, false), 'meta+shift+s');
  assert.equal(keyEventToKeys(event('s', { ctrlKey: true }), false), 'mod+s');
  assert.equal(keyEventToKeys(event('s', { ctrlKey: true }), true), 'control+s');
  assert.equal(keyEventToKeys(event(' ', {}), true), 'space');
  assert.equal(keyEventToKeys(event('ArrowLeft', {}), true), 'left');
  assert.equal(keyEventToKeys(event('Process', {}), true), null);
  assert.equal(keyEventToKeys(event('s', { isComposing: true }), true), null);
  assert.equal(keyEventToKeys(event('Shift', { shiftKey: true }), true), null);
  assert.equal(keyEventToKeys(event('Dead', {}), true), null);
});

test('no se pueden reclamar teclas reservadas', () => {
  assert.equal(isValidBinding('escape'), false);
  assert.equal(isValidBinding('f5'), false);
  assert.equal(isValidBinding('mod+w'), false);
  assert.equal(isValidBinding('t'), true);
  assert.equal(keyEventToKeys(event('w', { ctrlKey: true }), false), null);
});

test('setBinding rechaza conflictos y acepta una tecla libre', () => {
  assert.deepEqual(setBinding('save', 't'), { ok: true });
  assert.equal(getBinding('save'), 't');
  const clash = setBinding('undo', 'T');
  assert.equal(clash.ok, false);
  if (!clash.ok) assert.equal(clash.conflictWith, 'save');
  assert.equal(getBinding('undo'), DEFAULT_BINDINGS.undo);
  assert.equal(setBinding('copy', 'mod+').ok, false);
  assert.equal(setBinding('copy', 'escape').ok, false);
});

test('reset vuelve a los defaults y avisa a los suscriptores', () => {
  let notified = 0;
  const unsubscribe = subscribeBindings(() => {
    notified += 1;
  });
  setBinding('save', 't');
  resetBindings();
  assert.equal(notified, 2);
  unsubscribe();
  setBinding('save', 'y');
  assert.equal(notified, 2);
  resetBindings();
  assert.deepEqual(getBindings(), DEFAULT_BINDINGS);
});

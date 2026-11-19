/**
 * Decisiones puras de la E/S de archivos: si el navegador puede elegir archivo
 * con handle, qué hacer al guardar, cómo se llama el archivo sugerido y qué
 * atajo se apretó.
 *
 * Todo lo que toca el navegador (los selectores, la escritura del handle) queda
 * fuera de este test: acá sólo se fijan las decisiones.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  encodeLatin1,
  hasFileSystemAccess,
  planSaveAction,
  saveShortcutOf,
  suggestedSaveName,
} from '../src/ui/files.ts';

test('un objeto pelado no tiene File System Access', () => {
  assert.equal(hasFileSystemAccess({}), false);
});

test('con un solo selector no alcanza', () => {
  assert.equal(hasFileSystemAccess({ showSaveFilePicker() {} }), false);
  assert.equal(hasFileSystemAccess({ showOpenFilePicker() {} }), false);
});

test('con los dos selectores sí hay soporte', () => {
  assert.equal(hasFileSystemAccess({ showSaveFilePicker() {}, showOpenFilePicker() {} }), true);
});

test('con handle se reescribe el archivo abierto', () => {
  assert.equal(planSaveAction({ hasHandle: true, browserSupportsPickers: true }), 'write-in-place');
});

test('sin handle y con selectores se pide destino', () => {
  assert.equal(planSaveAction({ hasHandle: false, browserSupportsPickers: true }), 'pick-location');
});

test('sin selectores se descarga', () => {
  assert.equal(planSaveAction({ hasHandle: false, browserSupportsPickers: false }), 'download');
});

test('el nombre sugerido es el nombre de guardado normalizado', () => {
  assert.equal(suggestedSaveName(''), 'sin título.cad');
  assert.equal(suggestedSaveName('x.cade'), 'x.cad');
  assert.equal(suggestedSaveName('x.cad'), 'x.cad');
  assert.equal(suggestedSaveName('x.txt'), 'x.txt.cad');
});

test('⌘S guarda y ⇧⌘S guarda como', () => {
  assert.equal(saveShortcutOf({ metaKey: true, key: 's' }), 'save');
  assert.equal(saveShortcutOf({ metaKey: true, shiftKey: true, key: 'S' }), 'save-as');
});

test('en Windows y Linux el atajo lleva Ctrl', () => {
  assert.equal(saveShortcutOf({ ctrlKey: true, key: 's' }), 'save');
  assert.equal(saveShortcutOf({ ctrlKey: true, shiftKey: true, key: 's' }), 'save-as');
});

test('una s suelta no es atajo de guardado', () => {
  assert.equal(saveShortcutOf({ key: 's' }), null);
});

// Guardia de la conducta de antes: `encodeLatin1` se movió desde `ui/samples.ts`
// para que los bytes guardados y los descargados sean los mismos, un byte por
// carácter (latin1), nunca UTF-8.
test('la codificación de guardado sigue siendo latin1, un byte por carácter', () => {
  assert.deepEqual([...encodeLatin1('Aáñ')], [0x41, 0xe1, 0xf1]);
});

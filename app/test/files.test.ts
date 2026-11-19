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
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PickerError,
  encodeLatin1,
  hasFileSystemAccess,
  pickOpenHandle,
  pickSaveHandle,
  planSaveAction,
  saveShortcutOf,
  suggestedSaveName,
  writeHandle,
} from '../src/ui/files.ts';
import { createEditor, markSaved } from '../src/editor/state.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/**
 * Los selectores del navegador se prueban con objetos falsos puestos en
 * `globalThis`: los envoltorios son finos a propósito, así que esto alcanza
 * para fijar el reparto entre «canceló» y «falló» sin un navegador.
 */
const globals = globalThis as unknown as Record<string, unknown>;

function withPicker(key: 'showOpenFilePicker' | 'showSaveFilePicker', fn: (options?: unknown) => Promise<unknown>) {
  globals[key] = fn;
  return () => {
    delete globals[key];
  };
}

/** Handle de escritura falso: registra el orden de las llamadas y los bytes. */
function fakeWritable(behaviour: { failWrite?: boolean; failClose?: boolean; failAbort?: boolean } = {}) {
  const events: string[] = [];
  const bytes: number[][] = [];
  const writable = {
    async write(chunk: Uint8Array) {
      events.push('write');
      bytes.push([...chunk]);
      if (behaviour.failWrite) throw new Error('write roto');
    },
    async close() {
      events.push('close');
      if (behaviour.failClose) throw new Error('close roto');
    },
    async abort() {
      events.push('abort');
      if (behaviour.failAbort) throw new Error('abort roto');
    },
  };
  const handle = { name: 'x.cad', createWritable: async () => writable } as unknown as FileSystemFileHandle;
  return { handle, events, bytes };
}

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

// Aunque el navegador no sepa elegir archivos, un documento que ya tiene uno
// abierto se reescribe en ese archivo: no se pierde por falta de selectores.
test('con handle y sin selectores también se reescribe', () => {
  assert.equal(planSaveAction({ hasHandle: true, browserSupportsPickers: false }), 'write-in-place');
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

test('otros atajos no se confunden con guardar', () => {
  assert.equal(saveShortcutOf({ altKey: true, key: 's' }), null);
  assert.equal(saveShortcutOf({ metaKey: true, key: 'z' }), null);
});

// Guardia de la conducta de antes: `encodeLatin1` se movió desde `ui/samples.ts`
// para que los bytes guardados y los descargados sean los mismos, un byte por
// carácter (latin1), nunca UTF-8.
test('la codificación de guardado sigue siendo latin1, un byte por carácter', () => {
  assert.deepEqual([...encodeLatin1('Aáñ')], [0x41, 0xe1, 0xf1]);
});

// Guardia del corte fuera de latin1: un carácter que no entra en un byte se
// trunca, que es exactamente lo que hacía la descarga. Si algún día el guardado
// pasara a UTF-8 o a una codificación que reemplace, esto lo delata.
test('lo que no entra en latin1 se trunca byte a byte, como la descarga', () => {
  assert.deepEqual([...encodeLatin1('Aáñ€\u00ff\u0100')], [0x41, 0xe1, 0xf1, 0xac, 0xff, 0x00]);
});

// Los bytes que se escriben tienen que ser los del archivo real: el formato es
// latin1 de un byte por carácter, así que decodificar y volver a codificar no
// puede cambiar nada.
test('los bytes guardados son los de los archivos reales', () => {
  const names = readdirSync(FIXTURES).filter((f) => /\.(cade|cad)$/i.test(f));
  assert.ok(names.length >= 5, `hacen falta al menos 5 fixtures, hay ${names.length}`);
  for (const name of names) {
    const raw = readFileSync(join(FIXTURES, name));
    const text = raw.toString('latin1');
    assert.deepEqual(encodeLatin1(text), new Uint8Array(raw), `bytes distintos en ${name}`);
  }
});

// --- envoltorios de navegador ------------------------------------------------

// Abrir tiene que ofrecer el mismo filtro que el input oculto (`accept`), o el
// diálogo del sistema muestra cualquier archivo.
test('el selector de apertura filtra por extensión y no permite múltiples', async () => {
  const calls: unknown[] = [];
  const file = { name: 'x.cade' };
  const handle = { name: 'x.cade', getFile: async () => file };
  const restore = withPicker('showOpenFilePicker', async (options) => {
    calls.push(options);
    return [handle];
  });
  try {
    assert.deepEqual(await pickOpenHandle(), { handle, file });
  } finally {
    restore();
  }
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    multiple: false,
    types: [{ description: 'Documentos CADe_SIMU', accept: { 'application/octet-stream': ['.cade', '.cad'] } }],
  });
});

test('cancelar la apertura no es un fallo: devuelve null en silencio', async () => {
  const restore = withPicker('showOpenFilePicker', async () => {
    throw new DOMException('cancelado', 'AbortError');
  });
  try {
    assert.equal(await pickOpenHandle(), null);
  } finally {
    restore();
  }
});

// Un selector que no se puede abrir (sin contexto seguro, permiso denegado) no
// es el usuario cancelando: se avisa distinto, no se lo culpa a él.
test('un fallo del selector de apertura se distingue de la cancelación', async () => {
  const restore = withPicker('showOpenFilePicker', async () => {
    throw new Error('sin contexto seguro');
  });
  try {
    await assert.rejects(pickOpenHandle(), PickerError);
  } finally {
    restore();
  }
});

test('el selector de guardado propone el nombre normalizado', async () => {
  const calls: unknown[] = [];
  const handle = { name: 'x.cad' };
  const restore = withPicker('showSaveFilePicker', async (options) => {
    calls.push(options);
    return handle;
  });
  try {
    assert.equal(await pickSaveHandle('x.cad'), handle);
  } finally {
    restore();
  }
  assert.deepEqual(calls, [{ suggestedName: 'x.cad' }]);
});

test('cancelar el guardado no es un fallo: devuelve null en silencio', async () => {
  const restore = withPicker('showSaveFilePicker', async () => {
    throw new DOMException('cancelado', 'AbortError');
  });
  try {
    assert.equal(await pickSaveHandle('x.cad'), null);
  } finally {
    restore();
  }
});

test('un fallo del selector de guardado se distingue de la cancelación', async () => {
  const restore = withPicker('showSaveFilePicker', async () => {
    throw new Error('permiso denegado');
  });
  try {
    await assert.rejects(pickSaveHandle('x.cad'), PickerError);
  } finally {
    restore();
  }
});

// --- escritura del archivo ---------------------------------------------------

test('escribir deja los bytes latin1 y cierra el stream', async () => {
  const fake = fakeWritable();
  await writeHandle(fake.handle, 'Aáñ');
  assert.deepEqual(fake.events, ['write', 'close']);
  assert.deepEqual(fake.bytes, [[0x41, 0xe1, 0xf1]]);
});

test('si falla la escritura se aborta y se propaga el error', async () => {
  const fake = fakeWritable({ failWrite: true });
  await assert.rejects(writeHandle(fake.handle, 'x'), /write roto/);
  assert.deepEqual(fake.events, ['write', 'abort']);
});

// `close()` es donde se confirma el archivo: si falla, el archivo quedó a medio
// escribir y hay que abortar, no dar el guardado por bueno.
test('si falla el cierre se aborta y se propaga el error', async () => {
  const fake = fakeWritable({ failClose: true });
  await assert.rejects(writeHandle(fake.handle, 'x'), /close roto/);
  assert.deepEqual(fake.events, ['write', 'close', 'abort']);
});

test('un abort que también falla no tapa el error original', async () => {
  const fake = fakeWritable({ failClose: true, failAbort: true });
  await assert.rejects(writeHandle(fake.handle, 'x'), /close roto/);
});

// --- estado sucio ------------------------------------------------------------

test('markSaved limpia lo sucio y no toca el texto', () => {
  const state = { ...createEditor('CADe_SIMU*0*2001#'), dirty: true };
  const saved = markSaved(state);
  assert.equal(saved.dirty, false);
  assert.equal(saved.text, state.text);
});

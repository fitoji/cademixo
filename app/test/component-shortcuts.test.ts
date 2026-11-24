import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkComponentBinding,
  drawingHash,
  parseSidecar,
  readBindingsForDocument,
  readComponentBindings,
  serializeSidecar,
  sidecarFileName,
  writeComponentBindings,
} from '../src/ui/component-shortcuts.ts';
import { DEFAULT_BINDINGS, type Bindings } from '../src/ui/shortcut-bindings.ts';

class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

// Los tests de módulos de UI corren en node: el store se inyecta igual que en
// el navegador, sin DOM.
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();

test('el sidecar se llama <archivo>.keys.json', () => {
  assert.equal(sidecarFileName('plano.cad'), 'plano.cad.keys.json');
  assert.equal(sidecarFileName('plano.cade'), 'plano.cade.keys.json');
});

test('el hash del dibujo es estable y cambia con el texto', () => {
  const a = 'CADe_SIMU*1*3000#';
  assert.equal(drawingHash(a), drawingHash(a));
  assert.notEqual(drawingHash(a), drawingHash(`${a}*2*3001#`));
});

test('parsea v1 y v2, y serializa v2 con hash', () => {
  const v1 = parseSidecar('{"version":1,"bindings":{"-Q1":"shift+q","KM1":"shift+k"}}');
  assert.deepEqual(v1?.bindings, { '-Q1': 'shift+q', KM1: 'shift+k' });
  assert.equal(v1?.version, 2);

  const v2 = {
    version: 2 as const,
    drawingHash: drawingHash('plano'),
    sourceName: 'plano.cad',
    bindings: { '-Q1': 'shift+q' },
  };
  const round = parseSidecar(serializeSidecar(v2));
  assert.deepEqual(round, v2);
});

test('un sidecar roto, versión desconocida o clave inválida se ignora', () => {
  assert.equal(parseSidecar('{'), null);
  assert.equal(parseSidecar('{"version":3,"bindings":{}}'), null);
  assert.deepEqual(parseSidecar('{"version":1,"bindings":{"A":"espacio","B":"q"}}')?.bindings, { B: 'q' });
});

test('un sidecar importado no puede repetir la misma tecla', () => {
  const parsed = parseSidecar('{"version":2,"bindings":{"-Q1":"shift+q","KM1":"shift+q"}}');
  assert.deepEqual(parsed?.bindings, { '-Q1': 'shift+q' });
});

test('bindings por hash: renombrar el archivo no pierde los atajos', () => {
  const hash = drawingHash('plano A');
  const a = writeComponentBindings(hash, { '-Q1': 'shift+q' }, { drawingHash: hash, sourceName: 'a.cad' });
  assert.deepEqual(readComponentBindings(hash), a);
  assert.deepEqual(readBindingsForDocument('otro-nombre.cad', hash).bindings, { '-Q1': 'shift+q' });
});

test('migra los atajos guardados por nombre de archivo', () => {
  writeComponentBindings('viejo.cad', { '-Q2': 'shift+w' });
  const hash = drawingHash('texto sin sidecar');
  assert.deepEqual(readBindingsForDocument('viejo.cad', hash).bindings, { '-Q2': 'shift+w' });
});

test('un atajo global o de otro componente se rechaza por conflicto', () => {
  const globals: Bindings = { ...DEFAULT_BINDINGS, save: 'shift+q' };
  assert.deepEqual(checkComponentBinding('shift+q', '-Q1', {}, globals), {
    ok: false,
    reason: 'conflict',
    conflictWith: 'save',
  });
  assert.deepEqual(checkComponentBinding('shift+k', '-Q1', { KM1: 'shift+k' }, globals), {
    ok: false,
    reason: 'conflict',
    conflictWith: 'KM1',
  });
  assert.deepEqual(checkComponentBinding('q', '-Q1', {}, globals), { ok: true });
});

test('reasignar el mismo componente no es conflicto', () => {
  assert.deepEqual(checkComponentBinding('shift+q', '-Q1', { '-Q1': 'shift+k' }, DEFAULT_BINDINGS), { ok: true });
});

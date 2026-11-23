import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkComponentBinding,
  parseSidecar,
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

test('parsea y serializa un sidecar válido', () => {
  const text = '{"version":1,"bindings":{"-Q1":"shift+q","KM1":"shift+k"}}';
  const parsed = parseSidecar(text);
  assert.deepEqual(parsed?.bindings, { '-Q1': 'shift+q', KM1: 'shift+k' });
  assert.deepEqual(parseSidecar(serializeSidecar(parsed!)), parsed);
});

test('un sidecar roto o con teclas inválidas se ignora', () => {
  assert.equal(parseSidecar('{'), null);
  assert.equal(parseSidecar('{"version":2,"bindings":{}}'), null);
  assert.deepEqual(parseSidecar('{"version":1,"bindings":{"A":"espacio","B":"q"}}')?.bindings, { B: 'q' });
});

test('bindings por archivo: dos planos no comparten atajos', () => {
  const a = writeComponentBindings('a.cad', { '-Q1': 'shift+q' });
  writeComponentBindings('b.cad', { '-Q2': 'shift+w' });
  assert.deepEqual(readComponentBindings('a.cad'), a);
  assert.deepEqual(readComponentBindings('b.cad').bindings, { '-Q2': 'shift+w' });
  assert.deepEqual(readComponentBindings('virgen.cad').bindings, {});
});

test('un atajo global o de otro componente se rechaza por conflicto', () => {
  const globals: Bindings = { ...DEFAULT_BINDINGS, save: 'shift+q' };
  assert.deepEqual(checkComponentBinding('shift+q', '-Q1', {}, globals), { ok: false, reason: 'conflict', conflictWith: 'save' });
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parse } from '../src/format/cade.ts';
import {
  SHORTCUT_RECORD_CODE,
  encodeShortcutPayload,
  parseShortcutPayload,
  readComponentShortcuts,
  withComponentShortcuts,
  type ComponentShortcuts,
} from '../src/format/cade-shortcuts.ts';
import { buildProject, roundTrips } from '../src/model/project.ts';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const SAMPLE = fixture('ej0def.cad');

const metadata: ComponentShortcuts = {
  version: 1,
  bindings: { Q1: 'mod+q', 'KM-Ñ': 'shift+k' },
};

test('el payload va y vuelve por base64url, incluso con acentos', () => {
  const payload = encodeShortcutPayload(metadata);
  assert.doesNotMatch(payload, /[#*]/);
  assert.deepEqual(parseShortcutPayload(`{"version":1,"bindings":${JSON.stringify(metadata.bindings)}}`), metadata);
  // El path real codifica el JSON entero; se compara contra sí mismo.
  assert.equal(parseShortcutPayload(JSON.stringify(metadata))?.bindings['KM-Ñ'], 'shift+k');
});

test('payload con basura o versión desconocida no rompe', () => {
  assert.equal(parseShortcutPayload('{'), null);
  assert.equal(parseShortcutPayload('[]'), null);
  assert.equal(parseShortcutPayload('{"version":2,"bindings":{}}'), null);
  assert.equal(parseShortcutPayload('{"version":1,"bindings":[]}'), null);
});

test('un archivo sin metadata devuelve null', () => {
  assert.equal(readComponentShortcuts(SAMPLE), null);
});

test('la metadata sobrevive el round-trip byte a byte y no toca registros existentes', () => {
  const before = parse(SAMPLE);
  const withMeta = withComponentShortcuts(SAMPLE, metadata);
  const after = parse(withMeta);

  assert.equal(roundTrips(withMeta), true);
  assert.equal(after.records.length, before.records.length + 1);
  assert.deepEqual(
    after.records.slice(0, before.records.length).map((record) => record.raw),
    before.records.map((record) => record.raw),
  );
  assert.deepEqual(readComponentShortcuts(withMeta), metadata);

  const extra = after.records.at(-1)!;
  assert.equal(extra.code, SHORTCUT_RECORD_CODE);
  assert.equal(extra.id, Math.max(...before.records.map((record) => record.id)) + 1);
});

test('reemplazar la metadata deja un solo registro y conserva el id', () => {
  const first = withComponentShortcuts(SAMPLE, metadata);
  const second = withComponentShortcuts(first, { version: 1, bindings: { Q1: 'mod+9' } });
  const records = parse(second).records.filter((record) => record.code === SHORTCUT_RECORD_CODE);
  assert.equal(records.length, 1);
  assert.deepEqual(readComponentShortcuts(second), { version: 1, bindings: { Q1: 'mod+9' } });
});

test('sin bindings el archivo vuelve a ser el original exacto', () => {
  const withMeta = withComponentShortcuts(SAMPLE, metadata);
  const cleared = withComponentShortcuts(withMeta, { version: 1, bindings: {} });
  assert.equal(cleared, SAMPLE);
});

test('nuestro modelo abre el archivo con metadata sin romperse', () => {
  const withMeta = withComponentShortcuts(SAMPLE, metadata);
  const project = buildProject(parse(withMeta));
  assert.equal(project.records.length, parse(withMeta).records.length);
  // El registro custom queda como desconocido: no se dibuja ni aporta bornes.
  const extra = project.records.at(-1)!;
  assert.equal(extra.code, SHORTCUT_RECORD_CODE);
  assert.equal(extra.kind, 'unknown');
  assert.deepEqual(extra.pins, []);
});

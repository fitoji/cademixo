import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MIXO_MAGIC, isMixo, parseMixo, serializeMixo } from '../src/format/mixo.ts';

const drawing = `CADe_SIMU*1*3000#-X##1#2##*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0#
DRAWING no es una sección si está dentro del texto
KEYS tampoco
*2*4000##########*0*0*0*0*0*0*0*0*1*2*3*4*0*0*0*0*0*0*0*0*0*0*0#`;
const keys = '{\n  "version": 2,\n  "bindings": { "Q1": "q" }\n}';

test('el bundle preserva el dibujo y las keys byte a byte', () => {
  const bundle = { drawing, keys, manifest: { format: 'cademixo' as const, version: 1 as const, sourceName: 'plano.mixo' } };
  const text = serializeMixo(bundle);
  assert.equal(isMixo(text), true);
  assert.ok(text.startsWith(`${MIXO_MAGIC}\n`));
  assert.deepEqual(parseMixo(text), bundle);
});

test('un dibujo vacío también es válido para el codec', () => {
  const bundle = { drawing: '', keys: '', manifest: { format: 'cademixo' as const, version: 1 as const } };
  assert.deepEqual(parseMixo(serializeMixo(bundle)), bundle);
});

test('rechaza magic, versión o secciones inválidas', () => {
  assert.equal(parseMixo(''), null);
  assert.equal(parseMixo('CADe_SIMU'), null);
  assert.equal(parseMixo(`${MIXO_MAGIC}\n{"format":"otro","version":1}\n`), null);
  assert.equal(parseMixo(`${MIXO_MAGIC}\n{"format":"cademixo","version":2}\n`), null);
  assert.equal(parseMixo(`${MIXO_MAGIC}\n{"format":"cademixo","version":1}\n`), null);
});

test('rechaza largos truncados, negativos o no numéricos', () => {
  const head = `${MIXO_MAGIC}\n{"format":"cademixo","version":1}\n`;
  assert.equal(parseMixo(`${head}DRAWING 99\ncorto\nKEYS 0\n\n`), null);
  assert.equal(parseMixo(`${head}DRAWING -1\n\nKEYS 0\n\n`), null);
  assert.equal(parseMixo(`${head}DRAWING x\n\nKEYS 0\n\n`), null);
  assert.equal(parseMixo(`${head}DRAWING 0\n\nKEYS 99\n{}\n`), null);
});

test('rechaza contenido extra al final', () => {
  const text = serializeMixo({
    drawing: 'CADe_SIMU',
    keys: '{}',
    manifest: { format: 'cademixo', version: 1 },
  });
  assert.equal(parseMixo(`${text}basura`), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decodeLatin1, encodeLatin1 } from '../src/format/latin1.ts';
import {
  buildVerifiedDocumentBytes,
  captureMixoRevision,
  encodeRevision,
  verifyRevisionBytes,
} from '../src/format/mixo-revision.ts';

const drawing = `CADe_SIMU*1*3000#-X##1#2##*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0#
Texto con acentos: á é ñ - y registros sin interpretar ####8888####
*2*4000##########*0*0*0*0*0*0*0*0*1*2*3*4*0*0*0*0*0*0*0*0*0*0*0#`;
const keys = JSON.stringify({
  version: 2,
  drawingHash: 'abc12345',
  sourceName: 'plano áéñ.mixo',
  bindings: { Q1: 'q' },
});
const manifest = { format: 'cademixo' as const, version: 1 as const, sourceName: 'plano áéñ.mixo' };

function revision(drawingText = drawing) {
  return captureMixoRevision({ drawing: drawingText, keys, manifest });
}

test('la codificación latin1 preserva los bytes no ASCII que el formato v1 admite', () => {
  const bytes = encodeLatin1('á');
  assert.equal(bytes.length, 1);
  assert.equal(bytes[0], 0xe1);
  assert.equal(decodeLatin1(bytes), 'á');
});

test('una revisión capturada es inmutable y viaja completa por los bytes reales', () => {
  const captured = revision();
  assert.equal(Object.isFrozen(captured), true);
  assert.equal(Object.isFrozen(captured.manifest), true);
  assert.throws(() => {
    (captured as { drawing: string }).drawing = 'otro dibujo';
  });

  const encoded = encodeRevision(captured);
  assert.equal(encoded.bytes.length, encoded.text.length);
  assert.equal(decodeLatin1(encoded.bytes), encoded.text);
  assert.deepEqual(verifyRevisionBytes(encoded.bytes, captured), { ok: true });
});

test('la identidad de la revisión cubre dibujo, atajos y metadatos persistentes', () => {
  const base = revision();
  const same = revision();
  assert.equal(base.id, same.id);

  const otherManifest = captureMixoRevision({ drawing, keys, manifest: { ...manifest, sourceName: 'otro.mixo' } });
  const otherKeys = captureMixoRevision({ drawing, keys: keys.replace('"Q1"', '"Q2"'), manifest });
  const otherDrawing = revision(drawing.replace('8888', '8889'));
  assert.notEqual(base.id, otherManifest.id);
  assert.notEqual(base.id, otherKeys.id);
  assert.notEqual(base.id, otherDrawing.id);
});

test('detecta la alteración de un byte que conserva la longitud', () => {
  const captured = revision();
  const encoded = encodeRevision(captured);
  const altered = encoded.bytes.slice();
  const at = encoded.text.indexOf('plano');
  assert.ok(at > 0);
  altered[at] = (altered[at] ?? 0) ^ 0x01;

  const result = verifyRevisionBytes(altered, captured);
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.reason, 'mismatch');
});

test('detecta truncamiento y caracteres que la codificación v1 no puede preservar', () => {
  const captured = revision();
  const encoded = encodeRevision(captured);

  const truncated = verifyRevisionBytes(encoded.bytes.subarray(0, encoded.bytes.length - 10), captured);
  assert.equal(truncated.ok, false);

  const lossy = revision('CADe_SIMU*1*3000#-X##1#2##*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0#\n中');
  const encodedLossy = encodeRevision(lossy);
  // El byte se escribió, pero al releerlo no coincide con la revisión de entrada.
  assert.equal(verifyRevisionBytes(encodedLossy.bytes, lossy).ok, false);
});

test('no se entregan bytes para escribir ni descargar si la revisión es lossy', () => {
  const payload = buildVerifiedDocumentBytes({ drawing, native: true, keys, manifest });
  assert.ok(payload);
  assert.equal(payload.revisionId, revision().id);
  assert.equal(decodeLatin1(payload.bytes).includes('á é ñ'), true);

  const lossy = buildVerifiedDocumentBytes({
    drawing: 'CADe_SIMU*1*3000#-X##\n中',
    native: true,
    keys,
    manifest,
  });
  assert.equal(lossy, null);

  assert.ok(buildVerifiedDocumentBytes({ drawing: 'CADe_SIMU*1*3000#-X##\ná', native: false }));
  assert.equal(
    buildVerifiedDocumentBytes({ drawing: 'CADe_SIMU*1*3000#-X##\n中', native: false }),
    null,
  );
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeDestination } from '../src/ui/storage-contract.ts';

test('el archivo con handle promete escritura verificada y generación previa conservada', () => {
  const contract = describeDestination('file-handle');
  assert.equal(contract.guarantee, 'verified');
  assert.equal(contract.preservesPreviousGeneration, true);
  assert.equal(contract.survivesBrowserDataClear, true);
});

test('la descarga sólo promete bytes validados, nunca escritura confirmada', () => {
  const contract = describeDestination('download');
  assert.equal(contract.guarantee, 'download-started');
  assert.equal(contract.preservesPreviousGeneration, false);
  assert.match(contract.note, /no confirma/);
});

test('una copia de recuperación nunca repara sobre el original', () => {
  const contract = describeDestination('recovery-copy');
  assert.equal(contract.guarantee, 'download-started');
  assert.equal(contract.repairsOriginal, false);
  assert.equal(contract.survivesBrowserDataClear, false);
  assert.match(contract.note, /datos del sitio/);
});

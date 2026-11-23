import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(HERE, 'fixtures', 'marcha_motor.cad');
const SOURCE = join(HERE, '..', 'test_simu', 'PR1_Rodolfo_Giusti_03.cad');
const CATALOG = readFileSync(join(HERE, '..', 'src', 'ui', 'samples.ts'), 'utf8');

test('el ejemplo marcha_motor.cad es byte a byte el PR1', () => {
  assert.equal(readFileSync(SAMPLE, 'latin1'), readFileSync(SOURCE, 'latin1'));
});

test('el catálogo de ejemplos expone marcha_motor.cad', () => {
  assert.match(CATALOG, /import marchaMotorUrl from '[^']*marcha_motor\.cad\?url';/);
  assert.match(CATALOG, /name: 'marcha_motor\.cad', label: '[^']+', url: marchaMotorUrl/);
});

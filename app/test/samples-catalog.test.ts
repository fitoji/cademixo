import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SOURCE = readFileSync(join(HERE, '..', 'src', 'ui', 'samples.ts'), 'latin1');
const FIXTURE = join(HERE, 'fixtures', 'motor_con_inversion_giro.cad');
const ORIGINAL = join(HERE, '..', 'test_simu', 'PR2_Rodolfo_Giusti_vfinal.cad');

test('el catálogo de ejemplos de la app expone los dos .cad vigentes', () => {
  const entries = SOURCE.match(/^\s*\{ name: '[^']+', label: '[^']+', url: \w+ \},?$/gm) ?? [];
  assert.equal(entries.length, 2, `se esperaban dos ejemplos, hay ${entries.length}`);
  assert.match(entries[0]!, /name: 'motor_con_inversion_giro\.cad'/);
  assert.match(entries[1]!, /name: 'marcha_motor\.cad'/);
  assert.match(SOURCE, /^import \w+ from '[^']*motor_con_inversion_giro\.cad\?url';$/m);
  assert.match(SOURCE, /^import \w+ from '[^']*marcha_motor\.cad\?url';$/m);
});

test('los ejemplos anteriores ya no se cargan', () => {
  for (const name of [
    'arranque-paro-motor-3f.cad',
    'ej0def.cad',
    'inversion-giro-cej.cade',
    'pr1-rodolfo-giusti.cad',
    'luz-con-interruptor.cade',
  ]) {
    assert.equal(SOURCE.includes(`'${name}'`), false, `${name} todavía figura en el catálogo`);
  }
});

test('el fixture renombrado es idéntico al archivo original', () => {
  assert.equal(readFileSync(FIXTURE, 'latin1'), readFileSync(ORIGINAL, 'latin1'));
});

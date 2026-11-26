/**
 * La red final del documento se comparte entre App, `validate` y `buildNetlist`
 * (que alimenta `circuitFrom`). Compartirla no puede cambiar avisos, netlist ni
 * circuito: sólo evitar reconstrucciones.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildNetwork, networkStats, validate } from '../src/editor/network.ts';
import { buildNetlist } from '../src/sim/netlist.ts';
import { circuitFrom } from '../src/sim/circuit.ts';
import { createEditor, projectOf } from '../src/editor/state.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const ARRANQUE = readFileSync(join(FIXTURES, 'arranque-paro-motor-3f.cad'), 'latin1');

test('compartir la red no cambia avisos, netlist ni circuito', () => {
  const project = projectOf(createEditor(ARRANQUE));
  const records = project.records;
  const network = buildNetwork(records);
  const builds = networkStats.builds;

  assert.deepEqual(validate(records, network), validate(records));
  assert.deepEqual(buildNetlist(records, network), buildNetlist(records));
  assert.deepEqual(circuitFrom(records, { network }), circuitFrom(records, {}));

  // Sólo las variantes sin red construyen: una por consumidor.
  assert.equal(networkStats.builds, builds + 3);
});

test('los consumidores con red compartida no reconstruyen', () => {
  const project = projectOf(createEditor(ARRANQUE));
  const network = buildNetwork(project.records);
  const builds = networkStats.builds;

  validate(project.records, network);
  buildNetlist(project.records, network);
  circuitFrom(project.records, { network });

  assert.equal(networkStats.builds, builds);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '../src/format/cade.ts';
import { buildProject } from '../src/model/project.ts';
import { circuitFrom } from '../src/sim/circuit.ts';
import { buildNetlist, type Device, type Netlist } from '../src/sim/netlist.ts';
import { simulate, type SimState } from '../src/sim/solver.ts';
import { detectFaults } from '../src/sim/faults.ts';

function fixture(name: string): Netlist {
  const text = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'latin1');
  return buildNetlist(buildProject(parse(text)).records);
}

/** Estado cerrado del fixture: el pulsador `8000` sólo conduce mientras se pulsa. */
function closedFromFixture(name: string): Pick<SimState, 'closed'> {
  const text = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'latin1');
  const built = circuitFrom(buildProject(parse(text)).records)!;
  const pressed = new Set(built.circuit.devices.filter((d) => d.kind === 'buttonNO').map((d) => d.id));
  return simulate(built.circuit, { pressed });
}

function supply(recordId: number, code: number, nets: number[]): Device {
  return { recordId, code, designator: '', part: '', kind: 'terminal', pinNames: [], nets, poles: [] };
}

function link(recordId: number, nets: [number, number]): Device {
  return {
    recordId,
    code: 4000,
    designator: '',
    part: '',
    kind: 'terminal',
    pinNames: ['a', 'b'],
    nets,
    poles: [[0, 1]],
  };
}

function synthetic(devices: Device[]): Netlist {
  const sizes = new Map<number, number>();
  const members = new Map<number, Set<number>>();
  for (const device of devices) {
    for (const net of device.nets) {
      sizes.set(net, (sizes.get(net) ?? 0) + 1);
      const set = members.get(net) ?? new Set<number>();
      set.add(device.recordId);
      members.set(net, set);
    }
  }
  return { sizes, devices, members, recordNets: new Map() };
}

test('corto L–N del fixture real: sólo con el pulsador cerrado', () => {
  const netlist = fixture('short-test.cad');
  const fault = detectFaults(netlist, closedFromFixture('short-test.cad'));
  assert.equal(fault?.kind, 'short');
  assert.deepEqual([...fault!.nets].sort((a, b) => a - b), [0, 1]);
  assert.ok(fault!.recordIds.includes(2), 'el pulsador que cierra el corto queda marcado');
  assert.equal(fault!.culprit?.recordId, 2, 'el culpable es el contacto que cierra, no la fase');
  assert.equal(fault!.culprit?.pins.length, 2);
  assert.equal(detectFaults(netlist, { closed: new Set() }), null);
});

test('fase contra PE del fixture real: derivación a tierra', () => {
  const netlist = fixture('earth-test.cad');
  const fault = detectFaults(netlist, closedFromFixture('earth-test.cad'));
  assert.equal(fault?.kind, 'earth');
  assert.ok(fault!.recordIds.includes(2));
  assert.equal(fault!.culprit?.recordId, 2);
});

test('L1 contra L2 con contacto cerrado es corto', () => {
  const netlist = synthetic([
    supply(1, 3000, [1]),
    supply(2, 3004, [2, 3, 4]),
    link(9, [1, 3]),
  ]);
  const fault = detectFaults(netlist, { closed: new Set(['9:0-1']) });
  assert.equal(fault?.kind, 'short');
  assert.deepEqual([...fault!.nets].sort((a, b) => a - b), [1, 3]);
  assert.equal(fault!.culprit?.recordId, 9);
  assert.deepEqual(fault!.culprit?.pins, [0, 1]);
});

test('dos tramos de la misma fase no son fallo', () => {
  const netlist = synthetic([
    supply(1, 3000, [1]),
    supply(2, 3000, [2]),
    link(9, [1, 2]),
  ]);
  assert.equal(detectFaults(netlist, { closed: new Set(['9:0-1']) }), null);
});

test('PE aislado no es fallo', () => {
  const netlist = synthetic([supply(1, 3002, [7])]);
  assert.equal(detectFaults(netlist, { closed: new Set() }), null);
});

test('contacto abierto no une las dos fases', () => {
  const netlist = synthetic([
    supply(1, 3000, [1]),
    supply(2, 3001, [2]),
    link(9, [1, 2]),
  ]);
  assert.equal(detectFaults(netlist, { closed: new Set() }), null);
});

test('corriente continua: + contra - es corto', () => {
  const netlist = synthetic([
    supply(1, 3008, [5]),
    supply(2, 3009, [6]),
    link(9, [5, 6]),
  ]);
  assert.equal(detectFaults(netlist, { closed: new Set(['9:0-1']) })?.kind, 'short');
});

test('derivación gana sobre corto si conviven en la misma red', () => {
  const netlist = synthetic([
    supply(1, 3000, [1]),
    supply(2, 3001, [2]),
    supply(3, 3002, [3]),
    link(9, [1, 2]),
    link(10, [1, 3]),
  ]);
  const fault = detectFaults(netlist, { closed: new Set(['9:0-1', '10:0-1']) });
  assert.equal(fault?.kind, 'earth');
  // El culpable es el contacto que completa la derivación (10), no el corto previo (9).
  assert.equal(fault!.culprit?.recordId, 10);
});

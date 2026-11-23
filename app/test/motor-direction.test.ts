import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/format/cade.ts';
import { buildProject } from '../src/model/project.ts';
import { circuitFrom } from '../src/sim/circuit.ts';
import { simulate } from '../src/sim/solver.ts';
import type { BuiltCircuit } from '../src/sim/circuit.ts';
import type { Device } from '../src/sim/netlist.ts';
import type { SimDevice, SimState } from '../src/sim/solver.ts';
import { motorDirections } from '../src/sim/direction.ts';

function dev(recordId: number, code: number, designator: string, pinNames: string[], nets: number[], poles: [number, number][]): Device {
  return {
    recordId,
    code,
    designator,
    part: designator.replace(/^-/, ''),
    kind: code === 1000 ? 'motor' : 'unknown',
    pinNames,
    nets,
    poles,
    timerNC: false,
    latching: false,
  };
}

function state(closed: string[]): SimState {
  return {
    energized: new Set(),
    closed: new Set(closed),
    loads: new Set(),
    liveNets: new Set([10, 11, 12]),
    iterations: 1,
    stable: true,
  };
}

/** Fuente L1/L2/L3 (10,11,12), motor U1/V1/W1 (1,2,3), dos contactores. */
function circuit(): BuiltCircuit {
  const devices: Device[] = [
    dev(1, 3005, '-X', ['1', '3', '5', '2', '4', '6'], [10, 11, 12, 13], []),
    dev(2, 1000, 'M1', ['U1', 'V1', 'W1', 'PE'], [1, 2, 3, 4], [[0, 2], [1, 3]]),
    dev(30, 2001, 'K1M', ['1', '3', '5', '2', '4', '6'], [10, 11, 12, 1, 2, 3], [[0, 3], [1, 4], [2, 5]]),
    dev(31, 2001, 'K2M', ['1', '3', '5', '2', '4', '6'], [12, 11, 10, 1, 2, 3], [[0, 3], [1, 4], [2, 5]]),
  ];
  const simDevices: SimDevice[] = [];
  for (const d of devices) {
    for (const [i, j] of d.poles) {
      simDevices.push({ id: `${d.recordId}:${d.nets[i]}-${d.nets[j]}`, kind: 'contactNO', a: d.nets[i]!, b: d.nets[j]!, part: d.part });
    }
  }
  const sizes = new Map<number, number>();
  const members = new Map<number, Set<number>>();
  for (const d of devices) {
    for (const net of d.nets) {
      sizes.set(net, (sizes.get(net) ?? 0) + 1);
      const set = members.get(net) ?? new Set<number>();
      set.add(d.recordId);
      members.set(net, set);
    }
  }
  return {
    circuit: { devices: simDevices, supply: [10, 13] },
    netlist: { sizes, devices, members, recordNets: new Map() },
    recordNets: new Map(),
    supply: [10, 13],
    devices,
  };
}

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const PR2 = join(dirname(FIXTURES), '..', 'test_simu', 'PR2_Rodolfo_Giusti_v2.cad');

test('PR2 real: K1M gira horario y K2M antihorario', () => {
  // El archivo v2 todavía trae el junction 75 que cortocircuita dos fases en Q1;
  // se quita en memoria para probar la topología que el plano dice tener.
  const records = buildProject(parse(readFileSync(PR2, 'latin1'))).records.filter((r) => r.id !== 75);
  const built = circuitFrom(records)!;
  const press = (part: string): Set<string> =>
    new Set(built.circuit.devices.filter((d) => d.kind.startsWith('button') && d.part === part).map((d) => d.id));
  const changeovers = new Map([['2', 1]]);

  const forward = simulate(built.circuit, { pressed: press('S1'), changeovers });
  const reverse = simulate(built.circuit, { pressed: press('S2'), changeovers });
  assert.equal(motorDirections(built, forward).get(29), 1);
  assert.equal(motorDirections(built, reverse).get(29), -1);
});

test('K1M conecta L1/L2/L3 a U1/V1/W1: sentido horario', () => {
  const dirs = motorDirections(circuit(), state(['30:0-3', '30:1-4', '30:2-5']));
  assert.equal(dirs.get(2), 1);
});

test('K2M invierte dos fases: sentido antihorario', () => {
  const dirs = motorDirections(circuit(), state(['31:0-3', '31:1-4', '31:2-5']));
  assert.equal(dirs.get(2), -1);
});

test('sin contactos cerrados el sentido por defecto es horario', () => {
  assert.equal(motorDirections(circuit(), state([])).get(2), 1);
});

test('un motor con un borne sin cablear no cambia el sentido', () => {
  const built = circuit();
  built.devices = built.devices.map((d) =>
    d.recordId === 2 ? dev(2, 1000, 'M1', ['U1', 'V1', 'W1', 'PE'], [1, 2, -1, 4], d.poles) : d,
  );
  const dirs = motorDirections(built, state(['30:0-3', '30:1-4']));
  assert.equal(dirs.get(2), 1);
});

test('la detección lee el borne del motor, no qué contactor cerró', () => {
  // Mismo contactor K1M, pero con dos fases cruzadas en SU salida.
  const built = circuit();
  built.devices = built.devices.map((d) =>
    d.recordId === 30 ? dev(30, 2001, 'K1M', d.pinNames, [10, 11, 12, 3, 2, 1], d.poles) : d,
  );
  const dirs = motorDirections(built, state(['30:0-3', '30:1-4', '30:2-5']));
  assert.equal(dirs.get(2), -1);
});

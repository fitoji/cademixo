import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parse } from '../src/format/cade.ts';
import { boundsOf, buildProject } from '../src/model/project.ts';
import { faultFinding, faultLocation } from '../src/ui/fault-avisos.ts';
import { circuitFrom } from '../src/sim/circuit.ts';
import { detectFaults, type SimulationFault } from '../src/sim/faults.ts';
import { buildNetlist } from '../src/sim/netlist.ts';
import { simulate } from '../src/sim/solver.ts';

const project = buildProject(parse(readFileSync(new URL('./fixtures/ej0def.cad', import.meta.url), 'utf8')));

const component = project.records.find((record) => record.designator === 'Q1')!;
const wire = project.records.find((record) => record.kind === 'connection')!;

const short = (ids: number[], kind: 'short' | 'earth' = 'short'): SimulationFault => ({
  kind,
  nets: [1, 2],
  recordIds: ids,
  culprit: null,
});

test('el cortocircuito se ubica en el centro del primer componente implicado', () => {
  const box = boundsOf(component)!;
  const at = faultLocation(project.records, short([component.id]));
  assert.deepEqual(at, { x: box.x + box.w / 2, y: box.y + box.h / 2 });
});

test('un cable implicado se marca en la mitad de su tramo', () => {
  const at = faultLocation(project.records, short([wire.id]));
  assert.notEqual(at, null);
  assert.equal(Number.isFinite(at!.x), true);
  assert.equal(Number.isFinite(at!.y), true);
});

test('sin registros reconocibles, el aviso no inventa un punto', () => {
  assert.equal(faultLocation(project.records, short([999_999])), null);
});

test('sin culpable, el fallback evita marcar la alimentación', () => {
  const supply = project.records.find((record) => record.code === 3000)!;
  const target = project.records.find((record) => record.code === 6009)!;
  const at = faultLocation(project.records, short([supply.id, target.id]));
  const box = boundsOf(target)!;
  assert.deepEqual(at, { x: box.x + box.w / 2, y: box.y + box.h / 2 });
});

test('el aviso del corto es de nivel error y apunta a los registros detectados', () => {
  const finding = faultFinding(project.records, short([component.id]));
  assert.equal(finding.level, 'error');
  assert.equal(finding.code, 'short-circuit');
  assert.match(finding.message, /Cortocircuito/);
  assert.deepEqual(finding.ids, [component.id]);
  assert.notEqual(finding.at, undefined);
});

test('la derivación a tierra se distingue del cortocircuito', () => {
  const finding = faultFinding(project.records, short([component.id], 'earth'));
  assert.equal(finding.code, 'earth-fault');
  assert.match(finding.message, /tierra/);
});

test('marca el contacto que genera el corto, no la alimentación', () => {
  const text = readFileSync(new URL('./fixtures/short-test.cad', import.meta.url), 'latin1');
  const records = buildProject(parse(text)).records;
  const built = circuitFrom(records)!;
  const pressed = new Set(built.circuit.devices.filter((d) => d.kind === 'buttonNO').map((d) => d.id));
  const state = simulate(built.circuit, { pressed });
  const fault = detectFaults(buildNetlist(records), state)!;

  assert.notEqual(fault.culprit, null);
  const culpritRecord = records.find((record) => record.id === fault.culprit!.recordId)!;
  const box = boundsOf(culpritRecord)!;
  const finding = faultFinding(records, fault);
  const at = finding.at!;
  // El punto cae dentro del componente que cierra el corto, no en la fase.
  assert.ok(at.x >= box.x - 0.01 && at.x <= box.x + box.w + 0.01);
  assert.ok(at.y >= box.y - 0.01 && at.y <= box.y + box.h + 0.01);
  // Sólo el culpable queda marcado: la alimentación no se pinta de rojo.
  assert.deepEqual(finding.ids, [fault.culprit!.recordId]);
  assert.ok(!finding.ids.includes(fault.recordIds.find((id) => id !== fault.culprit!.recordId)!));
  assert.match(finding.message, /en -S1/);
});

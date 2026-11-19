import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/format/cade.ts';
import { buildProject } from '../src/model/project.ts';
import { circuitFrom, type BuiltCircuit } from '../src/sim/circuit.ts';
import { simulate } from '../src/sim/solver.ts';
import { isChangeover, specOf } from '../src/model/component-spec.ts';
import { resolveSymbol } from '../src/symbols/library.ts';
import { bladeAngle } from '../src/symbols/draw.ts';
import type { CadeRecordModel } from '../src/model/project.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const TEXT = readFileSync(join(FIXTURES, 'conmutado-tercer-borne.cade'), 'latin1');

/**
 * Copia de la regla de `closedContacts` (`app/src/ui/App.tsx`), sin el caso
 * especial de 7000/7001/2001 que este fixture no tiene.
 *
 * Un conmutado de tres bornes cuenta con el tiro que le toca según su polaridad
 * (`rest`), porque el símbolo está dibujado en una de las dos poses y la
 * cuchilla gira desde ahí; el 8018 de cuatro bornes sigue la posición libre.
 */
function poseRecords(
  records: readonly CadeRecordModel[],
  built: BuiltCircuit,
  closed: ReadonlySet<string>,
  positions: Record<string, number> = {},
  twoThrowRule = true,
): Set<number> {
  const out = new Set<number>();
  const codeById = new Map(
    records.filter((r) => r.kind === 'component').map((r) => [r.id, r.code]),
  );
  const twoThrow = new Set<number>();
  for (const device of built.circuit.devices) {
    if (device.id.endsWith(':0-2')) twoThrow.add(Number(device.id.split(':')[0]));
  }
  for (const id of closed) {
    const [head, pair] = id.split(':');
    const recordId = Number(head);
    const code = codeById.get(recordId);
    if (code !== undefined && isChangeover(code)) {
      if ((positions[String(recordId)] ?? 0) === 0) out.add(recordId);
      continue;
    }
    if (twoThrowRule && twoThrow.has(recordId)) {
      const wants = code !== undefined && specOf(code).rest === 'closed' ? '0-1' : '0-2';
      if (pair !== wants) continue;
    }
    out.add(recordId);
  }
  return out;
}

function poseAngles(
  code: number,
  pressed: boolean,
): { angles: number[]; degs: number[]; pose: Set<number> } {
  const text = TEXT.replace('*3*8003#', `*3*${code}#`);
  const proj = buildProject(parse(text));
  const rec = proj.records.find((r) => r.kind === 'component' && r.code === code);
  assert.ok(rec, `el fixture debe traer el aparato ${code}`);
  const built = circuitFrom(proj.records);
  assert.ok(built, 'el fixture arma circuito');
  const mine = built.circuit.devices.filter((d) => Number(d.id.split(':')[0]) === rec.id);
  const state = simulate(built.circuit, {
    pressed: pressed ? new Set(mine.map((d) => d.id)) : new Set<string>(),
  });
  const pose = poseRecords(proj.records, built, state.closed);
  const sym = resolveSymbol(rec.code, rec.pins);
  const blades = sym.shapes(12, 15).flatMap((s) => (s.blade ? [s.blade] : []));
  assert.ok(blades.length > 0, `el símbolo ${code} tiene cuchilla móvil`);
  return {
    angles: blades.map((b) => bladeAngle(b, { closed: pose.has(rec.id), pressed })),
    degs: blades.map((b) => b.deg),
    pose,
  };
}

for (const code of [8003, 8015]) {
  test(`conmutado de tres bornes ${code} (rest: ${specOf(code).rest}): dibujado en reposo, gira al accionar`, () => {
    const rest = poseAngles(code, false);
    assert.deepEqual(
      rest.angles,
      rest.degs.map(() => 0),
      'en reposo el símbolo se queda como está dibujado',
    );
    const pressed = poseAngles(code, true);
    assert.deepEqual(pressed.angles, pressed.degs, 'accionado gira a su pose de trabajo');
  });
}

test('la regla de pose no toca a un aparato de cuatro bornes (8018)', () => {
  const pr1 = readFileSync(join(FIXTURES, 'pr1-rodolfo-giusti.cad'), 'latin1');
  const proj = buildProject(parse(pr1));
  const built = circuitFrom(proj.records);
  assert.ok(built);
  for (const position of [0, 1]) {
    const state = simulate(built.circuit, { changeovers: new Map([['2', position]]) });
    const positions = { '2': position };
    // El 8018 tiene pares 0-2 y 1-3 (cuatro bornes), así que la regla del tercer
    // borne podría confundirlo: con y sin la regla tiene que dar lo mismo.
    assert.deepEqual(
      poseRecords(proj.records, built, state.closed, positions),
      poseRecords(proj.records, built, state.closed, positions, false),
      `la regla del tercer borne no altera la pose del 8018 (posición ${position})`,
    );
  }
});

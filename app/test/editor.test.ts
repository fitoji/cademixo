import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/format/cade.ts';
import { buildProject } from '../src/model/project.ts';
import { buildNetlist } from '../src/sim/netlist.ts';
import { buildNetwork } from '../src/editor/network.ts';
import { pathPoints, wirePathsOf } from '../src/editor/wiring/types.ts';
import {
  createEditor,
  projectOf,
  select,
  moveSelection,
  deleteSelection,
  copySelection,
  paste,
  addComponent,
  rotateSelection,
  setDesignator,
  undo,
  redo,
} from '../src/editor/state.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const ARRANQUE = readFileSync(join(FIXTURES, 'arranque-paro-motor-3f.cad'), 'latin1');

const idOf = (code: number, text = ARRANQUE): number =>
  parse(text).records.find((r) => r.code === code)!.id;

test('createEditor: abre sin marcar cambios y sin historial', () => {
  const s = createEditor(ARRANQUE);
  assert.equal(s.text, ARRANQUE);
  assert.equal(s.dirty, false);
  assert.deepEqual(s.past, []);
  assert.deepEqual(s.selection, []);
});

test('select: reemplaza y acumula con additive', () => {
  let s = createEditor(ARRANQUE);
  s = select(s, [1, 2]);
  assert.deepEqual(s.selection, [1, 2]);
  s = select(s, [2, 3], true);
  assert.deepEqual(s.selection.sort(), [1, 3]);
});

test('moveSelection: el componente y sus cables viajan juntos', () => {
  const motorId = idOf(1000);
  let s = createEditor(ARRANQUE);
  s = select(s, [motorId]);
  s = moveSelection(s, 10, -5);

  const before = projectOf(createEditor(ARRANQUE));
  const after = projectOf(s);
  const mb = before.records.find((r) => r.id === motorId)!;
  const ma = after.records.find((r) => r.id === motorId)!;

  assert.equal(ma.geometry[8], mb.geometry[8]! + 10);
  assert.equal(ma.geometry[9], mb.geometry[9]! - 5);
  assert.equal(s.dirty, true);

  // Los cables enganchados a sus bornes viajan con el componente. Se comparan
  // por ruta (los registros se reescriben al re-rutear).
  const attached = wirePathsOf(buildNetwork(before.records)).filter(
    (p) =>
      (p.from.kind === 'pin' && p.from.componentId === motorId) ||
      (p.to.kind === 'pin' && p.to.componentId === motorId),
  );
  assert.ok(attached.length > 0, 'el motor tiene cables en sus bornes');
  const afterNet = buildNetwork(after.records);
  const afterPaths = wirePathsOf(afterNet);
  let movedCable = false;
  for (const path of attached) {
    const now = afterPaths.find((p) => p.cable === path.cable);
    if (!now) continue;
    if (JSON.stringify(pathPoints(afterNet, now)) !== JSON.stringify(pathPoints(buildNetwork(before.records), path)))
      movedCable = true;
  }
  assert.equal(movedCable, true, 'al menos un cable enganchado viaja con el motor');
});

test('moveSelection: los extremos en bornes del componente siguen su desplazamiento', () => {
  const motorId = idOf(1000);
  const beforeNet = buildNetwork(projectOf(createEditor(ARRANQUE)).records);
  const attached = wirePathsOf(beforeNet).filter(
    (p) =>
      (p.from.kind === 'pin' && p.from.componentId === motorId) ||
      (p.to.kind === 'pin' && p.to.componentId === motorId),
  );
  assert.ok(attached.length > 0, 'el motor debe tener cables en sus bornes');

  const s = moveSelection(select(createEditor(ARRANQUE), [motorId]), 7, 0);
  const afterNet = buildNetwork(projectOf(s).records);
  const afterPaths = wirePathsOf(afterNet);

  for (const path of attached) {
    const beforePts = pathPoints(beforeNet, path);
    const now = afterPaths.find((p) => p.cable === path.cable)!;
    const afterPts = pathPoints(afterNet, now);
    const shiftFrom = path.from.kind === 'pin' && path.from.componentId === motorId ? 7 : 0;
    const shiftTo = path.to.kind === 'pin' && path.to.componentId === motorId ? 7 : 0;
    assert.deepEqual(afterPts[0], { x: beforePts[0]!.x + shiftFrom, y: beforePts[0]!.y });
    assert.deepEqual(afterPts.at(-1), { x: beforePts.at(-1)!.x + shiftTo, y: beforePts.at(-1)!.y });
  }
});

test('moveSelection sin selección no altera el texto', () => {
  const s = createEditor(ARRANQUE);
  assert.equal(moveSelection(s, 5, 5).text, ARRANQUE);
});

test('undo y redo restauran el texto exacto', () => {
  const motorId = idOf(1000);
  let s = select(createEditor(ARRANQUE), [motorId]);
  s = moveSelection(s, 12, 0);
  const moved = s.text;
  assert.notEqual(moved, ARRANQUE);

  s = undo(s);
  assert.equal(s.text, ARRANQUE);
  assert.deepEqual(s.selection, [motorId]);

  s = redo(s);
  assert.equal(s.text, moved);
});

test('undo sin historial es inocuo', () => {
  const s = createEditor(ARRANQUE);
  assert.equal(undo(s), s);
});

test('deleteSelection: borra el componente y deja intacto el resto', () => {
  const motorId = idOf(1000);
  const before = parse(ARRANQUE).records.length;
  let s = select(createEditor(ARRANQUE), [motorId]);
  s = deleteSelection(s);

  const after = parse(s.text).records;
  assert.equal(after.length, before - 1);
  assert.equal(after.some((r) => r.id === motorId), false);
  assert.ok(after.some((r) => r.code === 2001), 'el contactor sigue ahí');
  assert.ok(after.some((r) => r.code === 20000), 'el bloque de título sobrevive');
  assert.deepEqual(s.selection, []);
});

test('deleteSelection: no borra registros que no son dibujables', () => {
  const titleId = parse(ARRANQUE).records.find((r) => r.code === 20000)!.id;
  const s = deleteSelection(select(createEditor(ARRANQUE), [titleId]));
  assert.equal(s.text, ARRANQUE);
});

test('copy + paste: agrega registros con ids crecientes y reparsea', () => {
  const motorId = idOf(1000);
  let s = select(createEditor(ARRANQUE), [motorId]);
  s = copySelection(s);
  assert.equal(s.clipboard.length, 1);

  const before = parse(ARRANQUE).records.length;
  s = paste(s, 20, 20);

  const records = parse(s.text).records;
  assert.equal(records.length, before + 1);
  const ids = records.map((r) => r.id);
  for (let i = 1; i < ids.length; i++) {
    assert.ok(ids[i]! > ids[i - 1]!, `id ${ids[i]} no es mayor que ${ids[i - 1]}`);
  }
  const copy = records.at(-1)!;
  assert.equal(copy.code, 1000);
  assert.equal(s.selection.length, 1);
  assert.equal(s.selection[0], copy.id);
});

test('paste sin clipboard no cambia nada', () => {
  const s = createEditor(ARRANQUE);
  assert.equal(paste(s).text, ARRANQUE);
});

test('addComponent: inserta al final con el id siguiente y en la posición pedida', () => {
  const template = parse(ARRANQUE).records.find((r) => r.code === 6003)!.raw;
  let s = createEditor(ARRANQUE);
  s = addComponent(s, template, 140, 60);

  const records = parse(s.text).records;
  const added = projectOf(s).records.at(-1)!;
  assert.equal(added.code, 6003);
  assert.equal(added.id, Math.max(...records.slice(0, -1).map((r) => r.id)) + 1);
  assert.equal(added.geometry[8], 140);
  assert.equal(added.geometry[9], 60);
  assert.deepEqual(s.selection, [added.id]);
});

test('addComponent: no repite el designador aunque la plantilla lo traiga usado', () => {
  const template = parse(ARRANQUE).records.find((r) => r.code === 1000)!.raw;
  let s = createEditor(ARRANQUE);
  const usados = new Set(projectOf(s).records.map((r) => r.designator));

  s = addComponent(s, template, 200, 60);
  s = addComponent(s, template, 220, 60);

  const added = projectOf(s)
    .records.slice(-2)
    .map((r) => r.designator);
  assert.equal(added.length, 2);
  assert.notEqual(added[0], added[1], 'los dos motores nuevos comparten designador');
  for (const d of added) assert.ok(!usados.has(d), `el designador ${d} ya existía`);
});

test('rotateSelection: dos giros escriben 180° en el archivo', () => {
  // La fórmula de CADe vale para cualquier código con bloque de geometría, no
  // sólo para los medidos en la Parte A: el motor 1000 también se escribe.
  const motorId = idOf(1000);
  let s = select(createEditor(ARRANQUE), [motorId]);
  s = rotateSelection(s);
  assert.notEqual(s.text, ARRANQUE, 'el giro se escribe en geometry[17]');
  s = rotateSelection(s);
  assert.equal(s.rotation[motorId], undefined, 'la capa visual se pliega y se limpia');
  const motor = projectOf(s).records.find((r) => r.id === motorId)!;
  assert.deepEqual(motor.transform, { rotation: 180, mirror: false });
});

test('setDesignator: cambia sólo el designador del registro indicado', () => {
  const motorId = idOf(1000);
  let s = createEditor(ARRANQUE);
  s = setDesignator(s, motorId, '-M7');

  const records = parse(s.text).records;
  const motor = records.find((r) => r.id === motorId)!;
  assert.equal(motor.designator, '-M7');
  assert.equal(records.length, parse(ARRANQUE).records.length);

  const untouched = records.filter((r) => r.id !== motorId);
  const original = parse(ARRANQUE).records.filter((r) => r.id !== motorId);
  untouched.forEach((r, i) => assert.equal(r.raw, original[i]!.raw));
});

test('mover un componente no le suelta los cables', () => {
  // Reporte del usuario: al mover un aparato "perdía el contacto" y la
  // simulación dejaba de conducir. Los cables tienen que viajar con él.
  const unconnected = (text: string): number => {
    const netlist = buildNetlist(buildProject(parse(text)).records);
    let count = 0;
    for (const device of netlist.devices) for (const net of device.nets) if (net === -1) count++;
    return count;
  };

  for (const [name, text] of [
    ['arranque', ARRANQUE],
    ['demo', readFileSync(join(FIXTURES, 'luz-con-interruptor.cade'), 'latin1')],
  ] as const) {
    const base = unconnected(text);
    const components = buildProject(parse(text)).records.filter((r) => r.kind === 'component' && r.code !== 20000);
    for (const rec of components) {
      let s = createEditor(text);
      s = moveSelection(select(s, [rec.id], false), 6, 0);
      assert.equal(
        unconnected(s.text),
        base,
        `${name}: mover ${rec.code} (#${rec.id}) dejó bornes sin conectar`,
      );
    }
  }
});

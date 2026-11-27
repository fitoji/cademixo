/**
 * Manejo de cables al mover componentes: modo Actual vs Ortogonal (Wybrow).
 *
 * Aceptación fijada antes de implementar:
 *  - K2M (registro 55, tipo 2001) +12 conserva sus seis bornes conectados y los
 *    tres carriles superiores (129/123/117) y tres inferiores (147/153/159).
 *  - El modo Actual conserva byte a byte la geometría que producía antes.
 *  - Un obstáculo real obliga a usar el enrutador de visibilidad, no sólo la
 *    deformación local; un destino sin salida se rechaza sin tocar el documento.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  wirePoints,
  withGeometry,
  withId,
  withPosition,
  withWirePoints,
  type CadeRecordModel,
} from '../src/model/project.ts';
import {
  applyDrag,
  applyDragResult,
  createEditor,
  moveDelta,
  projectOf,
  redo,
  select,
  undo,
} from '../src/editor/state.ts';
import { attachPoints } from '../src/editor/pins.ts';
import { buildNetwork } from '../src/editor/network.ts';
import {
  cablePlanToDelta,
  connectionGroups,
  differentNetOverlaps,
  planCableMove,
  prepareCableMove,
} from '../src/editor/wiring/cable-move.ts';
import { setSettings } from '../src/ui/settings.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const FIXTURE = readFileSync(join(FIXTURES, 'motor_con_inversion_giro.cad'), 'latin1');
const K2M = 55;

const project = () => projectOf(createEditor(FIXTURE));
const wireOf = (records: readonly CadeRecordModel[], id: number) => {
  const rec = records.find((r) => r.id === id);
  return rec ? wirePoints(rec) : null;
};
const planFor = (records: readonly CadeRecordModel[], selection: number[], dx: number, dy: number) =>
  planCableMove(prepareCableMove(records, new Set(selection)), dx, dy, { validate: true });

/** Bornes de un componente, en el orden estable de `attachPoints`. */
const pinsOf = (records: readonly CadeRecordModel[], id: number) => attachPoints([...records]).get(id) ?? [];

test('K2M +12 ortogonal conserva bornes, carriles y conectividad', () => {
  const before = project();
  const plan = planFor(before.records, [K2M], 12, 0);
  assert.ok(plan.ok, plan.ok ? '' : plan.reason);

  const after = projectOf(applyDrag(select(createEditor(FIXTURE), [K2M]), { kind: 'move', dx: 12, dy: 0 }, 'ortogonal'));

  // El contactor correcto: tipo 2001 y registro 55, no su bobina ni auxiliares.
  const rec = after.records.find((r) => r.id === K2M)!;
  assert.equal(rec.code, 2001);
  assert.equal(rec.geometry[8], 228, 'K2M.x = 216 + 12');
  assert.equal(rec.geometry[9], 132);

  // Seis bornes reales (más el codo compartido en el borde inferior) trasladados.
  const pins = pinsOf(after.records, K2M);
  assert.deepEqual(pins.slice(0, 6), [
    { x: 228, y: 132 },
    { x: 234, y: 132 },
    { x: 240, y: 132 },
    { x: 228, y: 144 },
    { x: 234, y: 144 },
    { x: 240, y: 144 },
  ]);
  assert.deepEqual(pins.at(-1), { x: 228, y: 147 });

  // Los tramos conservan sus carriles escalonados: tres arriba, tres abajo.
  assert.deepEqual(wireOf(after.records, 125), { x1: 195, y1: 129, x2: 228, y2: 129 });
  assert.deepEqual(wireOf(after.records, 132), { x1: 189, y1: 123, x2: 234, y2: 123 });
  assert.deepEqual(wireOf(after.records, 138), { x1: 183, y1: 117, x2: 240, y2: 117 });
  assert.deepEqual(wireOf(after.records, 144), { x1: 183, y1: 147, x2: 228, y2: 147 });
  assert.deepEqual(wireOf(after.records, 147), { x1: 189, y1: 153, x2: 234, y2: 153 });
  assert.deepEqual(wireOf(after.records, 150), { x1: 195, y1: 159, x2: 240, y2: 159 });

  // La deformación local no agrega ni quita registros.
  assert.equal(after.records.length, before.records.length, 'sin tramos nuevos');

  // Un cruce perpendicular (el carril nuevo sobre el tronco x=201) no crea
  // nodo ni unión: el modelo eléctrico lo lee como cruce sin conexión.
  const trunk = wireOf(after.records, 31);
  const lane = wireOf(after.records, 125);
  assert.ok(trunk && lane);
  assert.equal(Math.abs(trunk.x1 - trunk.x2) < 0.01, true, 'el tronco es vertical');
  assert.equal(Math.abs(lane.y1 - lane.y2) < 0.01, true, 'el carril es horizontal');
  assert.ok(Math.min(lane.x1, lane.x2) < 201 && Math.max(lane.x1, lane.x2) > 201, 'el carril cruza el tronco');
  assert.equal(buildNetwork([...after.records]).nodes.get('0|201,129'), undefined, 'el cruce no crea nodo');

  // Conectividad por identidad de bornes (incluye aislados), no por número de red.
  assert.deepEqual(connectionGroups(after.records), connectionGroups(before.records));
  assert.deepEqual(differentNetOverlaps(after.records), []);
});

test('K2M +12 modo Actual conserva la geometría de referencia', () => {
  const before = project();
  const after = projectOf(applyDrag(select(createEditor(FIXTURE), [K2M]), { kind: 'move', dx: 12, dy: 0 }));
  const byId = new Map(after.records.map((r) => [r.id, r]));

  // Geometría capturada con el motor anterior: no se toca la ruta Actual.
  assert.deepEqual(wirePoints(byId.get(124)!), { x1: 216, y1: 129, x2: 216, y2: 132 });
  assert.deepEqual(wirePoints(byId.get(131)!), { x1: 222, y1: 123, x2: 222, y2: 132 });
  assert.deepEqual(wirePoints(byId.get(137)!), { x1: 228, y1: 117, x2: 228, y2: 132 });
  assert.deepEqual(wirePoints(byId.get(140)!), { x1: 228, y1: 144, x2: 228, y2: 147 });
  assert.deepEqual(wirePoints(byId.get(144)!), { x1: 183, y1: 147, x2: 228, y2: 147 });
  assert.deepEqual(wirePoints(byId.get(146)!), { x1: 234, y1: 144, x2: 222, y2: 144 });
  assert.deepEqual(wirePoints(byId.get(149)!), { x1: 240, y1: 144, x2: 228, y2: 144 });

  const beforeIds = new Set(before.records.map((r) => r.id));
  const added = after.records.filter((r) => !beforeIds.has(r.id));
  assert.equal(added.length, 5, 'la ruta Actual deja los cinco codos de siempre');
  assert.deepEqual(
    added.map((r) => wirePoints(r)),
    [
      { x1: 216, y1: 132, x2: 228, y2: 132 },
      { x1: 222, y1: 132, x2: 234, y2: 132 },
      { x1: 228, y1: 132, x2: 240, y2: 132 },
      { x1: 222, y1: 144, x2: 222, y2: 153 },
      { x1: 228, y1: 144, x2: 228, y2: 159 },
    ],
  );

  // El delta del preview coincide con la geometría confirmada.
  const deltaBefore = moveDelta(before.records, attachPoints(before.records), new Set([K2M]), 12, 0);
  for (const [id, pts] of deltaBefore.wires) assert.deepEqual(wirePoints(byId.get(id)!), pts);
});

test('el modo ortogonal sobrevive guardar/reabrir y deshacer/rehacer', () => {
  const state = select(createEditor(FIXTURE), [K2M]);
  const moved = applyDrag(state, { kind: 'move', dx: 12, dy: 0 }, 'ortogonal');
  const original = projectOf(state).records;
  assert.equal(moved.past.length, state.past.length + 1, 'una sola entrada de historial');

  const reopened = projectOf(createEditor(moved.text));
  const rec = reopened.records.find((r) => r.id === K2M)!;
  assert.equal(rec.geometry[8], 228);
  assert.deepEqual(connectionGroups(reopened.records), connectionGroups(original));
  assert.deepEqual(wireOf(reopened.records, 125), { x1: 195, y1: 129, x2: 228, y2: 129 });

  const undone = undo(moved);
  assert.equal(undone.text, state.text, 'deshacer restaura el original');
  assert.deepEqual(connectionGroups(projectOf(undone).records), connectionGroups(original));
  const redone = redo(undone);
  assert.equal(redone.text, moved.text, 'rehacer reproduce el resultado');
});

test('movimiento vertical y diagonal conservan la conectividad (escena simple)', () => {
  const text = syntheticText({
    components: [{ template: K2M, id: 2, x: 0, y: 0 }],
    wires: [
      { template: 124, id: 20, points: { x1: 0, y1: 12, x2: 0, y2: 18 } },
      { template: 124, id: 21, points: { x1: -30, y1: 18, x2: 0, y2: 18 } },
    ],
    junctions: [],
  });
  const records = projectOf(createEditor(text)).records;
  for (const [dx, dy] of [
    [0, -12],
    [12, -6],
    [-6, -9],
    [0, -18],
  ] as const) {
    const plan = planFor(records, [2], dx, dy);
    assert.ok(plan.ok, `plan (${dx},${dy}): ${plan.ok ? '' : plan.reason}`);
    const state = applyDrag(select(createEditor(text), [2]), { kind: 'move', dx, dy }, 'ortogonal');
    const after = projectOf(state);
    assert.deepEqual(connectionGroups(after.records), connectionGroups(records), `grupos (${dx},${dy})`);
    assert.deepEqual(differentNetOverlaps(after.records), [], `superposición (${dx},${dy})`);
    for (const r of after.records) {
      const pts = wirePoints(r);
      if (!pts) continue;
      assert.ok(
        Math.abs(pts.x1 - pts.x2) < 0.01 || Math.abs(pts.y1 - pts.y2) < 0.01,
        `cable ${r.id} ortogonal en (${dx},${dy})`,
      );
    }
  }
});

test('selección múltiple conserva la conectividad (escena simple)', () => {
  const text = syntheticText({
    components: [
      { template: K2M, id: 2, x: 0, y: 0 },
      { template: K2M, id: 3, x: 60, y: 0 },
    ],
    wires: [
      { template: 124, id: 20, points: { x1: 0, y1: 12, x2: 0, y2: 18 } },
      { template: 124, id: 21, points: { x1: -30, y1: 18, x2: 0, y2: 18 } },
      { template: 124, id: 22, points: { x1: 60, y1: 12, x2: 60, y2: 18 } },
      { template: 124, id: 23, points: { x1: 30, y1: 18, x2: 60, y2: 18 } },
    ],
    junctions: [],
  });
  const before = projectOf(createEditor(text)).records;
  const plan = planFor(before, [2, 3], 12, 0);
  assert.ok(plan.ok, plan.ok ? '' : plan.reason);
  const after = projectOf(applyDrag(select(createEditor(text), [2, 3]), { kind: 'move', dx: 12, dy: 0 }, 'ortogonal'));
  assert.equal(after.records.find((r) => r.id === 2)!.geometry[8], 12);
  assert.equal(after.records.find((r) => r.id === 3)!.geometry[8], 72);
  assert.deepEqual(connectionGroups(after.records), connectionGroups(before));
  assert.deepEqual(differentNetOverlaps(after.records), []);
});

test('la derivación compartida no se arrastra: queda fija y el borne se conecta por un tramo', () => {
  const text = syntheticText({
    components: [{ template: K2M, id: 2, x: 0, y: 0 }],
    wires: [
      { template: 124, id: 20, points: { x1: 0, y1: 12, x2: 0, y2: 18 } },
      { template: 124, id: 21, points: { x1: -30, y1: 18, x2: 0, y2: 18 } },
    ],
    junctions: [{ id: 30, x: 0, y: 12 }],
  });
  const before = projectOf(createEditor(text)).records;
  const plan = planFor(before, [2], 24, 0);
  assert.ok(plan.ok, plan.ok ? '' : plan.reason);
  assert.equal(plan.proposal.strategy, 'wybrow');
  const after = projectOf(applyDrag(select(createEditor(text), [2]), { kind: 'move', dx: 24, dy: 0 }, 'ortogonal'));

  // La unión sigue en su lugar y el tramo original no se movió.
  const junction = after.records.find((r) => r.code === 4001 && r.geometry[8] === 0 && r.geometry[9] === 12);
  assert.ok(junction, 'la unión de (0,12) no se movió');
  assert.deepEqual(wireOf(after.records, 20), { x1: 0, y1: 12, x2: 0, y2: 18 });

  // El borne nuevo (24,12) se conecta a la unión con un tramo propio.
  const pins = pinsOf(after.records, 2);
  const pin = pins.find((p) => p.x === 24 && p.y === 12);
  assert.ok(pin, 'el borne movido existe');
  const stub = after.records.find((r) => {
    const pts = wirePoints(r);
    return (
      pts !== null &&
      ((Math.abs(pts.x1 - 24) < 0.01 && Math.abs(pts.y1 - 12) < 0.01 && Math.abs(pts.x2) < 0.01 && Math.abs(pts.y2 - 12) < 0.01) ||
        (Math.abs(pts.x2 - 24) < 0.01 && Math.abs(pts.y2 - 12) < 0.01 && Math.abs(pts.x1) < 0.01 && Math.abs(pts.y1 - 12) < 0.01))
    );
  });
  assert.ok(stub, 'hay un tramo entre el borne nuevo y la unión fija');
  assert.deepEqual(connectionGroups(after.records), connectionGroups(before));
});

test('un obstáculo entre el borne y su anclaje ejercita el enrutador Wybrow', () => {
  const text = syntheticText({
    components: [
      { template: K2M, id: 2, x: 0, y: 0 },
      { template: 0, id: 3, x: 6, y: -8 }, // bloquea el codo directo por y=-6
      { template: 0, id: 4, x: -2, y: -4 }, // bloquea el codo directo por x=0
    ],
    wires: [
      { template: 124, id: 20, points: { x1: 0, y1: 0, x2: 0, y2: -6 } },
      { template: 124, id: 21, points: { x1: -30, y1: -6, x2: 0, y2: -6 } },
    ],
    junctions: [{ id: 30, x: 0, y: -6 }],
  });
  const editor = createEditor(text);
  const records = projectOf(editor).records;
  const plan = planFor(records, [2], 24, 0);
  assert.ok(plan.ok, plan.ok ? '' : plan.reason);
  assert.equal(plan.proposal.strategy, 'wybrow', 'la deformación local no puede arrastrar la unión');
  assert.ok(plan.proposal.added.length >= 1, 'el desvío agrega tramos');

  const afterResult = applyDragResult(select(editor, [2]), { kind: 'move', dx: 24, dy: 0 }, 'ortogonal');
  assert.ok(afterResult.ok, afterResult.ok ? '' : (afterResult.reason ?? ''));
  const after = projectOf(afterResult.state);
  assert.deepEqual(connectionGroups(after.records), connectionGroups(records));
  assert.deepEqual(differentNetOverlaps(after.records), []);
  // La ruta no atraviesa el obstáculo que bloqueaba el codo directo.
  for (const r of after.records) {
    const pts = wirePoints(r);
    if (!pts) continue;
    const inBlocked =
      Math.abs(pts.y1 + 6) < 0.01 &&
      Math.abs(pts.y2 + 6) < 0.01 &&
      Math.min(pts.x1, pts.x2) < 12 &&
      Math.max(pts.x1, pts.x2) > 6;
    assert.equal(inBlocked, false, 'ningún tramo nuevo cruza el obstáculo por y=-6');
  }
});

test('un destino sin solución se rechaza sin tocar documento ni historial', () => {
  const ring = [
    { template: 0, id: 3, x: 20, y: -8 },
    { template: 0, id: 4, x: 20, y: -6 },
    { template: 0, id: 5, x: 20, y: 1 },
    { template: 0, id: 6, x: 20, y: 3 },
    { template: 0, id: 7, x: 15, y: -4 },
    { template: 0, id: 8, x: 15, y: -2 },
    { template: 0, id: 9, x: 25, y: -4 },
    { template: 0, id: 10, x: 25, y: -2 },
  ];
  const text = syntheticText({
    components: [{ template: K2M, id: 2, x: 0, y: 0 }, ...ring],
    wires: [
      { template: 124, id: 20, points: { x1: 0, y1: 0, x2: 0, y2: -6 } },
      { template: 124, id: 21, points: { x1: -30, y1: -6, x2: 0, y2: -6 } },
    ],
    junctions: [{ id: 30, x: 0, y: -6 }],
  });
  const editor = select(createEditor(text), [2]);
  const before = editor.text;
  const past = editor.past.length;
  const result = applyDragResult(editor, { kind: 'move', dx: 24, dy: 0 }, 'ortogonal');
  assert.equal(result.ok, false, 'la ruta no existe');
  assert.match(result.reason ?? '', /ruta|conflicto|obstáculo|conexiones|identidades/i);
  assert.equal(result.state.text, before);
  assert.equal(result.state.past.length, past);
  assert.equal(result.state.dirty, false);
});

test('el delta del preview es exactamente la propuesta confirmada', () => {
  const before = project();
  const selection = [K2M];
  const ctx = prepareCableMove(before.records, new Set(selection));
  for (const [dx, dy] of [
    [-6, 0],
    [12, 0],
    [24, 0],
  ] as const) {
    const plan = planCableMove(ctx, dx, dy, { validate: false });
    assert.ok(plan.ok, plan.ok ? '' : plan.reason);
    const delta = cablePlanToDelta(plan.proposal);
    const committed = projectOf(
      applyDrag(select(createEditor(FIXTURE), selection), { kind: 'move', dx, dy }, 'ortogonal'),
    );
    const byId = new Map(committed.records.map((r) => [r.id, r]));
    for (const [id, pos] of delta.positions) {
      assert.equal(byId.get(id)!.geometry[8], pos.x);
      assert.equal(byId.get(id)!.geometry[9], pos.y);
    }
    for (const [id, pts] of delta.wires) assert.deepEqual(wirePoints(byId.get(id)!), pts);
    for (const codo of delta.codos) {
      const added = committed.records.filter((r) => r.id > Math.max(...before.records.map((b) => b.id)));
      assert.ok(added.some((r) => JSON.stringify(wirePoints(r)) === JSON.stringify(codo.moving)));
    }
    for (const hidden of delta.hidden) assert.equal(byId.has(hidden), false, `el registro ${hidden} se quitó`);
  }
});

test('cambiar de modo no toca el documento abierto', () => {
  const state = select(createEditor(FIXTURE), [K2M]);
  const text = state.text;
  const past = state.past.length;
  setSettings({ cableHandling: 'ortogonal' });
  try {
    assert.equal(state.text, text);
    assert.equal(state.past.length, past);
    assert.deepEqual(state.selection, [K2M]);
  } finally {
    setSettings({ cableHandling: 'actual' });
  }
});

test('el preview del router coincide con la confirmación (tramos agregados y quitados)', () => {
  const text = syntheticText({
    components: [
      { template: K2M, id: 2, x: 0, y: 0 },
      { template: 0, id: 3, x: 6, y: -8 },
      { template: 0, id: 4, x: -2, y: -4 },
    ],
    wires: [
      { template: 124, id: 20, points: { x1: 0, y1: 0, x2: 0, y2: -6 } },
      { template: 124, id: 21, points: { x1: -30, y1: -6, x2: 0, y2: -6 } },
    ],
    junctions: [{ id: 30, x: 0, y: -6 }],
  });
  const editor = select(createEditor(text), [2]);
  const before = projectOf(editor);
  const ctx = prepareCableMove(before.records, new Set([2]));
  const plan = planCableMove(ctx, 24, 0, { validate: false });
  assert.ok(plan.ok, plan.ok ? '' : plan.reason);
  const delta = cablePlanToDelta(plan.proposal);
  const result = applyDragResult(editor, { kind: 'move', dx: 24, dy: 0 }, 'ortogonal');
  assert.ok(result.ok, result.ok ? '' : (result.reason ?? ''));
  const after = projectOf(result.state);
  const byId = new Map(after.records.map((r) => [r.id, r]));
  const maxBefore = Math.max(...before.records.map((r) => r.id));

  for (const [id, pts] of delta.wires) assert.deepEqual(wirePoints(byId.get(id)!), pts);
  for (const hidden of delta.hidden) assert.equal(byId.has(hidden), false);
  const added = after.records.filter((r) => r.id > maxBefore);
  assert.deepEqual(
    added.map((r) => wirePoints(r)),
    delta.codos.map((c) => c.moving),
    'los tramos nuevos coinciden con el preview',
  );
});



test('el contacto auxiliar 7001 de K2M mueve sus cables y conserva la derivación interior', () => {
  const before = project();
  const plan = planFor(before.records, [90], -6, 0);
  assert.ok(plan.ok, plan.ok ? '' : plan.reason);
  const after = projectOf(applyDrag(select(createEditor(FIXTURE), [90]), { kind: 'move', dx: -6, dy: 0 }, 'ortogonal'));

  assert.equal(after.records.find((r) => r.id === 90)!.geometry[8], 60);
  assert.deepEqual(pinsOf(after.records, 90), [
    { x: 60, y: 123 },
    { x: 60, y: 135 },
  ]);

  // La unión interior de (66,141) no se movió y el lado lejano del tramo sigue ahí.
  assert.ok(after.records.find((r) => r.code === 4001 && r.geometry[8] === 66 && r.geometry[9] === 141));
  assert.deepEqual(wireOf(after.records, 82), { x1: 66, y1: 141, x2: 66, y2: 144 });

  // Hay un tramo nuevo desde el borne desplazado hasta la unión.
  const stub = after.records.find((r) => {
    const pts = wirePoints(r);
    return pts !== null && (
      (Math.abs(pts.x1 - 60) < 0.01 && Math.abs(pts.y1 - 135) < 0.01) ||
      (Math.abs(pts.x2 - 60) < 0.01 && Math.abs(pts.y2 - 135) < 0.01)
    );
  });
  assert.ok(stub, 'el borne nuevo se conecta con un tramo');

  assert.deepEqual(connectionGroups(after.records), connectionGroups(before.records));
  assert.deepEqual(differentNetOverlaps(after.records), []);
});

test('una selección mixta traslada el cable elegido explícitamente', () => {
  const text = syntheticText({
    components: [{ template: K2M, id: 2, x: 0, y: 0 }],
    wires: [
      { template: 124, id: 20, points: { x1: 0, y1: 12, x2: 0, y2: 18 } },
      { template: 124, id: 21, points: { x1: -30, y1: 18, x2: 0, y2: 18 } },
      // Cable suelto, sin bornes: se selecciona y se traslada entero.
      { template: 124, id: 25, points: { x1: 90, y1: 60, x2: 120, y2: 60 } },
    ],
    junctions: [],
  });
  const before = projectOf(createEditor(text)).records;
  const plan = planFor(before, [2, 25], 12, 0);
  assert.ok(plan.ok, plan.ok ? '' : plan.reason);
  assert.deepEqual(plan.proposal.wires.get(25), { x1: 102, y1: 60, x2: 132, y2: 60 });
  const after = projectOf(applyDrag(select(createEditor(text), [2, 25]), { kind: 'move', dx: 12, dy: 0 }, 'ortogonal'));
  assert.equal(after.records.find((r) => r.id === 2)!.geometry[8], 12);
  assert.deepEqual(wireOf(after.records, 25), { x1: 102, y1: 60, x2: 132, y2: 60 });
  assert.deepEqual(connectionGroups(after.records), connectionGroups(before));
});

// --- Escena sintética -------------------------------------------------------

interface SyntheticPart {
  components: { template: number; id: number; x: number; y: number }[];
  wires: { template: number; id: number; points: { x1: number; y1: number; x2: number; y2: number } }[];
  junctions: { id: number; x: number; y: number }[];
}

function syntheticText(parts: SyntheticPart): string {
  const base = projectOf(createEditor(FIXTURE));
  const template = (id: number): CadeRecordModel => {
    const rec = base.records.find((r) => r.id === id);
    assert.ok(rec, `template ${id}`);
    return rec;
  };
  const raws: string[] = [];
  // Cabecera de hoja del fixture: mantiene el formato y la hoja.
  for (const id of [0, 1]) raws.push(template(id).raw);
  for (const c of parts.components) {
    const rec = template(c.template);
    raws.push(withPosition({ ...rec, raw: withId(rec, c.id) }, c.x, c.y));
  }
  for (const w of parts.wires) {
    const rec = template(w.template);
    raws.push(withWirePoints({ ...rec, raw: withId(rec, w.id) }, w.points));
  }
  for (const j of parts.junctions) {
    const rec = template(15); // 4001
    const g = [...rec.geometry];
    g[8] = j.x;
    g[9] = j.y;
    g[10] = j.x;
    g[11] = j.y;
    raws.push(withGeometry({ ...rec, raw: withId(rec, j.id) }, g));
  }
  return `${base.hasMagic ? 'CADe_SIMU' : ''}${base.prefix}${raws.join('')}`;
}

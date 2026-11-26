/**
 * Selección por área: "seleccionado" tiene que significar "se mueve".
 *
 * - Componentes: entran si su caja cruza el rectángulo (criterio de siempre).
 * - Cables: entran sólo si están completos dentro del rectángulo. Uno que sale
 *   del área no se selecciona y se estira desde el extremo que se mueve, así no
 *   se desconecta del componente de afuera.
 *
 * El cable seleccionado se traslada entero: el preview y el commit usan la
 * misma regla (`moveDelta`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createEditor, moveDelta, projectOf } from '../src/editor/state.ts';
import { idsInRect, type SelectionRect } from '../src/editor/selection-rect.ts';
import { attachPoints } from '../src/editor/pins.ts';
import { boundsOf, wirePoints } from '../src/model/project.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const ARRANQUE = readFileSync(join(FIXTURES, 'arranque-paro-motor-3f.cad'), 'latin1');

const inside = (rect: SelectionRect, x: number, y: number): boolean =>
  x > rect.x1 && x < rect.x2 && y > rect.y1 && y < rect.y2;

test('el área selecciona el componente y sólo los cables completos', () => {
  const project = projectOf(createEditor(ARRANQUE));
  const comp = project.records.find((r) => r.id === 5)!;
  const box = boundsOf(comp)!;
  const rect: SelectionRect = { x1: box.x - 2, y1: box.y - 2, x2: box.x + box.w + 2, y2: box.y + box.h + 2 };

  const ids = idsInRect(project.records, rect);
  assert.ok(ids.includes(5), 'el componente entra en la selección');

  const selectedWires = project.records.filter((r) => r.kind === 'connection' && ids.includes(r.id));
  for (const wire of selectedWires) {
    const p = wirePoints(wire)!;
    assert.ok(
      inside(rect, p.x1, p.y1) && inside(rect, p.x2, p.y2),
      `el cable ${wire.id} sólo entra si está completo dentro del área`,
    );
  }
});

test('un cable completo entra y uno cortado por el borde no', () => {
  const project = projectOf(createEditor(ARRANQUE));
  const wire = project.records.find((r) => {
    if (r.kind !== 'connection') return false;
    const p = wirePoints(r);
    return p !== null && p.x1 !== p.x2;
  })!;
  const p = wirePoints(wire)!;

  const whole: SelectionRect = {
    x1: Math.min(p.x1, p.x2) - 1,
    y1: Math.min(p.y1, p.y2) - 1,
    x2: Math.max(p.x1, p.x2) + 1,
    y2: Math.max(p.y1, p.y2) + 1,
  };
  assert.ok(idsInRect(project.records, whole).includes(wire.id), 'el cable completo entra');

  const cut: SelectionRect = {
    x1: Math.min(p.x1, p.x2) - 1,
    y1: Math.min(p.y1, p.y2) - 1,
    x2: (p.x1 + p.x2) / 2,
    y2: Math.max(p.y1, p.y2) + 1,
  };
  assert.ok(!idsInRect(project.records, cut).includes(wire.id), 'el cable cortado no entra');
});

test('un cable seleccionado se traslada entero, sin codos', () => {
  const project = projectOf(createEditor(ARRANQUE));
  const wire = project.records.find((r) => {
    if (r.kind !== 'connection') return false;
    const p = wirePoints(r);
    return p !== null && p.x1 !== p.x2;
  })!;
  const p = wirePoints(wire)!;
  const delta = moveDelta(project.records, attachPoints(project.records), new Set([wire.id]), 5, 3);

  assert.deepEqual(delta.wires.get(wire.id), {
    x1: p.x1 + 5,
    y1: p.y1 + 3,
    x2: p.x2 + 5,
    y2: p.y2 + 3,
  });
  assert.equal(delta.codos.length, 0, 'un cable que se traslada no necesita codo');
  assert.equal(delta.positions.size, 0, 'sin componentes seleccionados no hay posiciones');
});

test('un área lejos del dibujo no selecciona nada', () => {
  const project = projectOf(createEditor(ARRANQUE));
  const ids = idsInRect(project.records, { x1: 1e6, y1: 1e6, x2: 1e6 + 1, y2: 1e6 + 1 });
  assert.deepEqual(ids, []);
});

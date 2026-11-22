/**
 * Orientación de componentes leída del archivo (`geometry[17]`).
 *
 * Cubre S1 (al abrir, cada componente se dibuja con la transformación de su
 * registro), S2 (bitfield giro + espejo, compuesto giro y después espejo),
 * S4/S3 (el slot se lee, nunca se escribe: el archivo sale byte a byte igual) y
 * T4 (la caja de selección y encuadre es la del dibujo transformado, sin tocar
 * el valor guardado).
 *
 * S7 queda cubierto por el barrido de fixtures: todo el corpus tiene `geo[17]`
 * en cero, así que su caja tiene que ser exactamente la declarada, como antes.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from '../src/format/cade.ts';
import { buildProject, boundsOf, boxOf, serializeProject, GEOMETRY, type CadeRecordModel } from '../src/model/project.ts';
import { copySelection, createEditor, moveSelection, paste, projectOf, select } from '../src/editor/state.ts';
import { attachPoints } from '../src/editor/pins.ts';
import {
  applyMatrix,
  isIdentity,
  multiply,
  rotationMatrix,
  slotFromTransform,
  transformFromSlot,
  transformMatrix,
  type Transform,
} from '../src/model/transform.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROTACION = join(HERE, '..', 'samples', 'rotacion', 'automaticoin.cad');
const FIXTURES = join(HERE, 'fixtures');

const text = readFileSync(ROTACION, 'latin1');
const components = (): CadeRecordModel[] =>
  buildProject(parse(text)).records.filter((r) => r.kind === 'component');

/** Las ocho combinaciones posibles del bitfield (S2). */
const SLOTS: Array<{ slot: number; transform: Transform }> = [
  { slot: 0, transform: { rotation: 0, mirror: false } },
  { slot: 1, transform: { rotation: 90, mirror: false } },
  { slot: 2, transform: { rotation: 180, mirror: false } },
  { slot: 3, transform: { rotation: 270, mirror: false } },
  { slot: 4, transform: { rotation: 0, mirror: true } },
  { slot: 5, transform: { rotation: 90, mirror: true } },
  { slot: 6, transform: { rotation: 180, mirror: true } },
  { slot: 7, transform: { rotation: 270, mirror: true } },
];

test('S2: el slot se interpreta como bitfield giro (2 bits) + espejo', () => {
  for (const { slot, transform } of SLOTS) {
    assert.deepEqual(transformFromSlot(slot), transform, `slot ${slot}`);
  }
});

test('S2: la conversión inversa devuelve el slot de cada combinación', () => {
  for (const { slot, transform } of SLOTS) {
    assert.equal(slotFromTransform(transform), slot, `slot ${slot}`);
    // Ida y vuelta en los dos sentidos, sin pérdida.
    assert.equal(slotFromTransform(transformFromSlot(slot)), slot);
    assert.deepEqual(transformFromSlot(slotFromTransform(transform)), transform);
  }
});

test('S2: la composición es primero el giro y después el espejo', () => {
  const origin = { x: 0, y: 0 };
  const at = (slot: number, x: number, y: number): { x: number; y: number } =>
    applyMatrix(transformMatrix(transformFromSlot(slot), origin), { x, y });

  // Sin transformación, el punto no se mueve.
  assert.deepEqual(at(0, 1, 0), { x: 1, y: 0 });
  // Giro horario, tal como lo dibuja el lienzo (eje y hacia abajo).
  assert.deepEqual(at(1, 1, 0), { x: 0, y: 1 });
  assert.deepEqual(at(2, 1, 0), { x: -1, y: 0 });
  assert.deepEqual(at(3, 1, 0), { x: 0, y: -1 });
  // Espejo solo: sobre el eje vertical (izquierda ↔ derecha).
  assert.deepEqual(at(4, 1, 0), { x: -1, y: 0 });
  // 5 = giro 90 y después espejo ⇒ reflexión sobre la diagonal principal.
  assert.deepEqual(at(5, 1, 0), { x: 0, y: 1 });
  assert.deepEqual(at(5, 0, 1), { x: 1, y: 0 });
  // 6 = giro 180 y después espejo (evidencia L4: «rotada 180 y espejada»).
  assert.deepEqual(at(6, 1, 0), { x: 1, y: 0 });
  assert.deepEqual(at(6, 0, 1), { x: 0, y: -1 });
  // 7 = giro 270 y después espejo ⇒ reflexión sobre la antihiagonal.
  assert.deepEqual(at(7, 1, 0), { x: 0, y: -1 });
  assert.deepEqual(at(7, 0, 1), { x: -1, y: 0 });
});

test('S1: buildProject lee la orientación guardada en cada registro', () => {
  const recs = components();
  assert.deepEqual(
    recs.map((r) => r.code),
    [6002, 6001, 6001, 6001, 6002],
  );
  assert.deepEqual(
    recs.map((r) => r.transform),
    SLOTS.slice(0, 5).map((s) => s.transform),
  );
  // Y el slot crudo sigue estando donde el formato lo pone.
  assert.deepEqual(
    recs.map((r) => r.geometry[GEOMETRY.transform]),
    [0, 1, 2, 3, 4],
  );
});

test('S3/S4: abrir y guardar la muestra devuelve los mismos bytes', () => {
  const project = buildProject(parse(text));
  const again = serializeProject(project);
  assert.equal(again, text, 'el round-trip cambió bytes');
  // El slot leído es el del archivo: la app no lo reescribe al modelar.
  assert.deepEqual(
    buildProject(parse(again))
      .records.filter((r) => r.kind === 'component')
      .map((r) => r.geometry[GEOMETRY.transform]),
    [0, 1, 2, 3, 4],
  );
});

/**
 * T4 (corregido): la caja dibujada se mide sobre el TAMAÑO CANÓNICO del símbolo
 * y no sobre las métricas por variante que guarda CADe (`geometry[14..15]`).
 *
 * La captura `automaticoin.png` muestra las cinco piezas del mismo tamaño, cada
 * una con distinta orientación: CADe no dibuja escalado a 3×12 / 15×3 / 15×15.
 * Con el tamaño canónico, t = 1 y t = 3 dan 15×12 (el transpuesto de 12×15) y
 * t = 0, 2 y 4 vuelven a 12×15.
 *
 * (Antes esta prueba fijaba 12×3 para t = 1: eso era leer el error, el dibujo
 * aplastado a 3 de ancho.)
 */
test('T4: la caja dibujada usa el tamaño canónico del símbolo, no la métrica del archivo', () => {
  const recs = components();
  const [first, turned, halfTurn, threeQuarter, mirrored] = recs as [
    CadeRecordModel,
    CadeRecordModel,
    CadeRecordModel,
    CadeRecordModel,
    CadeRecordModel,
  ];

  // Las métricas del archivo siguen ahí, sin tocar: son de CADe, no del dibujo.
  assert.deepEqual(boxOf(first), { width: 12, height: 15 });
  assert.deepEqual(boxOf(turned), { width: 3, height: 12 });
  assert.deepEqual(boxOf(halfTurn), { width: 15, height: 3 });

  // t = 0: sin orientación manda la caja del registro, como siempre (S7).
  assert.deepEqual(boundsOf(first), { x: 99, y: 69, w: 12, h: 15 });
  // t = 1: el símbolo mide 12×15 y girado 90° ocupa 15×12, aunque el archivo
  // declare 3×12.
  assert.deepEqual(boundsOf(turned), { x: 136.5, y: 76.5, w: 15, h: 12 });
  // t = 2 (180°): vuelve a 12×15, aunque el archivo declare 15×3.
  assert.deepEqual(boundsOf(halfTurn), { x: 168, y: 78, w: 12, h: 15 });
  // t = 3 (270°): 15×12 otra vez.
  assert.deepEqual(boundsOf(threeQuarter), { x: 202.5, y: 76.5, w: 15, h: 12 });
  // t = 4 (espejo): el espejo no cambia el tamaño.
  assert.deepEqual(boundsOf(mirrored), { x: 240, y: 66, w: 12, h: 15 });

  // Las cinco piezas de la captura se dibujan con el mismo tamaño; dos de ellas
  // con el ancho y el alto intercambiados.
  const sizes = new Set(recs.map((r) => {
    const b = boundsOf(r)!;
    return `${b.w}×${b.h}`;
  }));
  assert.deepEqual([...sizes].sort(), ['12×15', '15×12']);

  // Y el valor guardado del registro sigue intacto.
  assert.equal(turned.geometry[GEOMETRY.x], 138);
  assert.equal(turned.geometry[GEOMETRY.y], 75);
  assert.equal(turned.geometry[GEOMETRY.width], 3);
  assert.equal(turned.geometry[GEOMETRY.height], 12);
  assert.equal(turned.geometry[GEOMETRY.transform], 1);
});

test('T4: un código sin tamaño canónico declarado mantiene la caja del registro', () => {
  // Sin `SymbolDef.size` no hay tamaño con el que dibujar el símbolo girado, así
  // que la base sigue siendo la caja del registro (comportamiento de siempre).
  const rec: CadeRecordModel = {
    id: 9,
    code: 99999,
    kind: 'component',
    designator: '',
    pins: [],
    pinVisible: [],
    pinLabelsVisible: true,
    lampColor: null,
    transform: transformFromSlot(1),
    geometry: [0, 0, 0, 0, 0, 0, 0, 0, 20, 30, 0, 0, 0, 0, 4, 10, 0, 1, 0, 0, 0, 0, 0],
    text: '',
    raw: '',
    sheet: 0,
  };
  // Caja 4×10 en (20,30) girada 90° alrededor de su centro (22, 35): 10×4.
  assert.deepEqual(boundsOf(rec), { x: 17, y: 33, w: 10, h: 4 });
});

/**
 * S6 + T3: el símbolo se dibuja con la orientación del archivo y la capa visual
 * del editor encima. Es exactamente la composición que arma `SymbolGlyph`, y se
 * verifica acá porque el glifo es JSX y no se puede renderizar en `node --test`:
 * si esta cuenta cambia, el lienzo dibuja otra cosa que la que dice el archivo.
 */
test('S6/T3: la capa visual del editor se compone encima de la del archivo', () => {
  const pivot = { x: 6, y: 7.5 };
  const composed = (slot: number, visual: 0 | 90 | 180 | 270): ReturnType<typeof rotationMatrix> =>
    multiply(rotationMatrix(visual, pivot), transformMatrix(transformFromSlot(slot), pivot));
  const top = { x: 6, y: 0 };

  // Archivo 90° + la tecla R una vez = 180°: el punto de arriba cae abajo.
  assert.deepEqual(applyMatrix(composed(1, 90), top), { x: 6, y: 15 });
  // Archivo 90° + la tecla R tres veces vuelve al punto de partida.
  assert.deepEqual(applyMatrix(composed(1, 270), top), top);
  // Archivo espejado (slot 4): el punto del eje vertical no se mueve, uno
  // lateral sí. La capa visual encima no rompe el espejo.
  assert.deepEqual(applyMatrix(composed(4, 0), top), top);
  assert.deepEqual(applyMatrix(composed(4, 0), { x: 0, y: 7.5 }), { x: 12, y: 7.5 });
  assert.deepEqual(applyMatrix(composed(4, 180), { x: 0, y: 7.5 }), { x: 0, y: 7.5 });
});

test('S7: sin orientación, la caja de todo el corpus sigue siendo la declarada', () => {
  for (const name of readdirSync(FIXTURES).filter((f) => /\.(cad|cade)$/i.test(f))) {
    const project = buildProject(parse(readFileSync(join(FIXTURES, name), 'latin1')));
    for (const rec of project.records) {
      if (rec.kind !== 'component') continue;
      assert.ok(isIdentity(rec.transform), `${name} #${rec.id} tiene orientación`);
      const box = boxOf(rec);
      assert.deepEqual(
        boundsOf(rec),
        box ? { x: rec.geometry[GEOMETRY.x], y: rec.geometry[GEOMETRY.y], w: box.width, h: box.height } : null,
        `${name} #${rec.id}`,
      );
    }
  }
});

/**
 * T4 + S3: editar un componente transformado no puede tocar su orientación ni
 * su caja. El movimiento se aplica sobre el ancla guardada (`geometry[8..9]`),
 * no sobre el origen de la caja dibujada, que con giro ya no coincide.
 */
test('T4/S3: mover un componente con giro no deriva ni toca su registro', () => {
  const turned = components()[1]!;
  let state = select(createEditor(text), [turned.id], false);
  state = moveSelection(state, 12, 0);

  const moved = projectOf(state).records.find((r) => r.id === turned.id)!;
  assert.equal(moved.geometry[GEOMETRY.x], 150, 'el ancla tiene que moverse exactamente 12');
  assert.equal(moved.geometry[GEOMETRY.y], 75);
  assert.deepEqual(moved.geometry.slice(GEOMETRY.offsetX, GEOMETRY.height + 1), [-15, -15, 3, 12]);
  assert.equal(moved.geometry[GEOMETRY.transform], 1, 'la orientación del archivo no se reescribe');

  // Volver con el mismo delta deja el registro byte a byte como estaba: sin
  // deriva acumulada.
  state = moveSelection(state, -12, 0);
  const back = projectOf(state).records.find((r) => r.id === turned.id)!;
  assert.equal(back.raw, turned.raw);
});

test('T4/S3: pegar un componente con giro conserva su orientación', () => {
  const turned = components()[3]!;
  let state = select(createEditor(text), [turned.id], false);
  state = paste(copySelection(state));

  const added = projectOf(state).records.at(-1)!;
  assert.notEqual(added.id, turned.id);
  assert.equal(added.geometry[GEOMETRY.x], turned.geometry[GEOMETRY.x]! + 8);
  assert.equal(added.geometry[GEOMETRY.y], turned.geometry[GEOMETRY.y]! + 8);
  assert.equal(added.geometry[GEOMETRY.transform], 3);
  assert.deepEqual(added.transform, turned.transform);
});

test('T4: el enganche de cables no se afloja con orientación', () => {
  // Componente con caja declarada (10,10)-(22,25) y giro 90°: el dibujo pasa a
  // ocupar (8.5,11.5)-(23.5,23.5). El borne de la esquina (10,10) queda fuera de
  // la caja dibujada pero dentro de la declarada, que es donde CADe_SIMU
  // engancha el cable: tiene que seguir apareciendo.
  const component: CadeRecordModel = {
    id: 1,
    code: 6001,
    kind: 'component',
    designator: '',
    pins: ['1'],
    pinVisible: [true],
    pinLabelsVisible: true,
    lampColor: null,
    transform: transformFromSlot(1),
    geometry: [0, 0, 0, 0, 0, 0, 0, 0, 10, 10, 0, 0, 0, 0, 12, 15, 0, 1, 0, 0, 0, 0, 0],
    text: '',
    raw: '',
    sheet: 0,
  };
  const wire: CadeRecordModel = {
    ...component,
    id: 2,
    code: 4000,
    kind: 'connection',
    pins: [],
    geometry: [0, 0, 0, 0, 0, 0, 0, 0, 10, 10, 40, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };

  assert.deepEqual(attachPoints([component, wire]).get(component.id), [{ x: 10, y: 10 }]);

  // Y sin orientación el enganche es exactamente el de antes.
  const plain = { ...component, transform: transformFromSlot(0) };
  assert.deepEqual(attachPoints([plain, wire]).get(plain.id), [{ x: 10, y: 10 }]);
});

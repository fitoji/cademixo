import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CadeRecordModel } from '../src/model/project.ts';
import { changeoverPositions, groupIdsWith, linkedProtection } from '../src/sim/apparatus.ts';

/**
 * Semántica del designador medida contra CADe_SIMU V4
 * (`docs/pruebas-cadesimu-windows.md`, series F y G):
 *
 *  - todos los componentes con el mismo designador son UN aparato: se accionan
 *    juntos, no hay "el primero de la lista";
 *  - la comparación es literal: `-F`, `F`, `-f` y ` F` son aparatos distintos.
 */

function rec(id: number, code: number, designator: string): CadeRecordModel {
  return {
    id,
    code,
    kind: 'component',
    designator,
    pins: [],
    pinVisible: [],
    pinLabelsVisible: true,
    lampColor: null,
    transform: { rotation: 0, mirror: false },
    geometry: [],
    text: '',
    raw: '',
    sheet: 0,
  };
}

test('el enlace exige el designador literal, sin normalizar', () => {
  const proteccion = rec(1, 6001, '-F');
  const auxiliar = rec(2, 8018, '-F');
  assert.equal(linkedProtection([proteccion, auxiliar], auxiliar)?.id, 1);

  for (const texto of ['F', '-f', ' F', '-F ', 'f1']) {
    const otro = rec(3, 8018, texto);
    assert.equal(
      linkedProtection([proteccion, otro], otro),
      undefined,
      `'-F' no debe enlazarse con '${texto}'`,
    );
  }
});

test('un grupo con dos protecciones comparte un único estado por designador', () => {
  const primera = rec(1, 6001, '-F');
  const segunda = rec(2, 6009, '-F');
  const auxiliar = rec(3, 8018, '-F');
  const records = [primera, segunda, auxiliar];

  // Con el aparato abierto el conmutador queda en reposo, con el grupo cerrado
  // pasa a la posición de maniobra. El estado se escribe una sola vez, por
  // designador, y gobierna a las tres piezas.
  assert.equal(changeoverPositions(records, { '-F': 'open' }, {})['3'], 0);
  assert.equal(changeoverPositions(records, { '-F': 'closed' }, {})['3'], 1);
});

test('groupIdsWith devuelve todas las piezas del aparato y respeta el literal', () => {
  const records = [
    rec(1, 6001, '-F'),
    rec(2, 6009, '-F'),
    rec(3, 8018, '-F'),
    rec(4, 6003, 'F'),
  ];
  assert.deepEqual(groupIdsWith(records, records[1]!), [1, 2, 3]);
  assert.deepEqual(groupIdsWith(records, records[3]!), [4]);
});

test('las piezas sin designador no comparten estado', () => {
  const uno = rec(1, 6001, '');
  const dos = rec(2, 6003, '');
  assert.deepEqual(groupIdsWith([uno, dos], uno), [1]);
});

test('un conmutador sin protección de su designador sigue siendo libre', () => {
  const suelto = rec(1, 8018, 'QX');
  const proteccionOtra = rec(2, 6001, 'Q1');
  const records = [suelto, proteccionOtra];
  assert.equal(linkedProtection(records, suelto), undefined);
  assert.equal(changeoverPositions(records, { QX: 'closed' }, {})['1'], undefined);
});

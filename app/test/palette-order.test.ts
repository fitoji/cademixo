import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUP_ORDER, groupSymbols } from '../src/ui/palette-order.ts';
import { symbolList, lineList } from '../src/symbols/library.ts';

test('el orden de la paleta sigue el menú Barras de CADe_SIMU V4', () => {
  assert.deepEqual(GROUP_ORDER, [
    'alimentacion', // Barra de alimentaciones
    'fusible',      // Barra de fusibles (y seccionadores)
    'proteccion',   // Barra de automáticos
    'contactor',    // Barra de contactores
    'motor',        // Barras de motores y accionamientos
    'potencia',     // Barra de potencia
    'mando',        // Barras de contactos, pulsadores, bobinas y relés
    'sensor',       // Barra de detectores
    'senalizacion', // Barra de señalizaciones
    'otro',         // Barras de lógica, ladder, grafcet y E/S
    'neumatico',    // Barra de actuadores neumáticos
    'linea',        // Barra de conexiones
    'carga',
    'borne',
  ]);
});

test('todos los grupos dibujables aparecen en el orden y sin duplicados', () => {
  assert.equal(new Set(GROUP_ORDER).size, GROUP_ORDER.length, 'sin duplicados');
  const present = new Set([...symbolList(), ...lineList()].map((s) => s.group));
  for (const group of present) {
    assert.ok(GROUP_ORDER.includes(group), `falta el grupo ${group} en el orden`);
  }
});

test('cada grupo va ordenado por código y no pierde símbolos', () => {
  const all = [...symbolList(), ...lineList()];
  const byGroup = groupSymbols(all);
  for (const [group, syms] of byGroup) {
    const codes = syms.map((s) => s.code);
    assert.deepEqual(codes, [...codes].sort((a, b) => a - b), `el grupo ${group} no está ordenado`);
  }
  assert.equal(byGroup.size, new Set(all.map((s) => s.group)).size, 'grupos duplicados');
  const total = [...byGroup.values()].reduce((n, list) => n + list.length, 0);
  assert.equal(total, all.length, 'se perdió algún símbolo al agrupar');
});

test('automáticos y fusibles siguen la numeración de CADe_SIMU', () => {
  const byGroup = groupSymbols([...symbolList(), ...lineList()]);
  assert.deepEqual(
    byGroup.get('proteccion')!.map((s) => s.code),
    [6000, 6001, 6002, 6003, 6004, 6005, 6006, 6007, 6008, 6009, 6010, 6015, 6016, 6017, 6018, 6019, 6020],
  );
  assert.deepEqual(
    byGroup.get('fusible')!.map((s) => s.code),
    [5000, 5001, 5002, 5003, 5005, 5006, 5007, 5008],
  );
});

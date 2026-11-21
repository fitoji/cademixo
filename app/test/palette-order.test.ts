import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUP_ORDER } from '../src/ui/palette-order.ts';
import { symbolList, lineList } from '../src/symbols/library.ts';

test('el orden de la paleta sigue el menú Barras de CADe_SIMU V4', () => {
  assert.deepEqual(GROUP_ORDER, [
    'alimentacion', // Barra de alimentaciones
    'fusible',      // Barra de fusibles (y seccionadores)
    'proteccion',   // Barra de automáticos
    'potencia',     // Barras de contactores y potencia
    'motor',        // Barras de motores y accionamientos
    'mando',        // Barras de contactos, bobinas y relés electrónicos
    'sensor',       // Barra de detectores
    'senalizacion', // Barra de señalizaciones
    'otro',         // Barras de lógica, ladder, grafcet, E/S y neumáticos
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

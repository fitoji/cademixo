/**
 * Buscador de la paleta: código o nombre, con ranking explícito.
 *
 * El catálogo real trae acentos y erratas del CAD («Fuente de alimentacióm»,
 * «Dahalander»), así que el matching normaliza y tolera una diferencia.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { normalize, searchSymbols } from '../src/symbols/search.ts';

const cat = [
  { code: 1000, name: 'Motor trifásico' },
  { code: 1001, name: 'Motor trifásico YD' },
  { code: 1400, name: 'Motor cc. iman permanente' },
  { code: 3000, name: 'Alimentación L' },
  { code: 3014, name: 'Fuente de alimentacióm' },
  { code: 6007, name: 'Dahalander' },
  { code: 1600, name: 'Variador velocidad ca II.' },
];

const codes = (syms: { code: number }[]): number[] => syms.map((s) => s.code);

// --- Normalización ---------------------------------------------------------

test('normaliza acentos, mayúsculas y espacios de más', () => {
  assert.equal(normalize('  Alimentación   L '), 'alimentacion l');
  assert.equal(normalize('MOTOR'), 'motor');
  assert.equal(normalize(''), '');
});

// --- Ranking por código ----------------------------------------------------

test('el código exacto va primero', () => {
  assert.deepEqual(codes(searchSymbols(cat, '6007')), [6007]);
  assert.deepEqual(codes(searchSymbols(cat, '1600')), [1600]);
});

test('un prefijo de código lista la familia completa en orden de catálogo', () => {
  assert.deepEqual(codes(searchSymbols(cat, '10')), [1000, 1001]);
  assert.deepEqual(codes(searchSymbols(cat, '30')), [3000, 3014]);
});

test('el código exacto gana al prefijo aunque venga después en el catálogo', () => {
  const syms = [
    { code: 1600, name: 'Variador' },
    { code: 600, name: 'Seiscientos' },
  ];
  assert.deepEqual(codes(searchSymbols(syms, '600')), [600, 1600]);
});

// --- Ranking por nombre ----------------------------------------------------

test('encuentra por nombre sin acentos', () => {
  // 3014 entra por la errata del catálogo («alimentacióm»), después de 3000.
  assert.deepEqual(codes(searchSymbols(cat, 'alimentacion')), [3000, 3014]);
  assert.deepEqual(codes(searchSymbols(cat, 'MOTOR')), [1000, 1001, 1400]);
});

test('el nombre que empieza con la consulta gana al que sólo la contiene', () => {
  const syms = [
    { code: 1, name: 'Control de motor' },
    { code: 2, name: 'Motor trifásico' },
  ];
  assert.deepEqual(codes(searchSymbols(syms, 'motor')), [2, 1]);
});

test('varias palabras se piden todas y en cualquier orden', () => {
  assert.deepEqual(codes(searchSymbols(cat, 'trifasico motor')), [1000, 1001]);
  assert.deepEqual(codes(searchSymbols(cat, 'motor trifasico')), [1000, 1001]);
});

test('tolera una errata del catálogo', () => {
  assert.ok(codes(searchSymbols(cat, 'alimentacion')).includes(3014));
  assert.ok(codes(searchSymbols(cat, 'fuente alimentacion')).includes(3014));
  assert.deepEqual(codes(searchSymbols(cat, 'dahlander')), [6007]);
});

// --- Casos vacíos ----------------------------------------------------------

test('sin consulta no devuelve nada', () => {
  assert.deepEqual(searchSymbols(cat, ''), []);
  assert.deepEqual(searchSymbols(cat, '   '), []);
});

test('sin coincidencias devuelve una lista vacía', () => {
  assert.deepEqual(searchSymbols(cat, 'zzzz'), []);
});

test('no muta la lista recibida', () => {
  const original = [...cat];
  searchSymbols(cat, 'motor');
  assert.deepEqual(cat, original);
});

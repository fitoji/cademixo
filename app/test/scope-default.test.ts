import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { getScope, setScope } from '../src/symbols/scope.ts';
import { insertableSymbols } from '../src/ui/insertion-matches.ts';

test('sin preferencia guardada el alcance incluye todos los componentes', () => {
  assert.equal(getScope(), 'all');
  assert.ok(insertableSymbols(getScope()).some((sym) => sym.code === 8018));
});

test('el filtro a CADe_SIMU sigue disponible si se pide explícitamente', () => {
  setScope('cadesimu');
  assert.equal(getScope(), 'cadesimu');
  assert.ok(!insertableSymbols(getScope()).some((sym) => sym.code === 8018));
  setScope('all');
});

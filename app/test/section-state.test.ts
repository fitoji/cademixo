/**
 * Plegado del inspector: el estado vive fuera de React para sobrevivir al
 * remontaje que provoca cada cambio de selección. Sin `localStorage` (node) no
 * hay persistencia, pero el comportamiento de la sesión tiene que ser el mismo.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  getSectionsSnapshot,
  isSectionOpen,
  setSectionOpen,
  subscribeSections,
} from '../src/ui/section-state.ts';

const KNOWN = ['vertice', 'avisos', 'bornes'] as const;

test('plegar y desplegar se refleja en el estado y en la instantánea', () => {
  for (const id of KNOWN) setSectionOpen(id, true);
  assert.equal(getSectionsSnapshot(), '');

  setSectionOpen('bornes', false);
  assert.equal(isSectionOpen('bornes'), false);
  assert.equal(isSectionOpen('avisos'), true);
  assert.equal(getSectionsSnapshot(), 'bornes');

  setSectionOpen('vertice', false);
  // La instantánea está ordenada: dos estados iguales producen el mismo string.
  assert.equal(getSectionsSnapshot(), 'bornes,vertice');

  setSectionOpen('bornes', true);
  setSectionOpen('vertice', true);
  assert.equal(getSectionsSnapshot(), '');
});

test('pedir el mismo estado otra vez no notifica', () => {
  setSectionOpen('avisos', true);
  let calls = 0;
  const unsubscribe = subscribeSections(() => {
    calls += 1;
  });

  setSectionOpen('avisos', true);
  assert.equal(calls, 0, 'un plegado redundante no debe despertar a los suscriptores');

  setSectionOpen('avisos', false);
  assert.equal(calls, 1);

  unsubscribe();
  setSectionOpen('avisos', true);
  assert.equal(calls, 1, 'después de desuscribirse no se notifica más');
});

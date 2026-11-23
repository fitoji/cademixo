import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE_TAGS, phaseConflict, type PhaseConflict, type PhaseTag } from '../src/sim/phase.ts';

/**
 * Transcripción literal de los 42 pares ordenados que `FUN_00854790`
 * (CADe_SIMU V4, Ghidra `0x854790`) despacha a los handlers de corto y de
 * derivación a tierra. Se escriben como datos, no se derivan de la regla
 * general, para que el test pueda detectar una generalización incorrecta.
 */
const SHORT_PAIRS: readonly (readonly [PhaseTag, PhaseTag])[] = [
  ['1', '2'], ['1', '3'], ['1', 'N'], ['1', '+'], ['1', '-'],
  ['2', '1'], ['2', '3'], ['2', 'N'], ['2', '+'], ['2', '-'],
  ['3', '1'], ['3', '2'], ['3', 'N'], ['3', '+'], ['3', '-'],
  ['N', '1'], ['N', '2'], ['N', '3'], ['N', '+'], ['N', '-'],
  ['+', '1'], ['+', '2'], ['+', '3'], ['+', 'N'], ['+', '-'],
  ['-', '1'], ['-', '2'], ['-', '3'], ['-', 'N'], ['-', '+'],
];

const EARTH_PAIRS: readonly (readonly [PhaseTag, PhaseTag])[] = [
  ['1', 'P'], ['2', 'P'], ['3', 'P'], ['N', 'P'], ['+', 'P'], ['-', 'P'],
  ['P', '1'], ['P', '2'], ['P', '3'], ['P', 'N'], ['P', '+'], ['P', '-'],
];

const key = (a: PhaseTag, b: PhaseTag): string => `${a}${b}`;
const expected = new Map<string, PhaseConflict>();
for (const [a, b] of SHORT_PAIRS) expected.set(key(a, b), 'short');
for (const [a, b] of EARTH_PAIRS) expected.set(key(a, b), 'earth');

test('la tabla del binario tiene los 42 pares ordenados', () => {
  assert.equal(SHORT_PAIRS.length, 30);
  assert.equal(EARTH_PAIRS.length, 12);
  assert.equal(expected.size, 42);
});

test('cada uno de los 64 pares coincide con FUN_00854790', () => {
  for (const a of PHASE_TAGS) {
    for (const b of PHASE_TAGS) {
      assert.equal(phaseConflict(a, b), expected.get(key(a, b)) ?? null, `${a} vs ${b}`);
    }
  }
});

test('fases distintas entre sí y contra neutro son cortocircuito', () => {
  assert.equal(phaseConflict('1', '2'), 'short');
  assert.equal(phaseConflict('2', '1'), 'short');
  assert.equal(phaseConflict('1', '3'), 'short');
  assert.equal(phaseConflict('3', '1'), 'short');
  assert.equal(phaseConflict('1', 'N'), 'short');
  assert.equal(phaseConflict('N', '1'), 'short');
});

test('fase contra tierra es derivación, en ambos sentidos', () => {
  assert.equal(phaseConflict('1', 'P'), 'earth');
  assert.equal(phaseConflict('P', '1'), 'earth');
  assert.equal(phaseConflict('N', 'P'), 'earth');
  assert.equal(phaseConflict('P', 'N'), 'earth');
});

test('el par de corriente continua también es corto', () => {
  assert.equal(phaseConflict('+', '-'), 'short');
  assert.equal(phaseConflict('-', '+'), 'short');
  assert.equal(phaseConflict('1', '+'), 'short');
  assert.equal(phaseConflict('+', '1'), 'short');
});

test('la misma fase en dos tramos no es fallo', () => {
  for (const tag of PHASE_TAGS) assert.equal(phaseConflict(tag, tag), null, tag);
});

test('un extremo sin asignar nunca dispara un aviso', () => {
  for (const tag of PHASE_TAGS) {
    assert.equal(phaseConflict('0', tag), null, tag);
    assert.equal(phaseConflict(tag, '0'), null, tag);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bumpKind, nextVersion, summarize } from '../scripts/bump-version.ts';

test('un fix sube el parche', () => {
  assert.equal(bumpKind(['fix: cable que no se borra']), 'patch');
});

test('una feature sube el minor', () => {
  assert.equal(bumpKind(['feat: cajetín dibujado en el lienzo']), 'minor');
});

test('si hay feature y fix gana el minor', () => {
  assert.equal(bumpKind(['fix: uno', 'feat: otro']), 'minor');
});

test('un cambio incompatible sube el major', () => {
  assert.equal(bumpKind(['feat!: nuevo formato de archivo']), 'major');
  assert.equal(bumpKind(['fix(core)!: rompe el round-trip']), 'major');
  assert.equal(bumpKind(['chore: limpia\n\nBREAKING CHANGE: se va la API vieja']), 'major');
});

test('sin feature ni fix igual sube el parche', () => {
  assert.equal(bumpKind(['docs: reordena los informes']), 'patch');
  assert.equal(bumpKind([]), 'patch');
});

test('el prefijo del scope no confunde la detección', () => {
  assert.equal(bumpKind(['feature: no es conventional', 'docs: x']), 'patch');
  assert.equal(bumpKind(['refactor(symbols): saca QET']), 'patch');
});

test('la versión se arma desde major.minor.patch', () => {
  assert.equal(nextVersion('0.9.2', 'patch'), '0.9.3');
  assert.equal(nextVersion('0.9.2', 'minor'), '0.10.0');
  assert.equal(nextVersion('0.9.2', 'major'), '1.0.0');
  assert.equal(nextVersion('1.4.9', 'minor'), '1.5.0');
});

test('una versión inválida no se toca', () => {
  assert.equal(nextVersion('0.9', 'patch'), null);
  assert.equal(nextVersion('v0.9.2', 'patch'), null);
});

test('el resumen cuenta por tipo', () => {
  assert.deepEqual(summarize(['feat: a', 'fix: b', 'fix(c): c', 'docs: d']), {
    total: 4,
    feat: 1,
    fix: 2,
    breaking: 0,
  });
});

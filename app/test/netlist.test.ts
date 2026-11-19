import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/format/cade.ts';
import { buildProject } from '../src/model/project.ts';
import { buildNetlist, isTwoThrow, partKey, kindOf, isProtectionCode, polesOf } from '../src/sim/netlist.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function load(name: string) {
  return buildProject(parse(readFileSync(join(FIXTURES, name), 'latin1')));
}

const files = readdirSync(FIXTURES).filter((f) => /\.(cade|cad)$/i.test(f));

test('cada archivo produce una netlist con aparatos y redes', () => {
  for (const name of files) {
    const nl = buildNetlist(load(name).records);
    assert.ok(nl.devices.length > 0, `${name}: sin aparatos`);
    assert.ok(nl.sizes.size > 0, `${name}: sin redes`);
    for (const device of nl.devices) {
      for (const net of device.nets) assert.ok(net >= 0, `${name}: net inválida en ${device.designator}`);
    }
  }
});

test('todo aparato con dos bornes conectados declara al menos un polo', () => {
  for (const name of files) {
    const nl = buildNetlist(load(name).records);
    for (const device of nl.devices) {
      if (device.nets.length < 2) continue;
      assert.ok(device.poles.length >= 1, `${name}: ${device.designator} (${device.code}) sin polos`);
      for (const [a, b] of device.poles) {
        assert.ok(a >= 0 && a < device.nets.length);
        assert.ok(b >= 0 && b < device.nets.length);
        assert.notEqual(a, b);
      }
    }
  }
});

test('el designador agrupa las partes del mismo aparato', () => {
  // Inversión de giro: KM1 es el contactor principal (2001) y su auxiliar (7001)
  const nl = buildNetlist(load('inversion-giro-cej.cade').records);
  const km1 = nl.devices.filter((d) => d.part === 'KM1');
  assert.ok(km1.length >= 2, 'KM1 debe tener varias partes');
  assert.ok(km1.some((d) => d.code === 2001), 'falta el contacto de potencia');
  assert.ok(km1.some((d) => d.code === 7001), 'falta el contacto auxiliar');

  // KM2 tiene la bobina: sin eso no hay enclavamiento posible
  const km2 = nl.devices.filter((d) => d.part === 'KM2');
  assert.ok(km2.some((d) => d.kind === 'coil'), 'KM2 debe tener bobina');
});

test('los bornes de un aparato caen en redes distintas cuando el dibujo las separa', () => {
  const nl = buildNetlist(load('arranque-paro-motor-3f.cad').records);
  const motor = nl.devices.find((d) => d.code === 1000)!;
  assert.equal(motor.pinNames.length, 4);
  assert.equal(new Set(motor.nets).size >= 3, true, `el motor debe tener al menos 3 redes: ${JSON.stringify(motor.nets)}`);
});

test('en el arranque, el contacto auxiliar queda en paralelo con STAR y la bobina en serie', () => {
  // Antes el código 7000 (contacto auxiliar) estaba clasificado como bobina, así
  // que el "contactor" era en realidad su contacto y la bobina real (9000) se
  // leía como motor. Con el mapeo corregido el dibujo dice lo que debe: el
  // auxiliar de -KM1 puentea a STAR (enclavamiento) y la bobina cuelga de la
  // red que sale de ellos.
  const nl = buildNetlist(load('arranque-paro-motor-3f.cad').records);
  const star = nl.devices.find((d) => d.part === 'STAR' && d.kind === 'pushbutton')!;
  const aux = nl.devices.find((d) => d.part === 'KM1' && d.code === 7000)!;
  const coil = nl.devices.find((d) => d.kind === 'coil')!;

  assert.deepEqual([...aux.nets], [...star.nets], 'el auxiliar puentea al pulsador');
  assert.notDeepEqual([...coil.nets], [...star.nets], 'la bobina no está en paralelo con STAR');
  const shared = coil.nets.filter((n) => star.nets.includes(n));
  assert.equal(shared.length, 1, 'la bobina sale de una de las dos redes del pulsador');
});

test('polesOf: los aparatos de 2, 4 y 6 bornes se emparejan por mitad, como hasta ahora', () => {
  // S6: la derivación de polos nueva no toca estos conteos. 8018 y el motor de
  // seis puntas siguen saliendo por mitad.
  assert.deepEqual(polesOf(['A1', 'A2']), [[0, 1]]);
  assert.deepEqual(polesOf(['95', '97', '96', '98']), [[0, 2], [1, 3]]);
  assert.deepEqual(polesOf(['1', '3', '5', '2', '4', '6']), [[0, 3], [1, 4], [2, 5]]);
  assert.deepEqual(polesOf(['U']), []);
  assert.deepEqual(polesOf([]), []);
});

test('polesOf: un conmutado de tres bornes tiene dos tiros que comparten el común', () => {
  // S2/S4: el 12 (NC) es el primer tiro y el 14 (NO) el segundo, sobre los
  // índices de `attachPoints` — as\u00ed `flow.ts` indexa `network.pins`.
  assert.deepEqual(polesOf(['11', '12', '14']), [[0, 1], [0, 2]]);
});

test('polesOf: el tiro sigue al rótulo aunque el dibujo los cablee en otro orden', () => {
  assert.deepEqual(polesOf(['11', '14', '12']), [[0, 2], [0, 1]], 'el NC siempre es el primer polo');
  assert.equal(isTwoThrow(['11', '12', '14']), true);
  assert.equal(isTwoThrow(['11', '12']), false);
  assert.equal(isTwoThrow(['U', 'V', 'W']), false, 'tres bornes cualesquiera no son un conmutado');
});

test('polesOf: los polos nunca se salen de los bornes cableados', () => {
  // Una caja donde sólo dos de los tres bornes tienen punto de conexión se
  // queda con un polo, como antes. La bornera no declara rótulos: manda el
  // conteo de `attachPoints`.
  assert.deepEqual(polesOf(['11', '12', '14'], 2), [[0, 1]]);
  assert.deepEqual(polesOf([], 4), [[0, 2], [1, 3]]);
  assert.deepEqual(polesOf([], 3), [[0, 1]], 'tres puntos sin rótulos se emparejan por mitad');
});

test('el conmutado de tres bornes conserva los tres bornes como dos polos', () => {
  const nl = buildNetlist(load('conmutado-tercer-borne.cade').records);
  const s1 = nl.devices.find((d) => d.code === 8003);
  assert.ok(s1, 'falta el pulsador conmutado del fixture');
  assert.deepEqual(s1.pinNames, ['11', '12', '14']);
  assert.equal(new Set(s1.nets).size, 3, 'los tres bornes caen en redes distintas');
  assert.deepEqual(s1.poles, [[0, 1], [0, 2]], 'el 14 ya no se descarta');
});

test('normalización de designador: el guion inicial no cambia el aparato', () => {
  assert.equal(partKey('-KM1'), 'KM1');
  assert.equal(partKey('km1 '), 'KM1');
  assert.equal(partKey('KM1'), 'KM1');
  assert.notEqual(partKey('-KM1'), partKey('-KM2'));
});

test('clasificación de códigos en tipos de aparato', () => {
  assert.equal(kindOf(7000), 'contact');
  assert.equal(kindOf(9000), 'coil');
  assert.equal(kindOf(9008), 'lamp');
  assert.equal(kindOf(2001), 'contact');
  assert.equal(kindOf(7001), 'contact');
  assert.equal(kindOf(8000), 'pushbutton');
  assert.equal(kindOf(8012), 'selector');
  assert.equal(kindOf(8016), 'lamp');
  assert.equal(kindOf(6009), 'fuse');
  assert.equal(kindOf(6007), 'thermal');
  assert.equal(kindOf(1000), 'motor');
  assert.equal(kindOf(3005), 'terminal');
  assert.equal(kindOf(12345), 'unknown');
});

test('clasificación: los códigos que el ComponentSpec corrige', () => {
  // 8100 era pulsable en la UI y unknown acá: el clic se perdía.
  assert.equal(kindOf(8100), 'pushbutton');
  // 2002 era CONTACT en visual y unknown en el solver.
  assert.equal(kindOf(2002), 'contact');
  // 8101/8102/8103 tienen glifo de lámpara pero nunca fueron lamp.
  assert.equal(kindOf(8101), 'lamp');
  assert.equal(kindOf(8102), 'lamp');
  assert.equal(kindOf(8103), 'lamp');
  // 9004-9007 siguen siendo bobinas, ahora temporizadas.
  assert.equal(kindOf(9004), 'coil');
  assert.equal(kindOf(9007), 'coil');
});

test('isProtectionCode se deriva del ComponentSpec', () => {
  assert.equal(isProtectionCode(6000), true);
  assert.equal(isProtectionCode(6007), true);
  assert.equal(isProtectionCode(6999), true);
  assert.equal(isProtectionCode(8017), true);
  assert.equal(isProtectionCode(8000), false);
  assert.equal(isProtectionCode(8100), false);
  assert.equal(isProtectionCode(12345), false);
});

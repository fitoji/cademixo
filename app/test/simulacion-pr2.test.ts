import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/format/cade.ts';
import { buildProject, type CadeRecordModel } from '../src/model/project.ts';
import { buildNetwork } from '../src/editor/network.ts';
import { symbolFor } from '../src/symbols/library.ts';
import { changeoverPositions, linkedProtection } from '../src/sim/apparatus.ts';

/**
 * Integridad del plano del PR2 (`vfinal`, la versión con la que quedó el
 * usuario) y sus aparatos enlazados por designador.
 *
 * Es un archivo de apoyo para la pregunta abierta de CADe (ver
 * `docs/pruebas-contactos-auxiliares-cadesimu.md`): trae el mismo par `Q1` del
 * PR1 —conmutador `8018` de mando y disyuntor `6009` de potencia— más dos
 * contactores completos, así que sirve como segunda muestra independiente.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const PR2 = buildProject(
  parse(readFileSync(join(HERE, '..', 'test_simu', 'PR2_Rodolfo_Giusti_vfinal.cad'), 'latin1')),
);
const componentes = PR2.records.filter((r) => r.kind === 'component');
const porCodigo = (code: number): CadeRecordModel[] => componentes.filter((r) => r.code === code);

test('el plano abre entero: una hoja, sin códigos sin símbolo', () => {
  assert.equal(PR2.records.filter((r) => r.kind === 'component').length, 22);
  const sinSimbolo = componentes.filter((r) => !symbolFor(r.code)).map((r) => r.code);
  assert.deepEqual(sinSimbolo, [], 'todo componente tiene símbolo en la biblioteca');
  // Los dos únicos sin designador son los bornes de alimentación (3000/3001):
  // en CADeSimu el designador de esos símbolos no se escribe.
  const sinDesignador = componentes.filter((r) => !(r.designator ?? '').trim()).map((r) => r.code).sort();
  assert.deepEqual(sinDesignador, [3000, 3001]);
});

test('todos los bornes declarados están cableados', () => {
  const network = buildNetwork(PR2.records);
  const clave = (x: number, y: number) => `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`;
  const puntos = new Set<string>();
  for (const seg of network.segments.values()) {
    puntos.add(clave(seg.points.x1, seg.points.y1));
    puntos.add(clave(seg.points.x2, seg.points.y2));
  }
  for (const union of network.junctionPoints) puntos.add(clave(union.x, union.y));

  const flotantes: string[] = [];
  let revisados = 0;
  for (const rec of componentes) {
    for (const [i, pin] of (network.pins.get(rec.id) ?? []).entries()) {
      revisados += 1;
      if (!puntos.has(clave(pin.x, pin.y))) {
        flotantes.push(`${rec.code}/${rec.id} borne ${rec.pins?.[i] ?? i}`);
      }
    }
  }
  // Sin esto el aserto pasaría vacío si el mapa de puntos viniera vacío.
  assert.equal(network.pins.size, 22, 'los 22 componentes aportan puntos de conexión');
  assert.equal(revisados, 73, 'el plano declara 73 bornes');
  assert.deepEqual(flotantes, [], 'ningún borne queda sin cable');
});

test('el conmutador del mando es el contacto auxiliar del disyuntor de potencia', () => {
  const conmutador = porCodigo(8018);
  const disyuntor = porCodigo(6009);
  assert.equal(conmutador.length, 1);
  assert.equal(disyuntor.length, 1);
  const [auxiliar] = conmutador;
  const [aparato] = disyuntor;
  assert.equal(auxiliar!.designator, aparato!.designator, 'comparten designador: son el mismo aparato');
  assert.equal(linkedProtection(PR2.records, auxiliar!)?.id, aparato!.id);

  const posiciones = (cerrado: boolean) =>
    changeoverPositions(PR2.records, { [aparato!.designator]: cerrado ? 'closed' : 'open' }, {});
  assert.equal(posiciones(true)[String(auxiliar!.id)], 1, 'disyuntor cerrado → posición de maniobra');
  assert.equal(posiciones(false)[String(auxiliar!.id)], 0, 'disyuntor abierto → posición de reposo');
});

test('los dos contactores traen bobina y auxiliares con el mismo designador', () => {
  for (const designador of ['K1M', 'K2M']) {
    const delAparato = componentes.filter((r) => (r.designator ?? '').trim() === designador);
    const codigos = delAparato.map((r) => r.code).sort((a, b) => a - b);
    assert.ok(
      codigos.includes(9000),
      `${designador} tiene que traer su bobina (9000), trae ${codigos.join(', ')}`,
    );
    assert.ok(
      codigos.some((code) => code === 7000 || code === 7001),
      `${designador} tiene que traer contactos auxiliares 70xx, trae ${codigos.join(', ')}`,
    );
    // Un contactor no es una protección: el enlace mecánico del 8018 sólo mira
    // protecciones 6000-6999, así que estos grupos no arrastran conmutadores.
    for (const rec of delAparato) {
      if (rec.code !== 8018) continue;
      assert.equal(linkedProtection(PR2.records, rec), undefined);
    }
  }
});

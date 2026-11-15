import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSymbol } from '../src/symbols/library.ts';

/**
 * Conmutador de dos posiciones (el 8018).
 *
 * Criterio de aceptación: `app/test_simu/PR1_Rodolfo_Giusti_03_simu_play_02.png`
 * y `..._play_04.png`, las capturas de CADeSimu con el Q1 en cada posición.
 *
 * Lo que se ve en ellas: dos contactos **verticales** (95-96 y 97-98) con las
 * cuchillas abiertas en direcciones opuestas —la lambda—, un acoplamiento
 * mecánico punteado entre ellas y el corchete de la derecha. En una captura
 * está apoyada la cuchilla de 97-98 y en la otra la de 95-96: nunca las dos.
 */

const sym = resolveSymbol(8018, ['95', '97', '96', '98']);

test('el conmutador tiene dos contactos verticales con cuchillas opuestas', () => {
  const shapes = sym.shapes(15, 15);
  const blades = shapes.filter((s) => s.blade);
  assert.equal(blades.length, 2, 'dos cuchillas, una por contacto');
  // Signos contrarios: el lienzo rota la hoja cuando el contacto está cerrado
  // (`deg > 0`), así que con signos opuestos se apoya una y se abre la otra.
  const [a, b] = blades.map((s) => s.blade!.deg);
  assert.ok(a * b < 0, `los giros deben tener signo contrario: ${a} y ${b}`);
  assert.ok(Math.abs(a) > 15 && Math.abs(a) < 30, `el giro debe ser el de la cuchilla: ${a}`);
});

test('el acoplamiento mecánico enlaza los dos contactos a media altura', () => {
  // Medido sobre `docs/03/componentes01` (registro 144,90): tramos horizontales
  // en y=6 de −6 a 7,5 y el operador en la columna derecha (x=12,75).
  const shapes = sym.shapes(15, 15);
  const enlace = shapes.find((s) => s.thin && s.d.startsWith('M-6 6H'));
  assert.ok(enlace, 'falta el enlace mecánico');
  assert.equal(
    enlace!.d,
    'M-6 6H-4.25 M-3 6H-1.25 M0 6H1.75 M3 6H4.75 M6 6H7.5',
    'los tramos del enlace no son los medidos',
  );
  assert.ok(shapes.some((s) => s.d === 'M12.75 4L12.75 5' && s.thin), 'falta el guion alto del operador');
  assert.ok(shapes.some((s) => s.d === 'M12.75 7L12.75 7.75' && s.thin), 'falta el guion bajo del operador');
});

test('los bornes caen en la grilla de CADeSimu: 0 y 12 de alto, cada 9 de ancho', () => {
  assert.deepEqual(
    sym.pins.map((p) => [p.name, Math.round(p.nx * 15), Math.round(p.ny * 15)]),
    [
      ['95', 0, 0],
      ['97', 9, 0],
      ['96', 0, 12],
      ['98', 9, 12],
    ],
  );
});

test('cada cuchilla pivota en la fila inferior del contacto y abre hacia un lado', () => {
  const blades = sym.shapes(15, 15).filter((s) => s.blade);
  const tips = blades.map((s) => {
    const m = /M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/.exec(s.d)!;
    return { pivot: [Number(m[1]), Number(m[2])], tip: [Number(m[3]), Number(m[4])] };
  });
  // Los dos pivotes en la fila inferior del contacto (y = 9), como en 2000 y
  // 2001: del pivote al borne (y = 12) baja el tramo recto.
  for (const { pivot } of tips) {
    assert.equal(pivot[1], 9, `el pivote debe estar en la fila inferior del contacto: ${pivot[1]}`);
  }
  // La lambda medida en `componentes01`: la de 95-96 abre hacia la derecha y la
  // de 97-98 hacia la izquierda, así que las puntas se miran.
  const [nc, na] = tips;
  assert.ok(nc!.tip[0] > nc!.pivot[0], 'la de 95-96 abre a la derecha');
  assert.ok(na!.tip[0] < na!.pivot[0], 'la de 97-98 abre a la izquierda');
});

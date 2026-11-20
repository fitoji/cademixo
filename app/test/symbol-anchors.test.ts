import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/format/cade.ts';
import { buildProject, GEOMETRY } from '../src/model/project.ts';
import { attachPoints } from '../src/editor/pins.ts';
import { resolveSymbol } from '../src/symbols/library.ts';
import { shapesBounds } from '../src/symbols/draw.ts';
import { designatorAt, pinLabelAt } from '../src/ui/labels.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, 'fixtures/test01-termomag-lampara.cad');
const project = buildProject(parse(readFileSync(FIXTURE, 'latin1')));
const pins = attachPoints(project.records);

/**
 * Criterio de aceptación: la captura real de CADeSimu del fixture
 * (`data/samples/tests01/test01.png`, que no viaja al repo porque `data/` está
 * ignorado). Las medidas de abajo están en unidades del archivo, tomadas sobre
 * esa captura (6 px por unidad).
 */

const near = (a: number, b: number, tol = 0.05): boolean => Math.abs(a - b) <= tol;


test('el terminal de alimentación se dibuja anclado al origen, con su círculo encima', () => {
  for (const code of [3000, 3001]) {
    const sym = resolveSymbol(code, []);
    assert.equal(sym.anchor, 'origin', `${code} debe quedar anclado al origen`);
    const ink = shapesBounds(sym.shapes(6, 3));
    // Círculo de radio 1 con el centro 3,2 unidades por encima del origen, y
    // un hilo que baja hasta el origen (el extremo del cable).
    assert.ok(near(ink.minX, -1) && near(ink.maxX, 1), `el círculo del ${code} mide ${ink.minX}..${ink.maxX}`);
    assert.ok(near(ink.minY, -4.2), `el ${code} sube hasta ${ink.minY}`);
    assert.ok(near(ink.maxY, 0), `el ${code} baja hasta ${ink.maxY}`);
  }
});

test('el automático IN tiene dos polos sobre los bornes y el disparo sólo en el primero', () => {
  const sym = resolveSymbol(6001, ['1', '3', '2', '4']);
  assert.equal(sym.anchor, 'origin');
  const ink = shapesBounds(sym.shapes(12, 15));
  // La cuchilla sale 3 unidades a la izquierda del polo; el segundo polo está
  // 6 unidades a la derecha. El cuadrado de disparo (media diagonal 1,35,
  // inclinado 18°) llega a 4,24 a la izquierda. El guion del segundo polo va
  // hacia el centro, así que no sale por la derecha del segundo polo.
  assert.ok(near(ink.minX, -4.24), `el automático llega a ${ink.minX}`);
  assert.ok(near(ink.maxX, 6), `el automático llega a ${ink.maxX}`);
  assert.ok(near(ink.minY, 0) && near(ink.maxY, 12), `el automático mide ${ink.minY}..${ink.maxY}`);

  const filled = sym.shapes(12, 15).filter((s) => s.fill);
  assert.equal(filled.length, 1, 'el detalle de disparo va sólo en el primer polo');
});

test('la lámpara se dibuja centrada en el medio de sus dos bornes', () => {
  const sym = resolveSymbol(9008, ['X1', 'X2']);
  assert.equal(sym.anchor, 'origin');
  const ink = shapesBounds(sym.shapes(9, 15));
  // Círculo de radio 2,83 con el centro 6 unidades abajo del borne de arriba.
  assert.ok(near(ink.minX, -2.83) && near(ink.maxX, 2.83), `la lámpara mide ${ink.minX}..${ink.maxX}`);
  assert.ok(near(ink.minY, 0) && near(ink.maxY, 12), `la lámpara mide ${ink.minY}..${ink.maxY}`);
});

test('el pulsador NA (8000) va anclado al origen, vertical, como lo dibuja CADeSimu', () => {
  const sym = resolveSymbol(8000, ['13', '14']);
  assert.equal(sym.anchor, 'origin', 'el 8000 migró a anclaje al origen');
  assert.deepEqual(sym.originPins, [
    { name: '13', x: 0, y: 0 },
    { name: '14', x: 0, y: 12 },
  ]);

  // Los bornes son las filas del registro (0 y 12): la tinta se corre +6
  // respecto de la medición sobre
  // docs/cadesimu-svg/reference/PR1_Rodolfo_Giusti_03.png (4 px por unidad),
  // S1 en (66,123), para llegar a ellos: tramo superior (0,0)→(0,2.75),
  // paleta (−3,3)→(0,9) con pivote en (0,9), tramo inferior (0,9)→(0,12)
  // —estirado 0,25 para que el borne 14 caiga sobre la tinta—, corchete del
  // operador en x=−6 y guion (−3,6)→(−1.5,6) apoyado en la paleta.
  const shapes = sym.shapes(9, 15);
  const ink = shapesBounds(shapes);
  assert.ok(near(ink.minX, -6) && near(ink.maxX, 0), `el NA mide ${ink.minX}..${ink.maxX} de ancho`);
  assert.ok(near(ink.minY, 0) && near(ink.maxY, 12), `el NA mide ${ink.minY}..${ink.maxY} de alto`);

  const blade = shapes.find((s) => s.blade);
  assert.ok(blade, 'la paleta del NA es móvil');
  const m = /M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/.exec(blade.d)!;
  assert.deepEqual([Number(m[1]), Number(m[2])], [0, 9], 'el pivote de la paleta baja con la tinta hasta y=9');
  assert.deepEqual([Number(m[3]), Number(m[4])], [-3, 3], 'la paleta en reposo abre hacia la izquierda');
  // CADe deja la paleta a 1 unidad del conductor al cerrar (medido en
  // K1M-aux de play_03 y F0 de play_04): giro de 17.1° (26.57 − 9.46),
  // positivo porque el lienzo rota las cuchillas con deg > 0 al cerrar.
  assert.ok(near(blade.blade!.deg, 17.1, 0.05), `giro del NA: ${blade.blade!.deg}`);
});

test('el pulsador NC (8001) abre girando al contrario que el NA', () => {
  const sym = resolveSymbol(8001, ['11', '12']);
  assert.equal(sym.anchor, 'origin', 'el 8001 migró a anclaje al origen');
  assert.deepEqual(sym.originPins, [
    { name: '11', x: 0, y: 0 },
    { name: '12', x: 0, y: 12 },
  ]);

  // Los bornes son las filas del registro (0 y 12) y la tinta está corrida +6
  // respecto de la medición sobre la misma referencia, S0 en (66,99): tramo
  // superior hasta 3.5 donde sale la barra (0,3.5)→(+3.25,3.5); paleta espejo
  // (+3,3)→(0,9); dos guiones en la fila 6.
  const shapes = sym.shapes(9, 15);
  const ink = shapesBounds(shapes);
  assert.ok(near(ink.minX, -6) && near(ink.maxX, 3.25), `el NC mide ${ink.minX}..${ink.maxX} de ancho`);
  assert.ok(near(ink.minY, 0) && near(ink.maxY, 12), `el NC mide ${ink.minY}..${ink.maxY} de alto`);

  const blade = shapes.find((s) => s.blade);
  assert.ok(blade, 'la paleta del NC es móvil');
  const m = /M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/.exec(blade.d)!;
  assert.deepEqual([Number(m[1]), Number(m[2])], [0, 9], 'el pivote de la paleta baja con la tinta hasta y=9');
  assert.deepEqual([Number(m[3]), Number(m[4])], [3, 3], 'la paleta en reposo está apoyada hacia la derecha');
  // Espejo del NA: el carrier común mueve las dos puntas hacia el conductor
  // y frena a 1 unidad, así que el NC presionado deja la punta a +1 y el
  // giro es negativo (el lienzo lo aplica cuando el contacto está abierto).
  assert.ok(near(blade.blade!.deg, -17.1, 0.05), `giro del NC: ${blade.blade!.deg}`);

  // La barra del apoyo y el tramo superior comparten la esquina (0,3.5).
  const bar = shapes.find((s) => s.d === 'M0 3.5L3.25 3.5');
  assert.ok(bar, 'falta la barra del apoyo NC');
  const stub = shapes.find((s) => s.d === 'M0 0L0 3.5');
  assert.ok(stub, 'el tramo superior del NC arranca en el borne 11 y baja hasta la barra');
});

test('el pulsador NA-NC (8002) va anclado con un contacto en cada columna', () => {
  const sym = resolveSymbol(8002, ['11', '13', '12', '14']);
  assert.equal(sym.anchor, 'origin', 'el 8002 migró a anclaje al origen');
  // Los bornes son las filas del registro (0 arriba, 12 abajo): la tinta se
  // corre +6 respecto de la medición para llegar a ellos, en vez de mover el
  // borne al extremo del ramal.
  assert.deepEqual(sym.originPins, [
    { name: '11', x: 0, y: 0 },
    { name: '13', x: 9, y: 0 },
    { name: '12', x: 0, y: 12 },
    { name: '14', x: 9, y: 12 },
  ]);

  // Medido sobre docs/02/pulsadores.png (9 px por unidad), NA-NC en (528,198),
  // con la tinta corrida +6: NC en la columna 0 (barra a 3,5 y paleta de +9 a
  // +3) y NO en la columna 9 (paleta de +9 a +3 abriendo hacia la izquierda),
  // con el enlace mecánico discontinuo en y=6 de −3 a 7,5.
  const shapes = sym.shapes(15, 15);
  const ink = shapesBounds(shapes);
  assert.ok(near(ink.minX, -6) && near(ink.maxX, 9), `el NA-NC mide ${ink.minX}..${ink.maxX} de ancho`);
  assert.ok(near(ink.minY, 0) && near(ink.maxY, 12), `el NA-NC mide ${ink.minY}..${ink.maxY} de alto`);
  assert.ok(shapes.some((s) => s.d === 'M0 3.5L3.5 3.5'), 'falta la barra del contacto NC');
  assert.ok(shapes.some((s) => s.d === 'M0 9L3 3'), 'falta la paleta NC');
  assert.ok(shapes.some((s) => s.d === 'M9 0L9 3'), 'falta el tramo superior del NO');
  assert.ok(shapes.some((s) => s.d === 'M9 9L6 3'), 'falta la paleta NO');
  for (const d of ['M-3 6L-1 6', 'M0 6L2 6', 'M3 6L5 6', 'M6 6L7.5 6']) {
    assert.ok(shapes.some((s) => s.d === d && s.thin), `falta el tramo ${d} del enlace mecánico`);
  }
});

test('el pulsador conmutado (8003) lleva el común arriba y los dos tiros abajo', () => {
  const sym = resolveSymbol(8003, ['11', '12', '14']);
  assert.equal(sym.anchor, 'origin', 'el 8003 migró a anclaje al origen');
  // Los bornes son las filas del registro: el común arriba en (3,0) y los dos
  // tiros abajo en (0,12) y (6,12).
  assert.deepEqual(sym.originPins, [
    { name: '11', x: 3, y: 0 },
    { name: '12', x: 0, y: 12 },
    { name: '14', x: 6, y: 12 },
  ]);

  // Medido sobre la misma captura, conmutado en (798,198), con la tinta
  // corrida +6: común arriba en x=3, cuchilla hasta (0,5;9) apoyada en el NC, y
  // los dos tiros abajo en x=0 y x=6 con sus barras cortas en la fila 8,33
  // apuntando hacia la cuchilla.
  const shapes = sym.shapes(12, 15);
  const ink = shapesBounds(shapes);
  assert.ok(near(ink.minX, -6) && near(ink.maxX, 6), `el conmutado mide ${ink.minX}..${ink.maxX} de ancho`);
  assert.ok(near(ink.minY, 0) && near(ink.maxY, 12), `el conmutado mide ${ink.minY}..${ink.maxY} de alto`);
  assert.ok(shapes.some((s) => s.d === 'M3 0L3 3'), 'falta el tramo del común');
  assert.ok(shapes.some((s) => s.d === 'M3 3L0.5 9'), 'falta la cuchilla del conmutado');
  assert.ok(shapes.some((s) => s.d === 'M0 8.33L1.2 8.33'), 'falta la barra del tiro NC');
  assert.ok(shapes.some((s) => s.d === 'M4.78 8.33L6 8.33'), 'falta la barra del tiro NO');
});

test('la seta (8004/8005) se dibuja como cúpula con vástago, no con tapa recta', () => {
  for (const [code, names] of [
    [8004, ['13', '14']],
    [8005, ['11', '12']],
  ] as const) {
    const sym = resolveSymbol(code, [...names]);
    assert.equal(sym.anchor, 'origin', `el ${code} migró a anclaje al origen`);
    // Los bornes son las filas del registro (0 y 12), como los del NA/NC.
    assert.deepEqual(sym.originPins, [
      { name: names[0], x: 0, y: 0 },
      { name: names[1], x: 0, y: 12 },
    ]);

    // Medido sobre la misma captura, seta en (1041,90) y (1041,279), con la
    // tinta corrida +6: cúpula de radio 2 con el lado plano en x=−6 y vástago
    // hasta −4,1. El 8005 suma la barra del apoyo NC hasta +3,25.
    const shapes = sym.shapes(6, 15);
    const ink = shapesBounds(shapes);
    const maxX = code === 8005 ? 3.25 : 0;
    assert.ok(near(ink.minX, -8) && near(ink.maxX, maxX), `la seta ${code} mide ${ink.minX}..${ink.maxX} de ancho`);
    assert.ok(near(ink.minY, 0) && near(ink.maxY, 12), `la seta ${code} mide ${ink.minY}..${ink.maxY} de alto`);
    assert.ok(shapes.some((s) => s.d.startsWith('M-6 4.1') && s.d.includes('L-8 6')), `falta la cúpula de la seta ${code}`);
    assert.ok(shapes.some((s) => s.d === 'M-6 4L-6 8'), `falta el lado plano de la seta ${code}`);
    assert.ok(shapes.some((s) => s.d === 'M-6 6L-4.1 6'), `falta el vástago de la seta ${code}`);
  }
});

test('cada borne declarado de los pulsadores anclados cae sobre la tinta del símbolo', () => {
  // Regresión del defecto reportado: el borne superior quedaba en el medio del
  // contacto y el inferior seis unidades por debajo de la tinta. El criterio es
  // que todo punto de `originPins` —las filas 0/12 del registro— sea un punto
  // del trazado del def: la tinta se dibuja hasta el borne, no al revés.
  const pairsOf = (d: string): Array<[number, number]> => {
    const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const out: Array<[number, number]> = [];
    for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i]!, nums[i + 1]!]);
    return out;
  };
  for (const [code, names] of [
    [8002, ['11', '13', '12', '14']],
    [8003, ['11', '12', '14']],
    [8004, ['13', '14']],
    [8005, ['11', '12']],
  ] as const) {
    const sym = resolveSymbol(code, [...names]);
    const pts = sym.shapes(9, 15).flatMap((s) => pairsOf(s.d));
    for (const pin of sym.originPins ?? []) {
      const onInk = pts.some(([x, y]) => near(x, pin.x, 0.01) && near(y, pin.y, 0.01));
      assert.ok(onInk, `${code}: el borne ${pin.name} (${pin.x},${pin.y}) no cae sobre la tinta del símbolo`);
    }
  }
});

test('la bobina (9000) va anclada al origen, con el cuerpo centrado en el conductor', () => {
  const sym = resolveSymbol(9000, ['A1', 'A2']);
  assert.equal(sym.anchor, 'origin', 'el 9000 migró a anclaje al origen');
  assert.deepEqual(sym.originPins, [
    { name: 'A1', x: 0, y: 0 },
    { name: 'A2', x: 0, y: 12 },
  ]);

  // Medido sobre docs/cadesimu-svg/reference/PR1_Rodolfo_Giusti_03.png, K1M
  // en (66,141) y desplazado +6 en `y` para que el conductor llegue a los dos
  // bornes del archivo: conductora continua de 0 a 12 y rectángulo de −4 a +4
  // por +4 a +8 atravesado por el conductor, sin letra adentro.
  const shapes = sym.shapes(9, 15);
  const ink = shapesBounds(shapes);
  assert.ok(near(ink.minX, -4) && near(ink.maxX, 4), `el cuerpo mide ${ink.minX}..${ink.maxX} de ancho`);
  assert.ok(near(ink.minY, 0) && near(ink.maxY, 12), `la bobina mide ${ink.minY}..${ink.maxY} de alto`);
  assert.ok(shapes.some((s) => s.d === 'M0 0L0 12'), 'la conductora va del borne A1 al A2');
  assert.ok(shapes.some((s) => s.d === 'M-4 4H4V8H-4Z'), 'el cuerpo es el rectángulo medido, corrido a la mitad del conductor');
  assert.equal(sym.labels?.(9, 15), undefined, 'el cuerpo va sin letra: los rótulos los pone el lienzo');
});

test('la lámpara (9008) sigue anclada y centrada como antes', () => {
  // S6: la lámpara ya estaba calibrada; la migración de los vecinos no la
  // mueve. Es la verificación de que el recorte piloto no la toca.
  const sym = resolveSymbol(9008, ['X1', 'X2']);
  assert.equal(sym.anchor, 'origin');
  const ink = shapesBounds(sym.shapes(9, 15));
  assert.ok(near(ink.minX, -2.83) && near(ink.maxX, 2.83), `la lámpara mide ${ink.minX}..${ink.maxX}`);
  assert.ok(near(ink.minY, 0) && near(ink.maxY, 12), `la lámpara mide ${ink.minY}..${ink.maxY}`);
});

test('el motor (1000) va anclado al origen, con los bornes sobre el registro y el cuerpo centrado', () => {
  const sym = resolveSymbol(1000, ['U1', 'V1', 'W1', 'PE']);
  assert.equal(sym.anchor, 'origin', 'el 1000 migró a anclaje al origen');
  assert.deepEqual(sym.originPins, [
    { name: 'U1', x: 0, y: 0 },
    { name: 'V1', x: 6, y: 0 },
    { name: 'W1', x: 12, y: 0 },
    { name: 'PE', x: 18, y: 0 },
  ]);

  // Medido sobre docs/cadesimu-svg/reference/PR1_Rodolfo_Giusti_03.png, M1 en
  // (183,168): los cables terminan en la fila del registro (rel y=0) y la
  // tinta del símbolo empieza 6 unidades arriba (162) tapando el cable,
  // igual que en CADe. Círculo r=9 centrado en (189,174): rel (6,6).
  // El sobreenvolvente de arcos de shapesBounds es conservador: para el arco
  // del PE cuenta los dos centros candidatos (±9,75 de la cuerda), así que la
  // caja llega a 25,3 aunque la tinta real (el gancho) termina en x=18.
  const shapes = sym.shapes(24, 24);
  const ink = shapesBounds(shapes);
  assert.ok(near(ink.minX, -3) && near(ink.maxX, 25.3), `el motor mide ${ink.minX}..${ink.maxX} de ancho`);
  assert.ok(near(ink.minY, -6) && near(ink.maxY, 15), `el motor mide ${ink.minY}..${ink.maxY} de alto`);

  // Cada stub baja hasta ~0,15 del borde del círculo (el hueco visual que
  // deja CADe): U1 -0.375, V1 -2.875 (borde el apex), W1 -0.875.
  const ds = shapes.map((s) => s.d);
  assert.ok(ds.includes('M0 -6L0 -0.37'), 'falta el stub de U1');
  assert.ok(ds.includes('M6 -6L6 -2.87'), 'falta el stub de V1');
  assert.ok(ds.includes('M12 -6L12 -0.87'), 'falta el stub de W1');
  assert.ok(ds.includes('M18 -6L18 6'), 'el stub del PE cruza hasta la altura del centro');
  assert.ok(ds.includes('M18 6L15.5 6'), 'falta el gancho del PE hacia el círculo');
  // La terminal del PE es un arco concéntrico al cuerpo (r 9.75), no una
  // marca de tierra: mide ~4u de alto pegado al borde derecho.
  assert.ok(ds.includes('M15.55 4a9.75 9.75 0 0 1 0 4'), 'falta el arco de la terminal del PE');
  assert.equal(shapes.some((s) => s.fill), false, 'sin rellenos');
});

test('el contactor de potencia (2001) va anclado al origen con la fila de bornes del registro', () => {
  const sym = resolveSymbol(2001, ['1', '3', '5', '2', '4', '6']);
  assert.equal(sym.anchor, 'origin', 'el 2001 migró a anclaje al origen');
  assert.deepEqual(sym.originPins, [
    { name: '1', x: 0, y: 0 },
    { name: '3', x: 6, y: 0 },
    { name: '5', x: 12, y: 0 },
    { name: '2', x: 0, y: 12 },
    { name: '4', x: 6, y: 12 },
    { name: '6', x: 12, y: 12 },
  ]);

  // Medido sobre docs/cadesimu-svg/reference/PR1_Rodolfo_Giusti_03.png
  // (4 px por unidad), K1M en (624,390), caja del registro 18x15, y desplazado
  // +6 en `y` para que los ramales lleguen a las filas de bornes del archivo.
  // Por polo (columnas 0/6/12): stub superior (p,0)→(p,3) —donde el cable (gris
  // de CADe) se apoya—, hoja (p−3,3)→(p,+9) con pivote en (p,+9) y montante
  // (p,+9)→(p,+12), que cierra en la fila inferior +12. El guion mecánico
  // discontinuo queda en y=6: arranca en el cruce de la hoja 1 (−1,5) y termina
  // en el de la hoja 3 (+10,5), tramos de 2u con paso 5u.
  const shapes = sym.shapes(18, 15);
  const ink = shapesBounds(shapes);
  assert.ok(near(ink.minX, -3) && near(ink.maxX, 12), `el contactor mide ${ink.minX}..${ink.maxX} de ancho`);
  assert.ok(near(ink.minY, 0) && near(ink.maxY, 12), `el contactor mide ${ink.minY}..${ink.maxY} de alto`);
  for (const p of [0, 6, 12]) {
    assert.ok(shapes.some((s) => s.d === `M${p} 0L${p} 3`), `falta el stub del polo ${p}`);
    assert.ok(shapes.some((s) => s.d === `M${p - 3} 3L${p} 9`), `falta la hoja del polo ${p}`);
    assert.ok(shapes.some((s) => s.d === `M${p} 9L${p} 12`), `falta el montante del polo ${p}`);
  }
  assert.ok(shapes.some((s) => s.d === 'M-1.5 6L0.5 6' && s.thin), 'falta el primer tramo del guion');
  assert.ok(shapes.some((s) => s.d === 'M3.5 6L5.5 6' && s.thin), 'falta el segundo tramo del guion');
  assert.ok(shapes.some((s) => s.d === 'M8.5 6L10.5 6' && s.thin), 'falta el tercer tramo del guion');
});

test('el contactor bipolar (2000) va anclado al origen con la hoja y el guion medidos en docs/03', () => {
  const sym = resolveSymbol(2000, ['1', '3', '2', '4']);
  assert.equal(sym.anchor, 'origin', 'el 2000 migró a anclaje al origen');
  assert.deepEqual(sym.originPins, [
    { name: '1', x: 0, y: 0 },
    { name: '3', x: 6, y: 0 },
    { name: '2', x: 0, y: 12 },
    { name: '4', x: 6, y: 12 },
  ]);

  // Medido sobre docs/cadesimu-svg/reference/componentes01.png (S=4, OX=-17,
  // OY=-101), registro `*2000#-KM##1#3#2#4####*...*27*126*...*-12*-3*12*15*`.
  // Por polo (columnas 0/6): conductor superior (p,0)→(p,3), hoja (p,9)→(p−3,3)
  // con pivote en el borne inferior, y bajada (p,9)→(p,12). El guion mecánico
  // punteado va a media hoja (y=6), de cruce a cruce: −1,5 … 4,5.
  const shapes = sym.shapes(12, 15);
  const ink = shapesBounds(shapes);
  assert.ok(near(ink.minX, -3) && near(ink.maxX, 6), `el contactor mide ${ink.minX}..${ink.maxX} de ancho`);
  assert.ok(near(ink.minY, 0) && near(ink.maxY, 12), `el contactor mide ${ink.minY}..${ink.maxY} de alto`);
  for (const p of [0, 6]) {
    assert.ok(shapes.some((s) => s.d === `M${p} 0L${p} 3`), `falta el conductor superior del polo ${p}`);
    assert.ok(shapes.some((s) => s.d === `M${p} 9L${p - 3} 3`), `falta la hoja del polo ${p}`);
    assert.ok(shapes.some((s) => s.d === `M${p} 9L${p} 12`), `falta la bajada del polo ${p}`);
  }
  const blades = shapes.filter((s) => s.blade);
  assert.equal(blades.length, 2, 'las dos cuchillas son móviles');
  for (const b of blades) assert.ok(b.blade!.deg > 0, 'la hoja cierra girando hacia el conductor');
  assert.ok(shapes.some((s) => s.d === 'M-1.5 6L0.25 6' && s.thin), 'falta el primer tramo del guion');
  assert.ok(shapes.some((s) => s.d === 'M2.75 6L4.5 6' && s.thin), 'falta el segundo tramo del guion');
});

test('el disyuntor motor (6010) va anclado al origen con su disparo magnético medido en docs/03', () => {
  const sym = resolveSymbol(6010, ['1', '2']);
  assert.equal(sym.anchor, 'origin', 'el 6010 migró a anclaje al origen');
  assert.deepEqual(sym.originPins, [
    { name: '1', x: 0, y: 0 },
    { name: '2', x: 0, y: 21 },
  ]);

  // Medido sobre `componentes01` (registro `*…*156*120*…*-21*-3*6*24*`): polo en
  // la columna 0, caja doble de (−3,12) a (3,18) y disparo magnético a la
  // izquierda, con el enlace punteado en x=−6.
  const shapes = sym.shapes(6, 24);
  const ink = shapesBounds(shapes);
  assert.ok(near(ink.minX, -10) && near(ink.maxX, 3), `el disyuntor mide ${ink.minX}..${ink.maxX} de ancho`);
  assert.ok(near(ink.minY, 0) && near(ink.maxY, 21), `el disyuntor mide ${ink.minY}..${ink.maxY} de alto`);
  assert.ok(shapes.some((s) => s.d === 'M0 0L0 3'), 'falta el conductor superior');
  assert.ok(shapes.some((s) => s.d === 'M0 9L-3 3' && s.blade), 'falta la hoja del polo');
  assert.ok(shapes.some((s) => s.d === 'M-3 12H3V18H-3Z'), 'falta la caja doble');
  assert.ok(shapes.some((s) => s.d === 'M-3 15L3 15'), 'falta la divisoria del térmico');
  assert.ok(shapes.some((s) => s.d === 'M0 12.75H1.25V14H0' && s.thin), 'falta el gancho del térmico');
  assert.ok(shapes.some((s) => s.d === 'M-8 4H-4V8H-8Z'), 'falta el cuadro del disparo magnético');
  assert.ok(shapes.some((s) => s.d === 'M-6 4L-6 8'), 'falta la cruz del disparo magnético');
  assert.ok(shapes.some((s) => s.d === 'M-10 6L-2.25 6'), 'falta la acometida del disparo');
  assert.ok(shapes.some((s) => s.d === 'M0 18L0 21'), 'falta la bajada al borne inferior');
});

test('la resistencia I (1050) va anclada al origen, vertical, como en docs/03', () => {
  const sym = resolveSymbol(1050, ['1', '2']);
  assert.equal(sym.anchor, 'origin', 'la 1050 migró a anclaje al origen');
  assert.deepEqual(sym.originPins, [
    { name: '1', x: 0, y: 0 },
    { name: '2', x: 0, y: 15 },
  ]);

  // Medido sobre `componentes01` (registro `*…*12*75*…*-12*-3*6*18*`): cuerpo
  // vertical de 2,75 de ancho pegado al conductor, de y=3 a y=12.
  const shapes = sym.shapes(6, 18);
  const ink = shapesBounds(shapes);
  assert.ok(near(ink.minX, -1.5) && near(ink.maxX, 1.25), `la resistencia mide ${ink.minX}..${ink.maxX} de ancho`);
  assert.ok(near(ink.minY, 0) && near(ink.maxY, 15), `la resistencia mide ${ink.minY}..${ink.maxY} de alto`);
  assert.ok(shapes.some((s) => s.d === 'M0 0L0 3'), 'falta la conductora superior');
  assert.ok(shapes.some((s) => s.d === 'M-1.5 3H1.25V12H-1.5Z'), 'falta el cuerpo medido');
  assert.ok(shapes.some((s) => s.d === 'M0 12L0 15'), 'falta la conductora inferior');
});

test('la bobina biestable (9001) va anclada al origen con sus dos entradas', () => {
  const sym = resolveSymbol(9001, ['A1', 'B1', 'A2']);
  assert.equal(sym.anchor, 'origin', 'la 9001 migró a anclaje al origen');
  assert.deepEqual(sym.originPins, [
    { name: 'A1', x: -3, y: 0 },
    { name: 'B1', x: 3, y: 0 },
    { name: 'A2', x: 0, y: 12 },
  ]);

  // Medido sobre `componentes01` (registro `*…*21*105*…*-15*-3*9*15*`): dos
  // patas de entrada en x=−3 y x=3, cuerpo de (−4,4) a (4,8) y salida centrada.
  const shapes = sym.shapes(9, 15);
  const ink = shapesBounds(shapes);
  assert.ok(near(ink.minX, -4) && near(ink.maxX, 4), `la bobina mide ${ink.minX}..${ink.maxX} de ancho`);
  assert.ok(near(ink.minY, 0) && near(ink.maxY, 12), `la bobina mide ${ink.minY}..${ink.maxY} de alto`);
  assert.ok(shapes.some((s) => s.d === 'M-3 0L-3 4'), 'falta la pata de A1');
  assert.ok(shapes.some((s) => s.d === 'M3 0L3 4'), 'falta la pata de B1');
  assert.ok(shapes.some((s) => s.d === 'M-4 4H4V8H-4Z'), 'falta el cuerpo de la bobina');
  assert.ok(shapes.some((s) => s.d === 'M-1.25 4.25L-3 7.75' && s.thin), 'falta la diagonal izquierda');
  assert.ok(shapes.some((s) => s.d === 'M1 4.25L2.75 7.75' && s.thin), 'falta la diagonal derecha');
  assert.ok(shapes.some((s) => s.d === 'M0 8L0 12'), 'falta la salida de A2');
});

test('el telerruptor (9002) va anclado al origen con el chevrón biestable', () => {
  const sym = resolveSymbol(9002, ['A1', 'A2']);
  assert.equal(sym.anchor, 'origin', 'el 9002 migró a anclaje al origen');
  assert.deepEqual(sym.originPins, [
    { name: 'A1', x: 0, y: 0 },
    { name: 'A2', x: 0, y: 12 },
  ]);

  // Medido sobre `componentes01` (registro `*…*42*108*…*-15*-3*9*15*`).
  const shapes = sym.shapes(9, 15);
  const ink = shapesBounds(shapes);
  assert.ok(near(ink.minX, -4) && near(ink.maxX, 4), `el telerruptor mide ${ink.minX}..${ink.maxX} de ancho`);
  assert.ok(near(ink.minY, 0) && near(ink.maxY, 12), `el telerruptor mide ${ink.minY}..${ink.maxY} de alto`);
  assert.ok(shapes.some((s) => s.d === 'M0 0L0 4'), 'falta el conductor de entrada');
  assert.ok(shapes.some((s) => s.d === 'M-4 4H4V8H-4Z'), 'falta el cuerpo');
  assert.ok(shapes.some((s) => s.d === 'M-1 4.25L-4 6' && s.thin), 'falta el chevrón de subida');
  assert.ok(shapes.some((s) => s.d === 'M-4 6L-1 7.75' && s.thin), 'falta el chevrón de bajada');
  assert.ok(shapes.some((s) => s.d === 'M-1 4.25L-1 7.75' && s.thin), 'falta la barra del chevrón');
  assert.ok(shapes.some((s) => s.d === 'M0 8L0 12'), 'falta la salida');
});

test('la resistencia III (1051) repite el cuerpo de la 1050 sobre las columnas 0/6/12', () => {
  const sym = resolveSymbol(1051, ['1', '3', '5', '2', '4', '6']);
  assert.equal(sym.anchor, 'origin', 'la 1051 migró a anclaje al origen');
  assert.deepEqual(sym.originPins, [
    { name: '1', x: 0, y: 0 },
    { name: '3', x: 6, y: 0 },
    { name: '5', x: 12, y: 0 },
    { name: '2', x: 0, y: 15 },
    { name: '4', x: 6, y: 15 },
    { name: '6', x: 12, y: 15 },
  ]);

  // Medido sobre `componentes01` (registro `*…*33*81*…*-12*-3*18*18*`).
  const shapes = sym.shapes(18, 18);
  const ink = shapesBounds(shapes);
  assert.ok(near(ink.minX, -1.5) && near(ink.maxX, 13.25), `la resistencia mide ${ink.minX}..${ink.maxX} de ancho`);
  assert.ok(near(ink.minY, 0) && near(ink.maxY, 15), `la resistencia mide ${ink.minY}..${ink.maxY} de alto`);
  for (const p of [0, 6, 12]) {
    assert.ok(shapes.some((s) => s.d === `M${p} 0L${p} 3`), `falta la conductora superior del polo ${p}`);
    assert.ok(shapes.some((s) => s.d === `M${p - 1.5} 3H${p + 1.25}V12H${p - 1.5}Z`), `falta el cuerpo del polo ${p}`);
    assert.ok(shapes.some((s) => s.d === `M${p} 12L${p} 15`), `falta la conductora inferior del polo ${p}`);
  }
});

test('el diferencial IN (6005) va anclado al origen con el toroide medido en docs/03', () => {
  const sym = resolveSymbol(6005, ['1', '3', '2', '4']);
  assert.equal(sym.anchor, 'origin', 'el 6005 migró a anclaje al origen');
  assert.deepEqual(sym.originPins, [
    { name: '1', x: 0, y: 0 },
    { name: '3', x: 6, y: 0 },
    { name: '2', x: 0, y: 18 },
    { name: '4', x: 6, y: 18 },
  ]);

  // Medido sobre `componentes01` (registro `*…*183*102*…*-21*-3*12*21*`): dos
  // polos, toroide del diferencial de (0,12) a (6,15) con arcos a los lados y
  // disparo magnético a la izquierda.
  const shapes = sym.shapes(12, 21);
  const ink = shapesBounds(shapes);
  assert.ok(near(ink.minX, -10) && near(ink.maxX, 7.52), `el diferencial mide ${ink.minX}..${ink.maxX} de ancho`);
  assert.ok(near(ink.minY, 0) && near(ink.maxY, 18), `el diferencial mide ${ink.minY}..${ink.maxY} de alto`);
  for (const p of [0, 6]) {
    assert.ok(shapes.some((s) => s.d === `M${p} 0L${p} 3`), `falta el conductor superior del polo ${p}`);
    assert.ok(shapes.some((s) => s.d === `M${p} 9L${p - 3} 3` && s.blade), `falta la hoja del polo ${p}`);
    assert.ok(shapes.some((s) => s.d === `M${p} 15L${p} 18`), `falta la bajada del polo ${p}`);
  }
  assert.ok(shapes.some((s) => s.d === 'M0 12H6V15H0Z'), 'falta el toroide del diferencial');
  assert.ok(shapes.some((s) => s.d === 'M0 12A1.52 1.52 0 0 0 0 15' && s.thin), 'falta el arco izquierdo');
  assert.ok(shapes.some((s) => s.d === 'M6 12A1.52 1.52 0 0 1 6 15' && s.thin), 'falta el arco derecho');
  assert.ok(shapes.some((s) => s.d === 'M-8 4H-4V8H-8Z'), 'falta el disparo magnético');
  assert.ok(shapes.some((s) => s.d === 'M-10 6L-2.25 6'), 'falta la acometida del disparo');
});

test('los bornes de los símbolos anclados caen donde el archivo los conecta', () => {
  // El criterio real del anclaje: el símbolo tiene que estar sobre sus cables.
  for (const rec of project.records) {
    if (rec.kind !== 'component') continue;
    const sym = resolveSymbol(rec.code, rec.pins);
    if (sym.anchor !== 'origin') continue;
    const originPins = sym.originPins ?? [];
    if (originPins.length === 0) continue;
    const actual = pins.get(rec.id) ?? [];
    assert.equal(actual.length, originPins.length, `${rec.code}: ${actual.length} puntos para ${originPins.length} bornes`);
    const ox = rec.geometry[GEOMETRY.x] ?? 0;
    const oy = rec.geometry[GEOMETRY.y] ?? 0;
    const expected = originPins.map((p) => `${p.x},${p.y}`).sort();
    const got = actual.map((p) => `${p.x - ox},${p.y - oy}`).sort();
    assert.deepEqual(got, expected, `${rec.code}: los bornes no coinciden con el origen`);
  }
});

test('la lámpara de señalización intermitente (9009) lleva el destello medido en docs/03', () => {
  const sym = resolveSymbol(9009, ['X1', 'X2']);
  assert.equal(sym.anchor, 'origin', 'el 9009 va anclado al origen');
  assert.deepEqual(sym.originPins, [
    { name: 'X1', x: 0, y: 0 },
    { name: 'X2', x: 0, y: 12 },
  ]);

  // Misma base que la lámpara CADe (círculo centrado en y=6, r=2,83, aspa y
  // conductores hasta las filas 0/12) más la marca de intermitencia medida
  // sobre docs/03/componentes01.png (S=4, OX=-17, OY=-101), a la derecha.
  const shapes = sym.shapes(12, 15);
  const ink = shapesBounds(shapes);
  assert.ok(near(ink.minX, -2.83) && near(ink.maxX, 7.25), `la 9009 mide ${ink.minX}..${ink.maxX} de ancho`);
  assert.ok(near(ink.minY, 0) && near(ink.maxY, 12), `la 9009 mide ${ink.minY}..${ink.maxY} de alto`);
  assert.ok(shapes.some((s) => s.d === 'M0 0L0 3.17'), 'falta el conductor superior de la lámpara');
  assert.ok(shapes.some((s) => s.d === 'M0 8.83L0 12'), 'falta el conductor inferior de la lámpara');
  assert.ok(shapes.some((s) => s.d === 'M6 5.25H6.75'), 'falta la barra superior del destello');
  assert.ok(shapes.some((s) => s.d === 'M6 5.25V6.5H5.5'), 'falta el trazo izquierdo del destello');
  assert.ok(shapes.some((s) => s.d === 'M6.75 5.25V6.5H7.25'), 'falta el trazo derecho del destello');
});

test('el rótulo del borne va a su derecha y el designador a la izquierda del símbolo', () => {
  assert.deepEqual(pinLabelAt({ x: 10, y: 20 }), { x: 11.2, y: 20.4 });
  assert.deepEqual(designatorAt({ x: 4, y: 6, w: 10, h: 12 }), { x: 2.8, y: 12 });
});

test('los símbolos que no se migraron siguen dibujándose en su caja', () => {
  // El anclaje al origen es opt-in: el resto del catálogo no se mueve.
  // El 2001, el 6007 y la 1051 ya migraron; la 3006 sigue en su caja.
  for (const code of [3006]) {
    const sym = resolveSymbol(code, []);
    assert.notEqual(sym.anchor, 'origin', `${code} no debería estar anclado todavía`);
  }
});


test('el contacto auxiliar NA-NC (7002) va anclado al origen con sus cuatro bornes', () => {
  const sym = resolveSymbol(7002, ['11', '13', '12', '14']);
  assert.equal(sym.anchor, 'origin', 'el 7002 migra a anclaje al origen');
  assert.deepEqual(sym.originPins, [
    { name: '11', x: 0, y: 0 },
    { name: '13', x: 9, y: 0 },
    { name: '12', x: 0, y: 12 },
    { name: '14', x: 9, y: 12 },
  ]);
});

test('el conmutador de dos posiciones (8018) va anclado al origen con sus cuatro bornes', () => {
  const sym = resolveSymbol(8018, ['95', '97', '96', '98']);
  assert.equal(sym.anchor, 'origin', 'el 8018 migra a anclaje al origen');
  assert.deepEqual(sym.originPins, [
    { name: '95', x: 0, y: 0 },
    { name: '97', x: 9, y: 0 },
    { name: '96', x: 0, y: 12 },
    { name: '98', x: 9, y: 12 },
  ]);
});


test('el fusible monofásico (5000) va anclado al origen', () => {
  const sym = resolveSymbol(5000, ['1', '2']);
  assert.equal(sym.anchor, 'origin');
  assert.deepEqual(sym.originPins, [
    { name: '1', x: -5.75, y: 0 },
    { name: '2', x: -5.75, y: 12 },
  ]);
  const sh = sym.shapes(6, 15);
  assert.ok(sh.some((x) => x.d === 'M-5.75 -6L-5.75 -0.25'), '5000 stem');
  // El ramal baja hasta la fila del borne 2 (12).
  assert.ok(sh.some((x) => x.d === 'M-5.75 9L-5.75 12'), '5000 lower');
});

test('el fusible II (5002) va anclado al origen', () => {
  const sym = resolveSymbol(5002, ['1', '3', '2', '4']);
  assert.equal(sym.anchor, 'origin');
  assert.deepEqual(sym.originPins, [
    { name: '1', x: -5.75, y: 0 },
    { name: '3', x: 0.25, y: 0 },
    { name: '2', x: -5.75, y: 12 },
    { name: '4', x: 0.25, y: 12 },
  ]);
  const sh = sym.shapes(12, 15);
  assert.ok(sh.some((x) => x.d === 'M-5.75 -6L-5.75 -0.25'), '5002 stem left');
  assert.ok(sh.some((x) => x.d === 'M0.25 -6L0.25 -0.25'), '5002 stem right');
  // Los dos ramales bajan hasta la fila de los bornes 2 y 4 (12).
  assert.ok(sh.some((x) => x.d === 'M-5.75 9L-5.75 12'), '5002 lower left');
  assert.ok(sh.some((x) => x.d === 'M0.25 9L0.25 12'), '5002 lower right');
});


test('el contacto del térmico (8017) va anclado al origen', () => {
  const sym = resolveSymbol(8017, ['95', '96']);
  assert.equal(sym.anchor, 'origin');
  assert.deepEqual(sym.originPins, [
    { name: '95', x: -5.75, y: 0 },
    { name: '96', x: -5.75, y: 12 },
  ]);
  const sh = sym.shapes(12, 15);
  // La tinta medida en la captura va corrida +12: los dos conductores llegan a
  // las filas 0 y 12, que son los bornes del archivo.
  assert.ok(sh.some((x) => x.d === 'M-5.75 0L-5.75 3.5'), 'upper stem');
  assert.ok(sh.some((x) => x.d === 'M-5.75 8.75L-5.75 12'), 'lower stem');
  const ink = shapesBounds(sh);
  assert.equal(ink.minY, 0, 'la tinta arranca en la fila del borne 95');
  assert.equal(ink.maxY, 12, 'la tinta termina en la fila del borne 96');
});

test('el relé térmico tripolar (6007) va anclado al origen', () => {
  const sym = resolveSymbol(6007, ['1', '3', '5', '2', '4', '6']);
  assert.equal(sym.anchor, 'origin');
  assert.deepEqual(sym.originPins, [
    { name: '1', x: 0, y: 0 },
    { name: '3', x: 6, y: 0 },
    { name: '5', x: 12, y: 0 },
    { name: '2', x: 0, y: 12 },
    { name: '4', x: 6, y: 12 },
    { name: '6', x: 12, y: 12 },
  ]);
  const sh = sym.shapes(21, 15);
  assert.equal(sh.length, 15, 'cinco trazos por polo');
  assert.equal(sh.filter((x) => x.fill).length, 3, 'un dado térmico relleno por polo');
  assert.ok(sh.some((x) => x.d === 'M0 0.05L0 3'), 'conductor superior');
  assert.ok(sh.some((x) => x.d === 'M12 9L12 12'), 'conductor inferior');
  const ink = shapesBounds(sh);
  assert.equal(ink.minY, 0.05);
  assert.equal(ink.maxY, 12);
});

test('la paleta del térmico (8017) es una hoja maciza, no catorce puntos', () => {
  const sym = resolveSymbol(8017, ['95', '96']);
  const sh = sym.shapes(12, 15);
  const blades = sh.filter((x) => x.blade);
  assert.equal(blades.length, 1, 'una sola hoja móvil con un pivote compartido');
  assert.equal(blades[0]!.fill, true, 'CADe dibuja la paleta como una cuña rellena');
  assert.equal(
    blades[0]!.d,
    'M-2.75 3L-3 3.25L-3.25 3.75L-3.5 4.25L-3.75 4.75L-4 5.25L-4.25 5.75L-4.5 6.25L-4.75 6.75L-5 7.25L-5.25 7.75L-5.5 8.25L-5.75 8.75L-5.75 9L-5.5 8.75L-5.25 8.25L-5 7.75L-4.75 7.25L-4.5 6.75L-4.25 6.25L-4 5.75L-3.75 5.25L-3.5 4.75L-3.25 4L-3 3.25L-2.75 3Z'
  );
  assert.ok(!sh.some((x) => x.d === 'M-2.75 3L-2.75 3'), 'ya no hay trazos de un solo píxel');
  const ink = shapesBounds(sh);
  assert.equal(ink.minY, 0);
  assert.equal(ink.maxY, 12);
});

test('el contacto auxiliar conmutado (7003) va anclado al origen', () => {
  const sym = resolveSymbol(7003, ['11', '12', '14']);
  assert.equal(sym.anchor, 'origin');
  assert.deepEqual(sym.originPins, [
    { name: '11', x: 3, y: 0 },
    { name: '12', x: 0, y: 12 },
    { name: '14', x: 6, y: 12 },
  ]);
  assert.deepEqual(sym.size, { w: 12, h: 15 });
  const shapes = sym.shapes(12, 15);
  assert.ok(shapes.some((s) => s.d === 'M3 0L3 3.25'));
  assert.ok(shapes.some((s) => s.d === 'M0 8.25L0 12'));
  assert.ok(shapes.some((s) => s.d === 'M6 8.25L6 12'));
});

test('el contacto final de carrera conmutado (8015) va anclado al origen', () => {
  const sym = resolveSymbol(8015, ['11', '12', '14']);
  assert.equal(sym.anchor, 'origin');
  assert.deepEqual(sym.originPins, [
    { name: '11', x: 3, y: 0 },
    { name: '12', x: 0, y: 12 },
    { name: '14', x: 6, y: 12 },
  ]);
  assert.deepEqual(sym.size, { w: 12, h: 15 });
  const shapes = sym.shapes(12, 15);
  assert.ok(shapes.some((s) => s.d === 'M3 0L3 3.25'));
  assert.ok(shapes.some((s) => s.d === 'M0 9L0 12'));
  assert.ok(shapes.some((s) => s.d === 'M6 9L6 12'));
});

test('el disyuntor II (6008) va anclado al origen', () => {
  const sym = resolveSymbol(6008, ['1', '3', '2', '4']);
  assert.equal(sym.anchor, 'origin');
  assert.deepEqual(sym.originPins, [
    { name: '1', x: 0, y: 0 },
    { name: '3', x: 6, y: 0 },
    { name: '2', x: 0, y: 21 },
    { name: '4', x: 6, y: 21 },
  ]);
  assert.deepEqual(sym.size, { w: 12, h: 24 });
  const shapes = sym.shapes(12, 24);
  assert.ok(shapes.some((s) => s.d === 'M0 0L0 3'));
  assert.ok(shapes.some((s) => s.d === 'M6 0L6 3'));
  assert.ok(shapes.some((s) => s.d === 'M-3 12H9V18H-3Z'));
});

test('las alimentaciones 3002,3003,3004,3005,3011 van ancladas al origen con terminales medidos', () => {
  const check = (code: number, cols: number[], w: number) => {
    const sym = resolveSymbol(code, []);
    assert.equal(sym.anchor, 'origin', `${code} anchor`);
    assert.deepEqual(sym.size, { w, h: 3 }, `${code} size`);
    const shapes = sym.shapes(w, 3);
    for (const c of cols) {
      assert.ok(shapes.some((s) => s.d === `M${c} -2L${c} -0.25`), `${code} stem ${c}`);
    }
    assert.equal(shapes.length, cols.length * 3, `${code} shapes`);
  };
  check(3002, [0], 6);
  check(3003, [0, 6], 12);
  check(3004, [0, 6, 12], 18);
  check(3005, [0, 6, 12], 24);
  check(3011, [0, 6, 12], 18);
});

test('los fusibles 5001 y 5003 van anclados al origen (comp02)', () => {
  const f1 = resolveSymbol(5001, []);
  assert.equal(f1.anchor, 'origin', '5001 anchor');
  assert.deepEqual(f1.originPins?.map((p) => [p.name, p.x, p.y]), [['1', -6, 0], ['3', 0, 0], ['2', -6, 12], ['4', 0, 12]]);
  const s1 = f1.shapes(12, 15);
  assert.ok(s1.some((s) => s.d === 'M-5.75 0L-5.75 12'), '5001 stem left');
  assert.ok(s1.some((s) => s.d === 'M0.25 0L0.25 12'), '5001 stem right');
  assert.equal(shapesBounds(s1).minY, 0, '5001 arranca en la fila 0');
  assert.equal(shapesBounds(s1).maxY, 12, '5001 termina en la fila 12');

  const f3 = resolveSymbol(5003, []);
  assert.equal(f3.anchor, 'origin', '5003 anchor');
  assert.deepEqual(f3.originPins?.map((p) => [p.name, p.x, p.y]), [['1', -6, 0], ['3', 0, 0], ['5', 6, 0], ['2', -6, 12], ['4', 0, 12], ['6', 6, 12]]);
  const s3 = f3.shapes(18, 15);
  assert.ok(s3.some((s) => s.d === 'M-5.75 0L-5.75 12'), '5003 stem left');
  assert.ok(s3.some((s) => s.d === 'M6.25 0L6.25 12'), '5003 stem right');
  assert.equal(shapesBounds(s3).minY, 0, '5003 arranca en la fila 0');
  assert.equal(shapesBounds(s3).maxY, 12, '5003 termina en la fila 12');
});


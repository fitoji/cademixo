import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSymbol } from '../src/symbols/library.ts';

/**
 * Geometría de la familia de protección, medida en CADeSimu.
 *
 * Criterio de aceptación:
 * - `data/samples/components_png/interruptor proteccion contra cortocircuitos
 *   monofasico.png` (el 6000) y `interruptor automatico de proteccion contra
 *   cortocircuitos y sobrecargas.png` (el 6003): cuchilla de tres unidades de
 *   recorrido horizontal y cuadro de disparo inclinado.
 * - `data/samples/tests01/test01.png` (el 6001): el cuadro va sólo en el primer
 *   polo.
 * - `data/samples/components_png/rele termico.png` (el 6007): conductores
 *   rectos, sin cuchilla.
 *
 * Las medidas están en unidades del archivo (6 px por unidad en la captura de
 * la hoja).
 */

const paths = (code: number, pins: string[] = [], w = 18, h = 15): string[] =>
  resolveSymbol(code, pins).shapes(w, h).map((s) => s.d);

test('los automáticos dibujan la cuchilla medida en CADeSimu', () => {
  // Cuchilla: de (x − 3, +3) a (x, +9). La conductora superior termina en
  // +2,9 y la inferior arranca en +9. El guion horizontal de 1,8 unidades
  // cruza el polo a +6.
  // El unipolar (6000) va anclado al origen, como los multipolares.
  for (const [code, poles] of [
    [6000, [0]],
    [6002, [0, 6]],
    [6003, [0, 6, 12]],
    [6004, [0, 6, 12]],
  ] as const) {
    const ds = paths(code, [], code === 6000 || code === 6002 ? 12 : 18);
    for (const x of poles) {
      assert.ok(ds.includes(`M${x - 3} 3L${x} 9`), `${code}: falta la cuchilla del polo ${x}`);
      assert.ok(ds.includes(`M${x} 0L${x} 2.9`), `${code}: falta la conductora superior del polo ${x}`);
      assert.ok(ds.includes(`M${x} 9L${x} 12`), `${code}: falta la conductora inferior del polo ${x}`);
    }
  }
});

test('el guion del automático va hacia el centro del aparato', () => {
  // En la captura de la hoja el del primer polo cruza el conductor (de −1,5 a
  // +0,3) y el del segundo queda a su izquierda (de −3,3 a −1,5): cada polo
  // lo lleva hacia el centro.
  const guion = (x: number, left: boolean): string =>
    left ? `M${x - 3.3} 6L${x - 1.5} 6` : `M${x - 1.5} 6L${x + 0.3} 6`;

  const ds6002 = paths(6002, [], 12);
  assert.ok(ds6002.includes(guion(0, false)), 'el 6002: el primer polo lleva el guion a la derecha');
  assert.ok(ds6002.includes(guion(6, true)), 'el 6002: el segundo polo lleva el guion a la izquierda');

  const ds6003 = paths(6003, [], 18);
  assert.ok(ds6003.includes(guion(0, false)), 'el 6003: el primer polo lleva el guion a la derecha');
  assert.ok(ds6003.includes(guion(12, true)), 'el 6003: el último polo lleva el guion a la izquierda');

  // El unipolar no tiene centro: el guion queda como estaba.
  assert.ok(paths(6000, [], 12).includes(guion(0, false)), 'el 6000: el guion no se mueve');
});

test('el cuadro de disparo va donde lo pone CADeSimu', () => {
  // El monofásico (6000) y el tripolar (6003) lo llevan en todos sus polos; el
  // bipolar (6001, medido en la captura de la hoja) sólo en el primero; el 6002
  // hereda la del bipolar y el 6004 la del tripolar.
  const filled = (code: number, w = 18): number =>
    resolveSymbol(code, []).shapes(w, 15).filter((s) => s.fill).length;
  assert.equal(filled(6000, 12), 1, 'el monofásico lleva el cuadro en su único polo');
  assert.equal(filled(6002, 12), 1, 'el bipolar lleva el cuadro en el primer polo');
  assert.equal(filled(6003, 18), 3, 'el tripolar lleva el cuadro en los tres polos');
  assert.equal(filled(6004, 18), 3, 'el 6004 hereda la del tripolar');
});

test('las siete protecciones de la fábrica CADeSimu llevan cuchilla con metadato (S2)', () => {
  // Los códigos que dibujan sus polos con `cadesimuPole`: seis por
  // `protectionDevice({ cadesimu: true })` —6000, 6002, 6003, 6004, 6006 y
  // 6009— y el 6001, que va por `cadesimuBreaker`. Antes la diagonal se emitía
  // sin `blade`, así que `bladeTransform` devolvía `null` y ningún estado podía
  // girarla; el 6007 queda afuera porque sus conductores son rectos.
  const codes = [6000, 6001, 6002, 6003, 6004, 6006, 6009] as const;
  let blades = 0;
  let squares = 0;
  for (const [code, poles, w, h] of [
    [6000, 1, 12, 15],
    [6001, 2, 12, 15],
    [6002, 2, 12, 15],
    [6003, 3, 18, 15],
    [6004, 3, 18, 15],
    [6006, 3, 18, 15],
    [6009, 3, 18, 24],
  ] as const) {
    // Las cuchillas son trazos; los cuadros de disparo son polígonos rellenos
    // montados sobre la cuchilla, que giran con ella (reporte del usuario sobre
    // el 6003: los cuadrados no se movían al cerrar).
    const withBlade = resolveSymbol(code, [])
      .shapes(w, h)
      .filter((s) => s.blade);
    const movable = withBlade.filter((s) => !s.fill);
    const squaresOfCode = withBlade.filter((s) => s.fill);
    assert.equal(movable.length, poles, `el ${code}: una cuchilla por polo`);
    assert.ok(
      squaresOfCode.length === 0 || squaresOfCode.length === 1 || squaresOfCode.length === poles,
      `el ${code}: cuadro de disparo en ningún polo, en uno o en todos, no en ${squaresOfCode.length}`,
    );
    for (const square of squaresOfCode) {
      // Cada cuadro se mueve con la cuchilla de SU polo, no con la primera.
      const suya = movable.find((b) => b.blade!.px === square.blade!.px);
      assert.ok(suya, `el ${code}: el cuadro en x=${square.blade!.px} tiene su polo`);
      assert.deepEqual(
        { px: square.blade!.px, py: square.blade!.py, deg: square.blade!.deg },
        { px: suya!.blade!.px, py: suya!.blade!.py, deg: suya!.blade!.deg },
        `el ${code}: el cuadro del polo ${square.blade!.px} gira con su cuchilla`,
      );
      squares += 1;
    }
    for (const blade of movable) {
      const m = /M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/.exec(blade.d)!;
      // El pivote va en el extremo inferior de la diagonal, sobre el polo.
      assert.equal(Number(m[3]), blade.blade!.px, `el ${code}: el pivote va en la columna del polo`);
      assert.equal(Number(m[4]), blade.blade!.py, `el ${code}: el pivote va en la fila 9`);
      assert.ok(blade.blade!.deg > 0, `el ${code}: la cuchilla cierra girando a la vertical`);
    }
    blades += movable.length;
  }
  assert.equal(blades, 17, `cuchillas con metadato en los ${codes.length} códigos de la fábrica`);
  assert.ok(squares > 0, 'los cuadros de disparo también llevan metadato y se mueven');
});

test('el relé térmico (6007) es el cuerpo rectangular de la captura real', () => {
  const ds = paths(6007, [], 21);
  // CADe lo dibuja como un rectángulo con tres elementos escalonados dentro,
  // NO como un automático III (cuchillas + cuadros de disparo). La captura
  // limpia está en docs/cadesimu-svg/reference/cade-6007-vs-6003.png.
  assert.ok(ds.includes('M-1.5 3H13.5V9H-1.5Z'), 'falta el cuerpo rectangular');
  for (const x of [0, 6, 12]) {
    assert.ok(ds.includes(`M${x} 0L${x} 12`), `falta el conductor del polo ${x}`);
    assert.ok(ds.includes(`M${x} 4L${x + 2.75} 4`), `falta el escalón alto del polo ${x}`);
    assert.ok(ds.includes(`M${x + 2.75} 4L${x + 2.75} 7`), `falta el escalón vertical del polo ${x}`);
    assert.ok(ds.includes(`M${x + 2.75} 7L${x} 7`), `falta el escalón bajo del polo ${x}`);
  }
  assert.equal(resolveSymbol(6007, []).shapes(21, 15).filter((s) => s.fill).length, 0, 'sin cuadros rellenos');
});

test('el automático IN sigue anclado al origen con el cuadro sólo en el primer polo', () => {
  const sym = resolveSymbol(6001, ['1', '3', '2', '4']);
  assert.equal(sym.anchor, 'origin');
  const ds = sym.shapes(12, 15).map((s) => s.d);
  assert.ok(ds.includes('M-3 3L0 9'), 'falta la cuchilla del primer polo');
  assert.ok(ds.includes('M3 3L6 9'), 'falta la cuchilla del segundo polo');
  // El guion del segundo polo va hacia el centro del aparato.
  assert.ok(ds.includes('M-1.5 6L0.3 6'), 'falta el guion del primer polo');
  assert.ok(ds.includes('M2.7 6L4.5 6'), 'falta el guion del segundo polo');
  assert.equal(sym.shapes(12, 15).filter((s) => s.fill).length, 1);
});

test('el unipolar de la familia se dibuja en el origen, no en el centro de la caja', () => {
  // En el archivo el primer borne está en el origen del registro: el polo va
  // en el borde izquierdo de la caja, como el primer polo de los multipolares.
  // 6010 salió de la familia: se midió contra `componentes01` y quedó anclado
  // al origen en `library.ts` (ver `symbol-anchors.test.ts`).
  for (const code of [6000, 6017, 5005, 6019, 6020]) {
    const sym = resolveSymbol(code, []);
    assert.ok(sym.size, `${code} debe declarar caja`);
    const { w, h } = sym.size;
    assert.equal(sym.pins[0]!.nx * w, 0, `${code}: el primer borne está en x=0`);
    assert.equal(sym.pins[1]!.nx * w, 0, `${code}: el segundo borne está en x=0`);
    const ds = sym.shapes(w, h).map((s) => s.d);
    assert.ok(
      ds.some((d) => d.startsWith('M0 0L0 ')),
      `${code}: el polo no se dibuja en el origen`,
    );
  }
});

test('el fusible se dibuja vertical, con el cuerpo alrededor del conductor', () => {
  // `docs/03/componentes02` (registro 15,57, S=4 OX=-2 OY=-60, gate stray=0):
  // cuerpo superior y conductor medidos; mecanismo inferior refOnly.
  const sym = resolveSymbol(5000, []);
  assert.ok(sym.size);
  const { w, h } = sym.size;
  assert.deepEqual(sym.pins.map((p) => p.name), ['1', '2']);
  assert.deepEqual(sym.originPins, [
    { name: '1', x: -5.75, y: 0 },
    { name: '2', x: -5.75, y: 12 },
  ]);
  const ds = sym.shapes(w, h).map((s) => s.d);
  assert.ok(ds.includes('M-7.25 -9L-7.25 -3'), 'falta pata izquierda del cuerpo');
  assert.ok(ds.includes('M-5.75 -9L-5.75 -0.25'), 'falta conductor superior');
  assert.ok(ds.includes('M-7.25 -9L-4.75 -9'), 'falta la tapa del cuerpo');
  assert.ok(ds.includes('M-5.75 9L-5.75 12'), 'falta conductor inferior');
});

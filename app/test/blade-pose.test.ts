import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bladeAngle, bladeTransform } from '../src/symbols/draw.ts';
import { resolveSymbol, type Shape } from '../src/symbols/library.ts';

/**
 * Pose de la cuchilla móvil de un símbolo (S9).
 *
 * La rotación vive en `draw.ts` como función pura, así se puede probar sin DOM:
 * el lienzo sólo aplica el ángulo sobre el pivote. `deg` lleva signo y es a la
 * vez la convención de disparo de los contactos: positivo cierra la hoja
 * dibujada abierta (NA) y negativo abre la dibujada apoyada (NC).
 */

const near = (a: number, b: number, eps = 0.01): boolean => Math.abs(a - b) < eps;

const bladesOf = (code: number, pins: string[] = [], w = 18, h = 15): Shape[] => {
  const raw = resolveSymbol(code, pins).shapes(w, h).filter((s) => s.blade);
  assert.ok(raw.length > 0, `el ${code} debe llevar cuchilla móvil`);
  return raw;
};

const endsOf = (shape: Shape): { from: [number, number]; to: [number, number] } => {
  const m = /M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/.exec(shape.d);
  assert.ok(m, `la cuchilla no es un trazo simple: ${shape.d}`);
  return { from: [Number(m[1]), Number(m[2])], to: [Number(m[3]), Number(m[4])] };
};

/** Gira un punto alrededor del pivote, con el signo que usa el lienzo. */
const rotate = (x: number, y: number, px: number, py: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  const dx = x - px;
  const dy = y - py;
  return [px + dx * Math.cos(a) - dy * Math.sin(a), py + dx * Math.sin(a) + dy * Math.cos(a)];
};

test('en reposo la hoja se queda como está dibujada', () => {
  // El NA se dibuja abierto y el NC apoyado: ninguno gira mientras no cambia.
  assert.equal(bladeAngle({ deg: 17.1 }, { closed: false }), 0);
  assert.equal(bladeAngle({ deg: -17.1 }, { closed: true }), 0);
});

test('cerrado y abierto mueven la hoja: el NA cierra y el NC abre', () => {
  assert.equal(bladeAngle({ deg: 17.1 }, { closed: true }), 17.1);
  assert.equal(bladeAngle({ deg: -17.1 }, { closed: false }), -17.1);
});

test('el conmutador (8018) gira una cuchilla cuando la otra no, y al revés', () => {
  const blades = bladesOf(8018, ['95', '97', '96', '98'], 15, 15);
  assert.equal(blades.length, 2, 'dos cuchillas, una por contacto');

  const moved = (closed: boolean): boolean[] =>
    blades.map((s) => bladeAngle(s.blade!, { closed }) !== 0);

  // Las dos hojas se dibujan abiertas en la lambda y nunca giran juntas: la de
  // `deg` positivo (97-98) se apoya al cerrar y la negativa (95-96) al abrir.
  assert.deepEqual(moved(true), [false, true], 'cerrado: gira la hoja de 97-98');
  assert.deepEqual(moved(false), [true, false], 'abierto: gira la hoja de 95-96');
});

test('el pulsador conmutado (8003) lleva la punta del tiro NC al NO al accionarlo', () => {
  const [blade] = bladesOf(8003, ['11', '12', '14']);
  const { from, to } = endsOf(blade);
  // El pivote está en la columna del común, en la fila 3 de la tinta (el común
  // es el borne (3,0)): la cuchilla está dibujada apoyada en el NC.
  assert.deepEqual(from, [3, 3], 'el pivote va en la columna del común (3,3)');
  assert.ok(near(blade.blade!.px, 3) && near(blade.blade!.py, 3), 'el pivote declarado es el del común');
  assert.ok(near(to[0], 0.5) && near(to[1], 9), `en reposo apoya en el NC: ${to}`);

  const rest = { closed: false, pressed: false };
  const pressed = { closed: false, pressed: true };
  assert.equal(bladeAngle(blade.blade!, rest), 0, 'en reposo no gira: el dibujo ya es la pose NC');

  const [tx, ty] = rotate(to[0], to[1], 3, 3, bladeAngle(blade.blade!, pressed));
  // Espejo del NC respecto del común: la punta cae sobre el tiro NO.
  assert.ok(near(tx, 5.5) && near(ty, 9), `accionado apaga en el NO: (${tx},${ty})`);

  // Cerrado también lo acciona: es un pulsador conmutado, no un contacto más.
  assert.equal(
    bladeAngle(blade.blade!, { closed: true }),
    bladeAngle(blade.blade!, pressed),
    'la pose del 8003 sigue al aparato accionado, no sólo al contacto cerrado',
  );
});

test('el auxiliar NC del térmico (8017) abre su cuchilla al abrir el contacto', () => {
  const blades = bladesOf(8017, ['95', '96'], 12, 15);

  // La paleta es una cuchilla fina: un solo trazo diagonal con metadata
  // `blade` que gira sobre el pivote (S4). Los catorce pares de puntos
  // medidos seguían la diagonal, no los bordes de un sólido.
  assert.equal(blades.length, 1, 'la paleta móvil es un solo trazo');
  const [first] = blades;
  assert.equal(first!.fill, undefined, 'la paleta es trazo, no relleno');
  assert.ok(near(first!.blade!.px, -3.25) && near(first!.blade!.py, 3.75), 'el pivote va en el extremo de la barra fija');

  assert.equal(bladeAngle(first.blade!, { closed: true }), 0, 'cerrado se dibuja como está');
  assert.ok(bladeAngle(first.blade!, { closed: false }) < -20, 'abierto gira y se separa del conductor');

  assert.equal(blades.filter((s) => s.thin).length, 0, 'la paleta conserva el peso calibrado');
  assert.equal(first!.d, 'M-2.75 3L-5.75 9', 'la cuchilla sigue la diagonal medida');

  // La barra fija no acompaña el giro: no lleva metadata.
  const fixed = resolveSymbol(8017, ['95', '96']).shapes(12, 15).filter((s) => !s.blade);
  assert.ok(
    fixed.some((s) => s.d === 'M-5.75 3.5L-2.5 3.5'),
    'la barra fija del contacto se queda quieta',
  );
});

test('el guardamotor (6007) conserva los conductores rectos de la captura', () => {
  // Decisión de fidelidad: `rele termico.png` dibuja conductores rectos, así que
  // el 6007 NO lleva cuchilla. Su segunda pose se lee por la atenuación de
  // `[data-protection][data-state='open']` (S6/S7), no por rotación.
  const shapes = resolveSymbol(6007, []).shapes(21, 15);
  assert.equal(shapes.filter((s) => s.blade).length, 0, 'el térmico no inventa cuchilla');
});

test('el pivote de la rotación sale de la caja de tinta del trazo', () => {
  // La hoja del 8018 va de (0,9) a (2.5,3.75) y pivota en (0,9), que es la
  // esquina inferior izquierda de su envolvente.
  const blades = bladesOf(8018, ['95', '97', '96', '98'], 15, 15);
  const nc = blades.find((s) => s.blade!.deg < 0)!;
  const rest = bladeTransform(nc, { closed: true });
  assert.ok(rest !== null, 'la hoja tiene rotación');
  assert.ok(near(rest!.originX, 0), `origen X en %: ${rest!.originX}`);
  assert.ok(near(rest!.originY, 100), `origen Y en %: ${rest!.originY}`);
  assert.equal(rest!.angle, 0, 'en reposo no gira');

  const open = bladeTransform(nc, { closed: false })!;
  assert.ok(near(open.angle, -17.1), `giro del NC abierto: ${open.angle}`);

  // Una forma sin `blade` no tiene rotación: el lienzo la deja quieta.
  assert.equal(bladeTransform({ d: 'M0 0L10 10' }, { closed: false }), null);
});

/**
 * Giro que deja vertical la cuchilla del polo CADeSimu: la diagonal dibujada va
 * del pivote (x, 9) a la punta (x − 3, 3), así que forma `atan(3/6)` con la
 * vertical. Es el mismo número que declara `cadesimuPole`.
 */
const CADESIMU_BLADE_DEG = 26.57;

test('las protecciones de la fábrica CADeSimu giran su cuchilla al cerrar (S2)', () => {
  // 6009 (tripolar, caja 18×24) y 6002 (bipolar, caja 12×15): sus polos salen de
  // `cadesimuPole`, que hasta ahora emitía la diagonal sin metadato `blade` y
  // por eso el lienzo no podía girarla en ningún estado.
  for (const [code, w, h, poles] of [
    [6009, 18, 24, 3],
    [6002, 12, 15, 2],
  ] as const) {
    // Las cuchillas son trazos; los cuadros de disparo son polígonos rellenos
    // que van montados sobre ellas y giran con ellas (mismo pivote y giro).
    const all = bladesOf(code, [], w, h);
    const blades = all.filter((s) => !s.fill);
    const squares = all.filter((s) => s.fill);
    assert.equal(blades.length, poles, `el ${code} lleva una cuchilla por polo`);
    // El cuadro de disparo va en un polo (`tripSquare: 'first'`) o en todos
    // (`'all'`), nunca en una cantidad distinta.
    assert.ok(
      squares.length === 0 || squares.length === 1 || squares.length === poles,
      `el ${code} lleva cuadro en ningún polo, en uno o en todos, no en ${squares.length}`,
    );

    const rest = { closed: false, pressed: false } as const;
    const closed = { closed: true, pressed: false } as const;

    for (const shape of blades) {
      const { from, to } = endsOf(shape);
      const { px, py, deg } = shape.blade!;
      // El pivote es el extremo inferior de la cuchilla, sobre su conductor.
      assert.ok(near(to[0], px) && near(to[1], py), `el pivote del ${code} va en ${to}, no en (${px},${py})`);
      // El ángulo es el que hay entre la diagonal y la vertical, no un estimado.
      assert.ok(near(deg, CADESIMU_BLADE_DEG, 0.01), `giro del ${code}: ${deg}`);
      // En reposo la pose es exactamente la dibujada: la de la captura.
      assert.equal(bladeAngle(shape.blade!, rest), 0, `el ${code} no gira en reposo`);
      // Reportado: "el 6003 tiene cuchillas y unos cuadrados negros que deberían
      // moverse al cerrar y no lo hacen". Cada cuadro comparte pivote y giro con
      // su cuchilla, así que se mueve con ella en vez de quedar clavado.
      for (const square of squares.filter((s) => s.blade!.px === px)) {
        assert.deepEqual(square.blade, shape.blade, `el cuadro del ${code} gira con su cuchilla`);
        assert.ok(bladeAngle(square.blade!, closed) > 0, `el cuadro del ${code} se mueve al cerrar`);
      }

      const angle = bladeAngle(shape.blade!, closed);
      assert.equal(angle, deg, `el ${code} aplica su giro al cerrar`);
      const [tx, ty] = rotate(from[0], from[1], px, py, angle);
      assert.ok(near(tx, px, 0.01), `cerrada, la punta del ${code} queda vertical en x=${tx} (pivote x=${px})`);
      // La cuchilla mide √45 y gira rígida: la punta sube hasta y ≈ 2,29, por
      // encima del extremo de la conductora superior (2,9), así que la cierra.
      assert.ok(ty < 2.9, `cerrada, la punta del ${code} llega a y=${ty}`);
    }
  }
});

test('el pulsador NA (8000) muestra la pulsación aunque la rama no conduzca (S3)', () => {
  const [blade] = bladesOf(8000, ['13', '14'], 9, 15);
  const deg = blade.blade!.deg;
  // La paleta del pulsador sigue al aparato accionado (`when: 'active'`), no al
  // cierre eléctrico: apretarlo ya la gira aunque el circuito no esté armado.
  assert.equal(bladeAngle(blade.blade!, { closed: false, pressed: false }), 0, 'en reposo se queda como está');
  assert.equal(bladeAngle(blade.blade!, { closed: false, pressed: true }), deg, 'sólo apretado ya gira');
  assert.equal(bladeAngle(blade.blade!, { closed: true, pressed: false }), deg, 'cerrado también gira');
  assert.equal(bladeAngle(blade.blade!, { closed: true, pressed: true }), deg, 'cerrado y apretado dan la misma pose');
});

test('8003 y 8017 estrenan cuchilla con metadata', () => {
  for (const [code, pins] of [
    [8003, ['11', '12', '14']],
    [8017, ['95', '96']],
  ] as const) {
    const shapes = resolveSymbol(code, [...pins]).shapes(12, 15);
    assert.ok(
      shapes.some((s) => s.blade),
      `el ${code} debe llevar al menos una forma con metadata \`blade\``,
    );
  }
});

test('el contacto de potencia (2001) muestra el cierre en sus tres polos', () => {
  // Reporte del usuario: el 7000 cerraba el 2001 eléctricamente pero no se veía
  // el cierre. La diagonal se dibujaba sin metadato `blade`, así que no había
  // rotación posible; ahora cada polo pivota en su borne inferior y cierra
  // vertical, con el mismo ángulo que el polo de CADeSimu.
  const blades = bladesOf(2001, ['1', '3', '5', '2', '4', '6'], 18, 15);
  assert.equal(blades.length, 3, 'tres polos, tres cuchillas');
  for (const [i, p] of [0, 6, 12].entries()) {
    const blade = blades.find((s) => s.blade!.px === p);
    assert.ok(blade, `falta la cuchilla del polo ${p}`);
    assert.equal(blade!.blade!.py, 9, `el polo ${i} pivota en su borne inferior`);
    assert.equal(bladeAngle(blade!.blade!, { closed: false }), 0, `el polo ${i} en reposo se dibuja abierto`);
    assert.ok(bladeAngle(blade!.blade!, { closed: true }) > 20, `el polo ${i} cierra al conducir`);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, '..', 'src', 'ui');
const CSS = readFileSync(join(UI, 'diagram.css'), 'utf8');
const CANVAS = readFileSync(join(UI, 'Canvas.tsx'), 'utf8');

/**
 * Primera regla cuyo selector contiene todos los fragmentos pedidos y cuyo
 * cuerpo contiene todos los del segundo arreglo. Se compara por fragmentos y no
 * por selector exacto para que el test no se rompa cuando la regla suma un
 * guardia más adelante.
 */
function rule(selectorParts: string[], bodyParts: string[] = []): { selector: string; body: string } | null {
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1]!.trim();
    const body = m[2]!;
    if (selectorParts.every((p) => selector.includes(p)) && bodyParts.every((p) => body.includes(p))) {
      return { selector, body };
    }
  }
  return null;
}

/**
 * Pedido: el lienzo no respondía al puntero. Sin recuadro de componente, la
 * única pista de que un símbolo era clickeable era el cursor de arrastre. El
 * hover ahora suma un halo tenue y una tinta un poco más gruesa.
 *
 * El grosor de reposo no puede moverse: la variable que habilita el hover tiene
 * que caer en el mismo valor que antes estaba escrito a mano.
 */
test('el grosor de reposo de la tinta no cambia', () => {
  const normal = rule(['.sym path'], ['var(--sym-stroke-w, 0.26)']);
  assert.ok(normal, 'el trazo normal toma su grosor de --sym-stroke-w con 0,26 de reposo');

  const fino = rule(['.sym path.thin'], ['var(--sym-thin-w, 0.17)']);
  assert.ok(fino, 'el trazo fino toma su grosor de --sym-thin-w con 0,17 de reposo');
});

/**
 * El halo y el grosor se aplican sobre el grupo del componente, no sobre los
 * trazos sueltos, así que alcanzan también a los bornes y a los textos.
 */
test('el hover señala el componente entero', () => {
  const hover = rule(['.canvas', ':has(.sym)', ':hover']);
  assert.ok(hover, 'falta la regla de hover');

  assert.ok(hover!.selector.includes('[data-id]'), 'el hover cuelga del grupo del registro');
  assert.ok(hover!.body.includes('drop-shadow('), `el halo es una sombra suave: ${hover!.body}`);
  assert.ok(hover!.body.includes('var(--select)'), `el halo usa el color de acento del tema: ${hover!.body}`);
  assert.ok(hover!.body.includes('--sym-stroke-w:'), 'el hover engorda la tinta del símbolo');
});

/**
 * El halo no puede tapar lo que ya está diciendo algo: la selección, el halo de
 * activo de la simulación y el de disparo. Y no aparece durante un gesto
 * —colocar, arrastrar el lienzo o trazar un cable— donde el puntero elige un
 * punto y no un objeto.
 */
test('el hover se retira ante la selección, los estados y los gestos', () => {
  const hover = rule(['.canvas', ':has(.sym)', ':hover']);
  assert.ok(hover, 'falta la regla de hover');

  for (const guardia of ['not([data-sel])', "not([data-state='active'])", "not([data-state='tripped'])"]) {
    assert.ok(hover!.selector.includes(guardia), `falta el guardia :${guardia}`);
  }
  for (const modo of ['.placing', '.panning', '.wiring']) {
    assert.ok(hover!.selector.includes(`:not(${modo})`), `falta el apagado en modo ${modo}`);
  }

  // El lienzo declara los tres modos que apagan el hover.
  assert.ok(CANVAS.includes("'placing' | 'panning' | 'wiring'"), 'el lienzo declara los modos del puntero');
  assert.ok(CANVAS.includes("wireStart !== null ? 'wiring'"), 'trazar un cable apaga el hover');
});

/**
 * El cable también lleva `data-id`: sin acotar el hover a los grupos que dibujan
 * un símbolo, el halo y la herencia del grosor le caerían encima.
 */
test('el cable no hereda el hover del componente', () => {
  const hover = rule(['.canvas', ':has(.sym)', ':hover']);
  assert.ok(hover!.selector.includes(':has(.sym)'), 'el hover exige que el grupo contenga un símbolo');
  assert.ok(CANVAS.includes('data-wire='), 'el cable se marca con data-wire: comparte `data-id` con el componente');
});

/**
 * Reporte: algunos componentes no tenían buena señalización de selección.
 * El contorno pasaba a acento, pero el área maciza seguía en tinta, los bornes
 * del glifo conservaban su relleno de reposo y el designador con los rótulos de
 * borne no cambiaban en absoluto.
 */
test('selección: el relleno macizo también se señala', () => {
  const relleno = rule(['.sym.sel path.fill'], ['fill: var(--select)']);
  assert.ok(relleno, 'el área maciza del símbolo seleccionado pasa a acento');
});

test('selección: los bornes del glifo cambian enteros', () => {
  const borne = rule(['.sym.sel .pin'], ['fill: var(--pin-sel-fill)', 'stroke: var(--pin-sel-stroke)']);
  assert.ok(borne, 'el borne del glifo se llena y se contornea como el borne externo');
});

test('selección: el designador y los rótulos de borne se señalan', () => {
  const textos = rule(['[data-sel] .designator', '[data-sel] .pinlabel'], ['fill: var(--select)']);
  assert.ok(textos, 'los textos del componente seleccionado pasan a acento');

  // Los textos viven fuera del glifo: la marca de selección va en el grupo.
  assert.ok(CANVAS.includes('data-sel={selected || undefined}'), 'el grupo del componente declara data-sel');
});

test('selección: el símbolo engorda como el cable seleccionado', () => {
  const sel = rule(['.sym.sel'], ['--sym-stroke-w:', '--sym-thin-w:']);
  assert.ok(sel, 'el símbolo seleccionado declara el grosor por variable, para su tinta y la fina');
});

/**
 * La lámpara encendida se llena con el color de su luz: la selección no puede
 * taparlo, y el estado manda sobre el acento.
 */
test('la selección no tapa el relleno de la lámpara encendida', () => {
  const lampara = /\[data-state='active'\]\s+\.sym\[data-lamp\]\s+path\.lamp:not\(\.thin\)\s*\{([^}]*)\}/.exec(CSS);
  assert.ok(lampara, 'falta el relleno del vidrio de la lámpara encendida');
  assert.ok(lampara![1]!.includes('fill: var(--lamp)'), `el vidrio conserva su color: ${lampara![1]}`);

  assert.equal(rule(['.sym.sel path.lamp']), null, 'la selección no fija relleno sobre el vidrio de la lámpara');
});

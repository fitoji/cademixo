/**
 * Atajos globales: qué teclas se registran en el registro compartido de ui-sdk y
 * a quién le pertenece una tecla cuando el foco no está escribiendo.
 *
 * La decisión de la tecla (modificadores exactos, autorepetición, capas) la toma
 * la librería y la cubre el e2e; acá se prueban las dos guardas propias, sin DOM:
 * el `target` entra como un objeto con `closest` o con las propiedades que se
 * miran, así que se prueba la regla y no el navegador.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SPACE_OWNER_SELECTOR,
  isTypingTarget,
  ownsSpaceKey,
  useShortcut,
  useShortcutHint,
} from '../src/ui/shortcuts.ts';

// --- La puerta ------------------------------------------------------------

test('la puerta expone el registro y los hints de ui-sdk', () => {
  assert.equal(typeof useShortcut, 'function');
  assert.equal(typeof useShortcutHint, 'function');
});

// --- De quién es la barra espaciadora -------------------------------------

/** Un `target` de mentira: dice si se reconoce en el selector que le pasan. */
const target = (owned: boolean, seen: string[]) =>
  ({
    closest(selector: string) {
      seen.push(selector);
      return owned ? {} : null;
    },
  }) as unknown as Pick<Element, 'closest'>;

test('un control con foco se queda con la barra espaciadora', () => {
  const seen: string[] = [];
  assert.equal(ownsSpaceKey(target(true, seen)), true);
  assert.deepEqual(seen, [SPACE_OWNER_SELECTOR]);
});

test('el lienzo o el cuerpo no se quedan con la tecla', () => {
  const seen: string[] = [];
  assert.equal(ownsSpaceKey(target(false, seen)), false);
  assert.deepEqual(seen, [SPACE_OWNER_SELECTOR]);
});

test('un target sin closest no posee la tecla', () => {
  assert.equal(ownsSpaceKey(null), false);
  assert.equal(ownsSpaceKey({} as Pick<Element, 'closest'>), false);
});

test('el selector cubre los controles que usan la barra espaciadora', () => {
  // Se compara por partes para que el orden pueda cambiar sin romper el test.
  const parts = SPACE_OWNER_SELECTOR.split(',').map((part) => part.trim());
  for (const control of [
    'button',
    'input',
    'textarea',
    'select',
    'summary',
    'a[href]',
    '[contenteditable]',
    '[role="alertdialog"]',
    '[role="button"]',
    '[role="checkbox"]',
    '[role="dialog"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="switch"]',
    '[role="tab"]',
  ]) {
    assert.ok(parts.includes(control), control);
  }
  // El lienzo tiene `tabindex` pero no es dueño de la tecla: si el selector
  // incluyera `[tabindex]`, el atajo no funcionaría con el foco en el esquema.
  assert.equal(parts.includes('[tabindex]'), false);
});

// --- Dónde se escriben las letras ----------------------------------------

/** Un nodo de mentira con lo que `isTypingTarget` mira. */
const node = (tagName: string, extra: Record<string, unknown> = {}) =>
  ({ tagName, isContentEditable: false, ...extra }) as unknown as EventTarget;

test('los campos donde se escribe se quedan con las letras', () => {
  assert.equal(isTypingTarget(node('INPUT', { type: 'text' })), true);
  assert.equal(isTypingTarget(node('INPUT', { type: 'number' })), true);
  assert.equal(isTypingTarget(node('INPUT', { type: 'search' })), true);
  // Un input sin `type` explícito es de texto: es el default del DOM.
  assert.equal(isTypingTarget(node('INPUT')), true);
  assert.equal(isTypingTarget(node('TEXTAREA')), true);
  assert.equal(isTypingTarget(node('SELECT')), true);
  assert.equal(isTypingTarget(node('DIV', { isContentEditable: true })), true);
});

test('un control que no se escribe no se queda con las letras', () => {
  assert.equal(isTypingTarget(node('INPUT', { type: 'checkbox' })), false);
  assert.equal(isTypingTarget(node('INPUT', { type: 'range' })), false);
  assert.equal(isTypingTarget(node('INPUT', { type: 'button' })), false);
  assert.equal(isTypingTarget(node('BUTTON')), false);
  assert.equal(isTypingTarget(node('DIV')), false);
  assert.equal(isTypingTarget(node('svg')), false);
});

test('sin foco reconocible nadie está escribiendo', () => {
  assert.equal(isTypingTarget(null), false);
  // `document` o `window` no tienen `tagName`.
  assert.equal(isTypingTarget({} as EventTarget), false);
});

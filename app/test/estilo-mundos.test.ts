/**
 * Modo moderno: dos mundos visuales sobre el mismo esquema.
 *
 * El mundo de Codia vive entero bajo `:root.moderno` / `.dark.moderno`. Fuera de
 * esos selectores sólo se suma el token de lo que flota sobre el lienzo
 * (`--elev-float`). Si un color, un radio o una elevación del clásico se mueve,
 * el test lo dice con el selector en la mano: el clásico es el look de CADe_SIMU
 * y no se negocia.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, '..', 'src', 'index.css'), 'utf8');

/**
 * Cuerpo del primer bloque `selector { … }` del archivo. Asume que el bloque no
 * anida llaves, que es cierto para los cuatro bloques de tokens.
 */
function block(selector: string): string {
  const at = CSS.indexOf(`\n${selector} {`);
  assert.notEqual(at, -1, `falta el bloque ${selector}`);
  const open = CSS.indexOf('{', at);
  const close = CSS.indexOf('\n}', open);
  assert.notEqual(close, -1, `bloque sin cerrar: ${selector}`);
  return CSS.slice(open + 1, close);
}

test('el clásico conserva el mundo plano de obra', () => {
  const day = block(':root');
  for (const [name, value] of Object.entries({
    '--radius': '0.4375rem',
    '--background': '#f6f8fb',
    '--wire': '#0f9d63',
    '--warn': '#b97d05',
    '--ink': '#3d4a5c',
    '--grid-minor': '#e3e9f1',
    '--grid-major': '#cfd8e4',
    '--elev-down': '0 1px 2px rgb(22 32 44 / 0.06), 0 3px 8px rgb(22 32 44 / 0.05)',
  })) {
    assert.ok(day.includes(`${name}: ${value};`), `${name} del clásico de día cambió`);
  }

  const night = block('.dark');
  for (const [name, value] of Object.entries({
    '--background': '#0e1116',
    '--card': '#14181f',
    '--wire': '#3fbf8f',
    '--warn': '#f0b429',
    '--ink': '#93a7c2',
  })) {
    assert.ok(night.includes(`${name}: ${value};`), `${name} del clásico nocturno cambió`);
  }
});

test('el moderno adopta los charcos, el borde al 7% y el radio de 8px', () => {
  const day = block(':root.moderno');
  const night = block('.dark.moderno');

  assert.ok(day.includes('--radius: 0.5rem;'), 'el radio de control del moderno es 8px');
  assert.ok(day.includes("--font-ui: 'DM Sans Variable'"), 'la interfaz del moderno es DM Sans');

  assert.ok(night.includes('--background: #18181b;'), 'falta la superficie del fondo');
  assert.ok(night.includes('--card: #242429;'), 'falta la superficie del panel');
  assert.ok(night.includes('--secondary: #333338;'), 'falta la superficie de control');
  assert.ok(night.includes('--border: rgb(255 255 255 / 0.07);'), 'el borde nocturno no es blanco al 7%');

  // La jerarquía la hace el borde: el chrome del moderno no lleva sombra.
  for (const side of ['down', 'up', 'right', 'left']) {
    assert.ok(night.includes(`--elev-${side}: none;`), `el chrome nocturno conserva la sombra ${side}`);
  }
  assert.match(night, /--elev-float: 0 2px 6px/, 'lo que flota sobre el lienzo conserva su sombra');
});

test('la tinta del dibujo no depende del mundo visual', () => {
  // `--wire`, `--warn` y `--ink` sólo se declaran en los bloques del clásico y
  // en el override de impresión: el estilo moderno no los reescribe.
  const moderno = block(':root.moderno') + block('.dark.moderno');
  for (const token of ['--wire:', '--warn:', '--ink:', '--grid-minor:', '--grid-major:']) {
    assert.ok(!moderno.includes(token), `el moderno reescribe ${token} y no debería`);
  }
});

test('fuera del moderno sólo se suma lo que flota sobre el lienzo', () => {
  for (const selector of [':root', '.dark', ':root.moderno', '.dark.moderno']) {
    assert.ok(block(selector).includes('--elev-float: '), `${selector} no declara lo que flota`);
  }
});

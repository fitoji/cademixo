/**
 * Contraste medido, no estimado.
 *
 * Resuelve los tokens reales de `index.css` para los cuatro mundos y calcula
 * ratios WCAG. Es la clase de verificación que no se puede dejar "a ojo": el
 * texto puede verse bien en una captura y estar en 3.9:1.
 *
 * Dos cosas quedan fuera a propósito, y están documentadas en `DESIGN.md`:
 * - el límite de los controles del mundo clásico (<3:1) porque el clásico es el
 *   look de CADe_SIMU y cambiarlo es una decisión de producto, no un arreglo;
 * - `--border` como separador de zonas, que WCAG no alcanza porque no identifica
 *   un componente: separa áreas.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, '..', 'src', 'index.css'), 'utf8');

type Rgba = [number, number, number, number];

function block(selector: string): string {
  const at = CSS.indexOf(`\n${selector} {`);
  assert.notEqual(at, -1, `falta el bloque ${selector}`);
  const open = CSS.indexOf('{', at);
  const close = CSS.indexOf('\n}', open);
  return CSS.slice(open + 1, close);
}

function decls(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

/**
 * Los cuatro mundos, en orden de cascada. Un mundo es la lista de bloques que el
 * navegador aplicaría con esas clases en `<html>`.
 */
const WORLDS: Record<string, string[]> = {
  'clásico día': [':root'],
  'clásico noche': [':root', '.dark'],
  'moderno día': [':root', ':root.moderno'],
  'moderno noche': [':root', '.dark', ':root.moderno', '.dark.moderno'],
};

function tokens(world: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const selector of WORLDS[world]!) Object.assign(out, decls(block(selector)));
  return out;
}

function parse(value: string | undefined): Rgba | null {
  if (value === undefined) return null;
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (rgb) return [+rgb[1]!, +rgb[2]!, +rgb[3]!, rgb[4] === undefined ? 1 : +rgb[4]];
  return null;
}

/** Compone un color con alfa sobre un fondo opaco, como hace el navegador. */
function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(fg: Rgba, bg: Rgba): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function contrast(world: string, fgToken: string, bgToken: string): number {
  const t = tokens(world);
  const bg = parse(t[bgToken]);
  assert.ok(bg, `${world}: falta ${bgToken}`);
  const rawFg = parse(t[fgToken]);
  assert.ok(rawFg, `${world}: falta ${fgToken}`);
  const fg = rawFg[3] < 1 ? over(rawFg, bg) : rawFg;
  return ratio(fg, bg);
}

/** Texto: WCAG 1.4.3. Se mide en todos los mundos. */
const TEXT_PAIRS: Array<[string, string, string]> = [
  ['texto sobre fondo', '--foreground', '--background'],
  ['texto sobre panel', '--foreground', '--card'],
  ['texto secundario sobre panel', '--muted-foreground', '--card'],
  ['texto secundario sobre fondo', '--muted-foreground', '--background'],
  ['texto sobre control', '--foreground', '--secondary'],
  ['texto de botón primario', '--primary-foreground', '--primary'],
  ['destructivo sobre panel', '--destructive', '--card'],
  ['foco sobre panel', '--ring', '--card'],
];

for (const world of Object.keys(WORLDS)) {
  test(`${world}: el texto llega a 4.5:1 y el foco a 3:1`, () => {
    for (const [label, fg, bg] of TEXT_PAIRS) {
      const min = label.startsWith('foco') ? 3 : 4.5;
      const value = contrast(world, fg, bg);
      assert.ok(value >= min, `${world} · ${label}: ${value.toFixed(2)}:1, mínimo ${min}:1`);
    }
  });
}

/**
 * Componentes: WCAG 1.4.11. El borde de un campo de formulario es lo único que
 * dice "acá se escribe", así que necesita 3:1 contra el panel.
 */
for (const world of ['moderno día', 'moderno noche']) {
  test(`${world}: el borde de un campo se distingue del panel`, () => {
    const value = contrast(world, '--input', '--card');
    assert.ok(value >= 3, `${world} · borde de control: ${value.toFixed(2)}:1, mínimo 3:1`);
  });
}

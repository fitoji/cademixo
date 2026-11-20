/**
 * Apariencia de la app: dos ejes independientes que se combinan en cuatro looks.
 *
 * - `mode` (día / noche) gobierna la clase `.dark` en `<html>` y, con ella,
 *   todos los tokens de color.
 * - `style` (clásico / moderno) gobierna la clase `.moderno`, que reescribe
 *   tipografía, radios y elevación. La tinta del dibujo no se toca: cambia el
 *   chrome, no el esquema.
 *
 * Vivir fuera de React permite aplicar la preferencia antes del primer render
 * y compartirla entre el menú, la barra de herramientas y el arranque. Sin
 * `localStorage` (tests en node, modo privado) todo cae a noche + clásico sin
 * romper la aplicación.
 */

export type Mode = 'dark' | 'light';
export type StyleMode = 'clasico' | 'moderno';

export const MODE_KEY = 'simuelectro:mode';
export const STYLE_KEY = 'simuelectro:estilo';

/** Sólo 'light' enciende el día; cualquier otro valor (basura incluida) es noche. */
export function parseMode(raw: string | null): Mode {
  return raw === 'light' ? 'light' : 'dark';
}

/** Sólo 'moderno' enciende el estilo nuevo; el resto conserva el plano de obra. */
export function parseStyle(raw: string | null): StyleMode {
  return raw === 'moderno' ? 'moderno' : 'clasico';
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Modo privado o storage bloqueado: la elección vale sólo para esta sesión.
  }
}

export function readMode(): Mode {
  return parseMode(read(MODE_KEY));
}

export function readStyle(): StyleMode {
  return parseStyle(read(STYLE_KEY));
}

export function persistMode(mode: Mode): void {
  write(MODE_KEY, mode);
}

export function persistStyle(style: StyleMode): void {
  write(STYLE_KEY, style);
}

/**
 * Orientación natural de la paleta para cada estilo: clásico la lleva arriba,
 * como el CADe_SIMU original; moderno la baja a una columna al costado.
 */
export function panelesForStyle(style: StyleMode): 'horizontal' | 'vertical' {
  return style === 'moderno' ? 'vertical' : 'horizontal';
}

/**
 * Aplica los dos ejes al documento. Se llama en el arranque (antes de pintar)
 * y en cada cambio; el `toggle` con un booleano es idempotente.
 */
export function applyAppearance(mode: Mode, style: StyleMode): void {
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.classList.toggle('moderno', style === 'moderno');
}

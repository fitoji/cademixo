/**
 * Alcance de la paleta de componentes.
 *
 * `all` es el default: incluye los símbolos propios que CADe_SIMU no ofrece en
 * su menú (8016, 8017, 8018…). `cadesimu` es un filtro opt-in a los códigos
 * extraídos del binario. El catálogo completo está en
 * `docs/re/componentes-completo.md`.
 *
 * Vive fuera de React para que la paleta y el menú compartan el valor; la UI se
 * suscribe con `useSyncExternalStore`.
 */
export type PaletteScope = 'cadesimu' | 'all';

const KEY = 'simuelectro:paleta';
const listeners = new Set<() => void>();

function read(): PaletteScope {
  try {
    // Sin preferencia (o valor extraño) se muestran todos: los códigos que
    // sólo aparecen en archivos reales también son parte de la librería.
    return localStorage.getItem(KEY) === 'cadesimu' ? 'cadesimu' : 'all';
  } catch {
    // Sin storage (SSR, modo privado, tests): catálogo completo.
    return 'all';
  }
}

let current: PaletteScope = read();

export function getScope(): PaletteScope {
  return current;
}

export function setScope(next: PaletteScope): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Sin storage: la elección vale sólo para esta sesión.
  }
  for (const listener of listeners) listener();
}

export function subscribeScope(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

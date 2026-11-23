/**
 * Qué secciones del inspector quedaron plegadas.
 *
 * Vive fuera de React por la misma razón que `appearance.ts`: el inspector se
 * remonta en cada cambio de selección, así que el estado tiene que sobrevivir al
 * desmontaje y a la recarga. Sin `localStorage` (tests en node, modo privado) el
 * plegado vale sólo para esta sesión, sin romper la aplicación.
 *
 * Sólo lo usa el estilo moderno: el clásico no renderiza secciones plegables.
 */

export type SectionId = 'vertice' | 'avisos' | 'bornes' | 'atajo';

const SECTIONS: readonly SectionId[] = ['vertice', 'avisos', 'bornes', 'atajo'];
const KEY = 'simuelectro:secciones';

/** Sólo se guarda lo plegado: abierto es el estado natural de una sección. */
let closed = new Set<SectionId>(load());
const listeners = new Set<() => void>();

function load(): SectionId[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Un id desconocido (versión vieja, archivo editado a mano) se descarta.
    return parsed.filter((id): id is SectionId => SECTIONS.includes(id as SectionId));
  } catch {
    return [];
  }
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...closed]));
  } catch {
    // Modo privado o storage bloqueado: la elección vale sólo para esta sesión.
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function isSectionOpen(id: SectionId): boolean {
  return !closed.has(id);
}

export function setSectionOpen(id: SectionId, open: boolean): void {
  if (closed.has(id) === !open) return;
  const next = new Set(closed);
  if (open) next.delete(id);
  else next.add(id);
  closed = next;
  persist();
  emit();
}

export function subscribeSections(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Instantánea estable para `useSyncExternalStore`: un string cambia sólo cuando
 * cambia el conjunto, a diferencia de un `Set` nuevo en cada lectura.
 */
export function getSectionsSnapshot(): string {
  return [...closed].sort().join(',');
}

/**
 * Etiquetas de fase que CADe_SIMU propaga por los conductores.
 *
 * No es una abstracción nueva: son los chars que el binario guarda por extremo
 * de cable (`this+0x9019c + i*2` y `this+0x9113c + i*2`) y que compara
 * `FUN_00854790` (Ghidra `0x854790`, VA del PE `0x454790`) al cerrar una
 * conexión. `'0'` significa «sin asignar» y `'P'` es tierra (PE).
 *
 * Los pares `Y`/`y` del binario (bobinados estrella/triángulo) quedan fuera:
 * no son fases de alimentación y este módulo no los acepta.
 */
export const PHASE_TAGS = ['0', '1', '2', '3', 'N', '+', '-', 'P'] as const;

export type PhaseTag = (typeof PHASE_TAGS)[number];

export type PhaseConflict = 'short' | 'earth';

const UNASSIGNED: PhaseTag = '0';
const EARTH: PhaseTag = 'P';

/**
 * Tabla de incompatibilidad de `FUN_00854790`: dos etiquetas distintas y
 * asignadas son un corto salvo que alguna sea tierra, que es una derivación.
 * Los pares iguales (dos tramos de L1) y cualquier par con `'0'` son válidos.
 */
export function phaseConflict(a: PhaseTag, b: PhaseTag): PhaseConflict | null {
  if (a === b || a === UNASSIGNED || b === UNASSIGNED) return null;
  if (a === EARTH || b === EARTH) return 'earth';
  return 'short';
}

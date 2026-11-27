/**
 * Coordinación del guardado: qué se capturó al empezar y si una finalización
 * todavía puede decir que el documento quedó guardado.
 *
 * Es puro y no conoce el navegador. Cuatro resultados distintos:
 * `confirmed` (write + close verificados), `download-started` (el navegador se
 * quedó con la descarga, sin confirmación), `cancelled` y `failed`.
 */

export type SaveOutcome = 'confirmed' | 'download-started' | 'cancelled' | 'failed';

export interface SaveContext {
  readonly text: string;
  readonly fileName: string;
  readonly handle: FileSystemFileHandle | null;
  readonly bindings: Readonly<Record<string, string>>;
}

export interface SaveSnapshot extends SaveContext {
  readonly sequence: number;
  readonly bindingsKey: string;
}

/** Comparación de atajos independiente del orden de inserción de las claves. */
export function bindingsKey(bindings: Readonly<Record<string, string>>): string {
  return JSON.stringify(
    Object.entries(bindings).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

/** Captura la revisión que se está guardando, antes de cualquier await. */
export function beginSave(context: SaveContext, sequence: number): SaveSnapshot {
  return {
    ...context,
    bindings: Object.freeze({ ...context.bindings }),
    bindingsKey: bindingsKey(context.bindings),
    sequence,
  };
}

/**
 * Sólo la escritura confirmada de la revisión que sigue siendo la actual puede
 * limpiar `dirty`. Un guardado anterior que termina después (secuencia vencida,
 * texto o atajos editados, otro documento o handle) no gana por llegar tarde.
 */
export function isCurrentSave(
  snapshot: SaveSnapshot,
  outcome: SaveOutcome,
  current: SaveContext,
  currentSequence: number,
): boolean {
  return (
    outcome === 'confirmed' &&
    currentSequence === snapshot.sequence &&
    current.text === snapshot.text &&
    current.fileName === snapshot.fileName &&
    current.handle === snapshot.handle &&
    bindingsKey(current.bindings) === snapshot.bindingsKey
  );
}

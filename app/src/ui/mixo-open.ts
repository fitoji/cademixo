/**
 * Decisión de apertura de un archivo: texto CADe suelto, proyecto `.mixo` con
 * atajos válidos, o rechazo con el dibujo recuperable cuando el sidecar está roto.
 *
 * Es una función pura para que la regla se pueda probar sin navegador. En
 * particular, un sidecar que no parsea NUNCA se sustituye por `{}`: el proyecto
 * se rechaza y el dibujo se ofrece como copia aparte.
 */

import { isCadeDocument } from '../format/cade.ts';
import { isMixo, parseMixo, type MixoBundle } from '../format/mixo.ts';
import { parseSidecar, type ComponentShortcuts } from './component-shortcuts.ts';

export type TextOpenInspection =
  | { kind: 'cad' }
  | { kind: 'mixo-valid'; bundle: MixoBundle; keys: ComponentShortcuts }
  | { kind: 'rejected'; reason: 'bad-cad' | 'bad-keys'; drawing: string | null };

/**
 * `parseSidecar` descarta entradas inválidas una por una. Si el archivo decía
 * tener atajos y todos se descartaron, abrir con `bindings: {}` sería una
 * sustitución silenciosa: se rechaza como sidecar inválido.
 */
function bindingsWereDropped(keysText: string, parsed: ComponentShortcuts): boolean {
  if (Object.keys(parsed.bindings).length > 0) return false;
  try {
    const data = JSON.parse(keysText) as { bindings?: unknown };
    return (
      typeof data.bindings === 'object' &&
      data.bindings !== null &&
      !Array.isArray(data.bindings) &&
      Object.keys(data.bindings).length > 0
    );
  } catch {
    return false;
  }
}

export function inspectTextForOpen(text: string): TextOpenInspection {
  const bundle = parseMixo(text);
  if (bundle) {
    if (!isCadeDocument(bundle.drawing)) return { kind: 'rejected', reason: 'bad-cad', drawing: null };
    const keys = parseSidecar(bundle.keys);
    if (keys === null || bindingsWereDropped(bundle.keys, keys)) {
      return { kind: 'rejected', reason: 'bad-keys', drawing: bundle.drawing };
    }
    return { kind: 'mixo-valid', bundle, keys };
  }
  // Un texto con el magic roto no es un `.cad`: no se intenta abrir como tal.
  if (isMixo(text) || !isCadeDocument(text)) return { kind: 'rejected', reason: 'bad-cad', drawing: null };
  return { kind: 'cad' };
}

/**
 * Un sidecar roto todavía puede abrirse por `openLoaded` para ofrecer la
 * recuperación como copia. Sólo los archivos que ni siquiera son CADe se cortan
 * antes del diálogo de guardado.
 */
export function canAttemptOpen(text: string): boolean {
  const inspection = inspectTextForOpen(text);
  return inspection.kind !== 'rejected' || inspection.reason === 'bad-keys';
}

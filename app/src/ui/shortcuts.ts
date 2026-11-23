/**
 * Atajos de teclado. Es la única puerta a `@ui-sdk/*` para el registro, igual
 * que `components/ui/resizable.tsx` lo es para el panel redimensionable.
 *
 * Los atajos globales no se resuelven con un `keydown` propio: se registran en
 * `shortcuts`, el registro compartido de ui-sdk, que escucha una sola vez en
 * `document` y resuelve lo que un handler casero tiene que acordarse de hacer:
 *
 * - modificadores exactos (`mod` es ⌘ en Apple y Ctrl en el resto, y `r` no se
 *   dispara con Shift),
 * - ninguna autorepetición por defecto,
 * - campos de texto y capas: las letras no se roban de un campo, y un popup de
 *   ui-sdk puede pausar los atajos de página mientras está abierto (`layer`),
 * - un control que ya marcó la tecla como manejada (`defaultPrevented`) gana,
 * - hints formateados por plataforma desde las MISMAS teclas que registran.
 *
 * Lo que queda acá es lo único que la librería no decide: a quién le pertenece
 * una tecla cuando el foco no está escribiendo.
 */
export { useShortcut, useShortcutHint } from '@ui-sdk/react/shortcuts';

/**
 * ui-sdk decide Apple desde `navigator.platform || userAgent`, pero no expone
 * esa función en su API pública. La repetimos acá, en la única puerta al
 * paquete, para normalizar las combinaciones que graba el usuario.
 */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

/**
 * Controles que ya usan la barra espaciadora: un `<button>` dispara su clic, una
 * opción de lista elige, un renglón con `role="button"` se activa. Si el foco
 * está ahí, la tecla es del control y no de la app: el atajo se saltea y el
 * navegador hace lo suyo, sin alternar dos veces la simulación. Los diálogos
 * entran por el mismo motivo: con uno abierto, la tecla no maneja el circuito
 * que quedó atrás.
 *
 * El lienzo no está en la lista aunque tenga `tabindex`: con el foco en el
 * esquema, la tecla sí tiene que llegar al atajo.
 */
export const SPACE_OWNER_SELECTOR = [
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
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
].join(', ');

/**
 * ¿El foco está en un control que se queda con la barra espaciadora? Recibe el
 * `event.target` o el `document.activeElement` tal cual: un nodo que no sabe
 * buscar ancestros (el `window`, un `document` sin `closest`) no posee la tecla.
 */
export function ownsSpaceKey(target: Pick<Element, 'closest'> | null): boolean {
  if (target === null || typeof target.closest !== 'function') return false;
  return target.closest(SPACE_OWNER_SELECTOR) !== null;
}

/** Inputs donde las letras se escriben; el resto (botón, checkbox, rango) no. */
const TYPING_INPUT_TYPES = /^(button|checkbox|radio|submit|reset|range|color|file|image)$/;

/**
 * ¿El foco está en algo donde las letras se escriben? Repite la regla con la que
 * ui-sdk no se roba las teclas (`isTypingIn`, que no expone), y hace falta
 * porque `when` no recibe el evento: se mira el foco en el momento de la
 * pulsación.
 *
 * Los ⌘-atajos de la librería pasan igual en un campo de texto. Eso es lo que
 * queremos para guardar, pero no para deshacer, copiar ni pegar: ahí el campo
 * tiene su propio historial y su propio portapapeles.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (el === null || typeof el.tagName !== 'string') return false;
  if (el.isContentEditable === true) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName !== 'INPUT') return false;
  return !TYPING_INPUT_TYPES.test((el as HTMLInputElement).type);
}

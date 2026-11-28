/**
 * Avisos del modo ortogonal.
 *
 * Sonner permite varios `<Toaster />` con `id`: los mensajes de cableado se
 * envían a uno propio abajo, sin mover los avisos generales de la app.
 */
import { toast } from 'sonner';

export const CABLE_TOASTER_ID = 'cables';
export const CABLE_PREVIEW_TOAST_ID = 'cable-move-preview';
export const CABLE_COMMIT_TOAST_ID = 'cable-move-commit';

/** Conflicto de enrutado: se actualiza en sitio mientras se arrastra. */
export function cableConflict(
  reason: string,
  opts: { id?: string; persistent?: boolean } = {},
): void {
  toast.error(`sin ruta válida: ${reason}`, {
    id: opts.id ?? CABLE_COMMIT_TOAST_ID,
    toasterId: CABLE_TOASTER_ID,
    duration: opts.persistent ? Infinity : 4500,
  });
}

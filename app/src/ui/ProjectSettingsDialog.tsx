/**
 * Diálogo «Archivo → Configuración del proyecto…».
 *
 * Ajustes que pertenecen al plano y no a la aplicación. Por ahora sólo la
 * visibilidad del cajetín; cuando se muevan acá el formato de hoja, el tipo de
 * cajetín y el contorno, van en el mismo `FieldSet`.
 *
 * Aplica en el acto, igual que el cajón de `Ver → Configuración…`: no hay Aceptar/Cancelar.
 */

import type { JSX } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldContent, FieldDescription, FieldLabel, FieldSet } from '@/components/ui/field';

export function ProjectSettingsDialog({
  open,
  onOpenChange,
  titleBlockHidden,
  onTitleBlockHiddenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si la capa del cajetín está apagada en el lienzo. */
  titleBlockHidden: boolean;
  onTitleBlockHiddenChange: (hidden: boolean) => void;
}): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configuración del proyecto</DialogTitle>
          <DialogDescription>Ajustes de la hoja de este plano.</DialogDescription>
        </DialogHeader>

        <FieldSet>
          <Field orientation="horizontal">
            <Checkbox
              id="proyecto-mostrar-cajetin"
              checked={!titleBlockHidden}
              onCheckedChange={(checked) => onTitleBlockHiddenChange(checked !== true)}
            />
            <FieldContent>
              <FieldLabel htmlFor="proyecto-mostrar-cajetin">Mostrar cajetín en el plano</FieldLabel>
              <FieldDescription>
                El bloque de título de la hoja. Sólo afecta la vista: el documento no cambia.
              </FieldDescription>
            </FieldContent>
          </Field>
        </FieldSet>

        <DialogFooter>
          <DialogClose asChild>
            <Button size="sm" variant="secondary">
              Listo
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

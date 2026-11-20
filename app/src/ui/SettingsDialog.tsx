import type { JSX } from 'react';
import { useSyncExternalStore } from 'react';
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
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  getSettings,
  setSettings,
  subscribeSettings,
  type Paneles,
  type PinSize,
  type WireWidth,
} from './settings.ts';

/**
 * Diálogo «Ver → Apariencia…».
 *
 * Lee y escribe las preferencias con el store de `settings.ts`, así el lienzo y
 * la paleta ven el cambio en el acto.
 */
export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apariencia</DialogTitle>
          <DialogDescription>Cómo se dibuja el plano y cómo se comportan los paneles.</DialogDescription>
        </DialogHeader>

        <Separator />

        <FieldSet>
          <Field>
            <FieldLabel>Tamaño de bornes</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={settings.pinSize}
              onValueChange={(value) => {
                if (value) setSettings({ pinSize: value as PinSize });
              }}
            >
              <ToggleGroupItem value="chico" aria-label="Bornes chicos">
                Chico
              </ToggleGroupItem>
              <ToggleGroupItem value="normal" aria-label="Bornes normales">
                Normal
              </ToggleGroupItem>
              <ToggleGroupItem value="grande" aria-label="Bornes grandes">
                Grande
              </ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription className="font-mono text-[11px]">
              Radio de los puntos de borne del símbolo y de las conexiones del lienzo.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel>Grosor de cables</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={settings.wireWidth}
              onValueChange={(value) => {
                if (value) setSettings({ wireWidth: value as WireWidth });
              }}
            >
              <ToggleGroupItem value="fino" aria-label="Cables finos">
                Fino
              </ToggleGroupItem>
              <ToggleGroupItem value="normal" aria-label="Cables normales">
                Normal
              </ToggleGroupItem>
              <ToggleGroupItem value="grueso" aria-label="Cables gruesos">
                Grueso
              </ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription className="font-mono text-[11px]">
              Ancho de todos los conductores, incluidos los de tensión y los seleccionados.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel>Paneles de componentes</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={settings.paneles}
              onValueChange={(value) => {
                if (value) setSettings({ paneles: value as Paneles });
              }}
            >
              <ToggleGroupItem value="horizontal" aria-label="Paneles de componentes horizontales">
                Horizontal
              </ToggleGroupItem>
              <ToggleGroupItem value="vertical" aria-label="Paneles de componentes verticales">
                Vertical
              </ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription className="font-mono text-[11px]">
              La barra de componentes arriba, como siempre, o al costado en una columna plegable.
            </FieldDescription>
          </Field>

          <Separator />

          <Field orientation="horizontal">
            <Checkbox
              id="ajustes-auto-cierre"
              checked={settings.autoCierre}
              onCheckedChange={(checked) => setSettings({ autoCierre: checked === true })}
            />
            <FieldContent>
              <FieldLabel htmlFor="ajustes-auto-cierre">Auto cierre</FieldLabel>
              <FieldDescription>
                Al abrir un panel de la paleta se cierra el que estaba abierto.
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

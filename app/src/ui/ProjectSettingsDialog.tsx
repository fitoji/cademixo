/**
 * Diálogo «Archivo → Configuración del proyecto…».
 *
 * Ajustes que pertenecen al plano y no a la aplicación: visibilidad del
 * cajetín y formato de hoja. El formato es el del trailer de esta hoja
 * (`docs/reportes/informe-tamano-hoja-cadesimu.md`): los presets no tocan el
 * tamaño guardado y Personalizado usa el alto y el ancho editables.
 *
 * Aplica en el acto, igual que el cajón de `Ver → Configuración…`: no hay
 * Aceptar/Cancelar.
 */

import { useEffect, useState, type JSX } from 'react';
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
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  parseTitleBlock,
  SHEET_PRESETS,
  SHEET_SIZE_MAX,
  SHEET_SIZE_MIN,
  titlePageFormat,
  titlePageSize,
  withSheetFormat,
  type PageFormat,
} from '../model/title-block.ts';

const validSize = (value: string): boolean => {
  const n = Number(value);
  return Number.isInteger(n) && n >= SHEET_SIZE_MIN && n <= SHEET_SIZE_MAX;
};

export function ProjectSettingsDialog({
  open,
  onOpenChange,
  text,
  onApply,
  titleBlockHidden,
  onTitleBlockHiddenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Texto del documento; de acá sale el trailer de la hoja. */
  text: string;
  onApply: (nextText: string) => void;
  /** Si la capa del cajetín está apagada en el lienzo. */
  titleBlockHidden: boolean;
  onTitleBlockHiddenChange: (hidden: boolean) => void;
}): JSX.Element {
  const [customAlto, setCustomAlto] = useState('210');
  const [customAncho, setCustomAncho] = useState('297');
  const [error, setError] = useState<string | null>(null);

  const block = parseTitleBlock(text);
  const format = block ? titlePageFormat(block) : 1;

  // Al abrir (o cuando cambia el documento) los campos reflejan lo guardado.
  useEffect(() => {
    if (!open) return;
    const current = parseTitleBlock(text);
    const size = current ? titlePageSize(current) : { alto: 210, ancho: 297 };
    setCustomAlto(String(size.alto));
    setCustomAncho(String(size.ancho));
    setError(null);
  }, [open, text]);

  const applyFormat = (next: PageFormat): void => {
    if (!block) return;
    if (next !== 4) {
      setError(null);
      onApply(withSheetFormat(text, next));
      return;
    }
    if (!validSize(customAlto) || !validSize(customAncho)) {
      setError(`Alto y ancho tienen que ser enteros entre ${SHEET_SIZE_MIN} y ${SHEET_SIZE_MAX}.`);
      return;
    }
    setError(null);
    onApply(withSheetFormat(text, 4, { alto: Number(customAlto), ancho: Number(customAncho) }));
  };

  /**
   * Los campos de Personalizado se confirman al salir o con Enter. Si el
   * formato todavía no es Personalizado, el valor queda en pantalla, como en
   * CADe: sólo se escribe al elegir esa opción.
   */
  const commitSize = (): void => {
    if (!validSize(customAlto) || !validSize(customAncho)) {
      setError(`Alto y ancho tienen que ser enteros entre ${SHEET_SIZE_MIN} y ${SHEET_SIZE_MAX}.`);
      return;
    }
    setError(null);
    if (format === 4) {
      onApply(withSheetFormat(text, 4, { alto: Number(customAlto), ancho: Number(customAncho) }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configuración del proyecto</DialogTitle>
          <DialogDescription>Ajustes de la hoja de este plano.</DialogDescription>
        </DialogHeader>

        <FieldSet>
          <Field>
            <FieldLabel>Formato de hoja</FieldLabel>
            <RadioGroup
              value={String(format)}
              onValueChange={(value) => applyFormat(Number(value) as PageFormat)}
            >
              {SHEET_PRESETS.map((preset) => (
                <div key={preset.format} className="flex items-center gap-2">
                  <RadioGroupItem value={String(preset.format)} id={`hoja-${preset.format}`} />
                  <label htmlFor={`hoja-${preset.format}`} className="text-sm">
                    {preset.label}{' '}
                    <span className="text-muted-foreground">
                      {preset.alto} × {preset.ancho} mm
                    </span>
                  </label>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <RadioGroupItem value="4" id="hoja-4" />
                <label htmlFor="hoja-4" className="text-sm">
                  Personalizado
                </label>
              </div>
            </RadioGroup>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="hoja-alto">Alto (mm)</FieldLabel>
              <Input
                id="hoja-alto"
                type="number"
                min={SHEET_SIZE_MIN}
                max={SHEET_SIZE_MAX}
                value={customAlto}
                aria-invalid={error !== null}
                onChange={(event) => setCustomAlto(event.target.value)}
                onBlur={commitSize}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitSize();
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="hoja-ancho">Ancho (mm)</FieldLabel>
              <Input
                id="hoja-ancho"
                type="number"
                min={SHEET_SIZE_MIN}
                max={SHEET_SIZE_MAX}
                value={customAncho}
                aria-invalid={error !== null}
                onChange={(event) => setCustomAncho(event.target.value)}
                onBlur={commitSize}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitSize();
                }}
              />
            </Field>
          </div>
          {error !== null && <p className="text-xs text-destructive">{error}</p>}

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

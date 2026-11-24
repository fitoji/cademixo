/**
 * Cajetín estilo CADe_SIMU: 7 filas con check de visibilidad, alineación y
 * campos de texto. Toda la persistencia la hacen las funciones puras de
 * `model/title-block.ts`; acá sólo se edita el estado local del formulario.
 */

import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  parseTitleBlock,
  withTitleField,
  withTitleFlags,
  type TitleFieldIndex,
} from '../model/title-block.ts';

type Alignment = 0 | 1 | 2;

interface Row {
  label: string;
  fields: Array<{ index: TitleFieldIndex; label: string }>;
}

const ROWS: readonly Row[] = [
  { label: 'Dibujado', fields: [{ index: 0, label: 'Fecha' }, { index: 1, label: 'Nombre' }] },
  { label: 'Comprobado', fields: [{ index: 2, label: 'Fecha' }, { index: 3, label: 'Nombre' }] },
  { label: 'Entidad', fields: [{ index: 4, label: 'Entidad' }] },
  { label: 'Título', fields: [{ index: 5, label: 'Título' }] },
  { label: 'Fecha', fields: [{ index: 6, label: 'Fecha' }] },
  { label: 'Número', fields: [{ index: 7, label: 'Número' }, { index: 8, label: 'De' }] },
  { label: 'Archivo', fields: [{ index: 9, label: 'Archivo' }] },
];

/** Anchos que CADe escribe en el trailer; sirven también como `maxlength` nativo. */
const FIELD_WIDTHS: readonly number[] = [11, 11, 11, 11, 25, 25, 11, 11, 11, 21];

const ALIGNMENTS: ReadonlyArray<{ value: Alignment; label: string }> = [
  { value: 0, label: 'Izq.' },
  { value: 1, label: 'Cen.' },
  { value: 2, label: 'Der.' },
];

export function TitleBlockDialog({
  open,
  onOpenChange,
  text,
  onApply,
  disabled = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  text: string;
  onApply: (nextText: string) => void;
  disabled?: boolean;
}): JSX.Element {
  const [values, setValues] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<boolean[]>([]);
  const [alignment, setAlignment] = useState<Alignment[]>([]);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!open) return;
    const block = parseTitleBlock(text);
    setAvailable(block !== null);
    setValues(block ? block.fields.map((f) => f.value.trimEnd()) : []);
    setVisibility(block ? block.visibility : ROWS.map(() => true));
    setAlignment(block ? (block.alignment.map((n) => (n === 2 ? 2 : n === 1 ? 1 : 0)) as Alignment[]) : ROWS.map(() => 0));
  }, [open, text]);

  const apply = (): void => {
    if (!available) return;
    let next = text;
    values.forEach((value, index) => {
      next = withTitleField(next, index as TitleFieldIndex, value);
    });
    const vis: Record<number, boolean> = {};
    const align: Record<number, Alignment> = {};
    visibility.forEach((value, i) => { vis[i] = value; });
    alignment.forEach((value, i) => { align[i] = value; });
    next = withTitleFlags(next, { visibility: vis, alignment: align });
    if (next !== text) onApply(next);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(36rem,90vh)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cajetín</DialogTitle>
          <DialogDescription>
            Datos del bloque de título que CADe_SIMU guarda al final del `.cad`.
          </DialogDescription>
        </DialogHeader>

        {!available ? (
          <p className="text-sm text-muted-foreground">El documento no tiene un cajetín que se pueda editar.</p>
        ) : (
          <form
            id="title-block-form"
            aria-label="Datos del cajetín"
            onSubmit={(event) => {
              event.preventDefault();
              apply();
            }}
            className="flex flex-col gap-2"
          >
            {ROWS.map((row, rowIndex) => (
              <div key={row.label} className="grid grid-cols-[92px_1fr_auto] items-center gap-2">
                <span className="text-xs font-medium">{row.label}</span>
                <div className="flex flex-wrap gap-1.5">
                  {row.fields.map((field) => (
                    <Field key={field.index} className="min-w-24 flex-1 gap-0.5">
                      <FieldLabel htmlFor={`tb-field-${field.index}`} className="text-[10px] text-muted-foreground">
                        {field.label}
                      </FieldLabel>
                      <Input
                        id={`tb-field-${field.index}`}
                        className="h-7 text-xs"
                        disabled={disabled || !visibility[rowIndex]}
                        maxLength={FIELD_WIDTHS[field.index]}
                        value={values[field.index] ?? ''}
                        onChange={(event) =>
                          setValues((prev) => prev.map((v, i) => (i === field.index ? event.target.value : v)))
                        }
                      />
                    </Field>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Checkbox
                      id={`tb-visible-${rowIndex}`}
                      checked={visibility[rowIndex] ?? true}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        setVisibility((prev) => prev.map((v, i) => (i === rowIndex ? checked === true : v)))
                      }
                    />
                    <label htmlFor={`tb-visible-${rowIndex}`} className="text-[10px] text-muted-foreground">
                      Mostrar
                    </label>
                  </div>
                  <div className="flex items-center gap-1" role="radiogroup" aria-label={`Alineación de ${row.label}`}>
                    {ALIGNMENTS.map((option) => (
                      <label key={option.value} className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <input
                          type="radio"
                          name={`align-${rowIndex}`}
                          className="size-3 accent-foreground"
                          disabled={disabled}
                          checked={(alignment[rowIndex] ?? 0) === option.value}
                          aria-label={`${row.label} ${option.label}`}
                          onChange={() =>
                            setAlignment((prev) => prev.map((v, i) => (i === rowIndex ? option.value : v)))
                          }
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </form>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form="title-block-form" disabled={disabled || !available}>Aceptar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

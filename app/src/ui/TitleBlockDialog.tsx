/**
 * Cajetín estilo CADe_SIMU: 7 filas con check de visibilidad, alineación y
 * campos de texto. Toda la persistencia la hacen las funciones puras de
 * `model/title-block.ts`; acá sólo se edita el estado local del formulario.
 *
 * El formulario usa las primitivas de shadcn (`FieldSet`, `FieldGroup`, `Field`,
 * `FieldLabel`, `FieldError`) y `RadioGroup`; no hay `react-hook-form` porque el
 * resto del proyecto usa el mismo patrón controlado.
 */

import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { FileTextIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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

/** Respaldo si el documento no trae el cajetín; el ancho real sale del trailer. */
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
  hidden = false,
  onApply,
  disabled = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  text: string;
  /** Si la capa del cajetín está apagada en el lienzo. */
  hidden?: boolean;
  onApply: (nextText: string, hidden: boolean) => void;
  disabled?: boolean;
}): JSX.Element {
  const [values, setValues] = useState<string[]>([]);
  const [widths, setWidths] = useState<number[]>([...FIELD_WIDTHS]);
  const [visibility, setVisibility] = useState<boolean[]>([]);
  const [alignment, setAlignment] = useState<Alignment[]>([]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [available, setAvailable] = useState(false);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    if (!open) return;
    const block = parseTitleBlock(text);
    setAvailable(block !== null);
    setShown(!hidden);
    setValues(block ? block.fields.map((field) => field.value.trimEnd()) : []);
    setWidths(block ? block.fields.map((field) => field.width) : [...FIELD_WIDTHS]);
    setVisibility(block ? block.visibility : ROWS.map(() => true));
    setAlignment(
      block
        ? (block.alignment.map((n) => (n === 2 ? 2 : n === 1 ? 1 : 0)) as Alignment[])
        : ROWS.map(() => 0),
    );
    setErrors({});
  }, [open, text, hidden]);

  const updateValue = (index: TitleFieldIndex, value: string): void => {
    setValues((prev) => prev.map((current, i) => (i === index ? value : current)));
    setErrors((prev) => {
      if (!(index in prev)) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const apply = (): void => {
    if (!available) return;
    const invalid: Record<number, string> = {};
    values.forEach((value, index) => {
      if (value.includes('*')) invalid[index] = 'El cajetín no admite el carácter *.';
    });
    setErrors(invalid);
    if (Object.keys(invalid).length > 0) return;

    let next = text;
    values.forEach((value, index) => {
      next = withTitleField(next, index as TitleFieldIndex, value);
    });
    const vis: Record<number, boolean> = {};
    const align: Record<number, Alignment> = {};
    visibility.forEach((value, i) => {
      vis[i] = value;
    });
    alignment.forEach((value, i) => {
      align[i] = value;
    });
    next = withTitleFlags(next, { visibility: vis, alignment: align });
    // El documento sólo cambia si cambió algún dato; ocultar es preferencia de
    // vista y no ensucia el archivo.
    if (next !== text || !shown !== hidden) onApply(next, !shown);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(42rem,90vh)] w-[min(620px,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>Cajetín</DialogTitle>
          <DialogDescription>
            Datos del bloque de título que CADe_SIMU guarda al final del `.cad`.
          </DialogDescription>
        </DialogHeader>

        {!available ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileTextIcon />
              </EmptyMedia>
              <EmptyTitle>Sin cajetín editable</EmptyTitle>
              <EmptyDescription>
                Este documento no tiene un trailer de cajetín que la app pueda editar.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <form
            id="title-block-form"
            aria-label="Datos del cajetín"
            onSubmit={(event) => {
              event.preventDefault();
              apply();
            }}
            className="max-h-[min(28rem,60vh)] overflow-y-auto pr-1"
          >
            <FieldSet>
              <FieldGroup className="gap-2">
                <Field
                  orientation="horizontal"
                  className="items-center gap-2 border-b border-border/60 pb-3"
                >
                  <Checkbox
                    id="tb-show-block"
                    checked={shown}
                    disabled={disabled}
                    aria-label="Mostrar cajetín en el plano"
                    onCheckedChange={(checked) => setShown(checked === true)}
                  />
                  <div className="flex flex-col gap-0.5">
                    <FieldLabel htmlFor="tb-show-block" className="text-xs font-normal">
                      Mostrar cajetín en el plano
                    </FieldLabel>
                    <FieldDescription className="text-[10px]">
                      Sólo afecta la vista: el documento no se modifica.
                    </FieldDescription>
                  </div>
                </Field>

                {ROWS.map((row, rowIndex) => (
                  <Field
                    key={row.label}
                    className="gap-2 border-b border-border/60 pb-3 last:border-0 last:pb-0"
                  >
                    <FieldTitle className="text-xs">{row.label}</FieldTitle>
                    <FieldContent className="gap-2">
                      <div className="flex flex-wrap gap-2">
                        {row.fields.map((field) => {
                          const error = errors[field.index];
                          return (
                            <Field
                              key={field.index}
                              data-invalid={error !== undefined}
                              className="min-w-40 flex-1 gap-1"
                            >
                              <FieldLabel
                                htmlFor={`tb-field-${field.index}`}
                                className="text-[10px] text-muted-foreground"
                              >
                                {field.label}
                              </FieldLabel>
                              <Input
                                id={`tb-field-${field.index}`}
                                className="h-7 text-xs"
                                disabled={disabled}
                                maxLength={widths[field.index] ?? FIELD_WIDTHS[field.index]}
                                value={values[field.index] ?? ''}
                                aria-invalid={error !== undefined}
                                aria-describedby={error ? `tb-error-${field.index}` : undefined}
                                onChange={(event) => updateValue(field.index, event.target.value)}
                              />
                              <FieldError id={`tb-error-${field.index}`}>{error}</FieldError>
                            </Field>
                          );
                        })}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <Field orientation="horizontal" className="w-auto items-center gap-1.5">
                          <Checkbox
                            id={`tb-visible-${rowIndex}`}
                            checked={visibility[rowIndex] ?? true}
                            disabled={disabled}
                            aria-label={`Mostrar ${row.label}`}
                            onCheckedChange={(checked) =>
                              setVisibility((prev) =>
                                prev.map((value, i) => (i === rowIndex ? checked === true : value)),
                              )
                            }
                          />
                          <FieldLabel
                            htmlFor={`tb-visible-${rowIndex}`}
                            className="text-[10px] font-normal text-muted-foreground"
                          >
                            Mostrar
                          </FieldLabel>
                        </Field>

                        <RadioGroup
                          value={String(alignment[rowIndex] ?? 0)}
                          onValueChange={(value) =>
                            setAlignment((prev) =>
                              prev.map((current, i) =>
                                i === rowIndex ? (Number(value) as Alignment) : current,
                              ),
                            )
                          }
                          disabled={disabled}
                          aria-label={`Alineación de ${row.label}`}
                          className="flex flex-wrap items-center gap-3"
                        >
                          {ALIGNMENTS.map((option) => (
                            <Field
                              key={option.value}
                              orientation="horizontal"
                              className="w-auto items-center gap-1"
                            >
                              <RadioGroupItem
                                value={String(option.value)}
                                id={`tb-align-${rowIndex}-${option.value}`}
                              />
                              <FieldLabel
                                htmlFor={`tb-align-${rowIndex}-${option.value}`}
                                className="text-[10px] font-normal text-muted-foreground"
                              >
                                {option.label}
                              </FieldLabel>
                            </Field>
                          ))}
                        </RadioGroup>
                      </div>
                    </FieldContent>
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>
            <FieldDescription className="pt-2 text-[10px]">
              La visibilidad y la alineación se conservan en el archivo; CADe no las usa al dibujar.
            </FieldDescription>
          </form>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="title-block-form" disabled={disabled || !available}>
            Aceptar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

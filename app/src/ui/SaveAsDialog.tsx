import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cadFileName } from '../format/filename.ts';
import { normalizeSaveName, suggestedSaveName } from './files.ts';

/**
 * Diálogo de «Guardar como…» para los navegadores que no tienen la File System
 * Access API.
 *
 * Ahí no hay selector del sistema al que pedirle el nombre: sin este diálogo,
 * «Guardar como…» descargaba con el nombre del documento y era indistinguible de
 * «Guardar». El nombre que se escribe acá es el de la descarga.
 *
 * `onConfirm` recibe el nombre ya normalizado (`.cad`), nunca el texto crudo.
 */
export function SaveAsDialog({
  open,
  initialName,
  target,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  initialName: string;
  target: 'cade' | 'mixo';
  onCancel: () => void;
  onConfirm: (name: string) => void;
}): JSX.Element {
  const suggested = (name: string): string =>
    target === 'mixo' ? suggestedSaveName(name, true) : (normalizeSaveName(name) ?? cadFileName(name));
  const [value, setValue] = useState(() => suggested(initialName));
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Al abrir se vuelve a proponer el nombre del documento y se lo deja
  // seleccionado, para escribir encima sin borrar a mano. El foco va después de
  // pintar el valor nuevo: si se selecciona antes, el `value` que llega después
  // mueve el cursor al final y la selección se pierde.
  useEffect(() => {
    if (!open) return;
    setValue(
      target === 'mixo' ? suggestedSaveName(initialName, true) : (normalizeSaveName(initialName) ?? cadFileName(initialName)),
    );
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, initialName, target]);

  const name = normalizeSaveName(value);

  return (
    // Cerrar por Esc, por el fondo o por la X es cancelar: no se guarda nada.
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {target === 'mixo' ? 'Guardar como proyecto cadeMixo' : 'Guardar como esquema CADe'}
          </DialogTitle>
          <DialogDescription>
            Este navegador descarga el archivo con el nombre que escribas acá. Elegí dónde guardarlo desde la
            descarga del navegador.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (name === null) return;
            onConfirm(name);
          }}
        >
          <Field>
            <FieldLabel htmlFor="guardar-como-nombre">Nombre del archivo</FieldLabel>
            <Input
              id="guardar-como-nombre"
              ref={inputRef}
              value={value}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setValue(event.target.value)}
            />
            <FieldDescription>
              Si no escribís la extensión, se guarda como <code>.cad</code>. Escribí <code>.mixo</code> para
              guardar el proyecto con las keys custom adentro.
            </FieldDescription>
          </Field>

          <DialogFooter>
            <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={name === null}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

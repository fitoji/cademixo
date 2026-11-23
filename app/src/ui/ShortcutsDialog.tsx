import type { JSX } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useShortcutHint } from './shortcuts.ts';

/**
 * Diálogo «Ver → Atajos».
 *
 * Las teclas son las mismas que se registran en `App.tsx`; el texto visible se
 * calcula con `useShortcutHint`, así que ⌘ en Apple y Ctrl en el resto salen del
 * registro y no de una cadena escrita a mano. Los gestos del lienzo no pasan por
 * el registro compartido (viven en el `<svg>`), por eso se describen con palabras.
 */
type Entry = { label: string; keys: string } | { label: string; text: string };

const CATEGORIES: Array<{ name: string; entries: Entry[] }> = [
  {
    name: 'Archivo',
    entries: [
      { label: 'Guardar', keys: 'mod+s' },
      { label: 'Guardar como…', keys: 'mod+shift+s' },
    ],
  },
  {
    name: 'Edición',
    entries: [
      { label: 'Deshacer', keys: 'mod+z' },
      { label: 'Rehacer', keys: 'mod+shift+z' },
      { label: 'Copiar la selección', keys: 'mod+c' },
      { label: 'Pegar', keys: 'mod+v' },
      { label: 'Rotar 90°', keys: 'r' },
      { label: 'Rotar −90°', keys: 'shift+r' },
      { label: 'Borrar la selección', keys: 'delete' },
      { label: 'Borrar el vértice enfocado', keys: 'backspace' },
    ],
  },
  {
    name: 'Ver',
    entries: [{ label: 'Encuadrar el dibujo', keys: 'mod+0' }],
  },
  {
    name: 'Simulación',
    entries: [{ label: 'Simular o detener la simulación', keys: 'space' }],
  },
  {
    name: 'Lienzo',
    entries: [
      { label: 'Cancelar lo que esté en curso', keys: 'escape' },
      { label: 'Tab + flechas cablean', text: 'Tab + Flechas' },
      { label: 'Elegir el borne y conectar el cable', text: 'Intro' },
      { label: 'Cancelar el gesto del lienzo', text: 'Clic derecho' },
      { label: 'Desplazar el plano', text: 'Alt + arrastrar' },
    ],
  },
];

/** Fila con un atajo registrado: el hint se deriva de las mismas teclas. */
function RegisteredRow({ label, keys }: { label: string; keys: string }): JSX.Element {
  const hint = useShortcutHint(keys).text;
  return (
    <li className="flex items-center justify-between gap-4 py-1 text-sm">
      <span>{label}</span>
      <kbd className="shrink-0 font-mono text-xs text-muted-foreground">{hint}</kbd>
    </li>
  );
}

/** Fila de un gesto del lienzo, que no tiene atajo registrado que formatear. */
function TextRow({ label, text }: { label: string; text: string }): JSX.Element {
  return (
    <li className="flex items-center justify-between gap-4 py-1 text-sm">
      <span>{label}</span>
      <kbd className="shrink-0 font-mono text-xs text-muted-foreground">{text}</kbd>
    </li>
  );
}

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(32rem,85vh)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>
            Los atajos disponibles, agrupados por lo que hacen. Las teclas se muestran para tu plataforma.
          </DialogDescription>
        </DialogHeader>

        {CATEGORIES.map((category) => (
          <section key={category.name}>
            <h3 className="pt-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {category.name}
            </h3>
            <ul>
              {category.entries.map((entry) =>
                'keys' in entry ? (
                  <RegisteredRow key={entry.label} label={entry.label} keys={entry.keys} />
                ) : (
                  <TextRow key={entry.label} label={entry.label} text={entry.text} />
                ),
              )}
            </ul>
          </section>
        ))}

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

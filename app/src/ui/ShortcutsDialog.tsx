import { useState, useSyncExternalStore, type JSX, type KeyboardEvent } from 'react';
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
import { isApplePlatform, useShortcutHint } from './shortcuts.ts';
import type { ComponentShortcuts } from './component-shortcuts.ts';
import {
  getBindings,
  keyEventToKeys,
  resetBindings,
  setBinding,
  subscribeBindings,
  type ShortcutId,
} from './shortcut-bindings.ts';

/**
 * Diálogo «Ver → Atajos».
 *
 * Los atajos registrados se agrupan por categoría y se editan desde acá. El
 * texto de cada tecla sale de `useShortcutHint` con la combinación vigente del
 * store, así que ⌘ en Apple y Ctrl en el resto siguen viniendo del registro.
 * Los gestos del lienzo no son atajos registrados y se muestran como texto.
 */
type Entry =
  | { label: string; id: ShortcutId }
  | { label: string; keys: string; fixed: true }
  | { label: string; text: string };

const CATEGORIES: Array<{ name: string; entries: Entry[] }> = [
  {
    name: 'Archivo',
    entries: [
      { label: 'Guardar', id: 'save' },
      { label: 'Guardar como…', id: 'saveAs' },
    ],
  },
  {
    name: 'Edición',
    entries: [
      { label: 'Deshacer', id: 'undo' },
      { label: 'Rehacer', id: 'redo' },
      { label: 'Copiar la selección', id: 'copy' },
      { label: 'Pegar', id: 'paste' },
      { label: 'Rotar 90°', id: 'rotateRight' },
      { label: 'Rotar −90°', id: 'rotateLeft' },
      { label: 'Borrar la selección', id: 'delete' },
      { label: 'Borrar el vértice enfocado', id: 'backspace' },
    ],
  },
  {
    name: 'Ver',
    entries: [{ label: 'Encuadrar el dibujo', id: 'fit' }],
  },
  {
    name: 'Simulación',
    entries: [{ label: 'Simular o detener la simulación', id: 'simulate' }],
  },
  {
    name: 'Lienzo',
    entries: [
      { label: 'Cancelar lo que esté en curso', keys: 'escape', fixed: true },
      { label: 'Tab + flechas cablean', text: 'Tab + Flechas' },
      { label: 'Elegir el borne y conectar el cable', text: 'Intro' },
      { label: 'Cancelar el gesto del lienzo', text: 'Clic derecho' },
      { label: 'Desplazar el plano', text: 'Alt + arrastrar' },
    ],
  },
];

const STATUS_ID = 'shortcut-capture-status';

const EDITABLE_LABELS: Record<ShortcutId, string> = Object.fromEntries(
  CATEGORIES.flatMap((category) =>
    category.entries.flatMap((entry) => ('id' in entry ? [[entry.id, entry.label]] : [])),
  ),
) as Record<ShortcutId, string>;

const ROW_CLASS = 'flex items-center justify-between gap-4 py-1 text-sm';

/** Tecla: superficie de control, sin sombra y con números tabulares. */
const KEY_CLASS =
  'shrink-0 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] leading-none tabular-nums text-foreground';

const SECTION_CLASS = 'pt-3 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase';

/** Fila editable: muestra el hint o, mientras captura, el botón que lo graba. */
function EditableRow({
  id,
  label,
  keys,
  editing,
  capturing,
  onStart,
  onCapture,
}: {
  id: ShortcutId;
  label: string;
  keys: string;
  editing: boolean;
  capturing: boolean;
  onStart: () => void;
  onCapture: (event: KeyboardEvent<HTMLButtonElement>) => void;
}): JSX.Element {
  const hint = useShortcutHint(keys).text;
  return (
    <li data-shortcut-id={id} className={ROW_CLASS}>
      <span>{label}</span>
      {editing ? (
        <button
          type="button"
          aria-label={
            capturing
              ? `Capturando atajo de ${label}. Presioná la combinación…`
              : `Cambiar atajo de ${label}: ${hint}`
          }
          aria-describedby={capturing ? STATUS_ID : undefined}
          onClick={onStart}
          onKeyDown={capturing ? onCapture : undefined}
          className="min-h-6 shrink-0 rounded-md px-2 py-0.5 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[capturing=true]:bg-accent"
          data-capturing={capturing}
        >
          {capturing ? 'Presioná la combinación…' : <kbd aria-hidden="true">{hint}</kbd>}
        </button>
      ) : (
        <kbd aria-hidden="true" className={KEY_CLASS}>
          {hint}
        </kbd>
      )}
    </li>
  );
}

/** Atajo fijo: se muestra igual que los demás pero no se puede cambiar. */
function FixedRow({ label, keys }: { label: string; keys: string }): JSX.Element {
  const hint = useShortcutHint(keys).text;
  return (
    <li className={ROW_CLASS}>
      <span>{label}</span>
      <kbd aria-hidden="true" className={KEY_CLASS}>
        {hint}
      </kbd>
    </li>
  );
}

function TextRow({ label, text }: { label: string; text: string }): JSX.Element {
  return (
    <li className={ROW_CLASS}>
      <span>{label}</span>
      <kbd aria-hidden="true" className={KEY_CLASS}>
        {text}
      </kbd>
    </li>
  );
}

/** Atajo asignado a un componente del plano abierto. */
function ComponentRow({ designator, keys }: { designator: string; keys: string }): JSX.Element {
  const hint = useShortcutHint(keys).text;
  return (
    <li className={ROW_CLASS}>
      <span className="font-mono text-xs text-foreground">{designator}</span>
      <kbd aria-hidden="true" className={KEY_CLASS}>
        {hint}
      </kbd>
    </li>
  );
}

export function ShortcutsDialog({
  open,
  onOpenChange,
  componentShortcuts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Atajos del plano abierto, guardados en el sidecar `.keys.json`. */
  componentShortcuts?: ComponentShortcuts | null;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [capturing, setCapturing] = useState<ShortcutId | null>(null);
  const [status, setStatus] = useState('');
  const bindings = useSyncExternalStore(subscribeBindings, getBindings, getBindings);

  const startCapture = (id: ShortcutId): void => {
    setCapturing(id);
    setStatus(`Presioná la combinación nueva para «${EDITABLE_LABELS[id]}». Escape cancela.`);
  };

  const capture = (id: ShortcutId, event: KeyboardEvent<HTMLButtonElement>): void => {
    // IME: una tecla de composición no es una combinación; se deja pasar.
    if (event.nativeEvent.isComposing || event.key === 'Process') return;
    // El botón tiene el foco: la tecla es nuestra, no del atajo global ni del
    // navegador. React corre antes del listener de document de ui-sdk.
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setCapturing(null);
      setStatus('Captura cancelada.');
      return;
    }
    const keys = keyEventToKeys(event.nativeEvent, isApplePlatform());
    if (keys === null) {
      setStatus('Combinación no válida o reservada por el navegador.');
      return;
    }
    const result = setBinding(id, keys);
    if (result.ok) {
      setCapturing(null);
      setStatus('Atajo actualizado.');
    } else if (result.reason === 'conflict' && result.conflictWith) {
      setStatus(`Esa tecla ya la usa «${EDITABLE_LABELS[result.conflictWith]}».`);
    } else if (result.reason === 'reserved') {
      setStatus('Esa tecla está reservada por el navegador.');
    } else {
      setStatus('Combinación incompleta: agregá una tecla.');
    }
  };

  const toggleEditing = (): void => {
    setEditing((value) => !value);
    setCapturing(null);
    setStatus('');
  };

  const componentEntries = Object.entries(componentShortcuts?.bindings ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const renderCategory = (category: (typeof CATEGORIES)[number]): JSX.Element => (
    <section key={category.name}>
      <h3 className={SECTION_CLASS}>{category.name}</h3>
      <ul>
        {category.entries.map((entry) =>
          'id' in entry ? (
            <EditableRow
              key={entry.id}
              id={entry.id}
              label={entry.label}
              keys={bindings[entry.id]}
              editing={editing}
              capturing={capturing === entry.id}
              onStart={() => startCapture(entry.id)}
              onCapture={(event) => capture(entry.id, event)}
            />
          ) : 'keys' in entry ? (
            <FixedRow key={entry.label} label={entry.label} keys={entry.keys} />
          ) : (
            <TextRow key={entry.label} label={entry.label} text={entry.text} />
          ),
        )}
      </ul>
    </section>
  );

  const componentSection = (
    <section>
      <div className="flex items-center justify-between gap-4">
        <h3 className={SECTION_CLASS}>Componentes del plano</h3>
        <span className="rounded-full border border-border px-1.5 py-px font-mono text-[10px] tabular-nums text-muted-foreground">
          {componentEntries.length}
        </span>
      </div>
      {componentEntries.length === 0 ? (
        <p className="py-1 text-sm text-muted-foreground">
          Este plano no tiene atajos de componente. Seleccioná uno y asignalo desde el inspector.
        </p>
      ) : (
        <ul>
          {componentEntries.map(([designator, keys]) => (
            <ComponentRow key={designator} designator={designator} keys={keys} />
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(38rem,88vh)] overflow-y-auto sm:w-[min(768px,calc(100vw-2rem))]">
        <div className="flex items-start justify-between gap-4">
          <DialogHeader>
            <DialogTitle>Atajos de teclado</DialogTitle>
            <DialogDescription>
              Los atajos del editor y los del plano abierto, agrupados por lo que hacen. Las teclas se
              muestran para tu plataforma.
            </DialogDescription>
          </DialogHeader>
          <Button size="sm" variant="outline" aria-pressed={editing} onClick={toggleEditing}>
            {editing ? 'Listo' : 'Personalizar'}
          </Button>
        </div>

        <div className="grid gap-x-6 sm:grid-cols-2 sm:divide-x sm:divide-border">
          <div className="sm:pr-6">
            {CATEGORIES.filter((category) => category.name !== 'Lienzo').map(renderCategory)}
          </div>
          <div className="sm:pl-6">
            {componentShortcuts !== undefined && componentSection}
            {CATEGORIES.filter((category) => category.name === 'Lienzo').map(renderCategory)}
          </div>
        </div>

        <p id={STATUS_ID} role="status" aria-live="polite" className="min-h-4 pt-2 text-xs text-muted-foreground">
          {status}
        </p>

        <DialogFooter>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              resetBindings();
              setCapturing(null);
              setStatus('Atajos restablecidos.');
            }}
          >
            Restablecer
          </Button>
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

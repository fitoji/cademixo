/**
 * Versiones recuperables del proyecto actual. Cada copia se descarga aparte:
 * acá nunca se repara ni se reescribe el archivo original.
 */

import type { JSX } from 'react';
import { Button } from '../components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx';
import type { RecoveryEntry } from './recovery-store.ts';
import { describeDestination } from './storage-contract.ts';

export function RecoveryDialog({
  open,
  projectId,
  entries,
  onCancel,
  onDownload,
  onDelete,
}: {
  open: boolean;
  projectId: string;
  entries: readonly RecoveryEntry[];
  onCancel: () => void;
  onDownload: (entry: RecoveryEntry) => void;
  onDelete: (entry: RecoveryEntry) => void;
}): JSX.Element {
  const contract = describeDestination('recovery-copy');
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Versiones recuperables</DialogTitle>
          <DialogDescription>
            Copias de «{projectId}» guardadas en este navegador. {contract.note}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-2">
          {entries.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay copias guardadas.</p>}
          {entries.map((entry) => (
            <div key={entry.revisionId} className="flex items-center gap-2 rounded-md border px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs">
                  {entry.name} · {entry.revisionId.slice(0, 8)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()} · {entry.bytes.byteLength} bytes
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onDownload(entry)}>
                Descargar copia
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDelete(entry)}>
                Borrar
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

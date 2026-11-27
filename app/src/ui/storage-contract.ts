/**
 * Contrato público de cada destino de guardado.
 *
 * La interfaz comunica qué garantía ofrece el destino, no sólo si la llamada
 * terminó sin excepción. Un «éxito» del navegador al iniciar una descarga NO es
 * una escritura verificada.
 */

export type StorageGuarantee = 'verified' | 'download-started';

export type StorageDestination = 'file-handle' | 'download' | 'recovery-copy';

export interface DestinationContract {
  readonly destination: StorageDestination;
  readonly guarantee: StorageGuarantee;
  readonly preservesPreviousGeneration: boolean;
  readonly survivesBrowserDataClear: boolean;
  readonly repairsOriginal: boolean;
  readonly note: string;
}

const CONTRACTS: Record<StorageDestination, DestinationContract> = {
  'file-handle': {
    destination: 'file-handle',
    guarantee: 'verified',
    preservesPreviousGeneration: true,
    survivesBrowserDataClear: true,
    repairsOriginal: false,
    note: 'El archivo se releyó y coincide con los bytes validados; la generación anterior quedó guardada antes de reemplazarlo.',
  },
  download: {
    destination: 'download',
    guarantee: 'download-started',
    preservesPreviousGeneration: false,
    survivesBrowserDataClear: false,
    repairsOriginal: false,
    note: 'Los bytes se validaron antes de descargar, pero el navegador no confirma el archivo: no es una escritura verificada.',
  },
  'recovery-copy': {
    destination: 'recovery-copy',
    guarantee: 'download-started',
    preservesPreviousGeneration: false,
    survivesBrowserDataClear: false,
    repairsOriginal: false,
    note: 'La copia se descarga aparte y nunca repara el archivo original; vive en este navegador y se pierde si borras los datos del sitio.',
  },
};

export function describeDestination(destination: StorageDestination): DestinationContract {
  return CONTRACTS[destination];
}

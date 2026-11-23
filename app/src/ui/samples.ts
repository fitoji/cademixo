/**
 * Carga de archivos `.cade` en el navegador.
 *
 * Detalle importante: se decodifica como latin1 (un byte = un carácter) en vez
 * de UTF-8. El formato es texto de un byte por carácter y decodificarlo como
 * UTF-8 corrompería los acentos y rompería el round-trip.
 *
 * La codificación de vuelta a bytes vive en `ui/files.ts` (`encodeLatin1`),
 * junto a la escritura del archivo del usuario: un solo lugar decide los bytes
 * que se guardan, se descargue o se reescriba el archivo abierto.
 */

import motorConInversionUrl from '../../test/fixtures/motor_con_inversion_giro.cad?url';
import marchaMotorUrl from '../../test/fixtures/marcha_motor.cad?url';
import { encodeLatin1 } from './files.ts';

export interface Sample {
  name: string;
  label: string;
  url: string;
}

export const SAMPLES: Sample[] = [
  { name: 'motor_con_inversion_giro.cad', label: 'Motor con inversión de giro', url: motorConInversionUrl },
  { name: 'marcha_motor.cad', label: 'Marcha del motor', url: marchaMotorUrl },
];

const decoder = new TextDecoder('latin1');

export async function loadSample(sample: Sample): Promise<string> {
  const res = await fetch(sample.url);
  if (!res.ok) throw new Error(`no se pudo abrir ${sample.name}: ${res.status}`);
  return decoder.decode(await res.arrayBuffer());
}

export async function loadFile(file: File): Promise<{ text: string; name: string }> {
  const buf = await file.arrayBuffer();
  return { text: decoder.decode(buf), name: file.name };
}

export function downloadCade(text: string, name: string): void {
  const blob = new Blob([encodeLatin1(text).buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

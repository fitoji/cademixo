/**
 * Codificación del formato v1: un carácter = un byte (Latin-1).
 *
 * Un solo lugar decide los bytes del archivo, tanto para la escritura con
 * handle como para la descarga y para la verificación por relectura. Usar
 * `TextEncoder` (UTF-8) acá rompería los largos de `CADEMIXO/1` y los acentos
 * CADe; `& 0xff` recortaría un carácter fuera de Latin-1 sin avisar, así que la
 * verificación de la revisión detecta ese caso.
 */

export function encodeLatin1(text: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

const decoder = new TextDecoder('latin1');

export function decodeLatin1(bytes: ArrayBuffer | ArrayBufferView): string {
  return decoder.decode(bytes);
}

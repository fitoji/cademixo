/**
 * Escribe una hoja cableada al disco para abrirla en el navegador (traza).
 *
 * Uso: node bench/write-sheet.ts <salida.cad> [registros]
 */
import { writeFileSync } from 'node:fs';
import { wiredSheetText } from './wired-sheet.ts';

const out = process.argv[2];
const target = Number(process.argv[3] ?? 10000);
if (!out || !Number.isFinite(target) || target <= 0) {
  console.error('uso: node bench/write-sheet.ts <salida.cad> [registros]');
  process.exit(1);
}

const sheet = wiredSheetText(target);
writeFileSync(out, sheet.text, 'latin1');
console.log(JSON.stringify({ out, ...sheet }, null, 2));

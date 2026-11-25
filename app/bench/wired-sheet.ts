/**
 * Generador de hojas cableadas para benchmarks.
 *
 * No inventa un circuito: replica el bloque real `arranque-paro-motor-3f.cad`
 * (12 componentes, 27 cables, uniones y derivaciones) desplazándolo en X y
 * renumerando ids. Así la red resultante tiene la misma clase de conectividad
 * que un dibujo real, que es lo que el benchmark necesita medir.
 *
 * Determinista: la misma cantidad de registros produce siempre el mismo texto.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEditor, projectOf } from '../src/editor/state.ts';
import { buildNetwork } from '../src/editor/network.ts';
import { GEOMETRY, withId, withPosition, withWirePoints } from '../src/model/project.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');
const REFERENCE = readFileSync(join(FIXTURES, 'arranque-paro-motor-3f.cad'), 'latin1');

/** Separación horizontal entre bloques, en unidades del dibujo. */
const BLOCK_GAP = 400;

export interface WiredSheet {
  text: string;
  records: number;
  components: number;
  cables: number;
  junctions: number;
  blocks: number;
}

export function wiredSheetText(targetRecords: number): WiredSheet {
  const base = projectOf(createEditor(REFERENCE));
  if (base.sheets.length !== 1) {
    throw new Error(`el fixture de referencia debe tener una hoja, tiene ${base.sheets.length}`);
  }
  const titleId = base.sheets[0]?.titleBlock?.id ?? null;
  const blockSize = base.records.length;
  const blocks = Math.max(1, Math.ceil(targetRecords / blockSize));

  const raws: string[] = [];
  let id = 1;
  for (let b = 0; b < blocks; b++) {
    const dx = b * BLOCK_GAP;
    for (const rec of base.records) {
      // El cajetín es único por hoja: no se replica.
      if (b > 0 && rec.id === titleId) continue;
      const g = rec.geometry;
      let raw = rec.raw;
      if (rec.kind === 'connection' && g.length > GEOMETRY.y2) {
        raw = withWirePoints(rec, {
          x1: g[GEOMETRY.x]! + dx,
          y1: g[GEOMETRY.y]!,
          x2: g[GEOMETRY.x2]! + dx,
          y2: g[GEOMETRY.y2]!,
        });
      } else if (g.length > GEOMETRY.y) {
        raw = withPosition(rec, g[GEOMETRY.x]! + dx, g[GEOMETRY.y]!);
      }
      raws.push(withId({ ...rec, raw }, id++));
    }
  }

  const text = (base.hasMagic ? 'CADe_SIMU' : '') + base.prefix + raws.join('');
  const check = projectOf(createEditor(text));
  const cables = check.records.filter((r) => r.kind === 'connection').length;
  const components = check.records.filter((r) => r.kind === 'component').length;
  const network = buildNetwork(check.records);
  const junctions = [...network.nodes.values()].filter((n) => n.junction || n.kind === 'tee').length;

  // Guardas: un benchmark sobre un documento que no re-parsea o que perdió la
  // conectividad mediría otra cosa.
  if (check.records.length !== raws.length) {
    throw new Error(`el documento generado no re-parsea: ${check.records.length} de ${raws.length} registros`);
  }
  if (cables === 0 || junctions === 0) {
    throw new Error(`la hoja generada no tiene cableado: ${cables} cables, ${junctions} uniones`);
  }

  return { text, records: check.records.length, components, cables, junctions, blocks };
}

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
import { attachPoints } from '../src/editor/pins.ts';
import { CABLE_NUMBER_INDEX, buildNetwork, netKey } from '../src/editor/network.ts';
import { wirePathsOf } from '../src/editor/wiring/types.ts';
import { GEOMETRY, wirePoints, withId, withPosition, withWirePoints } from '../src/model/project.ts';

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
  /** Componente conectado de un bloque central, para trazas en navegador. */
  traceId: number;
  /** Tramo interior de una polilínea agrupada real del bloque central. */
  traceGroupedWireId: number;
  /** Tramo extremo de esa misma polilínea (el commit usa bendCable). */
  traceGroupedEndWireId: number;
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
  const componentIdsByBlock: number[][] = [];
  let id = 1;
  for (let b = 0; b < blocks; b++) {
    const dx = b * BLOCK_GAP;
    const blockComponents: number[] = [];
    for (const rec of base.records) {
      // El cajetín es único por hoja: no se replica.
      if (b > 0 && rec.id === titleId) continue;
      const g = rec.geometry.slice();
      // Cada bloque es un circuito independiente: sus cables llevan número
      // propio. Si se repite el número, `wirePathsOf` agrupa tramos de bloques
      // distintos en una sola polilínea y el gesto de tramo se anula.
      if (rec.kind === 'connection' && g.length > CABLE_NUMBER_INDEX) {
        g[CABLE_NUMBER_INDEX] = (g[CABLE_NUMBER_INDEX] ?? 0) + b * 1000;
      }
      let raw = rec.raw;
      if (rec.kind === 'connection' && g.length > GEOMETRY.y2) {
        raw = withWirePoints({ ...rec, geometry: g }, {
          x1: g[GEOMETRY.x]! + dx,
          y1: g[GEOMETRY.y]!,
          x2: g[GEOMETRY.x2]! + dx,
          y2: g[GEOMETRY.y2]!,
        });
      } else if (g.length > GEOMETRY.y) {
        raw = withPosition(rec, g[GEOMETRY.x]! + dx, g[GEOMETRY.y]!);
      }
      if (rec.kind === 'component') blockComponents.push(id);
      raws.push(withId({ ...rec, raw }, id++));
    }
    componentIdsByBlock.push(blockComponents);
  }

  const text = (base.hasMagic ? 'CADe_SIMU' : '') + base.prefix + raws.join('');
  const check = projectOf(createEditor(text));
  const cables = check.records.filter((r) => r.kind === 'connection').length;
  const components = check.records.filter((r) => r.kind === 'component').length;
  const network = buildNetwork(check.records);
  const junctions = [...network.nodes.values()].filter((n) => n.junction || n.kind === 'tee').length;

  // Componente conectado de un bloque central: la traza en navegador necesita
  // arrastrar algo con cables, no un símbolo suelto en el borde de la hoja.
  const pins = attachPoints(check.records);
  const midBlock = Math.floor(componentIdsByBlock.length / 2);
  let traceId = 0;
  for (const candidate of componentIdsByBlock[midBlock] ?? []) {
    const connected = (pins.get(candidate) ?? []).some((p) => {
      const node = network.nodes.get(netKey(0, p.x, p.y));
      return node !== undefined && (node.ends.length > 0 || node.through.length > 0);
    });
    if (connected) {
      traceId = candidate;
      break;
    }
  }
  if (traceId === 0) {
    throw new Error('la hoja generada no tiene un componente conectado para trazar');
  }

  // Polilínea agrupada real (varios registros con el mismo número de cable) en
  // el bloque central: es el caso que el preview por documento todavía cubre.
  const midX = Math.floor(blocks / 2) * BLOCK_GAP;
  let traceGroupedWireId = 0;
  let traceGroupedEndWireId = 0;
  for (const path of wirePathsOf(network)) {
    if (path.segmentIds.length < 2) continue;
    const middle = path.segmentIds[Math.floor(path.segmentIds.length / 2)]!;
    const rec = check.records.find((r) => r.id === middle);
    const pts = rec ? wirePoints(rec) : null;
    if (!pts) continue;
    const cx = (pts.x1 + pts.x2) / 2;
    if (cx < midX || cx > midX + BLOCK_GAP) continue;
    traceGroupedWireId = middle;
    traceGroupedEndWireId = path.segmentIds[0]!;
    break;
  }
  if (traceGroupedWireId === 0) {
    throw new Error('la hoja generada no tiene una polilínea agrupada en el bloque central');
  }

  // Guardas: un benchmark sobre un documento que no re-parsea o que perdió la
  // conectividad mediría otra cosa.
  if (check.records.length !== raws.length) {
    throw new Error(`el documento generado no re-parsea: ${check.records.length} de ${raws.length} registros`);
  }
  if (cables === 0 || junctions === 0) {
    throw new Error(`la hoja generada no tiene cableado: ${cables} cables, ${junctions} uniones`);
  }

  return { text, records: check.records.length, components, cables, junctions, blocks, traceId, traceGroupedWireId, traceGroupedEndWireId };
}

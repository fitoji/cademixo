/**
 * Benchmark del preview del editor (etapa 0 del plan astra-optimizacion).
 *
 * Mide por separado lo que ocurre mientras se arrastra y lo que ocurre al
 * soltar, sobre hojas cableadas de 1.000, 5.000 y 10.000 registros.
 *
 * Qué mide: el costo de estado y de las derivaciones que el editor ejecuta en
 * cada fase. Qué NO mide: render de React, entrega de cuadros ni pintura del
 * navegador. Los números son costo de JavaScript en Node, no FPS.
 *
 * Uso:
 *   node --expose-gc bench/editor-preview.ts
 *   node --expose-gc bench/editor-preview.ts --json
 *   node --expose-gc bench/editor-preview.ts --sizes=1000,5000,10000 --runs=7
 */
import { createEditor, applyDrag, projectOf, select } from '../src/editor/state.ts';
import { buildNetwork, validate } from '../src/editor/network.ts';
import { attachPoints } from '../src/editor/pins.ts';
import { snapContext } from '../src/editor/wiring/snap.ts';
import { hitContext } from '../src/editor/wiring/hitTest.ts';
import { circuitFrom } from '../src/sim/circuit.ts';
import { WIRE_CORNER_TOL, wireCornerPaths } from '../src/ui/wire-corner.ts';
import { wirePoints } from '../src/model/project.ts';
import { wiredSheetText } from './wired-sheet.ts';

const MOVE_RUNS = Number(argValue('runs') ?? 7);
const RELEASE_RUNS = Math.max(1, Math.min(3, Math.floor(MOVE_RUNS / 2)));
const CORNER_RADIUS = 3;
const JSON_OUT = process.argv.includes('--json');

function argValue(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

function sizes(): number[] {
  const raw = argValue('sizes');
  if (!raw) return [1000, 5000, 10000];
  return raw.split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0);
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

const gc = (): void => (globalThis as { gc?: () => void }).gc?.();

interface Breakdown {
  total: number;
  [part: string]: number;
}

interface SizeResult {
  requested: number;
  records: number;
  components: number;
  cables: number;
  junctions: number;
  blocks: number;
  moveRuns: number;
  releaseRuns: number;
  move: Breakdown;
  release: Breakdown;
}

function summarize(samples: Array<Record<string, number>>): Breakdown {
  const parts = Object.keys(samples[0]!);
  const out: Breakdown = { total: median(samples.map((s) => s.total!)) };
  for (const p of parts) {
    if (p === 'total') continue;
    out[p] = median(samples.map((s) => s[p]!));
  }
  return out;
}

const fmt = (n: number): string => n.toFixed(1).padStart(6);

function line(label: string, b: Breakdown, order: string[]): string {
  const parts = order
    .filter((p) => b[p] !== undefined && p !== 'total')
    .map((p) => `${p} ${b[p]!.toFixed(1)}` )
    .join(' · ');
  return `  ${label} mediana ${fmt(b.total)} ms   [${parts}]`;
}

function runSize(target: number): SizeResult {
  const sheet = wiredSheetText(target);
  const state = createEditor(sheet.text);
  const project = projectOf(state);
  const component = project.records.find((r) => r.kind === 'component');
  if (!component) throw new Error('la hoja generada no tiene componentes');

  const baseState = select(state, [component.id]);
  const opOf = (r: number): Parameters<typeof applyDrag>[1] => ({
    kind: 'move',
    dx: 1 + r,
    dy: 1,
  });
  if (applyDrag(baseState, opOf(0)).text === baseState.text) {
    throw new Error('la operación de arrastre no modifica el texto: el benchmark mediría un preview vacío');
  }

  const moveSamples: Array<Record<string, number>> = [];
  for (let r = 0; r < MOVE_RUNS; r++) {
    gc();
    const t0 = performance.now();
    const next = applyDrag(baseState, opOf(r));
    const t1 = performance.now();
    const preview = projectOf(next);
    const t2 = performance.now();
    const sh = preview.sheets[0]!;
    const records = preview.records.slice(sh.startRecord, sh.endRecord);
    attachPoints(records);
    const t3 = performance.now();
    const network = buildNetwork(records);
    const t4 = performance.now();
    snapContext(network, records, sh.index);
    const t5 = performance.now();
    hitContext(network, records, sh.index);
    const t6 = performance.now();
    const hardPoints = [...network.nodes.values()]
      .filter((n) => n.junction || n.pin || n.through.length > 0)
      .map((n) => ({ x: n.x, y: n.y }));
    const pinned = (x: number, y: number): boolean =>
      hardPoints.some((p) => Math.abs(p.x - x) < WIRE_CORNER_TOL && Math.abs(p.y - y) < WIRE_CORNER_TOL);
    const segments = records
      .filter((r) => r.kind === 'connection')
      .map((r) => ({ id: r.id, sheet: r.sheet, ...wirePoints(r)! }))
      .filter((s) => Number.isFinite(s.x1));
    wireCornerPaths(segments, CORNER_RADIUS, pinned);
    const t7 = performance.now();
    moveSamples.push({
      total: t7 - t0,
      applyDrag: t1 - t0,
      projectOf: t2 - t1,
      attachPoints: t3 - t2,
      buildNetwork: t4 - t3,
      snapContext: t5 - t4,
      hitContext: t6 - t5,
      wireCornerPaths: t7 - t6,
    });
  }

  const releaseSamples: Array<Record<string, number>> = [];
  for (let r = 0; r < RELEASE_RUNS; r++) {
    gc();
    const t0 = performance.now();
    const next = applyDrag(baseState, opOf(MOVE_RUNS + r));
    const t1 = performance.now();
    const committed = projectOf(next);
    const t2 = performance.now();
    buildNetwork(committed.records);
    const t3 = performance.now();
    validate(committed.records);
    const t4 = performance.now();
    circuitFrom(committed.records, {});
    const t5 = performance.now();
    releaseSamples.push({
      total: t5 - t0,
      applyDrag: t1 - t0,
      projectOf: t2 - t1,
      buildNetwork: t3 - t2,
      validate: t4 - t3,
      circuitFrom: t5 - t4,
    });
  }

  return {
    requested: target,
    records: sheet.records,
    components: sheet.components,
    cables: sheet.cables,
    junctions: sheet.junctions,
    blocks: sheet.blocks,
    moveRuns: MOVE_RUNS,
    releaseRuns: RELEASE_RUNS,
    move: summarize(moveSamples),
    release: summarize(releaseSamples),
  };
}

const results: SizeResult[] = sizes().map(runSize);

if (JSON_OUT) {
  console.log(JSON.stringify({ node: process.version, results }, null, 2));
} else {
  console.log('cademixo · benchmark del preview del editor (etapa 0)');
  console.log(`Node ${process.version} · hojas cableadas: bloque real de 43 registros replicado cada 400 u, una hoja`);
  console.log('Costo de estado y derivaciones. NO mide render de React ni presentación en el navegador.');
  console.log('');
  for (const r of results) {
    console.log(
      `${r.records} registros (${r.components} comp · ${r.cables} cables · ${r.junctions} uniones) · ${r.blocks} bloques`,
    );
    console.log(line('mover ', r.move, Object.keys(r.move)));
    console.log(line('soltar', r.release, Object.keys(r.release)));
    console.log('');
  }
  if (!globalThis.gc) console.log('aviso: corré con --expose-gc para reducir ruido de recolección.');
}

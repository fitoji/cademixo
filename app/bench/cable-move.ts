/**
 * Benchmark del manejo de cables al mover componentes.
 *
 * Separa lo que cuesta el PREVIEW (cada evento del puntero) de lo que cuesta la
 * CONFIRMACIÓN (una sola operación de historial), en el fixture K2M y en una
 * hoja cableada grande.
 *
 * Uso:
 *   node --expose-gc bench/cable-move.ts
 *   node --expose-gc bench/cable-move.ts --json
 *   node --expose-gc bench/cable-move.ts --records=5000
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createEditor, applyDrag, projectOf, select } from '../src/editor/state.ts';
import { buildNetwork } from '../src/editor/network.ts';
import { prepareCableMove, planCableMove } from '../src/editor/wiring/cable-move.ts';
import { wiredSheetText } from './wired-sheet.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(here, '..', 'test', 'fixtures', 'motor_con_inversion_giro.cad'), 'latin1');
const K2M = 55;

const arg = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
};
const JSON_OUT = process.argv.includes('--json');
const LARGE = Number(arg('records') ?? 5000);

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};
const ms = (value: number): string => value.toFixed(2).padStart(8);

function fixtureBench(): Record<string, number | string | boolean> {
  const state = select(createEditor(fixture), [K2M]);
  const project = projectOf(state);
  const network = buildNetwork(project.records);

  const prepareStart = performance.now();
  const ctx = prepareCableMove(project.records, new Set([K2M]), undefined, network);
  const prepare = performance.now() - prepareStart;

  const previews: number[] = [];
  for (let i = 0; i < 120; i++) {
    const start = performance.now();
    planCableMove(ctx, 3 + (i % 36), 0, { validate: false });
    previews.push(performance.now() - start);
  }

  const commits: number[] = [];
  for (let i = 0; i < 30; i++) {
    const start = performance.now();
    applyDrag(state, { kind: 'move', dx: 3 + (i % 24), dy: 0 }, 'ortogonal');
    commits.push(performance.now() - start);
  }

  return {
    case: 'K2M fixture',
    records: project.records.length,
    prepare: +prepare.toFixed(2),
    preview: +median(previews).toFixed(3),
    commit: +median(commits).toFixed(2),
    accepted: planCableMove(ctx, 12, 0, { validate: true }).ok,
  };
}

function largeBench(records: number): Record<string, number | string | boolean> {
  const sheet = wiredSheetText(records);
  const state = select(createEditor(sheet.text), [sheet.traceId]);
  const project = projectOf(state);
  const network = buildNetwork(project.records);

  const prepareStart = performance.now();
  const ctx = prepareCableMove(project.records, new Set([sheet.traceId]), undefined, network, { groups: false });
  const prepare = performance.now() - prepareStart;

  const previews: number[] = [];
  for (let i = 0; i < 60; i++) {
    const start = performance.now();
    planCableMove(ctx, 3 + (i % 6), 0, { validate: false });
    previews.push(performance.now() - start);
  }

  const checks: number[] = [];
  for (let i = 0; i < 15; i++) {
    const start = performance.now();
    planCableMove(ctx, 3, 0, { validate: true });
    checks.push(performance.now() - start);
  }

  return {
    case: `large sheet (~${records})`,
    records: project.records.length,
    prepare: +prepare.toFixed(1),
    preview: +median(previews).toFixed(2),
    commit: +median(checks).toFixed(2),
    accepted: planCableMove(ctx, 3, 0, { validate: true }).ok,
  };
}

const results = [fixtureBench(), largeBench(LARGE)];
if (JSON_OUT) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log('caso                    registros  prepare(ms)  preview(ms)  commit(ms)  acepta');
  for (const row of results) {
    console.log(
      `${String(row.case).padEnd(22)} ${String(row.records).padStart(9)} ${ms(Number(row.prepare))} ${ms(Number(row.preview))} ${ms(Number(row.commit))}  ${row.accepted ? 'sí' : 'no'}`,
    );
  }
  console.log('\npreview = plan geométrico por evento; commit = plan + validación de grupos + historial.');
}

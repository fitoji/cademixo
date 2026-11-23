/**
 * Genera el par de archivos del spike de atajos por componente:
 *
 *   spike/atajos-cadesimu-base.cad  — fixture original, copia de control
 *   spike/atajos-cadesimu.cad       — el mismo archivo + registro de metadata
 *
 * Uso: `node scripts/make-shortcut-spike.ts` desde `app/`.
 *
 * El objetivo es que el usuario abra el segundo en CADe_SIMU (Windows), lo
 * guarde y verifique si el registro `*<id>*99999#SIMKEYS1:…` sobrevive. Hasta
 * que eso se confirme, la app no escribe esta metadata en archivos del usuario.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { parse } from '../src/format/cade.ts';
import {
  SHORTCUT_MARKER,
  SHORTCUT_RECORD_CODE,
  withComponentShortcuts,
  type ComponentShortcuts,
} from '../src/format/cade-shortcuts.ts';

const SOURCE = new URL('../test/fixtures/ej0def.cad', import.meta.url);
const OUT_DIR = new URL('../spike/', import.meta.url);
const BASE_OUT = new URL('atajos-cadesimu-base.cad', OUT_DIR);
const SPIKE_OUT = new URL('atajos-cadesimu.cad', OUT_DIR);

const metadata: ComponentShortcuts = {
  version: 1,
  bindings: {
    Q1: 'mod+q',
    KM1: 'shift+k',
  },
};

const original = readFileSync(SOURCE, 'utf8');
const spike = withComponentShortcuts(original, metadata);
const before = parse(original);
const after = parse(spike);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(BASE_OUT, original);
writeFileSync(SPIKE_OUT, spike);

const extra = after.records.at(-1);
console.log(`fuente:            ${SOURCE.pathname}`);
console.log(`copia de control:  ${BASE_OUT.pathname}`);
console.log(`archivo del spike: ${SPIKE_OUT.pathname}`);
console.log(`registros:         ${before.records.length} -> ${after.records.length}`);
console.log(`registro extra:    id ${extra?.id} · código ${extra?.code} · ${SHORTCUT_MARKER}…`);
console.log(`bytes:             ${original.length} -> ${spike.length}`);
console.log(`código del registro: ${SHORTCUT_RECORD_CODE}`);

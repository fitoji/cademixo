/**
 * Traza en navegador del preview del editor (etapa 0, segunda parte).
 *
 * Sobre una hoja cableada de ~9.800 registros y vista fija:
 *  - MOVER: desde pointerdown hasta antes de pointerup. p95 del intervalo entre
 *    callbacks de rAF, más una pasada aparte con muestreo de CPU para atribuir
 *    tiempo propio por función (React vs. estado vs. red).
 *  - SOLTAR: desde pointerup hasta el primer cuadro en el que el DOM muestra la
 *    edición confirmada (el gesto entra al historial). Es latencia hasta
 *    actualización de DOM, no presentación confirmada en pantalla.
 *
 * No corre por defecto: PREVIEW_TRACE=1 pnpm --filter electro-simulador trace
 */
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const RECORDS = Number(process.env.PREVIEW_TRACE_RECORDS ?? 9787);
const RUNS = Number(process.env.PREVIEW_TRACE_RUNS ?? 5);
const STEPS = Number(process.env.PREVIEW_TRACE_STEPS ?? 12);
const STEP_PX = 4;
const TARGET_ZOOM = 2;
const OUT = process.env.PREVIEW_TRACE_OUT ?? join(tmpdir(), 'preview-trace.json');
const URL_OVERRIDE = process.env.PREVIEW_TRACE_URL;
const PROFILE = process.env.PREVIEW_TRACE_PROFILE !== '0';

const pct = (xs: number[], p: number): number => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))]!;
};

type Row = { name: string; ms: number; url: string };

/** Suma de tiempo propio (ms) por función a partir de un perfil de V8. */
function selfTimes(profile: { nodes: any[]; samples: number[]; timeDeltas: number[] }): Row[] {
  const nodes = new Map<number, any>(profile.nodes.map((n: any) => [n.id, n]));
  const totals = new Map<string, Row>();
  for (let i = 0; i < profile.samples.length; i++) {
    const node = nodes.get(profile.samples[i]!);
    if (!node) continue;
    const name: string = node.callFrame?.functionName || '(anónima)';
    const url: string = node.callFrame?.url || '';
    const key = `${name}\u0000${url}`;
    const prev = totals.get(key);
    totals.set(key, { name, url, ms: (prev?.ms ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000 });
  }
  return [...totals.values()].sort((a, b) => b.ms - a.ms);
}

function bucket(rows: Row[]): Record<string, number> {
  const out: Record<string, number> = { react: 0, estado: 0, red: 0, sim: 0, resto: 0 };
  for (const r of rows) {
    if (/react(-dom)?/.test(r.url)) out.react! += r.ms;
    else if (/\/src\/editor\/(network|pins|wiring)/.test(r.url)) out.red! += r.ms;
    else if (/\/src\/editor\/state/.test(r.url)) out.estado! += r.ms;
    else if (/\/src\/sim\//.test(r.url)) out.sim! += r.ms;
    else out.resto! += r.ms;
  }
  return out;
}

/**
 * Tiempo inclusivo por función: la función más todo lo que llama. Se toma el
 * máximo entre sus instancias para no duplicar recursión. Es lo que hay que
 * mirar para saber cuánto cuesta `validate` con su `buildNetwork` adentro.
 */
function inclusiveTimes(profile: { nodes: any[]; samples: number[]; timeDeltas: number[] }): Row[] {
  const byId = new Map<number, any>(profile.nodes.map((n: any) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const self = new Map<number, number>();
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i]!;
    self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
  }
  const incl = new Map<number, number>(self);
  for (const [id, ms] of self) {
    let p = parent.get(id);
    while (p !== undefined) {
      incl.set(p, (incl.get(p) ?? 0) + ms);
      p = parent.get(p);
    }
  }
  const byName = new Map<string, Row>();
  for (const [id, ms] of incl) {
    const node = byId.get(id);
    if (!node) continue;
    const name: string = node.callFrame?.functionName || '(anónima)';
    const url: string = node.callFrame?.url || '';
    const key = `${name}\u0000${url}`;
    const prev = byName.get(key);
    if (!prev || ms > prev.ms) byName.set(key, { name, url, ms });
  }
  return [...byName.values()].sort((a, b) => b.ms - a.ms);
}

test.describe('traza del preview', () => {
  test.skip(!process.env.PREVIEW_TRACE, 'correr con PREVIEW_TRACE=1');
  test.setTimeout(1_800_000);

  test('mover y soltar con hoja cableada', async ({ page, context }) => {
    const sheetPath = join(tmpdir(), `preview-trace-${RECORDS}.cad`);
    const parsed = JSON.parse(
      execFileSync('node', [join(APP, 'bench/write-sheet.ts'), sheetPath, String(RECORDS)], { cwd: APP }).toString(),
    ) as { records: number; components: number; cables: number; junctions: number; blocks: number; traceId: number };
    // Sólo metadatos: el texto de la hoja vive en el archivo, no en el resultado.
    const sheet = {
      records: parsed.records,
      components: parsed.components,
      cables: parsed.cables,
      junctions: parsed.junctions,
      blocks: parsed.blocks,
      traceId: parsed.traceId,
    };
    const text = readFileSync(sheetPath, 'latin1');
    const id = sheet.traceId;
    const selector = `g[data-id="${id}"]`;

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(URL_OVERRIDE ?? '/');
    await page.waitForSelector('svg[role="application"]');

    await page.evaluate(({ name, text }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([text], name, { type: 'application/octet-stream' }));
      const target = document.querySelector('svg[role="application"]')!;
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, { name: 'traza.cad', text });

    await page.waitForSelector(selector, { timeout: 180_000 });
    const wirePaths = await page.locator('path[data-wire]').count();
    expect(wirePaths, 'la hoja cargada debe traer cableado').toBeGreaterThan(sheet.cables / 2);

    // Vista fija: la app ajusta la hoja al cargar; se acerca con la rueda
    // anclada al componente hasta un zoom conocido y estable.
    let box = await page.locator(`${selector} rect.hitbox`).boundingBox();
    for (let i = 0; i < 60 && box; i++) {
      if ((await zoomOf(page)) >= TARGET_ZOOM && box.width > 40) break;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -250);
      await page.waitForTimeout(25);
      box = await page.locator(`${selector} rect.hitbox`).boundingBox();
    }
    const zoom = await zoomOf(page);
    box = await page.locator(`${selector} rect.hitbox`).boundingBox();
    expect(box, 'el componente debe quedar visible').not.toBeNull();
    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;
    const original = await transformOf(page, id);

    await page.evaluate(({ id }) => {
      const w = window as any;
      w.__trace = { stamps: [], loaf: [], downAt: 0, upAt: 0, release: null as number | null, releaseFrame: null as number | null, running: false };
      w.__trace.startFrames = (): void => {
        w.__trace.stamps.length = 0;
        if (w.__trace.running) return;
        w.__trace.running = true;
        const tick = (t: number): void => {
          w.__trace.stamps.push(t);
          if (w.__trace.running) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      };
      w.__trace.stopFrames = (): number[] => {
        w.__trace.running = false;
        return w.__trace.stamps;
      };
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as any[]) {
            w.__trace.loaf.push({
              start: e.startTime,
              duration: e.duration,
              renderStart: e.renderStart,
              styleLayout: e.styleAndLayoutStart,
              scripts: (e.scripts ?? []).reduce((a: number, s: any) => a + s.duration, 0),
            });
          }
        }).observe({ type: 'long-animation-frame' });
      } catch {
        /* sin soporte de LoAF */
      }
      const svg = document.querySelector('svg[role="application"]')!;
      svg.addEventListener('pointerdown', () => { w.__trace.downAt = performance.now(); }, true);
      svg.addEventListener('pointerup', () => {
        w.__trace.upAt = performance.now();
        w.__trace.release = null;
        w.__trace.releaseFrame = null;
        let frames = 0;
        const poll = (): void => {
          frames += 1;
          // Señal de commit: el gesto entró al historial y «Deshacer» se habilitó.
          // El transform del componente ya mostraba el preview, así que no sirve.
          const undoBtn = document.querySelector('button[aria-label="Deshacer"]') as HTMLButtonElement | null;
          if (undoBtn !== null && !undoBtn.disabled && w.__trace.release === null) {
            w.__trace.release = performance.now() - w.__trace.upAt;
            requestAnimationFrame(() => {
              w.__trace.releaseFrame = performance.now() - w.__trace.upAt;
            });
            return;
          }
          if (frames > 1200) {
            w.__trace.release = -1;
            return;
          }
          requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
      }, true);
    }, { id });

    const drag = async (): Promise<void> => {
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      for (let s = 1; s <= STEPS; s++) await page.mouse.move(startX + s * STEP_PX, startY);
      const previewTransform = await transformOf(page, id);
      expect(previewTransform, 'el gesto debe mover el componente conectado').not.toBe(original);
    };

    const undo = async (): Promise<void> => {
      for (const key of ['Meta+z', 'Control+z']) {
        await page.keyboard.press(key);
        try {
          await page.waitForFunction(
            ({ id, orig }) => document.querySelector(`g[data-id="${id}"]`)?.getAttribute('transform') === orig,
            { id, orig: original },
            { timeout: 10_000 },
          );
          return;
        } catch {
          /* prueba la otra combinación */
        }
      }
      throw new Error('no se pudo deshacer con Meta+z ni Control+z');
    };

    // Calentamiento: un gesto completo y deshacer.
    await page.evaluate(() => (window as any).__trace.startFrames());
    await drag();
    await page.mouse.up();
    await page.waitForFunction(() => (window as any).__trace.release !== null, null, { timeout: 180_000 });
    await page.evaluate(() => (window as any).__trace.stopFrames());
    await undo();

    const moveP95: number[] = [];
    const moveMean: number[] = [];
    const frames: number[] = [];
    const loaf: any[] = [];
    const release: (number | null)[] = [];
    const releaseFrames: (number | null)[] = [];
    for (let run = 0; run < RUNS; run++) {
      await page.evaluate(() => {
        const t = (window as any).__trace;
        t.loaf.length = 0;
        t.downAt = 0;
        t.releaseFrame = null;
        t.startFrames();
      });
      await drag();
      const endAt = await page.evaluate(() => performance.now());
      const raw = await page.evaluate(() => {
        const t = (window as any).__trace;
        return { stamps: t.stopFrames() as number[], downAt: t.downAt as number, loaf: t.loaf as any[] };
      });
      const windowStamps = raw.stamps.filter((s) => s >= raw.downAt && s <= endAt);
      const intervals = windowStamps.slice(1).map((s, i) => s - windowStamps[i]!);
      await page.mouse.up();
      await page.waitForFunction(() => (window as any).__trace.release !== null, null, { timeout: 180_000 });
      const signals = await page.evaluate(() => ({
        release: (window as any).__trace.release as number,
        releaseFrame: (window as any).__trace.releaseFrame as number | null,
      }));
      if (signals.release < 0) throw new Error('el gesto no produjo una edición confirmada');

      moveP95.push(pct(intervals, 0.95));
      moveMean.push(intervals.reduce((a, b) => a + b, 0) / Math.max(1, intervals.length));
      frames.push(intervals.length);
      loaf.push(...raw.loaf.filter((e) => e.start >= raw.downAt && e.start <= endAt));
      release.push(signals.release);
      releaseFrames.push(signals.releaseFrame);
      await undo();
    }

    // Pasada con perfilado: atribución por función, mover y soltar por separado.
    let moveRows: Row[] = [];
    let releaseRows: Row[] = [];
    let moveInclusive: Row[] = [];
    let releaseInclusive: Row[] = [];
    if (PROFILE) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await cdp.send('Profiler.start');
      await drag();
      const moveProfile = (await cdp.send('Profiler.stop')).profile;
      await page.evaluate(() => { (window as any).__trace.release = null; });
      await cdp.send('Profiler.start');
      await page.mouse.up();
      await page.waitForFunction(() => (window as any).__trace.release !== null, null, { timeout: 180_000 });
      const releaseProfile = (await cdp.send('Profiler.stop')).profile;

      moveRows = selfTimes(moveProfile);
      releaseRows = selfTimes(releaseProfile);
      moveInclusive = inclusiveTimes(moveProfile);
      releaseInclusive = inclusiveTimes(releaseProfile);
    }

    const result = {
      sheet,
      view: { zoom, viewport: { width: 1440, height: 900 }, steps: STEPS, stepPx: STEP_PX },
      target: URL_OVERRIDE ?? 'dev (webServer)',
      move: { p95: pct(moveP95, 0.5), mean: moveMean.reduce((a, b) => a + b, 0) / moveMean.length, frames, p95PerRun: moveP95, loaf },
      release: { domLatency: release, nextFrame: releaseFrames },
      profile: PROFILE
        ? {
            move: moveRows.slice(0, 18),
            moveBucket: bucket(moveRows),
            moveInclusive,
            release: releaseRows.slice(0, 18),
            releaseBucket: bucket(releaseRows),
            releaseInclusive,
          }
        : null,
      limits: [
        'latencia hasta actualización de DOM, no presentación confirmada',
        'p95 del intervalo entre callbacks de rAF',
        PROFILE ? 'build de desarrollo (React dev)' : 'build de producción (minificado: sin atribución por función)',
      ],
    };
    writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(
      JSON.stringify(
        {
          out: OUT,
          target: result.target,
          sheet,
          view: result.view,
          moveP95: result.move.p95,
          moveMean: result.move.mean,
          frames: result.move.frames,
          release,
          releaseFrames,
          moveBucket: PROFILE ? bucket(moveRows) : null,
          releaseBucket: PROFILE ? bucket(releaseRows) : null,
          topMoveSelf: moveRows.slice(0, 8).map((r) => `${r.name} ${r.ms.toFixed(0)}ms`),
          topMoveInclusive: moveInclusive.slice(0, 8).map((r) => `${r.name} ${r.ms.toFixed(0)}ms`),
          topReleaseSelf: releaseRows.slice(0, 8).map((r) => `${r.name} ${r.ms.toFixed(0)}ms`),
          topReleaseInclusive: releaseInclusive.slice(0, 8).map((r) => `${r.name} ${r.ms.toFixed(0)}ms`),
        },
        null,
        2,
      ),
    );
  });
});

async function zoomOf(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const g = document.querySelector('svg[role="application"] > g[transform]');
    const m = /scale\(([-\d.e]+)\)/.exec(g?.getAttribute('transform') ?? '');
    return m ? Number(m[1]) : 0;
  });
}

async function transformOf(page: import('@playwright/test').Page, id: number): Promise<string | null> {
  return page.evaluate((id) => document.querySelector(`g[data-id="${id}"]`)?.getAttribute('transform') ?? null, id);
}

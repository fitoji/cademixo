/**
 * Traza en navegador del preview del editor (etapa 0 y posteriores).
 *
 * Gestos: PREVIEW_TRACE_GESTURE=move|segment|vertex (por defecto move).
 *  - MOVER: arrastra un componente conectado desde su caja.
 *  - TRAMO: arrastra el cuerpo de un cable recto (el "doblez" que expone la UI).
 *  - VÉRTICE: selecciona un cable y arrastra uno de sus tiradores de extremo.
 *
 * Mide por separado, para cada gesto:
 *  - durante el movimiento: p95 del intervalo entre callbacks de rAF y
 *    reconstrucciones completas de red (contador `window.__networkStats`);
 *  - al soltar: latencia desde pointerup hasta el DOM con la edición confirmada
 *    (botón «Deshacer» habilitado) y reconstrucciones de esa fase.
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
const GESTURE = (process.env.PREVIEW_TRACE_GESTURE ?? 'move') as 'move' | 'segment' | 'vertex';
// Los gestos de cable se arrastran más lejos y en menos pasos: cada evento
// reconstruye el documento hoy, y el snap devuelve un paso corto a un borne.
const RUNS = Number(process.env.PREVIEW_TRACE_RUNS ?? 5);
const STEPS = Number(process.env.PREVIEW_TRACE_STEPS ?? (GESTURE === 'move' ? 12 : 6));
const STEP_PX = Number(process.env.PREVIEW_TRACE_STEP_PX ?? (GESTURE === 'move' ? 4 : 10));
const DIR = Number(process.env.PREVIEW_TRACE_DIR ?? 1);
const WIRE_ID = Number(process.env.PREVIEW_TRACE_WIRE_ID ?? 0);
const TARGET_ZOOM = 2;
const OUT = process.env.PREVIEW_TRACE_OUT ?? join(tmpdir(), `preview-trace-${GESTURE}.json`);
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

test.describe('traza del preview', () => {
  test.skip(!process.env.PREVIEW_TRACE, 'correr con PREVIEW_TRACE=1');
  test.setTimeout(1_800_000);

  test(`mover, tramo y vértice · gesto=${GESTURE}`, async ({ page, context }) => {
    const sheetPath = join(tmpdir(), `preview-trace-${RECORDS}.cad`);
    const parsed = JSON.parse(
      execFileSync('node', [join(APP, 'bench/write-sheet.ts'), sheetPath, String(RECORDS)], { cwd: APP }).toString(),
    ) as { records: number; components: number; cables: number; junctions: number; blocks: number; traceId: number };
    const sheet = {
      records: parsed.records,
      components: parsed.components,
      cables: parsed.cables,
      junctions: parsed.junctions,
      blocks: parsed.blocks,
      traceId: parsed.traceId,
      traceGroupedWireId: parsed.traceGroupedWireId,
      traceGroupedEndWireId: parsed.traceGroupedEndWireId,
    };
    const text = readFileSync(sheetPath, 'latin1');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(URL_OVERRIDE ?? '/');
    await page.waitForSelector('svg[role="application"]');

    await page.evaluate(({ name, text }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([text], name, { type: 'application/octet-stream' }));
      const target = document.querySelector('svg[role="application"]')!;
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, { name: 'traza.cad', text });

    await page.waitForSelector(`g[data-id="${sheet.traceId}"]`, { timeout: 180_000 });
    expect(await page.locator('path[data-wire]').count()).toBeGreaterThan(sheet.cables / 2);

    // Vista fija: ajustar la hoja y acercar con la rueda anclada al componente
    // central, igual que la línea base de mover.
    let box = await page.locator(`g[data-id="${sheet.traceId}"] rect.hitbox`).boundingBox();
    for (let i = 0; i < 60 && box; i++) {
      if ((await zoomOf(page)) >= TARGET_ZOOM && box.width > 40) break;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -250);
      await page.waitForTimeout(25);
      box = await page.locator(`g[data-id="${sheet.traceId}"] rect.hitbox`).boundingBox();
    }
    const zoom = await zoomOf(page);
    box = await page.locator(`g[data-id="${sheet.traceId}"] rect.hitbox`).boundingBox();
    expect(box, 'el componente debe quedar visible').not.toBeNull();

    // Punto de agarre y lectura de "qué cambió" según el gesto.
    let startX = box!.x + box!.width / 2;
    let startY = box!.y + box!.height / 2;
    let wireId: number | null = null;
    let dragAxis: 'h' | 'v' = 'v';
    let read: () => Promise<string | null>;

    if (GESTURE === 'pan') {
      // Paneo: botón central desde el centro del viewport, escala fija.
      startX = 720;
      startY = 480;
      read = () => viewTransform(page);
    } else if (GESTURE === 'move') {
      read = () => transformOf(page, sheet.traceId);
    } else {
      const wireTarget = WIRE_ID > 0 ? WIRE_ID : process.env.PREVIEW_TRACE_END ? sheet.traceGroupedEndWireId : process.env.PREVIEW_TRACE_GROUPED ? sheet.traceGroupedWireId : 0;
      const wire = wireTarget > 0 ? await pickWireById(page, wireTarget) : await pickStraightWire(page);
      expect(wire, 'debe haber un cable recto visible').not.toBeNull();
      wireId = wire!.id;
      startX = wire!.cx;
      startY = wire!.cy;
      // Perpendicular al cable para que el tramo cambie de verdad.
      dragAxis = wire!.horizontal ? 'v' : 'h';
      read = () => wireD(page, wireId!);
      if (GESTURE === 'vertex') {
        // Un clic selecciona el cable y hace aparecer los tiradores.
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.up();
        const handle = await page.locator(`[data-endpoint="0"][data-wire="${wireId}"]`).boundingBox();
        expect(handle, 'el tirador del vértice debe aparecer').not.toBeNull();
        startX = handle!.x + handle!.width / 2;
        startY = handle!.y + handle!.height / 2;
        dragAxis = 'v';
      }
    }
    const original = await read();

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
      w.__trace.sceneTargets = new Set();
      w.__trace.sceneMutations = 0;
      w.__trace.cameraMutations = 0;
      w.__trace.resetMutations = (): void => {
        w.__trace.sceneTargets = new Set();
        w.__trace.sceneMutations = 0;
        w.__trace.cameraMutations = 0;
      };
      const svg = document.querySelector('svg[role="application"]')!;
      const viewGroup = svg.querySelector(':scope > g[transform]');
      new MutationObserver((records) => {
        for (const r of records) {
          const el = r.target.nodeType === 1 ? (r.target as Element) : (r.target.parentElement as Element | null);
          if (!el) continue;
          if (el === viewGroup) {
            w.__trace.cameraMutations += 1;
            continue;
          }
          const scene = el.closest('[data-id], [data-wire], [data-endpoint]');
          if (scene) {
            w.__trace.sceneMutations += 1;
            w.__trace.sceneTargets.add(scene.getAttribute('data-id') ?? scene.getAttribute('data-wire') ?? scene.tagName);
          }
        }
      }).observe(svg, { subtree: true, attributes: true, childList: true, characterData: true });
      svg.addEventListener('pointerdown', () => { w.__trace.downAt = performance.now(); }, true);
      svg.addEventListener('pointerup', () => {
        w.__trace.upAt = performance.now();
        w.__trace.release = null;
        w.__trace.releaseFrame = null;
        let frames = 0;
        const poll = (): void => {
          frames += 1;
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
      void id;
    }, { id: sheet.traceId });

    /** Ejecuta el gesto; devuelve las redes acumuladas al iniciar (pointerdown). */
    const drag = async (): Promise<{ startBuilds: number }> => {
      const dirtyBefore = await page.evaluate(() =>
        (document.querySelector('footer span.rounded-full[aria-hidden="true"]')?.className ?? '').includes('bg-warn'),
      );
      await page.mouse.move(startX, startY);
      await page.mouse.down(GESTURE === 'pan' ? { button: 'middle' } : {});
      const startBuilds = await page.evaluate(() => (window as any).__networkStats.builds as number);
      const stepBuilds: number[] = [];
      let prevBuilds = startBuilds;
      for (let s = 1; s <= STEPS; s++) {
        const dx = dragAxis === 'h' ? s * STEP_PX * DIR : 0;
        const dy = dragAxis === 'v' ? -s * STEP_PX * DIR : 0;
        await page.mouse.move(startX + dx, startY + dy);
        const now = await page.evaluate(() => (window as any).__networkStats.builds as number);
        stepBuilds.push(now - prevBuilds);
        prevBuilds = now;
      }
      const after = await read();
      expect(after, `el gesto ${GESTURE} debe modificar el dibujo`).not.toBe(original);
      const during = await page.evaluate(() => {
        const undo = document.querySelector('button[aria-label="Deshacer"]') as HTMLButtonElement | null;
        const dot = document.querySelector('footer span.rounded-full[aria-hidden="true"]');
        return {
          historyClean: undo === null || undo.disabled,
          dirty: (dot?.className ?? '').includes('bg-warn'),
        };
      });
      expect(during.historyClean, 'el preview no debe escribir historial').toBe(true);
      expect(during.dirty, 'el preview no debe cambiar el estado sucio').toBe(dirtyBefore);
      return { startBuilds, stepBuilds };
    };

    const undo = async (): Promise<void> => {
      for (const key of ['Meta+z', 'Control+z']) {
        await page.keyboard.press(key);
        try {
          await page.waitForFunction(
            ({ orig, id, wireId, gesture }) => {
              const el = gesture === 'move' ? document.querySelector(`g[data-id="${id}"]`) : document.querySelector(`path[data-wire="${wireId}"]`);
              return (gesture === 'move' ? el?.getAttribute('transform') : el?.getAttribute('d')) === orig;
            },
            { orig: original, id: sheet.traceId, wireId, gesture: GESTURE },
            { timeout: 10_000 },
          );
          return;
        } catch {
          /* prueba la otra combinación */
        }
      }
      throw new Error('no se pudo deshacer con Meta+z ni Control+z');
    };

    if (GESTURE === 'pan') {
      // Frecuencia real de pantalla en reposo (sin gesto).
      const idle = await page.evaluate(
        () =>
          new Promise<number[]>((resolve) => {
            const stamps: number[] = [];
            const start = performance.now();
            const tick = (t: number): void => {
              stamps.push(t);
              if (performance.now() - start < 1200) requestAnimationFrame(tick);
              else resolve(stamps);
            };
            requestAnimationFrame(tick);
          }),
      );
      const idleIntervals = idle.slice(1).map((s, i) => s - idle[i]!);

      await page.evaluate(() => (window as any).__trace.startFrames());
      await drag();
      await page.mouse.up({ button: 'middle' });
      await page.evaluate(() => (window as any).__trace.stopFrames());

      const panRuns: Record<string, unknown>[] = [];
      for (let run = 0; run < RUNS; run++) {
        await page.evaluate(() => {
          const t = (window as any).__trace;
          t.loaf.length = 0;
          t.downAt = 0;
          t.resetMutations();
          t.startFrames();
        });
        await drag();
        const endAt = await page.evaluate(() => performance.now());
        const raw = await page.evaluate(() => {
          const t = (window as any).__trace;
          return {
            stamps: t.stopFrames() as number[],
            downAt: t.downAt as number,
            loaf: t.loaf as any[],
            sceneTargets: t.sceneTargets.size as number,
            sceneMutations: t.sceneMutations as number,
            cameraMutations: t.cameraMutations as number,
          };
        });
        await page.mouse.up({ button: 'middle' });
        const windowStamps = raw.stamps.filter((s) => s >= raw.downAt && s <= endAt);
        const intervals = windowStamps.slice(1).map((s, i) => s - windowStamps[i]!);
        panRuns.push({
          p95: pct(intervals, 0.95),
          mean: intervals.reduce((a, b) => a + b, 0) / Math.max(1, intervals.length),
          frames: intervals.length,
          sceneTargets: raw.sceneTargets,
          sceneMutations: raw.sceneMutations,
          cameraMutations: raw.cameraMutations,
          builds: 0,
          loaf: raw.loaf,
        });
      }

      let paintTrace: Record<string, number> | null = null;
      if (process.env.PREVIEW_TRACE_PAINT) {
        const cdp = await context.newCDPSession(page);
        const events: Array<{ name: string; dur?: number }> = [];
        cdp.on('Tracing.dataCollected', (e: any) => events.push(...(e.value ?? [])));
        const complete = new Promise<void>((resolve) => cdp.on('Tracing.tracingComplete', () => resolve()));
        await cdp.send('Tracing.start', { categories: 'devtools.timeline,cc,viz,blink,benchmark', transferMode: 'ReportEvents' as any });
        await drag();
        await cdp.send('Tracing.end');
        await complete;
        await page.mouse.up({ button: 'middle' });
        const byName = new Map<string, { ms: number; n: number }>();
        for (const e of events) {
          if (!e.dur) continue;
          const prev = byName.get(e.name) ?? { ms: 0, n: 0 };
          byName.set(e.name, { ms: prev.ms + e.dur / 1000, n: prev.n + 1 });
        }
        paintTrace = {
          events: events.length,
          top: [...byName.entries()]
            .sort((a, b) => b[1].ms - a[1].ms)
            .slice(0, 20)
            .map(([name, v]) => ({ name, ms: Math.round(v.ms), n: v.n })),
        };
      }

      // Geometría tras panear: clic sobre símbolo, clic sobre cable y zoom anclado.
      let geometry: Record<string, unknown> | null = null;
      if (process.env.PREVIEW_TRACE_GEOMETRY) {
        const componentPoint = await page.evaluate(() => {
          const svg = document.querySelector('svg[role="application"]')!.getBoundingClientRect();
          for (const g of document.querySelectorAll('g[data-id]')) {
            const r = (g as SVGGraphicsElement).getBoundingClientRect();
            const cx = r.x + r.width / 2;
            const cy = r.y + r.height / 2;
            if (r.width < 20 || r.height < 20) continue;
            if (cx < svg.left + 40 || cx > svg.right - 40 || cy < svg.top + 40 || cy > svg.bottom - 40) continue;
            return { id: Number(g.getAttribute('data-id')), x: cx, y: cy };
          }
          return null;
        });
        let componentSelects = false;
        if (componentPoint) {
          await page.mouse.click(componentPoint.x, componentPoint.y);
          componentSelects = await page.evaluate(
            (id) => document.querySelector(`g[data-id="${id}"]`)?.hasAttribute('data-sel') ?? false,
            componentPoint.id,
          );
        }
        const wirePoint = await page.evaluate(() => {
          const svg = document.querySelector('svg[role="application"]')!.getBoundingClientRect();
          for (const el of document.querySelectorAll('path[data-wire]')) {
            const r = (el as SVGGraphicsElement).getBoundingClientRect();
            const cx = r.x + r.width / 2;
            const cy = r.y + r.height / 2;
            if (cx < svg.left + 40 || cx > svg.right - 40 || cy < svg.top + 40 || cy > svg.bottom - 40) continue;
            if (document.elementFromPoint(cx, cy) !== el) continue;
            return { id: Number(el.getAttribute('data-wire')), x: cx, y: cy };
          }
          return null;
        });
        let wireSelects = false;
        if (wirePoint) {
          await page.mouse.click(wirePoint.x, wirePoint.y);
          wireSelects = await page.evaluate(
            (id) => (document.querySelector(`path[data-wire="${id}"]`)?.getAttribute('class') ?? '').includes('sel'),
            wirePoint.id,
          );
        }
        // Zoom anclado: el punto del mundo bajo el cursor debe quedar igual.
        const anchor = { x: 700, y: 480 };
        const worldAt = async (): Promise<{ x: number; y: number }> =>
          page.evaluate(({ x, y }) => {
            const svg = document.querySelector('svg[role="application"]')!.getBoundingClientRect();
            const g = document.querySelector('svg[role="application"] > g[transform], svg[role="application"] > g[style]');
            const t = g?.getAttribute('transform') ?? '';
            const m = /translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)\s*scale\(([-\d.e]+)\)/.exec(t);
            if (m) return { x: (x - svg.left - Number(m[1])) / Number(m[3]), y: (y - svg.top - Number(m[2])) / Number(m[3]) };
            const style = g?.getAttribute('style') ?? '';
            const tm = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/.exec(style);
            if (!tm) return { x: NaN, y: NaN };
            return { x: (x - svg.left - Number(tm[1])) / Number(tm[3]), y: (y - svg.top - Number(tm[2])) / Number(tm[3]) };
          }, { x: anchor.x, y: anchor.y });
        const before = await worldAt();
        await page.mouse.move(anchor.x, anchor.y);
        await page.mouse.wheel(0, -250);
        await page.waitForTimeout(80);
        const after = await worldAt();
        geometry = {
          componentSelects,
          wireSelects,
          zoomAnchorDelta: Math.hypot(before.x - after.x, before.y - after.y),
        };
      }

      let profileRows: Row[] = [];
      if (PROFILE) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
        await cdp.send('Profiler.start');
        await drag();
        profileRows = selfTimes((await cdp.send('Profiler.stop')).profile);
        await page.mouse.up({ button: 'middle' });
      }

      const result = {
        gesture: 'pan',
        sheet,
        view: { zoom, viewport: { width: 1440, height: 900 }, steps: STEPS, stepPx: STEP_PX },
        target: URL_OVERRIDE ?? 'dev (webServer)',
        runs: panRuns,
        idle: {
          p50: pct(idleIntervals, 0.5),
          p95: pct(idleIntervals, 0.95),
          frames: idleIntervals.length,
        },
        paintTrace,
        geometry,
        profile: PROFILE ? { rows: profileRows.slice(0, 18), bucket: bucket(profileRows) } : null,
        limits: [
          'p95 del intervalo entre callbacks de rAF',
          'mutaciones del DOM en elementos de escena (no equivalen a renders de React)',
          'LoAF separa scripts de estilo/layout; pintura y composición no se aíslan',
        ],
      };
      writeFileSync(OUT, JSON.stringify(result, null, 2));
      console.log(JSON.stringify({ out: OUT, gesture: 'pan', geometry, zoom: view.zoom, sheet: sheet.records, idle: { p50: pct(idleIntervals, 0.5), p95: pct(idleIntervals, 0.95) }, runs: panRuns.map((r) => ({ p95: r.p95, frames: r.frames })), paintTrace, bucket: PROFILE ? bucket(profileRows) : null, top: profileRows.slice(0, 10).map((r) => `${r.name} ${r.ms.toFixed(0)}ms`) }, null, 2));
      return;
    }

    // Calentamiento.
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
    const moveBuilds: number[] = [];
    const startBuildsList: number[] = [];
    const stepBuildsList: number[][] = [];
    const releaseBuilds: number[] = [];
    for (let run = 0; run < RUNS; run++) {
      await page.evaluate(() => {
        const t = (window as any).__trace;
        t.loaf.length = 0;
        t.downAt = 0;
        t.releaseFrame = null;
        t.startFrames();
        (window as any).__networkStats.builds = 0;
      });
      const { startBuilds, stepBuilds } = await drag();
      const endAt = await page.evaluate(() => performance.now());
      const raw = await page.evaluate(() => {
        const t = (window as any).__trace;
        return { stamps: t.stopFrames() as number[], downAt: t.downAt as number, loaf: t.loaf as any[] };
      });
      const buildsTotal = await page.evaluate(() => (window as any).__networkStats.builds as number);
      const buildsDuringMove = buildsTotal - startBuilds;
      const buildsAtStart = startBuilds;
      const windowStamps = raw.stamps.filter((s) => s >= raw.downAt && s <= endAt);
      const intervals = windowStamps.slice(1).map((s, i) => s - windowStamps[i]!);
      await page.evaluate(() => { (window as any).__networkStats.builds = 0; });
      await page.mouse.up();
      await page.waitForFunction(() => (window as any).__trace.release !== null, null, { timeout: 180_000 });
      const signals = await page.evaluate(() => ({
        release: (window as any).__trace.release as number,
        releaseFrame: (window as any).__trace.releaseFrame as number | null,
        builds: (window as any).__networkStats.builds as number,
      }));
      if (signals.release < 0) throw new Error('el gesto no produjo una edición confirmada');

      moveP95.push(pct(intervals, 0.95));
      moveMean.push(intervals.reduce((a, b) => a + b, 0) / Math.max(1, intervals.length));
      frames.push(intervals.length);
      loaf.push(...raw.loaf.filter((e) => e.start >= raw.downAt && e.start <= endAt));
      release.push(signals.release);
      releaseFrames.push(signals.releaseFrame);
      moveBuilds.push(buildsDuringMove);
      startBuildsList.push(buildsAtStart);
      stepBuildsList.push(stepBuilds);
      releaseBuilds.push(signals.builds);
      await undo();
    }

    let moveRows: Row[] = [];
    let releaseRows: Row[] = [];
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
    }

    const result = {
      gesture: GESTURE,
      sheet,
      view: { zoom, viewport: { width: 1440, height: 900 }, steps: STEPS, stepPx: STEP_PX },
      target: URL_OVERRIDE ?? 'dev (webServer)',
      move: { p95: pct(moveP95, 0.5), mean: moveMean.reduce((a, b) => a + b, 0) / moveMean.length, frames, p95PerRun: moveP95, builds: moveBuilds, startBuilds: startBuildsList, stepBuilds: stepBuildsList, loaf },
      release: { domLatency: release, nextFrame: releaseFrames, builds: releaseBuilds },
      profile: PROFILE ? { move: moveRows.slice(0, 18), moveBucket: bucket(moveRows), release: releaseRows.slice(0, 18), releaseBucket: bucket(releaseRows) } : null,
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
          gesture: GESTURE,
          moveP95: result.move.p95,
          moveMean: result.move.mean,
          moveBuilds,
          release,
          releaseBuilds,
          moveBucket: PROFILE ? bucket(moveRows) : null,
          topMove: moveRows.slice(0, 8).map((r) => `${r.name} ${r.ms.toFixed(0)}ms`),
        },
        null,
        2,
      ),
    );
  });
});

async function zoomOf(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const g = document.querySelector('svg[role="application"] > g');
    const raw = `${g?.getAttribute('transform') ?? ''} ${g?.getAttribute('style') ?? ''}`;
    const m = /scale\(([-\d.e]+)\)/.exec(raw);
    return m ? Number(m[1]) : 0;
  });
}

async function transformOf(page: import('@playwright/test').Page, id: number): Promise<string | null> {
  return page.evaluate((id) => document.querySelector(`g[data-id="${id}"]`)?.getAttribute('transform') ?? null, id);
}

async function wireD(page: import('@playwright/test').Page, id: number): Promise<string | null> {
  return page.evaluate((id) => document.querySelector(`path[data-wire="${id}"]`)?.getAttribute('d') ?? null, id);
}

/** Cable recto (un solo tramo) con su mitad bajo el cursor, el más largo. */
async function pickStraightWire(page: import('@playwright/test').Page): Promise<{ id: number; cx: number; cy: number; horizontal: boolean } | null> {
  return page.evaluate(() => {
    const svg = document.querySelector('svg[role="application"]')!.getBoundingClientRect();
    let best: { id: number; cx: number; cy: number; len: number; horizontal: boolean } | null = null;
    for (const el of document.querySelectorAll('path[data-wire]')) {
      const d = el.getAttribute('d') ?? '';
      if (/[AQC]/.test(d)) continue;
      if ((d.match(/L/g) ?? []).length !== 1) continue;
      const r = (el as SVGGraphicsElement).getBoundingClientRect();
      if (Math.max(r.width, r.height) < 50) continue;
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      if (cx < svg.left + 40 || cx > svg.right - 40 || cy < svg.top + 40 || cy > svg.bottom - 40) continue;
      // El clic debe caer sobre el cable, no sobre la caja de un componente:
      // el lienzo prioriza el componente cuando el cable toca su tinta.
      if (document.elementFromPoint(cx, cy) !== el) continue;
      const len = Math.hypot(r.width, r.height);
      if (!best || len > best.len) {
        best = { id: Number(el.getAttribute('data-wire')), cx, cy, len, horizontal: r.width >= r.height };
      }
    }
    return best ? { id: best.id, cx: best.cx, cy: best.cy, horizontal: best.horizontal } : null;
  });
}

/** Cable concreto (por id): su mitad debe estar bajo el cursor. */
async function pickWireById(page: import('@playwright/test').Page, id: number): Promise<{ id: number; cx: number; cy: number; horizontal: boolean } | null> {
  return page.evaluate((id) => {
    const el = document.querySelector(`path[data-wire="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    if (document.elementFromPoint(cx, cy) !== el) return null;
    return { id, cx, cy, horizontal: r.width >= r.height };
  }, id);
}

async function viewTransform(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => {
    const g = document.querySelector('svg[role="application"] > g');
    return g?.getAttribute('transform') ?? g?.getAttribute('style') ?? null;
  });
}

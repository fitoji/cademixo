import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { serializeMixo } from '../src/format/mixo.ts';

const drawingFile = fileURLToPath(new URL('../test/fixtures/ej0def.cad', import.meta.url));

test('un .mixo con atajos inválidos no reemplaza el documento y ofrece el dibujo como copia', async ({ page }) => {
  await page.goto('/');

  const canvas = page.getByRole('application', { name: /Lienzo del esquema/ });
  const footer = page.locator('footer');
  await expect(footer.getByText('motor_con_inversion_giro.cad')).toBeVisible();
  const before = await canvas.locator('g[data-id]').evaluateAll((nodes) =>
    nodes.map((node) => `${node.getAttribute('data-id')}:${node.getAttribute('transform')}`),
  );

  // Sidecar con longitud esperada y JSON bien formado, pero versión desconocida.
  const drawing = readFileSync(drawingFile, 'latin1');
  const brokenKeys = JSON.stringify({ version: 99, bindings: { Q1: 'q' } });
  const text = serializeMixo({
    drawing,
    keys: brokenKeys,
    manifest: { format: 'cademixo', version: 1, sourceName: 'roto.mixo' },
  });

  await page.locator('input[type="file"]').setInputFiles({
    name: 'roto.mixo',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(text, 'latin1'),
  });

  await expect(page.getByText('no se cargó: los atajos del proyecto no son válidos')).toBeVisible();
  await expect(footer.getByText('motor_con_inversion_giro.cad')).toBeVisible();
  expect(
    await canvas.locator('g[data-id]').evaluateAll((nodes) =>
      nodes.map((node) => `${node.getAttribute('data-id')}:${node.getAttribute('transform')}`),
    ),
  ).toEqual(before);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Recuperar dibujo como copia' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('roto.cad');
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(readFileSync(path!, 'latin1')).toBe(drawing);
  // El archivo original sigue siendo el que se abrió, sin reescritura.
  await expect(footer.getByText('motor_con_inversion_giro.cad')).toBeVisible();
});

test('guardar como con selector adopta el handle elegido y limpia los cambios pendientes', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { writes: [] as string[] };
    (window as unknown as { __saveAs: typeof state }).__saveAs = state;
    const handle = () => ({
      name: 'plano.mixo',
      async getFile() {
        return new File([], 'plano.mixo');
      },
      async createWritable() {
        return {
          async write() {
            state.writes.push('plano.mixo');
          },
          async close() {},
          async abort() {},
        };
      },
    });
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => handle() });
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: async () => [handle()] });
  });
  await page.goto('/');

  const canvas = page.getByRole('application', { name: /Lienzo del esquema/ });
  const components = canvas.locator('g[data-id]');
  const total = await components.count();
  let dragged = false;
  for (let index = 0; index < total && !dragged; index += 1) {
    const component = components.nth(index);
    const b = await component.boundingBox();
    const viewport = page.viewportSize();
    if (!b || !viewport || b.width < 2 || b.height < 2) continue;
    if (b.x < 0 || b.y < 0 || b.x > viewport.width || b.y > viewport.height) continue;
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    const id = await component.getAttribute('data-id');
    const reachable = await page.evaluate(
      ({ px, py, expected }) =>
        document.elementFromPoint(px, py)?.closest('g[data-id]')?.getAttribute('data-id') === expected,
      { px: x, py: y, expected: id },
    );
    if (!reachable) continue;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 24, y + 18, { steps: 4 });
    await page.mouse.up();
    dragged = true;
  }
  expect(dragged).toBe(true);
  await expect(page.locator('footer span.bg-warn')).toBeVisible();

  await page.getByRole('menuitem', { name: 'Archivo', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Guardar como' }).click();
  await page.getByRole('menuitem', { name: 'Proyecto cadeMixo (.mixo)' }).click();

  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __saveAs: { writes: string[] } }).__saveAs.writes.length),
    )
    .toBe(1);
  await expect(page.locator('footer').getByText('plano.mixo')).toBeVisible();
  await expect(page.locator('footer span.bg-warn')).toHaveCount(0);
});

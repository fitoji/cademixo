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

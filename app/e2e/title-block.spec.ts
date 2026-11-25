import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('../test/fixtures/pr1-rodolfo-giusti.cad', import.meta.url));
const probe = fileURLToPath(new URL('../test/fixtures/cajetin-probe.cad', import.meta.url));

test('Editar > Cajetín edita el título y persiste en el documento', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.locator('footer').getByText('pr1-rodolfo-giusti.cad')).toBeVisible();

  await page.getByRole('menuitem', { name: 'Editar' }).click();
  await page.getByRole('menuitem', { name: 'Cajetín' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const titulo = dialog.getByRole('textbox', { name: 'Título' });
  await titulo.fill('MI TITULO');
  await dialog.getByRole('button', { name: 'Aceptar' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('footer span.bg-warn')).toBeVisible();

  await page.getByRole('menuitem', { name: 'Editar' }).click();
  await page.getByRole('menuitem', { name: 'Cajetín' }).click();
  await expect(page.getByRole('textbox', { name: 'Título' })).toHaveValue('MI TITULO');
});

test('el cajetín se dibuja sobre la hoja y sigue al diálogo', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(probe);
  await expect(page.locator('footer').getByText('cajetin-probe.cad')).toBeVisible();

  const block = page.locator('.title-block');
  await expect(block).toHaveCount(1);
  for (const text of ['DIB1', 'EMPRESA', 'TITULO', 'Dibujado', 'Comprobado', 'Entidad', 'Archivo']) {
    await expect(block.getByText(text, { exact: true })).toHaveCount(1);
  }

  // «Encuadrar hoja» deja la página entera dentro del lienzo.
  await page.getByRole('menuitem', { name: 'Ver' }).click();
  await page.getByRole('menuitem', { name: 'Encuadrar hoja' }).click();
  const canvasBox = await page.locator('svg.canvas').boundingBox();
  const blockBox = await block.boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(blockBox).not.toBeNull();
  expect(blockBox!.x).toBeGreaterThanOrEqual(canvasBox!.x - 1);
  expect(blockBox!.y).toBeGreaterThanOrEqual(canvasBox!.y - 1);
  expect(blockBox!.x + blockBox!.width).toBeLessThanOrEqual(canvasBox!.x + canvasBox!.width + 1);
  expect(blockBox!.y + blockBox!.height).toBeLessThanOrEqual(canvasBox!.y + canvasBox!.height + 1);

  // Editar el cajetín repinta la capa sin reabrir el archivo.
  await page.getByRole('menuitem', { name: 'Editar' }).click();
  await page.getByRole('menuitem', { name: 'Cajetín' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Título' }).fill('PLANO NUEVO');
  await dialog.getByRole('button', { name: 'Aceptar' }).click();
  await expect(block.getByText('PLANO NUEVO', { exact: true })).toHaveCount(1);
});

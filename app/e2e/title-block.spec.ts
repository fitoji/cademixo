import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('../test/fixtures/pr1-rodolfo-giusti.cad', import.meta.url));

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

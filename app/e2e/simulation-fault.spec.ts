import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * El fixture tiene un pulsador NC (8001) que cierra L con N en cuanto arranca
 * la simulación. No hace falta accionar nada: CADe mostraría el mismo error.
 */
const fixture = fileURLToPath(new URL('../test/fixtures/short-nc-test.cad', import.meta.url));

test('cortocircuito: muestra el error de CADe y detiene la simulación', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.locator('footer').getByText('short-nc-test.cad')).toBeVisible();

  await page.keyboard.press('Space');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Se ha producido un cortocircuito')).toBeVisible();
  await expect(page.locator('footer').getByText(/simulación estable/)).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Aceptar' }).click();
  await expect(dialog).toBeHidden();
});

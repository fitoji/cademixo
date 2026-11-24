import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * El fixture tiene un pulsador NC (8001) que cierra L con N en cuanto arranca
 * la simulación. No hace falta accionar nada: CADe mostraría el mismo error.
 */
const fixture = fileURLToPath(new URL('../test/fixtures/short-nc-test.cad', import.meta.url));
const crossFixture = fileURLToPath(new URL('../test/fixtures/short-cross-test.cad', import.meta.url));

test('cortocircuito: muestra el error de CADe y detiene la simulación', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.locator('footer').getByText('short-nc-test.cad')).toBeVisible();

  await page.keyboard.press('Space');

  // El aviso abre además el panel de avisos, que también es un diálogo: se
  // ancla el del error por su texto para no matchear los dos.
  const dialog = page.getByRole('dialog').filter({ hasText: 'Se ha producido un cortocircuito' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Se ha producido un cortocircuito')).toBeVisible();
  await expect(page.locator('footer').getByText(/simulación estable/)).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Aceptar' }).click();
  await expect(dialog).toBeHidden();

  // El mismo corte queda en el sistema de avisos y el lienzo marca el punto.
  await expect(page.getByText('Cortocircuito detectado al simular')).toBeVisible();
  await expect(page.locator('circle.mark')).toHaveCount(1);
  // Sólo el contacto culpable queda en rojo, no la alimentación.
  const marked = page.locator('g[data-bad]');
  await expect(marked).toHaveCount(1);
  await expect(marked).toContainText('-S1');
  await expect(marked).not.toContainText('-X1');
});

test('cortocircuito por conductor nuevo: marca el cruce con el neutro', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(crossFixture);
  await page.keyboard.press('Space');

  // En simulación, F1 se cierra con un clic; el auxiliar de Q1 queda en 96.
  await page.locator('g[data-id="46"]').click();

  const dialog = page.getByRole('dialog').filter({ hasText: 'Se ha producido un cortocircuito' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Aceptar' }).click();

  await expect(page.getByText(/cruce de conductores/)).toBeVisible();
  const mark = page.locator('circle.mark');
  await expect(mark).toHaveCount(1);
  await expect(mark).toHaveAttribute('cx', '39');
  await expect(mark).toHaveAttribute('cy', '144');
});

import { expect, test } from '@playwright/test';

test('Ver → Configuración sube un cajón desde abajo', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  await page.getByRole('menuitem', { name: 'Ver' }).click();
  await page.getByRole('menuitem', { name: 'Configuración…' }).click();

  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Configuración', { exact: true })).toBeVisible();

  // El borde inferior de la hoja coincide con el de la ventana: sube desde abajo.
  const viewport = page.viewportSize()!;
  await expect
    .poll(async () => {
      const box = await sheet.boundingBox();
      return box === null ? -1 : Math.round(box.y + box.height);
    })
    .toBeGreaterThan(viewport.height - 2);
  const sheetBox = (await sheet.boundingBox())!;
  expect(sheetBox.y).toBeGreaterThan(viewport.height / 3);

  // Los ajustes siguen ahí y aplican en el acto.
  await sheet.getByRole('radio', { name: 'Bornes chicos' }).click();
  await expect(sheet.getByRole('radio', { name: 'Bornes chicos' })).toBeChecked();

  await sheet.getByRole('button', { name: 'Listo' }).click();
  await expect(sheet).toBeHidden();
});

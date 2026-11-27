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

test('el manejo de cables se elige por teclado y persiste al reabrir', async ({ page }) => {
  await page.goto('/');
  const open = async () => {
    await page.getByRole('menuitem', { name: 'Ver' }).click();
    await page.getByRole('menuitem', { name: 'Configuración…' }).click();
    return page.getByRole('dialog');
  };

  let sheet = await open();
  const actual = sheet.getByRole('radio', { name: 'Manejo de cables actual' });
  const ortogonal = sheet.getByRole('radio', { name: 'Manejo de cables ortogonal Wybrow' });
  await expect(actual).toBeChecked();

  await ortogonal.focus();
  await page.keyboard.press('Space');
  await expect(ortogonal).toBeChecked();
  await sheet.getByRole('button', { name: 'Listo' }).click();

  // Reabrir la aplicación: la preferencia vive fuera del circuito.
  await page.reload();
  sheet = await open();
  await expect(sheet.getByRole('radio', { name: 'Manejo de cables ortogonal Wybrow' })).toBeChecked();

  await sheet.getByRole('radio', { name: 'Manejo de cables actual' }).focus();
  await page.keyboard.press('Space');
  await expect(sheet.getByRole('radio', { name: 'Manejo de cables actual' })).toBeChecked();
  await sheet.getByRole('button', { name: 'Listo' }).click();
});

import { expect, test } from '@playwright/test';

test('la marca del header abre «Acerca de cadeMixo»', async ({ page }) => {
  await page.goto('/');

  const brand = page.getByRole('button', { name: 'Acerca de cadeMixo' });
  await expect(brand).toBeVisible();

  // La versión del header y la del diálogo son la misma: una sola fuente.
  const brandVersion = (await brand.innerText()).match(/v\d+\.\d+\.\d+/)?.[0];
  expect(brandVersion).toBeTruthy();

  await brand.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Acerca de cadeMixo' })).toBeVisible();
  await expect(dialog.getByText(/educativo y 100\s% open source/)).toBeVisible();
  await expect(dialog.getByText(brandVersion!)).toBeVisible();

  const repo = dialog.getByRole('link', { name: /github\.com\/fitoji\/cademixo/ });
  await expect(repo).toHaveAttribute('href', 'https://github.com/fitoji/cademixo');
  await expect(repo).toHaveAttribute('target', '_blank');

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('la marca se abre con el teclado y devuelve el foco', async ({ page }) => {
  await page.goto('/');

  const brand = page.getByRole('button', { name: 'Acerca de cadeMixo' });
  await brand.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(dialog).toBeHidden();
  await expect(brand).toBeFocused();
});

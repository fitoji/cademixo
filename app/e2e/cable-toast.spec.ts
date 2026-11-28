import { expect, test } from '@playwright/test';

test('los conflictos del modo ortogonal salen en un toast abajo', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  await page.getByRole('menuitem', { name: 'Ver' }).click();
  await page.getByRole('menuitem', { name: 'Configuración…' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('radio', { name: 'Manejo de cables ortogonal Wybrow' }).click();
  await sheet.getByRole('button', { name: 'Listo' }).click();

  // Contacto auxiliar K2M (registro 90): 21 unidades a la izquierda chocan con
  // otro cable, así que el gesto se rechaza sin tocar el documento.
  const component = page.locator('svg [data-id="90"] .hitbox').first();
  const box = (await component.boundingBox())!;
  const scale = box.width / 6; // el auxiliar mide 6 unidades de ancho
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 21 * scale, cy, { steps: 12 });
  await page.mouse.up();

  const toast = page.getByText(/sin ruta válida/i).first();
  await expect(toast).toBeVisible({ timeout: 10000 });
  const toastBox = (await toast.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(toastBox.y).toBeGreaterThan(viewport.height / 2), 'el aviso aparece desde abajo';
});

test('el dock alterna el modo ortogonal y lo conserva al recargar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar estilo moderno' }).click();

  const toggle = page.getByRole('button', { name: 'Cables ortogonales (Wybrow)' });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Cables ortogonales (Wybrow)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

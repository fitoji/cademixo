import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('../test/fixtures/ej0def.cad', import.meta.url));

/** Busca el grupo del registro aunque el fixture abra con el lienzo desplazado. */
async function component(page: Page, id: string): Promise<{ locator: Locator; x: number; y: number }> {
  const groups = page.getByRole('application', { name: /Lienzo del esquema/ }).locator(`g[data-id="${id}"]`);
  const count = await groups.count();
  const viewport = page.viewportSize();
  for (let i = 0; i < count; i += 1) {
    const locator = groups.nth(i);
    const bounds = await locator.boundingBox();
    if (!bounds || bounds.width < 2 || bounds.height < 2) continue;
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    if (viewport && (x < 0 || y < 0 || x > viewport.width || y > viewport.height)) continue;
    const reached = await page.evaluate(
      ({ pointX, pointY, recordId }) =>
        document.elementFromPoint(pointX, pointY)?.closest('g[data-id]')?.getAttribute('data-id') === recordId,
      { pointX: x, pointY: y, recordId: id },
    );
    if (reached) return { locator, x, y };
  }
  throw new Error(`El registro ${id} no es alcanzable en el lienzo`);
}

test('asignar atajo en Propiedades y accionar el aparato con la simulación activa', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.locator('footer').getByText('ej0def.cad')).toBeVisible();

  // Q1 es una protección (6009): en edición está idle, al simular arranca abierta.
  const q1 = await component(page, '26');
  await expect(q1.locator).toHaveAttribute('data-state', 'idle');
  await page.mouse.click(q1.x, q1.y);

  const assign = page.getByRole('button', { name: 'Asignar atajo al componente' });
  await expect(assign).toBeVisible();
  await assign.click();
  await page.keyboard.press('q');
  await expect(assign).toHaveText('q');

  // El menú evita que la barra espaciadora la consuma el botón enfocado.
  await page.getByRole('menuitem', { name: /Simulación/ }).click();
  await page.getByRole('menuitem', { name: /Simular/ }).click();
  await expect(q1.locator).toHaveAttribute('data-state', 'open');

  await page.keyboard.press('q');
  await expect(q1.locator).toHaveAttribute('data-state', 'closed');

  // Al volver a abrirla queda disparada: CADe la pinta como "tripped".
  await page.keyboard.press('q');
  await expect(q1.locator).toHaveAttribute('data-state', 'tripped');
});

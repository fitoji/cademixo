import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('../test/fixtures/ej0def.cad', import.meta.url));

async function openFixture(page: import('@playwright/test').Page): Promise<import('@playwright/test').Locator> {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.locator('footer').getByText('ej0def.cad')).toBeVisible();
  return page.getByRole('application', { name: /Lienzo del esquema/ });
}

test('teclear desde el lienzo, recorrer variantes, confirmar y colocar con un clic', async ({ page }) => {
  const canvas = await openFixture(page);
  const before = await canvas.locator('g[data-id]').count();

  await canvas.focus();
  await page.keyboard.type('motor');

  const field = page.getByRole('combobox', { name: 'Buscar componente para insertar' });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('motor');

  const list = page.getByRole('listbox');
  await expect(list).toBeVisible();
  const options = list.getByRole('option');
  await expect(options.first()).toHaveAttribute('data-highlighted', '');
  await expect(field).toHaveAttribute('aria-activedescendant', /.+/);

  const firstCode = await options.first().getAttribute('data-code');
  await page.keyboard.press('ArrowDown');
  const secondCode = await options.nth(1).getAttribute('data-code');
  expect(secondCode).toBeTruthy();
  expect(secondCode).not.toBe(firstCode);
  await expect(field).toBeFocused();

  // Confirmar arma la herramienta pero no toca el documento.
  await expect(canvas.locator('g[data-id]')).toHaveCount(before);
  await page.keyboard.press('Enter');
  await expect(list).toBeHidden();
  await expect(field).toHaveValue('');
  await expect(canvas).toBeFocused();
  await expect(canvas.locator('g[data-id]')).toHaveCount(before);

  await canvas.click({ position: { x: 40, y: 40 } });
  await expect(canvas.locator('g[data-id]')).toHaveCount(before + 1);

  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(canvas.locator('g[data-id]')).toHaveCount(before);
});

test('sin coincidencias, Escape, Tab y clic fuera cierran sin insertar', async ({ page }) => {
  const canvas = await openFixture(page);
  const before = await canvas.locator('g[data-id]').count();
  const field = page.getByRole('combobox', { name: 'Buscar componente para insertar' });
  const list = page.getByRole('listbox');

  await canvas.focus();
  await page.keyboard.type('zzzz');
  await expect(page.locator('[data-component-insertion-bar] [data-slot="command-empty"]')).toHaveText(
    'Sin componentes para «zzzz»',
  );
  await page.keyboard.press('Enter');
  await expect(field).toHaveValue('zzzz');
  await expect(canvas.locator('g[data-id]')).toHaveCount(before);

  await page.keyboard.press('Escape');
  await expect(field).toHaveValue('');
  await expect(list).toBeHidden();
  await expect(canvas).toBeFocused();

  await canvas.focus();
  await page.keyboard.type('motor');
  await expect(list).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(field).toHaveValue('');
  await expect(list).toBeHidden();
  await expect(field).not.toBeFocused();

  await canvas.focus();
  await page.keyboard.type('motor');
  await canvas.click({ position: { x: 40, y: 40 } });
  await expect(field).toHaveValue('');
  await expect(list).toBeHidden();
  await expect(canvas.locator('g[data-id]')).toHaveCount(before);
});

test('un atajo, una etiqueta y la simulación no abren la barra', async ({ page }) => {
  const canvas = await openFixture(page);
  const field = page.getByRole('combobox', { name: 'Buscar componente para insertar' });
  const list = page.getByRole('listbox');

  await canvas.focus();
  await page.keyboard.press('r'); // rotar: atajo existente, tiene prioridad
  await expect(field).toHaveValue('');
  await expect(list).toBeHidden();
  await expect(field).not.toBeFocused();

  const groups = canvas.locator('g[data-id]');
  for (let i = 0; i < (await groups.count()); i += 1) {
    const bounds = await groups.nth(i).boundingBox();
    if (bounds && bounds.width > 2 && bounds.height > 2) {
      await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      break;
    }
  }
  await page.getByLabel('Designador').fill('motor');
  await expect(field).toHaveValue('');
  await expect(list).toBeHidden();

  await page.getByRole('menuitem', { name: /Simulación/ }).click();
  await page.getByRole('menuitem', { name: /Simular/ }).click();
  await canvas.focus();
  await page.keyboard.press('m');
  await expect(field).toHaveValue('');
  await expect(list).toBeHidden();
});

test('barra y paleta devuelven los mismos códigos en el mismo orden', async ({ page }) => {
  const canvas = await openFixture(page);
  const paletteField = page.getByRole('textbox', { name: 'Buscar componente por código o nombre' });
  const field = page.getByRole('combobox', { name: 'Buscar componente para insertar' });

  for (const query of ['motor', '6007', 'alimentacion', 'dahalander']) {
    await paletteField.fill(query);
    const fromPalette = await page
      .locator('[data-symbol-code]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-symbol-code')));
    await paletteField.fill('');

    await canvas.focus();
    await page.keyboard.type(query);
    const fromBar = await page
      .locator('[data-code]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-code')));
    expect(fromBar).toEqual(fromPalette);

    await page.keyboard.press('Escape');
  }
});

test('la barra flotante no tapa los controles del lienzo', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('simuelectro:estilo', 'moderno');
    localStorage.setItem('simuelectro:mode', 'light');
  });
  const canvas = await openFixture(page);
  const bar = page.locator('[data-component-insertion-bar]');
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe('absolute');

  const barBox = await bar.boundingBox();
  expect(barBox).not.toBeNull();
  const overlaps = (other: { x: number; y: number; width: number; height: number } | null): boolean => {
    if (other === null) return false;
    const a = barBox!;
    return (
      a.x < other.x + other.width &&
      a.x + a.width > other.x &&
      a.y < other.y + other.height &&
      a.y + a.height > other.y
    );
  };

  for (const name of ['Alejar', 'Acercar', 'Atajos del lienzo']) {
    expect(overlaps(await page.getByRole('button', { name }).boundingBox())).toBe(false);
  }

  await canvas.focus();
  await page.keyboard.type('motor');
  await page.getByRole('button', { name: 'Atajos del lienzo' }).click();
  expect(overlaps(await page.locator('div.bottom-14').boundingBox())).toBe(false);

  const prompt = page.locator('[data-component-insertion-bar] span').first();
  expect(await prompt.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/mono/i);
});

test('la lista cabe y no desplaza la vista en una ventana estrecha', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  const canvas = await openFixture(page);
  await canvas.focus();
  await page.keyboard.type('motor');

  const bar = page.locator('[data-component-insertion-bar]');
  const list = page.getByRole('listbox');
  await expect(bar).toBeVisible();
  await expect(list).toBeVisible();
  await expect(page.locator('footer')).toBeVisible();

  const box = await list.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeLessThanOrEqual(600 * 0.45);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
});

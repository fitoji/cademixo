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

  const prompt = page
    .locator('[data-component-insertion-bar] > div:not([inert]) > span')
    .filter({ hasText: 'Insertar:' });
  expect(await prompt.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/mono/i);
});

test('el tirador mueve la barra sin tocar el documento', async ({ page }) => {
  const canvas = await openFixture(page);
  const bar = page.locator('[data-component-insertion-bar]');
  const handle = page.getByRole('button', { name: /Mover barra de inserción/ });
  const before = await bar.boundingBox();
  const records = await canvas.locator('g[data-id]').count();
  const grip = await handle.boundingBox();
  expect(grip).not.toBeNull();

  await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip!.x + grip!.width / 2 + 120, grip!.y + grip!.height / 2 - 80, { steps: 6 });
  await page.mouse.up();

  const after = await bar.boundingBox();
  expect(after!.x).toBeGreaterThan(before!.x + 80);
  expect(after!.y).toBeLessThan(before!.y - 40);
  await expect(canvas.locator('g[data-id]')).toHaveCount(records);

  // La búsqueda sigue funcionando desde la nueva ubicación.
  await page.getByRole('combobox', { name: 'Buscar componente para insertar' }).fill('motor');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');

  // Un arrastre desmedido queda dentro del editor.
  const grip2 = await handle.boundingBox();
  await page.mouse.move(grip2!.x + grip2!.width / 2, grip2!.y + grip2!.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip2!.x + 4000, grip2!.y + 4000, { steps: 4 });
  await page.mouse.up();
  const host = await page.evaluate(() => {
    const el = document.querySelector('[data-component-insertion-bar]')?.parentElement;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });
  const clamped = await bar.boundingBox();
  expect(host).not.toBeNull();
  expect(clamped!.x + clamped!.width).toBeLessThanOrEqual(host!.right);
  expect(clamped!.y + clamped!.height).toBeLessThanOrEqual(host!.bottom);
});

test('el tirador se mueve con teclado y Inicio lo centra', async ({ page }) => {
  await openFixture(page);
  const bar = page.locator('[data-component-insertion-bar]');
  const handle = page.getByRole('button', { name: /Mover barra de inserción/ });
  const before = await bar.boundingBox();

  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  const after = await bar.boundingBox();
  expect(after!.x).toBeGreaterThan(before!.x + 10);
  expect(after!.y).toBeLessThan(before!.y - 10);

  await page.keyboard.press('Home');
  const home = await bar.boundingBox();
  expect(Math.abs(home!.x - before!.x)).toBeLessThan(2);
  expect(Math.abs(home!.y - before!.y)).toBeLessThan(2);
  await expect(bar.getByRole('status').first()).toContainText('abajo al centro');
});

test('un clic mueve la barra a otra posición sin arrastre', async ({ page }) => {
  await openFixture(page);
  const bar = page.locator('[data-component-insertion-bar]');
  const before = await bar.boundingBox();
  await page.getByRole('button', { name: 'Mover barra abajo a la izquierda' }).click();
  const after = await bar.boundingBox();
  expect(after!.x).toBeLessThan(before!.x - 40);
});

test('minimizar deja sólo Insertar y un clic la restaura', async ({ page }) => {
  const canvas = await openFixture(page);
  const bar = page.locator('[data-component-insertion-bar]');
  const input = page.getByRole('combobox', { name: 'Buscar componente para insertar' });
  const records = await canvas.locator('g[data-id]').count();
  const wide = await bar.boundingBox();

  await canvas.focus();
  await page.keyboard.type('motor');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.getByRole('button', { name: 'Minimizar barra de inserción' }).click();

  await expect.poll(async () => (await bar.boundingBox())!.width).toBeLessThan(wide!.width - 300);
  await expect(input).toBeHidden();
  await expect(bar.locator('> div:not([inert]) > span').filter({ hasText: 'Insertar:' })).toHaveCount(1);
  await expect(canvas.locator('g[data-id]')).toHaveCount(records);
  await expect(page.getByRole('button', { name: 'Restaurar barra de inserción' })).toBeFocused();

  expect(await bar.evaluate((el) => getComputedStyle(el).transitionDuration)).toContain('0.2s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await bar.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.getByRole('button', { name: 'Restaurar barra de inserción' }).click();
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeGreaterThan(wide!.width - 2);
  const restored = await bar.boundingBox();
  expect(Math.abs(restored!.width - wide!.width)).toBeLessThan(2);
  expect(Math.abs(restored!.x + restored!.width / 2 - (wide!.x + wide!.width / 2))).toBeLessThan(4);
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

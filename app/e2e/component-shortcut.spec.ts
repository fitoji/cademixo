import { expect, test, type Locator, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('../test/fixtures/ej0def.cad', import.meta.url));
const inversion = fileURLToPath(new URL('../test/fixtures/motor_con_inversion_giro.cad', import.meta.url));
const mixoFixture = fileURLToPath(new URL('../test/fixtures/ej0def.mixo', import.meta.url));

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

  const assign = page.locator('button[data-slot="component-shortcut"]');
  await expect(assign).toBeVisible();
  await assign.click();
  await page.keyboard.press('q');
  await expect(assign).toContainText('Q');

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

test('un designador compartido acciona la protección, no su auxiliar', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(inversion);
  await expect(page.locator('footer').getByText('motor_con_inversion_giro.cad')).toBeVisible();

  // Q1 comparte designador entre el disyuntor (registro 23, 6009) y su
  // auxiliar (registro 2, 8018). El atajo debe accionar el disyuntor.
  const q1 = await component(page, '23');
  await page.mouse.click(q1.x, q1.y);
  await page.locator('button[data-slot="component-shortcut"]').click();
  await page.keyboard.press('q');

  await page.getByRole('menuitem', { name: /Simulación/ }).click();
  await page.getByRole('menuitem', { name: /Simular/ }).click();
  await expect(q1.locator).toHaveAttribute('data-state', 'open');
  await page.keyboard.press('q');
  await expect(q1.locator).toHaveAttribute('data-state', 'closed');
});

test('abrir un .mixo carga el dibujo y sus atajos', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(mixoFixture);
  await expect(page.locator('footer').getByText('ej0def.mixo')).toBeVisible();
  await expect(page.locator('[data-slot="badge"]').filter({ hasText: 'cadeMixo' })).toBeVisible();

  const q1 = await component(page, '26');
  await page.mouse.click(q1.x, q1.y);
  await expect(page.locator('button[data-slot="component-shortcut"]')).toContainText('Q');

  await page.getByRole('menuitem', { name: /Simulación/ }).click();
  await page.getByRole('menuitem', { name: /Simular/ }).click();
  await expect(q1.locator).toHaveAttribute('data-state', 'open');
  await page.keyboard.press('q');
  await expect(q1.locator).toHaveAttribute('data-state', 'closed');
});

test('guardar un .mixo escribe un solo archivo con el dibujo y las keys', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { calls: 0, writes: [] as { name: string; data: number[] }[] };
    (window as unknown as { __mixo: typeof state }).__mixo = state;
    const handle = () => {
      let current = new Uint8Array(0);
      let pending = current;
      return {
        name: 'plano.mixo',
        async getFile() {
          return new File([current], 'plano.mixo');
        },
        async createWritable() {
          return {
            async write(chunk: Uint8Array | string) {
              const bytes = typeof chunk === 'string' ? Array.from(new TextEncoder().encode(chunk)) : Array.from(chunk);
              pending = Uint8Array.from(bytes);
              state.writes.push({ name: 'plano.mixo', data: bytes });
            },
            async close() {
              current = pending;
            },
            async abort() {},
          };
        },
      };
    };
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => {
        state.calls += 1;
        return handle();
      },
    });
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => [handle()],
    });
  });

  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(mixoFixture);
  await page.getByRole('menuitem', { name: 'Archivo' }).click();
  await page.getByRole('menuitem', { name: 'Guardar como' }).click();
  await page.getByRole('menuitem', { name: 'Proyecto cadeMixo (.mixo)' }).click();

  await expect
    .poll(async () =>
      page.evaluate(() => (window as unknown as { __mixo: { writes: unknown[] } }).__mixo.writes.length),
    )
    .toBe(1);
  const state = await page.evaluate(
    () => (window as unknown as { __mixo: { calls: number; writes: { name: string; data: number[] }[] } }).__mixo,
  );
  assert.equal(state.calls, 1);
  assert.equal(state.writes[0]?.name, 'plano.mixo');
  const bundle = Buffer.from(state.writes[0]!.data).toString('latin1');
  assert.match(bundle, /^CADEMIXO\/1\n/);
  assert.match(bundle, /KEYS \d+\n/);
  assert.match(bundle, /"Q1": "q"/);
  assert.doesNotMatch(bundle, /\.keys\.json/);
});

test('guardar escribe el .cad y su sidecar .keys.json', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { calls: 0, writes: [] as { name: string; data: number[] }[] };
    (window as unknown as { __sidecar: typeof state }).__sidecar = state;
    const handle = (name: string) => {
      let current = new Uint8Array(0);
      let pending = current;
      return {
        name,
        async getFile() {
          return new File([current], name);
        },
        async createWritable() {
          return {
            async write(chunk: Uint8Array | string) {
              const bytes = typeof chunk === 'string' ? Array.from(new TextEncoder().encode(chunk)) : Array.from(chunk);
              pending = Uint8Array.from(bytes);
              state.writes.push({ name, data: bytes });
            },
            async close() {
              current = pending;
            },
            async abort() {},
          };
        },
      };
    };
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => handle(state.calls++ === 0 ? 'plano.cad' : 'plano.cad.keys.json'),
    });
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => [handle('plano.cad')],
    });
  });

  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  const q1 = await component(page, '26');
  await page.mouse.click(q1.x, q1.y);
  await page.locator('button[data-slot="component-shortcut"]').click();
  await page.keyboard.press('q');

  await page.getByRole('menuitem', { name: 'Archivo' }).click();
  await page.getByRole('menuitem', { name: /^Guardar(?! como)/ }).click();

  await expect
    .poll(async () => page.evaluate(() => (window as unknown as { __sidecar: { writes: unknown[] } }).__sidecar.writes.length))
    .toBe(2);
  const writes = await page.evaluate(
    () => (window as unknown as { __sidecar: { writes: { name: string; data: number[] }[] } }).__sidecar.writes,
  );
  assert.deepEqual(writes.map((write) => write.name), ['plano.cad', 'plano.cad.keys.json']);

  const cad = Buffer.from(writes[0]!.data).toString('latin1');
  assert.match(cad, /^CADe_SIMU/);
  assert.doesNotMatch(cad, /drawingHash/);

  const sidecar = JSON.parse(Buffer.from(writes[1]!.data).toString('utf8'));
  assert.equal(sidecar.version, 2);
  assert.equal(typeof sidecar.drawingHash, 'string');
  assert.equal(sidecar.bindings.Q1, 'q');
});

test('el dock muestra atajos generales y los del plano abierto', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(inversion);
  await expect(page.locator('footer').getByText('motor_con_inversion_giro.cad')).toBeVisible();

  const q1 = await component(page, '23');
  await page.mouse.click(q1.x, q1.y);
  await page.locator('button[data-slot="component-shortcut"]').click();
  await page.keyboard.press('q');

  await page.getByRole('button', { name: 'Activar estilo moderno' }).click();
  await page.getByRole('button', { name: 'Atajos y gestos' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Guardar', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Componentes del plano')).toBeVisible();
  await expect(dialog.getByText('Q1', { exact: true })).toBeVisible();
});

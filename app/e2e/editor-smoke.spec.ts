import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('../test/fixtures/ej0def.cad', import.meta.url));
const pickerTarget = fileURLToPath(new URL('../test/fixtures/luz-con-interruptor.cade', import.meta.url));
const pickerFiles = {
  'current.cad': Array.from(readFileSync(fixture)),
  'next.cade': Array.from(readFileSync(pickerTarget)),
};

type OpenGuardState = { calls: number; messages: string[]; answer: boolean };
type PickerState = { openCalls: number; saveCalls: number; writeHandles: string[]; failWrites: boolean };
type TestWindow = Window & { __openGuardState: OpenGuardState; __pickerState?: PickerState };

async function setConfirmAnswer(page: import('@playwright/test').Page, answer: boolean): Promise<void> {
  await page.evaluate((value) => {
    (window as TestWindow).__openGuardState.answer = value;
  }, answer);
}

async function getOpenGuardState(page: import('@playwright/test').Page): Promise<OpenGuardState> {
  return page.evaluate(() => ({ ...(window as TestWindow).__openGuardState }));
}

async function getDocumentSnapshot(page: import('@playwright/test').Page) {
  const canvas = page.getByRole('application', { name: /Lienzo del esquema/ });
  return {
    fileName: await page.locator('footer').getByText(/\.(?:cad|cade)$/).first().innerText(),
    components: await canvas.locator('g[data-id]').evaluateAll((nodes) =>
      nodes.map((node) => `${node.getAttribute('data-id')}:${node.getAttribute('transform')}:${node.innerHTML}`),
    ),
  };
}

type DragTarget = { component: import('@playwright/test').Locator; x: number; y: number };

/**
 * Finds a component whose bounding-box centre actually hit-tests to itself and lies
 * inside the viewport. Loaded fixtures place their first component under the palette or
 * outside the visible area, so the first `g[data-id]` is not a safe drag target.
 */
async function findDraggableComponent(page: import('@playwright/test').Page): Promise<DragTarget> {
  const canvas = page.getByRole('application', { name: /Lienzo del esquema/ });
  const components = canvas.locator('g[data-id]');
  const total = await components.count();
  const viewport = page.viewportSize();

  for (let index = 0; index < total; index += 1) {
    const component = components.nth(index);
    const bounds = await component.boundingBox();
    if (!bounds || bounds.width < 2 || bounds.height < 2) continue;

    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    if (viewport && (x < 0 || y < 0 || x > viewport.width || y > viewport.height)) continue;

    const dataId = await component.getAttribute('data-id');
    const reached = await page.evaluate(
      ({ pointX, pointY, id }) =>
        document.elementFromPoint(pointX, pointY)?.closest('g[data-id]')?.getAttribute('data-id') === id,
      { pointX: x, pointY: y, id: dataId },
    );
    if (reached) return { component, x, y };
  }

  throw new Error('No canvas component is reachable for a drag');
}

async function makeDocumentDirty(page: import('@playwright/test').Page): Promise<void> {
  const target = await findDraggableComponent(page);

  const originalTransform = await target.component.getAttribute('transform');
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.move(target.x + 24, target.y + 18, { steps: 4 });
  await page.mouse.up();

  await expect(target.component).not.toHaveAttribute('transform', originalTransform ?? '');
  await expect(page.locator('footer span.bg-warn')).toBeVisible();
}

/**
 * The Archivo menu renders the platform shortcut inside each item's accessible name
 * ("Guardar ⌘S", "Guardar como… ⇧⌘S"), so an exact match on "Guardar" never resolves
 * and a plain substring match also reaches "Guardar como…".
 */
function saveMenuItem(page: import('@playwright/test').Page) {
  return page.getByRole('menuitem', { name: /^Guardar(?! como)/ });
}

async function installPickerStubs(
  page: import('@playwright/test').Page,
  openFiles: Array<keyof typeof pickerFiles | null>,
  failWrites = false,
): Promise<void> {
  await page.evaluate(({ files, queuedFiles, shouldFailWrites }) => {
    const state = { openCalls: 0, saveCalls: 0, writeHandles: [] as string[], failWrites: shouldFailWrites };
    (window as TestWindow).__pickerState = state;
    const createHandle = (name: keyof typeof files) => ({
      name,
      async getFile() {
        return new File([Uint8Array.from(files[name])], name, { type: 'application/octet-stream' });
      },
      async createWritable() {
        return {
          async write() {
            state.writeHandles.push(name);
            if (state.failWrites) throw new Error('test write failed');
          },
          async close() {},
          async abort() {},
        };
      },
    });

    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => {
        const name = queuedFiles[state.openCalls++];
        if (name === null || name === undefined) throw new DOMException('Picker cancelled', 'AbortError');
        return [createHandle(name)];
      },
    });
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => {
        state.saveCalls += 1;
        return createHandle('current.cad');
      },
    });
  }, { files: pickerFiles, queuedFiles: openFiles, shouldFailWrites: failWrites });
}

async function openFromMenu(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('menuitem', { name: 'Archivo', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Abrir…', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  // Exercise the supported fallback picker/download paths instead of native OS dialogs.
  await page.addInitScript(() => {
    const state: OpenGuardState = { calls: 0, messages: [], answer: false };
    (window as TestWindow).__openGuardState = state;
    Object.defineProperty(window, 'confirm', {
      configurable: true,
      value: (message: string) => {
        state.calls += 1;
        state.messages.push(message);
        return state.answer;
      },
    });
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
  });
});

test('starts with the first sample loaded', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('footer').getByText('arranque-paro-motor-3f.cad')).toBeVisible();
  await expect(page.getByRole('application', { name: /Lienzo del esquema/ })).toBeVisible();
});

test('opens a local .cad file through the file input', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"][accept=".cade,.cad"]').setInputFiles(fixture);

  await expect(page.locator('footer').getByText('ej0def.cad')).toBeVisible();
  expect((await getOpenGuardState(page)).calls).toBe(0);
});

test('declining the dirty-open prompt keeps the current document when using the file input', async ({ page }) => {
  await page.goto('/');
  await makeDocumentDirty(page);
  const before = await getDocumentSnapshot(page);

  await setConfirmAnswer(page, false);
  await page.locator('input[type="file"][accept=".cade,.cad"]').setInputFiles(fixture);

  await expect.poll(async () => (await getOpenGuardState(page)).calls).toBe(1);
  expect(await getDocumentSnapshot(page)).toEqual(before);
  expect((await getOpenGuardState(page)).messages[0]).toContain('Guardar antes de abrir «ej0def.cad»?');
  await expect(page.locator('footer span.bg-warn')).toBeVisible();
});

test('saving successfully before opening through the file input downloads the dirty document', async ({ page }) => {
  await page.goto('/');
  await makeDocumentDirty(page);
  const before = await getDocumentSnapshot(page);

  await setConfirmAnswer(page, true);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('input[type="file"][accept=".cade,.cad"]').setInputFiles(fixture);
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('arranque-paro-motor-3f.cad');
  await expect(page.locator('footer').getByText('ej0def.cad')).toBeVisible();
  expect(await getDocumentSnapshot(page)).not.toEqual(before);
  expect((await getOpenGuardState(page)).calls).toBe(1);
  await expect(page.locator('footer span.bg-warn')).toHaveCount(0);
});

test('a clean File System Access open does not prompt and adopts the selected handle', async ({ page }) => {
  await page.goto('/');
  await installPickerStubs(page, ['current.cad']);

  await openFromMenu(page);

  await expect(page.locator('footer').getByText('current.cad')).toBeVisible();
  expect((await getOpenGuardState(page)).calls).toBe(0);
  expect((await page.evaluate(() => (window as TestWindow).__pickerState?.openCalls))).toBe(1);
});

test('cancelling a File System Access picker does not prompt or alter a dirty document', async ({ page }) => {
  await page.goto('/');
  await installPickerStubs(page, ['current.cad', null]);
  await openFromMenu(page);
  await expect(page.locator('footer').getByText('current.cad')).toBeVisible();
  await makeDocumentDirty(page);
  const before = await getDocumentSnapshot(page);

  await openFromMenu(page);

  await expect.poll(async () => page.evaluate(() => (window as TestWindow).__pickerState?.openCalls)).toBe(2);
  expect((await getOpenGuardState(page)).calls).toBe(0);
  expect(await getDocumentSnapshot(page)).toEqual(before);

  await page.getByRole('menuitem', { name: 'Archivo', exact: true }).click();
  await saveMenuItem(page).click();
  await expect.poll(async () => page.evaluate(() => (window as TestWindow).__pickerState?.writeHandles.length)).toBe(1);
  expect(await page.evaluate(() => (window as TestWindow).__pickerState?.writeHandles)).toEqual(['current.cad']);
});

test('a failed save before a picker open preserves the dirty document and its file handle', async ({ page }) => {
  await page.goto('/');
  await installPickerStubs(page, ['current.cad', 'next.cade'], true);
  await openFromMenu(page);
  await expect(page.locator('footer').getByText('current.cad')).toBeVisible();
  await makeDocumentDirty(page);
  const before = await getDocumentSnapshot(page);

  await setConfirmAnswer(page, true);
  await openFromMenu(page);

  await expect(page.getByText('no se cargó: el proyecto no se guardó')).toBeVisible();
  expect(await getDocumentSnapshot(page)).toEqual(before);
  expect((await getOpenGuardState(page)).calls).toBe(1);
  expect(await page.evaluate(() => (window as TestWindow).__pickerState?.writeHandles)).toEqual(['current.cad']);
  await expect(page.locator('footer span.bg-warn')).toBeVisible();

  await page.evaluate(() => {
    const state = (window as TestWindow).__pickerState;
    if (state) state.failWrites = false;
  });
  await page.getByRole('menuitem', { name: 'Archivo', exact: true }).click();
  await saveMenuItem(page).click();
  await expect.poll(async () => page.evaluate(() => (window as TestWindow).__pickerState?.writeHandles.length)).toBe(2);
  expect(await page.evaluate(() => (window as TestWindow).__pickerState?.writeHandles)).toEqual([
    'current.cad',
    'current.cad',
  ]);
});

test('saves through Guardar como… and downloads a .cad file', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Archivo', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Guardar como…' }).click();

  const dialog = page.getByRole('dialog', { name: 'Guardar como' });
  await dialog.getByLabel('Nombre del archivo').fill('browser-smoke');

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('browser-smoke.cad');
});

test('a canvas drag can be undone back to the original component position', async ({ page }) => {
  await page.goto('/');

  const canvas = page.getByRole('application', { name: /Lienzo del esquema/ });
  const component = canvas.locator('g[data-id]').first();
  await expect(component).toBeVisible();
  const originalTransform = await component.getAttribute('transform');
  const bounds = await component.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error('The first canvas component has no bounding box');

  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 24, bounds.y + bounds.height / 2 + 18, { steps: 4 });
  await page.mouse.up();

  await expect(component).not.toHaveAttribute('transform', originalTransform ?? '');
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(component).toHaveAttribute('transform', originalTransform ?? '');
});

test('the simulate control keeps its label only in the modern style', async ({ page }) => {
  await page.goto('/');

  // Clásico es el estilo por defecto: el control es sólo icono y el nombre
  // accesible lo aporta el aria-label.
  const simulate = page.getByRole('button', { name: 'Simular' });
  await expect(simulate).toBeVisible();
  await expect(simulate).toHaveText('');

  await page.getByRole('button', { name: 'Activar estilo moderno' }).click();
  await expect(simulate).toHaveText('Simular');
});

test('the default wire thickness reaches the canvas', async ({ page }) => {
  await page.goto('/');

  // El grosor por defecto lo pone el estilo: clásico arranca en Fino (0,12) y
  // moderno en Normal (0,34), que desde el ajuste dejó de leerse como un pelo
  // al lado de la tinta del símbolo. El path de un cable vertical tiene bbox de
  // ancho 0, así que se espera adjunto y se lee el trazo computado.
  const wire = page.locator('.wire').first();
  await wire.waitFor({ state: 'attached' });
  const strokeWidth = () => wire.evaluate((node) => parseFloat(getComputedStyle(node).strokeWidth));

  await expect.poll(strokeWidth).toBeCloseTo(0.12, 3);

  await page.getByRole('button', { name: 'Activar estilo moderno' }).click();
  await expect.poll(strokeWidth).toBeCloseTo(0.34, 3);
});

test('el chrome flotante y el inspector plegable son del estilo moderno', async ({ page }) => {
  await page.goto('/');

  // Clásico: sin dock flotante y sin secciones plegables. Es el panel de
  // CADe_SIMU, donde todo está a la vista.
  await expect(page.getByRole('button', { name: 'Grilla' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Alejar' })).toHaveCount(0);
  await expect(page.locator('details')).toHaveCount(0);

  await page.getByRole('button', { name: 'Activar estilo moderno' }).click();

  // Moderno: grilla e imán son estados, no acciones.
  const grid = page.getByRole('button', { name: 'Grilla' });
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await grid.click();
  await expect(grid).toHaveAttribute('aria-pressed', 'false');

  await expect(page.getByRole('button', { name: 'Ajustar a la ventana' }).first()).toBeVisible();
});

test('el zoom flotante del moderno mueve la escala del lienzo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar estilo moderno' }).click();

  // La píldora de zoom de la esquina inferior derecha ya no existe: el
  // porcentaje vive en el cluster flotante de abajo a la izquierda.
  await expect(page.locator('div.right-3.bottom-3')).toHaveCount(0);
  const zoom = page.locator('div.bottom-3.left-3 button').nth(1);
  const original = await zoom.innerText();
  await page.getByRole('button', { name: 'Acercar' }).click();
  await expect.poll(() => zoom.innerText()).not.toBe(original);
  await page.getByRole('button', { name: 'Alejar' }).click();
  await expect.poll(() => zoom.innerText()).toBe(original);

  // Las pistas dejaron de ser una barra fija: se piden desde el dock.
  await expect(page.locator('div.bottom-14')).toHaveCount(0);
  await page.getByRole('button', { name: 'Atajos del lienzo' }).click();
  await expect(page.locator('div.bottom-14')).toHaveCount(1);
});

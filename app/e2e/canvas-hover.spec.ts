import { expect, test } from '@playwright/test';

/**
 * El halo de hover tiene que encenderse sobre el bloque del componente, no sólo
 * sobre sus trazos.
 *
 * La tinta de un símbolo son trazos con `fill: none`, así que el puntero sólo la
 * encuentra encima de los propios trazos: los intersticios de la pieza dependen
 * del rectángulo invisible que cada componente dibuja por debajo del glifo.
 * Mientras ese rectángulo salió de la caja declarada sola, en los símbolos
 * anclados al origen cubrió otro lugar que el dibujo y el interior del bloque
 * quedó muerto al puntero.
 */
type Group = {
  id: string;
  hit: { left: number; top: number; right: number; bottom: number } | null;
  ink: { left: number; top: number; right: number; bottom: number } | null;
};

test('la caja de impacto cubre todo el bloque dibujado de cada componente', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByRole('application', { name: /Lienzo del esquema/ });
  await expect(canvas.locator('g[data-id]').first()).toBeVisible();

  const groups = await canvas.evaluate((svg): Group[] => {
    const boxOf = (rect: DOMRect) => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
    return Array.from(svg.querySelectorAll<SVGGElement>('g[data-id]')).map((group) => {
      const hitbox = group.querySelector<SVGRectElement>('rect.hitbox');
      const strokes = Array.from(group.querySelectorAll('path'))
        .map((path) => path.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      const ink =
        strokes.length === 0
          ? null
          : {
              left: Math.min(...strokes.map((rect) => rect.left)),
              top: Math.min(...strokes.map((rect) => rect.top)),
              right: Math.max(...strokes.map((rect) => rect.right)),
              bottom: Math.max(...strokes.map((rect) => rect.bottom)),
            };
      return {
        id: group.getAttribute('data-id') ?? '',
        hit: hitbox ? boxOf(hitbox.getBoundingClientRect()) : null,
        ink,
      };
    });
  }, undefined);

  const conTinta = groups.filter((group) => group.hit !== null && group.ink !== null);
  expect(conTinta.length).toBeGreaterThan(0);

  // Tolerancia en píxeles: la caja se calcula con la geometría del archivo y la
  // tinta se mide sobre lo dibujado.
  const TOL = 1.5;
  const sinCubrir = conTinta.filter(({ hit, ink }) => {
    if (!hit || !ink) return false;
    return (
      hit.left > ink.left + TOL ||
      hit.top > ink.top + TOL ||
      hit.right < ink.right - TOL ||
      hit.bottom < ink.bottom - TOL
    );
  });

  expect(
    sinCubrir.map((group) => ({
      id: group.id,
      hit: group.hit,
      ink: group.ink,
    })),
    'hay componentes cuya caja de impacto no cubre su bloque dibujado',
  ).toEqual([]);
});

test('el halo se enciende sobre un hueco del bloque, no sólo sobre los trazos', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByRole('application', { name: /Lienzo del esquema/ });
  await expect(canvas.locator('g[data-id]').first()).toBeVisible();

  const spot = await canvas.evaluate((svg) => {
    const inkBoxOf = (group: SVGGElement) => {
      const boxes = Array.from(group.querySelectorAll('path'))
        .map((path) => path.getBoundingClientRect())
        .filter((box) => box.width > 0 && box.height > 0);
      if (boxes.length === 0) return null;
      const left = Math.min(...boxes.map((box) => box.left));
      const top = Math.min(...boxes.map((box) => box.top));
      const right = Math.max(...boxes.map((box) => box.right));
      const bottom = Math.max(...boxes.map((box) => box.bottom));
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    };

    for (const group of svg.querySelectorAll<SVGGElement>('g[data-id]')) {
      const id = group.getAttribute('data-id');
      // El halo se retira cuando el componente ya señala otra cosa por su cuenta.
      if (!id || group.hasAttribute('data-sel')) continue;
      const state = group.getAttribute('data-state');
      if (state === 'active' || state === 'tripped') continue;
      const hitbox = group.querySelector<SVGRectElement>('rect.hitbox');
      const ink = inkBoxOf(group);
      if (!hitbox || !ink) continue;
      // Un bloque diminuto no tiene huecos que valga la pena muestrear.
      if (ink.width < 12 || ink.height < 12) continue;

      const margin = 4;
      for (let ix = 1; ix <= 9; ix += 1) {
        for (let iy = 1; iy <= 9; iy += 1) {
          const x = ink.left + margin + ((ink.width - margin * 2) * ix) / 10;
          const y = ink.top + margin + ((ink.height - margin * 2) * iy) / 10;
          if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
          const found = document.elementFromPoint(x, y);
          // El hueco: quien atiende el puntero es el rectángulo invisible del
          // propio componente, no un trazo ni el lienzo de fondo.
          if (found === hitbox && found.closest('g[data-id]') === group) {
            return { id, x, y };
          }
        }
      }
    }
    return null;
  }, undefined);

  expect(spot, 'ningún componente responde al puntero en el interior de su bloque').not.toBeNull();
  const { id, x, y } = spot as { id: string; x: number; y: number };

  await page.mouse.move(x, y);

  // El halo es un `drop-shadow` sobre el grupo entero: la señal de que el hover
  // se activó, más allá de qué elemento recibió el puntero.
  await expect
    .poll(async () =>
      canvas.evaluate((svg, target) => {
        const group = Array.from(svg.querySelectorAll<SVGGElement>('g[data-id]')).find(
          (node) => node.getAttribute('data-id') === target,
        );
        return group ? getComputedStyle(group).filter : 'sin-grupo';
      }, id),
    )
    .toContain('drop-shadow');
});

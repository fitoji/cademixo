import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, '..', 'src', 'ui', 'diagram.css'), 'utf8');

/**
 * Regresión del reporte: con la simulación andando, el halo rojo de «activo»
 * tapaba el color de la luz de las señalizaciones ópticas. La regla de la
 * aparamenta ya no alcanza a las lámparas, y la lámpara tiene su propio halo
 * con el color que declara `data-lamp`.
 */
test('el halo de activo no alcanza a las señalizaciones ópticas', () => {
  const activo = /\[data-state='active'\]\s+\.sym([^{]*)\{([^}]*)\}/g;
  const reglas = [...CSS.matchAll(activo)].map((m) => ({ selector: m[1]!, cuerpo: m[2]! }));
  assert.ok(reglas.length > 0, 'falta la regla de activo');

  const roja = reglas.find((r) => r.cuerpo.includes('var(--warn)'));
  assert.ok(roja, 'la aparamenta conserva su halo');
  assert.ok(
    roja!.selector.includes(':not([data-lamp])'),
    `la regla roja no debe alcanzar a las lámparas: ${roja!.selector.trim()}`,
  );

  const lampara = reglas.find((r) => r.cuerpo.includes('var(--lamp)'));
  assert.ok(lampara, 'la lámpara encendida lleva halo de su propio color');
  assert.ok(
    lampara!.selector.includes('[data-lamp]'),
    `el halo de la lámpara tiene que ser sólo para [data-lamp]: ${lampara!.selector.trim()}`,
  );
});

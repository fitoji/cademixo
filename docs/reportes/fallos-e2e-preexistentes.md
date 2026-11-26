# Fallos E2E preexistentes

**Fecha:** 2026-11-26
**Base de comparación:** `main` @ `232a577`
**Rama verificada:** `astra-perfo` (con las correcciones de entrega)
**Tipo:** verificación de entrega. Los tres casos se dejan **sin corregir**.

## Método

Se creó un worktree aparte desde `main` (`cademixo-worktrees/base-e2e`) con `pnpm install --frozen-lockfile`, y se corrieron los tres casos señalados en la base y en la rama, con el mismo `playwright.config.ts` (servidor de desarrollo en `127.0.0.1:5173`, Chromium).

```sh
cd app && pnpm exec playwright test e2e/canvas-hover.spec.ts e2e/editor-smoke.spec.ts \
  --grep "la caja de impacto cubre|starts with the first sample loaded|saving successfully before opening" \
  --reporter=line
```

En la base se corrieron **sólo esos tres casos** (no la suite completa). En la rama se corrió la suite completa: **38 pasan, 3 fallan, 1 salteado** (42).

## Resultado

| Caso | Spec:línea | Base `main` | Rama `astra-perfo` |
|---|---|---|---|
| La caja de impacto cubre el bloque dibujado | `canvas-hover.spec.ts:20` | falla | falla |
| Arranca con la primera muestra cargada | `editor-smoke.spec.ts:159` | falla | falla |
| Descarga con el nombre del documento tras editar y abrir | `editor-smoke.spec.ts:195` | falla | falla |

Los tres fallos son **idénticos en la base y en la rama**.

## Detalle

### 1. `canvas-hover.spec.ts:20` — caja de impacto

```
Error: hay componentes cuya caja de impacto no cubre su bloque dibujado
Expected: []
Received: 32 objetos { hit, block }
```

32 componentes del esquema de muestra tienen una caja de impacto que no cubre su bloque dibujado. No se investigó la causa en esta entrega: los cambios de rendimiento no alteran geometría ni hit-test, y falla igual en la base.

### 2. `editor-smoke.spec.ts:159` — primera muestra

```
Error: expect(locator).toBeVisible() failed
Locator: locator('footer').getByText('arranque-paro-motor-3f.cad')
Expected: visible  ·  Received: element(s) not found (timeout 5000ms)
```

### 3. `editor-smoke.spec.ts:195` — nombre de descarga

```
Expected: "arranque-paro-motor-3f.cad"
Received: "motor_con_inversion_giro.cad"
```

### Causa de los dos fallos de `editor-smoke`

Ambos esperan el mismo nombre de archivo y la aplicación carga otro. El catálogo actual (`app/src/ui/samples.ts`) define:

```ts
export const SAMPLES: Sample[] = [
  { name: 'motor_con_inversion_giro.cad', ... },
  { name: 'marcha_motor.cad', ... },
];
```

`arranque-paro-motor-3f.cad` **ya no existe en el catálogo**. El cambio llegó en `c42d2e1` ("feat(samples): add marcha_motor example and current catalog"), que **está en `main`**: la expectativa de los tests quedó desactualizada antes de esta rama, no como efecto de las optimizaciones.

## Fuera de alcance

Los tres se dejan sin corregir en esta entrega para no mezclar cambios ajenos a la optimización. Si se retoman:

1. Actualizar la expectativa de los dos casos de `editor-smoke` al catálogo vigente (o fijar la muestra inicial explícitamente en el test).
2. Investigar por separado por qué 32 componentes tienen cajas de impacto menores que su dibujo.

`settings-drawer.spec.ts` es intermitente y en esta corrida pasó; no se cuenta como fallo.

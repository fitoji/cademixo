# Modo moderno estilo Codia

Reemplaza el mundo visual del estilo **moderno** por el de Codia Studio (medido en su DOM real), y le suma el chrome flotante y el inspector en acordeones. El estilo **clásico** y la tinta del dibujo no se tocan.

Rama: `feat/modo-moderno-codia`

## Specs

- **S1** — El estilo moderno adopta el mundo de Codia: superficies por escalón (`#18181b` fondo, `#242429` panel, `#333338` control), borde blanco al 6–9%, radio 8px dominante (10/12 en paneles, píldora en chips), DM Sans con escala 12/14/16, y jerarquía por borde en vez de sombra.
  > "me gusta mucho ese estilo para nuestra app en modo moderno usa la skill de impeccable si crees apropiado"
- **S2** — El estilo clásico y la tinta del dibujo quedan intactos: `--wire`, `--warn`, `--ink`, `--grid-*` y la grilla del lienzo siguen siendo el mundo "plano de obra". El cambio no alcanza el esquema.
- **S3** — Chrome flotante sobre el lienzo: zoom abajo-izquierda y dock de herramientas flotante, sobre el canvas, en vez de barras del chrome.
  > "piel mas estructura"
- **S4** — El inspector pasa a secciones colapsables, con inputs numéricos en pares y grupos de iconos segmentados.
  > "piel mas estructura"
- **S5** — Compatibilidad CADe_SIMU intacta: parser, serializador, modelo de dominio, netlist y solver sin cambios de contrato; el round-trip byte a byte sigue pasando.
  > "recuerda no romper nada de compatibilidad con cadesimu"
- **S6** — `DESIGN.md` documenta los dos mundos y reescribe los `Don't` para el eje moderno, sin romper las reglas del clásico.

## Tasks

| ID | Tarea | Spec | Ruta | Commit |
|---|---|---|---|---|
| T1 | Dependencia DM Sans self-hosted + tokens del estilo moderno | S1, S2 | inline | `78a94b9` |
| T2 | Chrome flotante del lienzo: zoom y dock de herramientas | S3, S2 | inline | `09c5b4a` |
| T3 | Inspector en secciones colapsables | S4 | inline | `09c5b4a` |
| T4 | `DESIGN.md` con los dos mundos + `Don't` del eje moderno | S6 | inline | `78a94b9` |
| T5 | Tests: mundos visuales (unit) + gate de estilo (e2e) | S2, S5 | inline | `e8053c9` |
| T6 | Corregir el defecto de S2 que encontró la verificación | S2 | inline | `09c5b4a` |
| T7 | Restituir el espaciado del clásico y cubrir el acordeón moderno | S2, S4 | inline | `22c0042` |
| T8 | Paleta lateral del moderno: rótulos en frase, contador como cifra, buscador como superficie | S7 | inline | — |

- **S7** — La columna de componentes del estilo moderno deja de gritar: los rótulos de panel y de grupo pasan a frase a 13/12.5px, el contador deja de ser insignia y el buscador pasa a ser una superficie que el foco enciende. Se aplica con un bloque `:root.moderno` sobre hooks `data-*`, porque la paleta vertical también la puede usar el clásico (hay preferencia de orientación).

## Risk

**Risk: item 5** — dependencia agregada (`@fontsource-variable/dm-sans`) y retirada (`space-grotesk`).

El eje que falló dos veces en verificación no es "dependencia" sino **"mundo clásico tocado"**. Ningún ítem de la lista lo nombra literalmente; se trata como ítem 3, porque el look de CADe_SIMU es un contrato que el usuario ya consume. Queda cubierto por `app/test/estilo-mundos.test.ts` y por el e2e del gate de estilo.

## Log

- **L1** — "revisa esta app: https://codia.ai/studio/session/4aec84c3-c777-4f52-8913-0e32ef2e969b que podemos adaptar para nuestra app en el modo moderno"
- **L2** — "revisa la ui/ux"
- **L3** — "me gusta mucho ese estilo para nuestra app en modo moderno usa la skill de impeccable si crees apropiado"
- **L4** — "piel mas estructura, pero recuerda no romper nada de compatibilidad con cadesimu"
- **L5** (evidencia) — La sesión de Codia no es pública: `/studio/session/<id>` redirige a `/studio` sin sesión iniciada, y `/share/<token>` da 404. Se inspeccionó autenticada vía la ventana de automatización. Tokens medidos con `getComputedStyle` sobre el DOM real:
  - fuentes: `-apple-system, "DM Sans", Inter, system-ui…` (46 nodos de texto)
  - fondos: `rgba(69,69,74,.6)` ×13, `rgb(51,51,56)` ×11, `rgb(29,29,32)` ×3, `rgb(36,36,41)` ×2
  - radios: `8px` ×58, `10px` ×16, `12px` ×13, `9999px` ×12
  - cuerpos de texto: `12px` ×25, `16px` ×21, `14px` ×14
- **L6** (decisión) — Alcance: piel + estructura, no solo tokens. Restricción dura: nada de compatibilidad CADe_SIMU.
- **L7** (decisión) — El moderno es un mundo reemplazado, no un retoque: los `Don't` de `DESIGN.md` sobre píldoras, violeta, radios y sombras pertenecen al mundo clásico y se reescriben para el eje moderno, no se rompen en silencio.
- **L8** (verificación independiente) — `gentle-ai-verify`: 629/630 unitarios, 11/11 e2e de entonces, build OK, `git diff main -- src/format src/model src/sim` vacío. El único fallo es `parse-perf.test.ts`, un test de tiempos de pared en milisegundos de un dígito: 3/3 verde aislado y con el parser byte-idéntico a `main`. Es flake de medición, no regresión; no se toca.
- **L9** (defecto real, corregido) — La verificación encontró que en clásico el plegado se apagaba sólo para el mouse: `pointer-events: none` deja el `<summary>` enfocable y **Enter lo cerraba**. Se abandonó el hack CSS: en clásico no se renderiza un `<details>` que no puede abrirse, se vuelve al rótulo pelado vía `collapsibleSections`. De paso se quitó el padding que el clásico había ganado y el `@import` muerto de Space Grotesk (22 + 19 kB que ya nadie usaba).
- **L10** (slices) — 608 líneas autoradas en 3 commits: `78a94b9` (tokens + docs), `09c5b4a` (estructura), `e8053c9` (tests). La suite e2e real tiene 13 casos, no 9 como decía el README.
- **L11** (segunda verificación, sobre el estado final) — 634/634 unitarios, 13/13 e2e, build OK. Confirmó el fix del plegado por teclado, pero encontró un **residuo**: al no renderizar `<details>` en clásico, Avisos y Vértice heredaban el gap de 12px del shell donde `main` tenía 8px propios. Corregido en `22c0042` con `groupInClassic`, que reproduce la forma que cada grupo tenía.
- **L12** (hueco de test, cerrado) — El e2e sólo afirmaba la mitad clásica del gate: pasaba igual con el acordeón muerto en moderno. Ahora selecciona un componente y exige que la sección exista, se pliegue al clic y se despliegue con Enter. El unitario además falla si una familia importada no está en `package.json` o si vuelve el import de Space Grotesk.
- **L13** (decisión) — S4 se cierra sin los "inputs numéricos en pares": el único candidato real es la posición X/Y, y volverla editable es una feature que escribe geometría en el modelo, no piel. Los "grupos de iconos segmentados" ya existen con la forma correcta (selector de color de señalización: `role="group"` + `aria-pressed` + `disabled`), así que migrarlos a `ToggleGroup` sería churn.
- **L14** (S7) — La paleta vertical **no** es exclusiva del moderno: hay preferencia de orientación, así que el rediseño se hizo con hooks `data-palette` / `data-panel-head` / `data-palette-group` más un bloque `:root.moderno`. Verificado por computed style en ambos mundos: clásico sigue con `text-transform: uppercase` y 10.5px.

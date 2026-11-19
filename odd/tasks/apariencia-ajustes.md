# apariencia-ajustes — Diálogo de Configuración → Apariencia y auto cierre de paneles

Feature: el menú estrena **Configuración → Apariencia**, que abre un diálogo con
el tamaño de los bornes, el grosor de los cables y un "auto cierre" para los
paneles de la paleta. Branch: `main` local. Test runner: `pnpm test` desde `app/`.

## Specs

- S1 (pedido verbatim): "agrega en el menu una opcion , apariencia, dentro
  configuracion, y dentro de configuracion que se abra un dialog, y dentro de
  dialog poder cambiar el tamaño de los bornes y el grosor de los cables, en
  apariencia un checkbox que sea ¨auto cierre¨que sea que los paneles por
  ejemplo si abro alimentacion y luego abro motores se cierre aliementacion".
- S2 (menú): nueva entrada de primer nivel «Configuración» en la barra, con el
  ítem «Apariencia»; elegirlo abre el diálogo de S3. Las entradas existentes
  (Archivo, Editar, Ver, Simulación) no cambian.
- S3 (diálogo): se abre como modal con título «Configuración» y la sección
  «Apariencia»; adentro, el tamaño de bornes, el grosor de cables y el check de
  auto cierre. Se cierra con el botón «Listo», con Esc y con clic en el fondo.
- S4 (bornes): tres tamaños — Chico / Normal / Grande — que cambian el radio de
  los puntos de borne del glifo del símbolo y de los puntos de conexión del
  lienzo. Normal reproduce los valores de hoy (1,4 en el glifo y 0,9 en el
  lienzo), así que sin tocar la preferencia el dibujo no cambia.
- S5 (cables): tres grosores — Fino / Normal / Grueso — que escalan el ancho de
  todos los conductores de forma proporcional, incluidos los de tensión
  (`.wire.live`) y los seleccionados (`.wire.sel`). Normal = 0,17, el valor de
  hoy.
- S6 (auto cierre): checkbox «Auto cierre» dentro de Apariencia, apagado por
  defecto; con el check prendido, abrir un panel de la paleta cierra el que
  estaba abierto (Alimentación → Motores deja sólo Motores) y volver a tocar el
  panel abierto lo cierra. Apagado, el comportamiento es el de hoy (varios
  paneles abiertos a la vez).
- S7 (persistencia): los tres valores viven en `localStorage` bajo
  `simuelectro:ajustes` y se leen al arrancar. Un valor inválido o un storage
  inaccesible cae al default sin romper ni tirar la UI.
- S8 (tests): codec tolerante (basura, parcial, desconocido), reducer del auto
  cierre en sus dos modos y derivaciones de radio/ancho. Suite verde y
  `npx tsc --noEmit` limpio.
- S9 (diferencial): sin preferencias guardadas, el menú previo funciona igual y
  el render conserva las geometrías de hoy (bornes 1,4/0,9, cables 0,17/0,34).

## Tasks

- T1 (S7, S8): módulo `app/src/ui/settings.ts` con codec tolerante, store
  (`getSettings`/`setSettings`/`subscribeSettings`), derivaciones de radio y
  ancho, y el reducer `nextOpenCats`; tests en `app/test/settings.test.ts`.
  Route: delegado a `gentle-ai-worker`. DONE — 13 tests nuevos, suite 398/398.
  Commit: `499d4c7`.
- T2 (S2, S3): `app/src/components/ui/dialog.tsx` (estilo shadcn sobre
  `radix-ui`), `app/src/ui/SettingsDialog.tsx` y la entrada de menú. Route:
  delegado a `gentle-ai-worker`. DONE. Commit: `4bd4efc`.
- T3 (S4, S5): aplicar tamaño/ancho en `SymbolGlyph`, `Canvas` y `diagram.css`
  (var `--wire-w`). Route: delegado a `gentle-ai-worker`. DONE. Commit:
  `ac891b6`.
- T4 (S6): auto cierre en `Palette.tsx` usando `nextOpenCats`. Route:
  delegado a `gentle-ai-worker`. DONE. Commit: `076acc0`.
- T5 (S9): diferencial de defaults + `pnpm test` + `tsc` + build. Route:
  inline. DONE — suite 398/398, `tsc` limpio, `vite build` OK y diferencial de
  valores: `parseSettings(null)` → `normal/normal/false` con 1,4 / 0,9 / 0,17
  (0,34 duplicado), idénticos a los literales que reemplazaron.

## Log

- L1: pedido verbatim: "agrega en el menu una opcion , apariencia, dentro
  configuracion, y dentro de configuracion que se abra un dialog, y dentro de
  dialog poder cambiar el tamaño de los bornes y el grosor de los cables, en
  apariencia un checkbox que sea ¨auto cierre¨que sea que los paneles por
  ejemplo si abro alimentacion y luego abro motores se cierre aliementacion".
- L2: mapa del UI (explorado antes de escribir): el menú vive en
  `app/src/ui/App.tsx:607-752` (shadcn Menubar sobre `radix-ui`); no existe
  ningún diálogo ni `dialog.tsx` en el proyecto; los "paneles" Alimentación /
  Motores son categorías de la barra horizontal de `Palette.tsx` con estado
  local `openCats` (array, varios abiertos a la vez) y el toggle en
  `toggleCategory`; los puntos de borne son literales JSX `r={1.4}`
  (`SymbolGlyph.tsx:113,118`) y `r={0.9}` (`Canvas.tsx:668`); el grosor de
  cable es CSS (`.wire` 0,17, `.wire.live`/`.wire.sel` 0,34 y un duplicado de
  mayor especificidad en `index.css:318`); la persistencia de preferencias ya
  tiene el molde de `symbols/scope.ts` (localStorage + `useSyncExternalStore`).
- L3: defaults elegidos para no cambiar nada sin preferencia guardada: bornes
  Normal = 1,4 / 0,9 y cables Normal = 0,17 (S4, S5, S9). Auto cierre apagado
  por defecto (S6): es una preferencia nueva, no un cambio de comportamiento.
- L4: verificación (S8, S9): 13 tests nuevos en `app/test/settings.test.ts`
  (codec por campo, round-trip, `nextOpenCats` en los dos modos, derivaciones
  con Normal exacto); suite 398/398; `npx tsc --noEmit` limpio; `vite build`
  OK; los únicos `stroke-width` de `.wire*` que quedan son `var(--wire-w)` y
  `calc(var(--wire-w) * 2)`, y el duplicado de especificidad
  `[data-pack='cadesimu'] .wire` ahora resuelve por la variable. Diferencial de
  defaults medido en node: `parseSettings(null)` → `normal/normal/false` con
  radios 1,4 / 0,9 y ancho 0,17 (0,34 duplicado). No se agregaron dependencias:
  `Dialog` y `Checkbox` salen del `radix-ui` que ya estaba en `package.json`.
- L5: el repo no tiene test de DOM (`node --test` con type-stripping, sin
  renderer), así que el diálogo y el render se verifican por tipos (`tsc`) y
  por los reducers/derivaciones ya testeados. La verificación visual del
  diálogo y de los tres presets queda como paso manual.

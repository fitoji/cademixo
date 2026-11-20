# paleta-horizontal-vertical — Paneles de componentes en las dos orientaciones

Feature: la barra de componentes se puede usar **horizontal** (como hoy) o
**vertical**, elegido como preferencia en Ver → Apariencia… Branch: `main`
local.

## Specs

- S1 (pedido verbatim): "opcion de tener paneles de componentes horizontal o
  vertical".
- S2 (preferencia): vive en el store de ajustes (`simuelectro:ajustes`), campo
  nuevo `paneles` con valores `horizontal` (default) y `vertical`. Se lee con el
  mismo patrón que los otros ajustes y tolera basura: un valor inválido cae a
  `horizontal`.
- S3 (dónde se elige): en **Ver → Apariencia…**, como un tercer grupo de
  opciones junto a tamaño de bornes y grosor de cables. No se agrega otro
  diálogo ni otra entrada de menú.
- S4 (horizontal): la barra actual, sin ningún cambio visual ni de
  comportamiento.
- S5 (vertical): la rama vertical de `Palette.tsx`, que hoy es código muerto
  porque `const horizontal = true` la desvía, tiene que quedar funcional y
  equivalente: mismo listado de categorías, favoritos y hojas, misma selección de
  componente, mismo estilo del resto de los paneles.
- S6 (auto cierre): la preferencia de auto cierre actúa igual en las dos
  orientaciones (abrir un panel cierra el anterior cuando está prendida).
- S7 (tests): el codec de la preferencia (default, valor válido, valor inválido)
  y la decisión de orientación como función pura; suite, `tsc` y build verdes.

## Tasks

- T1 (S2, S7): campo `paneles` en `app/src/ui/settings.ts` con su parseo
  tolerante y sus tests. Route: delegado.
- T2 (S3): tercer grupo en `SettingsDialog.tsx`. Route: delegado.
- T3 (S4, S5, S6): `Palette.tsx` lee la preferencia y la rama vertical queda
  funcional, con el auto cierre aplicando en las dos. Route: delegado.
- T4: verificación integral y prueba visual en la app. Route: inline.

## Log

- L1: pedido verbatim en S1.
- L2: estado previo. `Palette.tsx` tiene `const horizontal = true` y la rama
  vertical (Acordión con `open`/`setOpen`) nunca se ejecuta; el auto cierre
  (`nextOpenCats`) sólo está cableado en la rama horizontal.
- L3: decisión de diseño. La orientación es una preferencia de apariencia más, no
  un estado de sesión: se guarda con las otras y se elige en el mismo diálogo,
  porque partir la configuración en dos lugares es exactamente lo que el usuario
  acaba de corregir al mover Apariencia a Ver.
- L4: implementado (S2, S3, S5, S6, S7; S4 intacto). `settings.ts` suma
  `paneles: 'horizontal' | 'vertical'` con default `horizontal`, el mismo parseo
  por campo (valor de otro tipo o fuera de la lista → default), la misma
  serialización y la orientación incluida en el chequeo de «no cambió nada» de
  `setSettings`. La decisión de orientación no lleva envoltorio: es el campo
  `paneles` que devuelve `parseSettings`, y los tests cubren default, `vertical`
  guardado y valor inválido. `SettingsDialog.tsx` suma el tercer grupo «Paneles
  de componentes» (Horizontal / Vertical) con el mismo `Field` + `ToggleGroup`
  que los otros dos; los grupos existentes no se tocaron.
- L4 (rama vertical): estaba muerta, no solo desviada. Lo que faltaba o estaba
  viejo, exacto: (1) `const horizontal = true` la hacía inalcanzable; (2) usaba
  su propio estado `open`/`setOpen`, un segundo estado de paneles paralelo al
  `openCats` de la barra, y por eso el auto cierre nunca llegaba: el acordeón
  ignoraba `autoCierre` y `nextOpenCats` sólo estaba cableado en la rama
  horizontal (S6 roto); (3) repetía el armado de categorías filtrando
  `favSymbols` y `GROUP_ORDER` por su cuenta en vez de usar `categories`, y las
  filas de favoritos pasaban `favorite` fijo en `true` en lugar de leer el mismo
  arreglo `favorites` que el resto; (4) su `ScrollArea` con `min-h-0 flex-1`
  dependía de una altura definida que el lugar de la paleta en el layout no
  tiene (queda arriba del lienzo en las dos orientaciones), así que la lista se
  habría comprimido en vez de scrollear. Ahora las dos orientaciones comparten
  `openCats`: la horizontal sigue con `nextOpenCats` por clic de categoría y la
  vertical resuelve el conjunto que entrega Radix con `nextOpenAccordion`
  (función pura con tests), la rama vertical mapea `categories` con
  `SymbolTile`/`SymbolRow`, `onPick`, `onSheet` y `favorites`, y su zona
  plegable lleva altura acotada (`min(52vh,420px)`) para poder scrollear sin
  empujar el lienzo.
- L4 (sin verificar, necesita navegador): el aspecto real de la columna vertical
  y de su altura acotada, el abrir/cerrar de los acordeones con auto cierre
  prendido y apagado, el toggle de favoritos y el cambio de hoja desde la
  vertical. Tampoco se pudo verificar el encaje físico: la paleta se renderiza
  en el mismo lugar que la barra horizontal (arriba del lienzo), así que en
  vertical queda como columna de 232 px arriba del lienzo con espacio libre a la
  derecha; para que quede acoplada al costado hay que mover `{palette}` dentro
  de la fila del lienzo en `app/src/ui/App.tsx`, archivo fuera de las
  superficies de edición de esta tarea.
- L5: la rama vertical no quedaba a un costado: `App.tsx` montaba `{palette}`
  arriba del lienzo en las dos orientaciones, así que en vertical aparecía una
  columna de 232 px sobre el canvas con hueco a la derecha. Se movió el montaje:
  la misma pieza se renderiza arriba en horizontal y como primer hijo de la fila
  del lienzo en vertical, y su lista pasa de `h-[min(52vh,420px)]` a
  `flex-1 min-h-0` porque ahora tiene alto definido. Un solo componente, dos
  lugares.

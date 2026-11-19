# guardar-y-guardar-como — Guardar en el archivo abierto y Guardar como…

Feature: el menú Archivo pasa a tener «Guardar» (⌘S) y «Guardar como…» (⇧⌘S);
«Guardar» reescribe el archivo abierto cuando el navegador lo permite y nunca
inventa un destino. Branch: `main` local. Test runner: `pnpm test` desde `app/`.

## Specs

- S1 (pedido verbatim): "agrega en el menu archivo, guardar y guardar como...".
- S2 (menú): Archivo lleva «Guardar» y «Guardar como…» con sus atajos ⌘S y
  ⇧⌘S (Ctrl en Windows/Linux). Se retira el ítem «Guardar .cad» y el botón de
  la barra pasa a decir «Guardar» y hace lo mismo que el ítem.
- S3 (Guardar): si el documento tiene un archivo asociado con permiso de
  escritura, se reescribe ese archivo sin diálogo. Si no lo tiene, se comporta
  como «Guardar como…»: no se escribe en ningún destino inventado.
- S4 (Guardar como…): pide destino y nombre cuando el navegador lo permite y
  guarda ahí; si el navegador no lo permite, pide el nombre en un diálogo
  («Guardar como») y descarga con ese nombre, porque ahí no hay selector del
  sistema al que pedírselo. La cabecera muestra el nombre del archivo realmente
  escrito (`handle.name`), no el sugerido: si el usuario eligió otro nombre o
  extensión, mostrarlo distinto sería mentir sobre dónde quedó el archivo. El
  `.cad` normalizado se sigue usando como nombre sugerido del selector, como
  valor inicial del diálogo y como nombre de la descarga.
- S5 (Abrir): cuando el navegador permite elegir archivo con handle, al abrir
  se conserva el handle para poder reescribir después ese mismo archivo; si no,
  el camino actual (input oculto) queda exactamente igual.
- S6 (validación): ningún camino nuevo escribe si el documento no re-parsea
  igual; el aviso es el de hoy («no se guardó: el documento no re-parsea
  igual»). Escribir el archivo del usuario es irreversible, así que la
  validación es condición necesaria y previa a cualquier escritura.
- S7 (estado sucio): después de guardar, el documento deja de figurar como
  sucio.
- S8 (tests): la decisión de qué hacer al guardar y el atajo de teclado son
  funciones puras y se testean (handle presente o no, navegador con o sin
  soporte, nombre normalizado). El resto del camino es de navegador y no tiene
  test automatizado en este repo.
- S9 (diferencial): en un navegador sin soporte de la File System Access API,
  abrir y guardar se comportan como hoy, salvo el nombre de los ítems, los
  atajos y el estado sucio.

## Tasks

- T1 (S8): módulo `app/src/ui/files.ts` con la detección de soporte, la
  decisión `planSaveAction`, el nombre sugerido y el atajo, como funciones
  puras; tests en `app/test/files.test.ts`. Route: delegado. DONE — 11 tests.
- T2 (S3, S4, S5): cablear `App.tsx` (handle en ref, Abrir con handle,
  Guardar / Guardar como…), el fallback de descarga y el botón de la barra.
  Route: delegado. DONE.
- T3 (S2): los dos ítems de menú con atajos y el manejador de teclado sin
  romper los atajos existentes. Route: delegado. DONE.
- T4 (S7): marcar el documento como limpio al guardar. Route: delegado. DONE
  (`markSaved` en `editor/state.ts`).
- T5 (S6, S9): verificación integral (suite, tsc, build, diferencial del camino
  sin soporte) y cierre del doc. Route: inline. DONE — suite 431/431, `tsc`
  limpio, `vite build` OK, y se actualizó `docs/iconos.md`, que todavía hablaba
  de «Guardar .cade».

## Log

- L1: pedido verbatim: "agrega en el menu archivo, guardar y guardar como...".
- L2: mapa previo: hoy hay un solo «Guardar .cad» (`App.tsx:209-221`) que
  valida con `roundTrips` y descarga el blob (`samples.ts:57-66`); no se
  conserva ni el `File` ni ningún handle, así que guardar es siempre «Guardar
  como»; no hay uso de la File System Access API en el repo; no hay atajos
  ⌘S/⇧⌘S; `state.dirty` nunca se limpia al guardar; el nombre lo normaliza
  `cadFileName` (`format/filename.ts:26-30`) y la extensión de guardado es
  `.cad` (`filename.test.ts` la fija).
- L3: la escritura va al texto canónico del editor (`state.text`), que es
  lossless por invariante (`project.ts:383-390`) y está probado en
  `test/compat.test.ts`. Igual se mantiene la validación previa porque guardar
  sobre el archivo del usuario es irreversible.
- L4: implementación. `files.ts` separa lo puro (soporte, `planSaveAction`,
  nombre sugerido, `saveShortcutOf`) de tres envoltorios finos
  (`pickSaveHandle`, `pickOpenHandle`, `writeHandle`); los selectores de la File
  System Access API no están en la lib de TypeScript instalada, así que se
  declaran ahí con lo mínimo que se usa. `App.tsx` guarda el `FileSystemFileHandle`
  en un ref: lo fija «Abrir…» con selector y «Guardar como…», y lo limpia
  cualquier documento que entra sin archivo detrás («Nuevo» y los ejemplos).
  La validación `roundTrips` corre antes de cualquier escritura y su mensaje no
  cambió; un picker cancelado o una escritura fallida avisan y dejan el
  documento sucio, así que nunca se informa un guardado que no ocurrió.
- L5: dos cosas que quedan anotadas como deuda menor. (a) El efecto de teclado
  ahora depende de `saveDocument`, que cambia con el estado: el listener se
  vuelve a suscribir en cada edición (correcto, pero un `useRef` sería más
  prolijo). (b) `openDocument` no captura un fallo de lectura del archivo
  elegido; el camino del input oculto tampoco lo hacía antes.
- L6: cierre de la verificación independiente de `8010d29` + `68a05d8` (sin
  hallazgos bloqueantes, seis puntos). El reparto cancelación/fallo y la guarda
  «el texto sigue siendo el que se escribió» salieron de ahí.
  (a) UX: `pickOpenHandle` pasa el mismo filtro que el `accept` del input oculto
  (`OPEN_TYPES`: `.cade`/`.cad`) y sigue con `multiple: false`, así el diálogo
  del sistema ya no ofrece cualquier archivo (S5).
  (b) Cancelar ≠ fallar: las dos firmas devuelven `null` sólo con `AbortError` y
  lanzan `PickerError` en cualquier otro fallo; `App.tsx` avisa «no se pudo abrir
  el selector» en vez de «no se eligió destino». `planSaveAction` no cambió (S3, S4).
  (c) `markSaved` sólo corre si `s.text === text`, tanto al reescribir como al
  descargar: una edición tipeada durante la escritura se queda sucia (S7).
  (d) `writeHandle` envuelve también `close()`: aborta el stream como mejor
  esfuerzo (un abort que falla no tapa nada) y repropaga el error original (S6).
  (e) Docs: `docs/cade-format.md` y `README.md` dejan de decir que guardar
  siempre deja `.cad` (con handles se reescribe tal cual; el `.cad` normalizado
  es nombre sugerido y descarga), y `docs/iconos.md` documenta los tres casos de
  «Guardar» y suma `SaveAllIcon` (30 íconos).
  (f) `test/files.test.ts` suma los sondeos durables de la verificación: bytes de
  los fixtures, truncado fuera de latin1, los dos casos de `planSaveAction`,
  atajos, y los envoltorios con selectores y streams falsos. De 11 a 26 tests.
- L7: bug del usuario, verbatim: "guardar funciona, pero guardar como hace lo
  mismo que guardar, deberia de abri un dialog para poder escribir nombre ,
  etc". Diagnóstico: en un navegador sin la File System Access API,
  `planSaveAction` devuelve `'download'` tanto para «Guardar» como para
  «Guardar como…», así que los dos caminos colapsaban en la misma descarga con
  el nombre actual y «Guardar como…» nunca preguntaba nada (S4 no se cumplía en
  ese navegador). Cambios: `normalizeSaveName` en `ui/files.ts` (trim, `null` si
  queda vacío, y `cadFileName` para que la regla del `.cad` siga en un solo
  lugar); `ui/SaveAsDialog.tsx` nuevo con los primitivos de la casa (título
  «Guardar como», descripción de que el navegador descarga con ese nombre,
  `Input` prellenado y seleccionado, aviso de la extensión, «Cancelar» y
  «Guardar»; envía con Enter y «Guardar» queda deshabilitado mientras el nombre
  normalizado es `null`; Esc, fondo y Cancelar no guardan); `App.tsx` abre ese
  diálogo sólo cuando «Guardar como…» habría descargado, y al confirmar repite
  `roundTrips`, descarga con el nombre elegido, lo adopta como nombre del
  documento y lo marca limpio sólo si el texto sigue siendo el descargado. No se
  vuelve a llamar a `saveDocument('save-as')` al confirmar, así que no hay bucle;
  «Guardar» no cambió en ninguna rama. Tests: `normalizeSaveName` con `''`,
  `'   '`, `'nota'`, `'nota.cade'`, `'nota.cad'` y `'  mi plano  '` (26 → 29).
  Queda sin probar en navegador real: el diálogo es de React y este repo no tiene
  test de UI (S8).

# paneles-redimensionables — Paleta e Inspector con ancho ajustable (ui-sdk resizable)

Feature: la paleta y el Inspector se pueden redimensionar arrastrando (o con el
teclado) usando el comportamiento `resizable` de `@ui-sdk/react`, con el ancho
persistido. Primera adopción de ui-sdk, deliberadamente acotada a una isla.
Branch: `main` local.

## Specs

- S1 (pedido): "mme interesa los huecos reales que cubre ui-sdk, que te parece de
  utilizar creatviewport, create selection y resizable?" y luego "dale" a la
  propuesta de empezar por `resizable` (paleta + inspector) dejando
  `createViewport` para después y `createSelection` descartado para el lienzo.
- S2 (dependencia): se agregan `@ui-sdk/react` y `@ui-sdk/core` con la versión
  exacta que resuelva el registro, sin rango abierto. Licencia Apache-2.0, React
  ≥19 (el proyecto usa 19). Si la política de antigüedad de releases bloquea la
  instalación, **parar y avisar** en vez de cambiar la política.
- S3 (encapsulado): el paquete se usa a través de un wrapper propio en
  `app/src/components/ui/resizable.tsx`, con el estilo de la casa (mismos
  patrones que `dialog.tsx`/`menubar.tsx`). El resto de la app no importa
  `@ui-sdk/*` directamente: si mañana se cambia de librería, se cambia un
  archivo.
- S4 (qué se redimensiona): con la paleta **vertical**, el ancho de la columna
  (mínimo 160 px, máximo 420 px, inicial 232). Con la paleta **horizontal**, la
  barra de arriba mantiene su alto fijo y lo redimensionable es el **Inspector**
  (mínimo 240 px, máximo 520 px, inicial el actual). En vertical, también el
  Inspector. El lienzo ocupa el resto y sigue encuadrando igual.
- S5 (persistencia): el ancho elegido se guarda y se restaura al recargar, bajo
  el prefijo de claves del proyecto (`simuelectro:`), no bajo la clave suelta de
  la librería. Un layout guardado inválido no rompe el arranque.
- S6 (teclado y a11y): cada handle lleva `aria-label` en castellano y se mueve
  con flechas, Home/End. Los handles no roban el foco al tabular por el resto de
  la interfaz y un handle deshabilitado no queda en el orden de tabulación.
- S7 (sin regresión): el resto de la interfaz queda igual: menú, diálogo de
  Apariencia, barra horizontal, lienzo, atajos. Suite, `tsc` y build verdes.
- S8 (límite de verificación): la interacción se valida a mano (no hay harness de
  DOM). Lo único testeable es el formateo de claves y los límites si quedan como
  función pura.

## Tasks

- T1 (S2): instalar la dependencia exacta y verificar que compila. Route:
  delegado.
- T2 (S3): wrapper `components/ui/resizable.tsx`. Route: delegado.
- T3 (S4, S5, S6): cablear paleta vertical e Inspector con límites, teclado y
  persistencia con prefijo propio. Route: delegado.
- T4 (S7, S8): verificación integral y prueba visual. Route: inline.

## Log

- L1: pedidos verbatim en S1.
- L2: decisión de alcance. `resizable` es el único de los tres que **agrega**
  capacidad sin reemplazar el motor: paneles sin estilo, tamaños en %/px con
  mínimos, teclado, `autoSaveId`/`storage` y atributos `data-*` para estilar con
  nuestros tokens. `createViewport` toca todas las conversiones pantalla↔plano
  (hit-test, snap, arrastre, encuadre) y se decide después; `createSelection`
  modela listas ordenadas, no selección espacial sobre el lienzo.
- L3: riesgo declarado. Dependencia `0.1.0-beta`: se adopta en una isla
  reversible, no en el lienzo. Y sin harness de DOM, la verificación de la
  interacción es manual del usuario.
- L4: hecho (T1–T4).
  - Versión instalada: `@ui-sdk/react@0.1.0-beta.13` y `@ui-sdk/core@0.1.0-beta.13`,
    exactas (sin `^` ni `~`), con `pnpm --filter electro-simulador add --save-exact`.
    Verificado por `node -e` sobre los dos `package.json` en `node_modules`, por
    `npx tsc --noEmit` (exit 0) y por el build. Licencia Apache-2.0, peers
    `react >=19` (acá 19.2/19.3), cumplidos.
  - `@ui-sdk/react/resizable` **no es un directorio**: es un subpath del mapa
    `exports` del paquete (`./resizable` → `dist/resizable.js` + `dist/resizable.d.ts`).
    Se comprobó con `node --input-type=module -e "import('@ui-sdk/react/resizable')"`,
    que devuelve `Resizable`, `ResizablePanel`, `ResizableHandle`,
    `createResizableController` y `resizableStorageKey`.
  - `pnpm-workspace.yaml` tiene hoy un bloque `minimumReleaseAgeExclude` con
    `@ui-sdk/core@0.1.0-beta.13` y `@ui-sdk/react@0.1.0-beta.13`. Lo escribió pnpm
    solo, al instalar: la política de antigüedad de releases (supply-chain, pnpm
    12) no deja entrar una beta recién publicada y pnpm la exceptúa en vez de
    fallar (no estaba en modo estricto). Está atado a esas dos versiones exactas,
    no a un rango, y se borra si algún día se saca la dependencia. No se tocó la
    política ni se buscó otra versión para esquivarla.
  - `pnpm approve` sigue listando las *agent skills* de `@ui-sdk/core` como
    pendientes de aprobación. No bloquea ni el build ni los tests; sólo vuelve a
    avisar en cada instalación.
  - Wrapper: `app/src/components/ui/resizable.tsx`, con el estilo de la casa
    (`data-slot`, `cn` del paquete `cn`, partes finas, `"use client"`). Exporta
    `Resizable`, `ResizablePanel`, `ResizableHandle`, `layoutStorage` y los tipos
    `ResizableSize`, `ResizableStorage`, `ResizableState`, `ResizablePanelState`,
    `ResizableHandleState`. Es la única puerta a `@ui-sdk/*`: el resto de la app
    no importa la librería.
  - Layout en clases: grupo `flex` con `flex-row`/`flex-col` según
    `data-[orientation]` y `min-h-0 min-w-0`; panel `flex min-h-0 min-w-0 flex-col`
    (el tamaño lo pone la primitiva: escribe `--resizable-panel-size` en % en cada
    frame y su `flex-basis` en línea lo consume, así que no hay clase de ancho);
    handle hairline de 1 px con `bg-border`, `touch-none`, cursor de eje y
    `bg-ring` en `data-[hovering]`, `data-[dragging]` y `focus-visible`. Se
    confirmó en el CSS construido que esas variantes existen
    (`.data-\[hovering\]\:bg-ring[data-hovering]`, `[data-orientation=horizontal]:w-px`, etc.).
  - Persistencia: `app/src/components/ui/resizable-storage.ts` (módulo puro nuevo,
    parte de la isla) traduce la clave de la librería al prefijo del proyecto. La
    librería pide `ui-sdk-resizable:<autoSaveId>`; se guarda como
    `simuelectro:ui-sdk-resizable:<autoSaveId>` (hoy `simuelectro:ui-sdk-resizable:paneles`),
    con un objeto `{"<ids separados por coma>": [porcentajes]}` adentro. Si no hay
    `localStorage` el adaptador queda inerte y nunca se cae a la clave suelta de
    la librería. Un valor ausente, roto o con tamaños que no son números finitos
    se descarta y los paneles arrancan con sus tamaños por defecto.
  - Qué se redimensiona. **Vertical**: la paleta es un panel (inicial 232 px,
    mínimo 160, máximo 420) y el Inspector otro (inicial 268 px —el `w-[268px]`
    que tenía—, mínimo 240, máximo 520). **Horizontal**: la barra de arriba
    conserva su alto y queda fuera del grupo; sólo se redimensiona el Inspector,
    con los mismos límites. El lienzo es un panel sin `defaultSize`, así que se
    queda con lo que sobra y su encuadre no cambia. Ids estables `paleta`,
    `lienzo`, `inspector`; la librería guarda un layout por conjunto de ids, por
    eso cada orientación recuerda su propio ancho bajo el mismo `autoSaveId`.
  - Handles con `aria-label` en castellano («Redimensionar paleta»,
    «Redimensionar inspector»), separadores WAI-ARIA con flechas, Shift+flecha,
    Home/End y `aria-valuenow`/`min`/`max`/`controls` que pone la primitiva.
  - Único test ejecutable (S8): `app/test/resizable-keys.test.ts` (7 casos,
    RED→GREEN) cubre el prefijo, la lectura tolerante de basura y la ida y vuelta
    del adaptador. El resto es manual: arrastre, teclado, y que el ancho vuelva
    tras recargar.
  - Límite de los px: la librería razona en porcentajes internos, así que 160 px
    es un mínimo vigente para el ancho actual de la ventana; al redimensionar la
    ventana esos mínimos/máximos en px se re-derivan (reason `resize`) y los
    paneles conservan su *proporción*, no su ancho en px: agrandar la ventana
    ensancha la paleta hasta su tope de 420 px en vez de dejarla clavada en 232.
    Es el comportamiento documentado de la primitiva, no del wrapper.
  - Sin regresión declarada: mismo menú, mismo diálogo de Apariencia, misma barra
    horizontal, mismo lienzo. Lo único que cambia son 2 px de ancho del lienzo:
    los 1 px de `border-r` de la paleta y `border-l` del Inspector pasaron a ser
    los handles, y los paneles conservan sus 232/268 px. Suite (498), `tsc` y
    build en verde; `test/parse-perf.test.ts` falló una vez por su umbral de
    tiempo y pasó al reintentar (flaky conocido, no se tocó).
- L5: verificación independiente de la adopción (sin hallazgos bloqueantes).
  Confirmado con sondas sobre la librería real: versiones exactas y licencia,
  isla de imports, primer render 232/268 idéntico a hoy, clave final
  `simuelectro:ui-sdk-resizable:paneles`, 9 casos de layout corrupto que no
  rompen ni reescriben bytes, y claves de teclado con `aria-valuenow/min/max`.
  Tres precisiones que quedan anotadas como comportamiento conocido:
  (a) cambiar de orientación en la misma sesión no vuelve a los anchos por
  defecto — la librería arrastra el layout (medido: inspector 268 → 327,7 al
  pasar a horizontal, y al volver a vertical paleta 211,2 e inspector 240, su
  mínimo); se corrige recargando, y no se persiste salvo que después se arrastre.
  (b) el lienzo pierde 1 px en horizontal (no 2): 2 px es sólo en vertical.
  (c) el ancho exterior de la paleta y del inspector no cambia, pero el contenido
  gana 1 px porque el borde pasó a ser el handle.

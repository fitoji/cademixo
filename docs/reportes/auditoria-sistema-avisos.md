# Auditoría del sistema de avisos

**Fecha**: 2026-11-23
**Alcance**: detección, presentación, navegación y acciones del sistema de avisos («Avisos») de cadeMixo.
**Commit base**: `65eedd8`
**Tipo**: revisión de solo lectura. No se modificó código fuente; este archivo es el entregable.

## Resumen ejecutivo

El sistema funciona y tiene una base sana: un validador puro (`validate`), un modelo de datos simple (`Finding`), un contador en el pie que abre el drawer y dos acciones útiles sobre el lienzo (crear/quitar unión). El problema principal no es que falten avisos, sino que **hay demasiados y algunos no se pueden usar**:

- En un plano real (`inversion-giro-cej.cade`) se producen **59 avisos**, de los cuales **24 se repiten** con dos textos distintos para el mismo punto.
- Los avisos no guardan la hoja a la que pertenecen, así que en documentos multi-hoja «Ir al lugar del aviso» puede no mostrar nada.
- Al hacer clic en un aviso no se desplaza la vista hasta el punto y el resaltado nunca se limpia.
- El aviso de uniones duplicadas no incluye los ids de los registros, así que su acción correctiva no existe.

Prioridad recomendada: primero caracterizar con tests (F6), después deduplicar (F1) y dar identidad de hoja (F2), y recién entonces trabajar la navegación (F3).

## Mapa del subsistema

| Capa | Archivo | Qué hace |
|---|---|---|
| Detección | `app/src/editor/network.ts:223-334` | `validate(records)` construye la red y emite seis códigos: `orphan-end`, `tee-without-junction`, `orphan-junction`, `duplicate-junction`, `overlap`, `cable-disconnected`. |
| Modelo | `app/src/editor/network.ts:73-80` | `Finding { level, code, message, ids, at? }`. No incluye hoja. |
| Cómputo | `app/src/ui/App.tsx:595-596` | `network` y `findings` son dos `useMemo` separados; `validate` vuelve a construir la red. |
| Entrada UI | `app/src/ui/App.tsx:1619-1629` | Botón rojo en el pie con el total; abre el drawer en modo `avisos`. |
| Presentación | `app/src/ui/Inspector.tsx:299-373` | Tarjetas `Alert` con mensaje y acciones contextuales. En modo `avisos` se pasa `limit={findings.length}` (línea 95), así que **no hay truncamiento** en esa vista. |
| Navegación | `app/src/ui/App.tsx:1668`, `app/src/ui/Canvas.tsx:817-823` | `onFocusFinding` guarda `{ ids, at }` en `highlight`; el Canvas dibuja una cruz en esa coordenada. |

### Medición rápida sobre planos del repo

| Plano | Avisos | Desglose |
|---|---:|---|
| `app/test/fixtures/inversion-giro-cej.cade` | 59 | 30 `orphan-end`, 25 `cable-disconnected`, 2 `orphan-junction`, 2 `duplicate-junction` |
| `app/test/fixtures/arranque-paro-motor-3f.cad` | 1 | `duplicate-junction` |
| `app/test_simu/PR1_Rodolfo_Giusti_03.cad` (y su copia `marcha_motor.cad`) | 1 | `orphan-junction` |

De los 25 `cable-disconnected`, **24 caen exactamente en la misma coordenada** que un `orphan-end`: el mismo defecto físico se informa dos veces.

## Hallazgos vetted

Ordenados por apalancamiento (impacto ÷ esfuerzo, descontado por confianza y riesgo del fix).

### F6 — [TEST-01] Tres de los seis códigos de aviso no tienen test directo

- **Evidence**: `app/test/cables.test.ts:78,200,430,437` y `app/test/wiring-junctions.test.ts:42` cubren `duplicate-junction`, `orphan-junction` y `tee-without-junction`. No hay aserciones sobre `orphan-end`, `cable-disconnected` ni `overlap` (`rg` sobre `app/test` da cero para esos códigos).
- **Impact**: cualquier cambio de deduplicación o de severidad puede romper esos tres códigos sin que la suite lo detecte. Es dependencia directa de F1 y F5.
- **Effort**: S.
- **Risk**: LOW — sólo tests nuevos.
- **Confidence**: HIGH.
- **Fix sketch**: agregar en `app/test/cables.test.ts` una tabla de casos con un fixture mínimo por código y aseverar `code`, `at` e `ids`; usar el estilo de `validate: reporta un 4001 que no conecta ningún tramo` (línea 425).

### F1 — [CORRECTNESS-01] El mismo extremo suelto se reporta dos veces

- **Evidence**: `app/src/editor/network.ts:230-238` emite `orphan-end` para `ends.length === 1 && through.length === 0 && !pin && !junction`; `app/src/editor/network.ts:310-330` emite `cable-disconnected` para extremos con `!node.connected`. Medición: 24 de 25 `cable-disconnected` comparten coordenada con un `orphan-end` en `inversion-giro-cej.cade`.
- **Impact**: 59 avisos en un plano real, con el contador del pie en rojo y el usuario sin forma de saber que 24 son duplicados. Dificulta ver los avisos accionables.
- **Effort**: S–M.
- **Risk**: LOW — cambia sólo la emisión de mensajes; con F6 delante hay red de seguridad.
- **Confidence**: HIGH (medido, no inferido).
- **Fix sketch**: en `cable-disconnected`, omitir nodos que ya generaron `orphan-end`; si se quiere conservar el número de cable, fusionarlo en el mensaje del único aviso resultante.

### F2 — [CORRECTNESS-02] `Finding` no identifica la hoja

- **Evidence**: `app/src/editor/network.ts:73-80` no tiene campo `sheet`; `app/src/ui/App.tsx:596` valida `project.records` (todas las hojas) mientras `app/src/ui/App.tsx:186-587` dibuja sólo `activeSheet`; `app/src/ui/Canvas.tsx:817-823` pinta la cruz en coordenadas absolutas sin cambiar de hoja.
- **Impact**: en documentos multi-hoja, hacer clic en un aviso de otra hoja no muestra nada; peor aún, la misma coordenada existe en varias hojas, así que el resaltado puede apuntar al lugar equivocado.
- **Effort**: M.
- **Risk**: MED — toca la forma de `Finding` y a todos sus consumidores (`App`, `Inspector`, scripts).
- **Confidence**: HIGH por código; el fallo visual final no se reprodujo con un fixture multi-hoja (ver «No auditado»).
- **Fix sketch**: agregar `sheet: number` a `Finding`, tomarlo de `NetNode.sheet` en `validate`, filtrar el resaltado por hoja activa y, opcionalmente, cambiar de hoja al enfocar.

### F3 — [UX-01] Enfocar un aviso no lo pone en pantalla y la cruz nunca se limpia

- **Evidence**: `app/src/ui/App.tsx:1668` sólo hace `setHighlight({ ids, at })`; no hay `setHighlight(null)` en el archivo. `app/src/ui/Canvas.tsx:817-823` dibuja la marca en coordenadas del documento sin ajustar cámara ni selección. En la inspección visual el zoom era 430%, así que un punto cualquiera queda fuera del viewport.
- **Impact**: el usuario hace clic en «Ir al lugar del aviso» y puede no ver ningún cambio; después de corregirlo, la cruz roja sigue en pantalla porque nadie limpia `highlight`.
- **Effort**: M.
- **Risk**: LOW–MED — requiere coordinar `App` y `Canvas` sin romper el arrastre del lienzo.
- **Confidence**: HIGH para el código; el comportamiento visual se verificó por inspección del Canvas, no con un test e2e dedicado.
- **Fix sketch**: al enfocar, centrar la vista en `finding.at` y seleccionar `finding.ids`; limpiar `highlight` al cambiar la selección, al cerrar el drawer o cuando el código de aviso desaparezca de `findings`.

### F4 — [CORRECTNESS-03] `duplicate-junction` no lleva ids, así que no se puede corregir desde el aviso

- **Evidence**: `app/src/editor/network.ts:274-289` empuja `ids: []`; en cambio `network.junctionPoints` sí guarda `recordId` (`network.ts:68,112,122`). `app/src/ui/Inspector.tsx:354` sólo muestra «Quitar unión» cuando `f.ids.length > 0`.
- **Impact**: el aviso más común del plano `arranque-paro-motor-3f.cad` (y 2 casos en `inversion-giro-cej.cade`) no ofrece acción; el usuario debe buscar y borrar el registro a mano.
- **Effort**: S.
- **Risk**: LOW — un campo del finding y un botón que ya existe.
- **Confidence**: HIGH.
- **Fix sketch**: al agrupar `junctionPoints` por `netKey`, acumular sus `recordId` en `ids` y pasar el primero a `onRemoveJunction`.

### F5 — [PERF-01] La red se construye dos veces por cambio y la detección de solapes es cuadrática

- **Evidence**: `app/src/ui/App.tsx:595-596` calcula `network` y `findings` en memo separados; `app/src/editor/network.ts:224` llama de nuevo a `buildNetwork` dentro de `validate`; `network.ts:292-308` compara cada componente con todos los demás y llama a `boundsOf` en cada par.
- **Impact**: trabajo duplicado en cada edición del documento; con cientos de componentes el chequeo de solapes crece como O(n²). Hoy los planos del repo tienen 22–181 registros, así que no es urgente, pero es el primer coste que aparecerá al crecer el documento.
- **Effort**: M.
- **Risk**: LOW — `validate` es puro y ya tiene tests de caracterización parcial (F6 los completa).
- **Confidence**: HIGH en el código; LOW en el impacto medido a gran escala (no se generó un plano sintético grande).
- **Fix sketch**: `validate(records, network?)` reutilizando el memo de `App`; precalcular `boundsOf` una vez por componente y, si hace falta, agrupar por celdas antes de comparar.

### F7 — [DEAD-CODE-01] El nivel `error` nunca se produce

- **Evidence**: `app/src/editor/network.ts:74` declara `level: 'error' | 'warn'`, pero los seis `findings.push` (líneas 232, 241, 266, 283, 300, 323) usan siempre `'warn'`. La rama `destructive` de `app/src/ui/Inspector.tsx:324` es inalcanzable.
- **Impact**: el modelo sugiere severidades que la UI no puede mostrar; el botón del pie pinta todos los avisos como rojos, sean triviales o no.
- **Effort**: S.
- **Risk**: LOW.
- **Confidence**: HIGH.
- **Fix sketch**: decidir si `error` se reserva para futuras validaciones (y documentarlo) o simplificar el tipo a `'warn'` y quitar la rama muerta. No inventar errores sólo para poblar el nivel.

### F8 — [A11Y-01] Tarjeta con `role="button"` que contiene botones reales

- **Evidence**: `app/src/ui/Inspector.tsx:322-335` pone `role="button"` y `tabIndex={0}` en el `Alert` contenedor; dentro, en las líneas 341 y 355, hay `Button` reales («Crear unión», «Quitar unión») que frenan la propagación del `click` pero no del `keydown`.
- **Impact**: lectores de pantalla pueden aplanar el control contenedor y ocultar los botones; con teclado, `Enter` sobre el botón hijo también dispara `onFocusFinding` del contenedor antes de la acción.
- **Effort**: S–M.
- **Risk**: LOW — cambio local en el componente `Findings`.
- **Confidence**: MED — el patrón está confirmado en el código; no se corrió VoiceOver/NVDA.
- **Fix sketch**: dejar el `Alert` como contenedor sin rol, poner un único botón real sobre el mensaje para enfocar y sacar las acciones al mismo nivel, o detener también el `keydown` en los botones hijos.

## Orden de dependencias

1. **F6** (tests de caracterización) — habilita cambios seguros.
2. **F1** (deduplicar) y **F4** (ids del aviso duplicado) — se pueden hacer juntos; ambos tocan `validate`.
3. **F2** (campo `sheet`) — cambia la forma de `Finding`; conviene antes de F3 para no rehacer la navegación.
4. **F3** (enfocar/centrar/limpiar) — depende de saber la hoja.
5. **F5**, **F7**, **F8** — independientes entre sí.

## Considerado y rechazado

- **«El drawer trunca la lista a 10 avisos»**: rechazado. El `limit` por defecto de `Findings` es 10, pero el modo `avisos` pasa `limit={findings.length}` (`app/src/ui/Inspector.tsx:95`). La ficha de propiedades sí limita, pero ese no es el camino del contador del pie.
- **«Los avisos son falsos positivos de CADe»**: no afirmado. Los 30 `orphan-end` pueden ser extremos realmente sueltos del plano; lo que sí está probado es la duplicación con `cable-disconnected`. Haría falta comparar contra CADe_SIMU antes de eliminarlos.
- **«Falta agrupar avisos por código»**: movido a dirección de producto, no a hallazgo de corrección.

## Dirección (opciones, no bugs)

1. **Agrupar avisos por código con contador y desplegable**. Evidencia: 59 tarjetas en un plano real, 24 repetidas. Haría que el pie mostrase «59 avisos · 4 tipos» y el usuario eligiera dónde mirar. Coste bajo-medio; contrapartida: más estado en el drawer.
2. **Convertir cada aviso en una acción completa**. Evidencia: dos de los seis códigos ya tienen botón correctivo (F4 descubre que el tercero no). La dirección es que todo aviso acione o explique por qué no puede.
3. **Comando de validación en CI o CLI**. Evidencia: `validate` ya se usa en `app/scripts/fixture-orphans.ts`; hoy nadie impide que un fixture nuevo entre con avisos. Coste bajo; contrapartida: decidir qué códigos son bloqueantes (probablemente ninguno de los actuales).
4. **Diferenciar avisos del documento de avisos de la app**. Evidencia: `level` mezcla `error`/`warn` con severidad de red, y el note de rotación en `Inspector.tsx` es información de app mezclada con la ficha del componente.

## No auditado

- Comportamiento real en un documento con **múltiples hojas** y avisos en cada una: hay código para cambiar de hoja (`App.tsx:1140-1141`), pero no construí un fixture así para reproducir F2 de punta a punta.
- Lectores de pantalla reales (VoiceOver/NVDA) y medición de contraste: F8 se basa en inspección de código y del DOM.
- Render del drawer en móvil para listas largas de avisos (se inspeccionó 390×844 con dos avisos, no con 59).
- El pipeline de simulación (`sim/`) y la escritura del formato `.cad`: quedan fuera de este sistema de avisos.
- Dependencias y `pnpm audit`: no se ejecutaron; no son parte del subsistema auditado.

## Verificación

Durante la sesión se ejecutaron, con resultado verde, `pnpm test` (762/762), `npx tsc --noEmit` y `pnpm build`. Dos tests de performance (`wiring-performance`, `parse-perf`) son conocidos por fallar intermitentemente bajo carga: no deben usarse como única puerta para los cambios propuestos. Las mediciones de avisos se obtuvieron con scripts de Node read-only sobre los fixtures listados, llamando a `parse`, `buildProject` y `validate` directamente.

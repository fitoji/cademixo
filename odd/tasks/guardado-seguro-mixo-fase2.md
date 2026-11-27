# guardado-seguro-mixo-fase2 — Publicar y recuperar sin destruir la copia buena

Feature: Fase 2 de `docs/plan-guardado-seguro-mixo.md`. Branch:
`feat/guardado-seguro-mixo-v1` (continuación de la Fase 1). Runner: `pnpm test`,
`pnpm exec tsc --noEmit` y Playwright desde `app/`.

## Specs

- S1 (pedido verbatim): "Separar tres responsabilidades: **códec** (revisión ↔ bytes), **coordinador** (validación, revisiones y orden de guardado) y **adaptador de almacenamiento** (escritura y confirmación). La interfaz debe comunicar qué garantías ofrece cada destino."
- S2 (pedido verbatim): "Navegador con acceso al archivo | Antes de reemplazarlo, conservar una generación previa verificada. Validar la candidata, escribir mediante el flujo del navegador, esperar el cierre y comprobar el resultado por relectura si el destino lo permite. Un fallo de cierre o verificación no es éxito."
- S3 (pedido verbatim): "Navegador con descarga | Validar los bytes antes de descargar e informar «descarga iniciada». No asumir que terminó ni descartar la única copia recuperable."
- S4 (pedido verbatim): "La recuperación debe ser independiente del archivo candidato. Identificar cada copia por proyecto y revisión, conservar al menos la última generación buena y rotarla solo después de verificar su sucesora. Si no hay espacio o permiso para preservar el original, no sobrescribirlo: ofrecer guardar como archivo nuevo. Al reabrir, mostrar qué versión se puede recuperar y no reparar sobre el original sin intervención del usuario."
- S5 (pedido verbatim): "Escritorio Rust, cuando exista | Escribir un temporal en el mismo directorio, vaciar búferes, sincronizar, reabrir y validar. Reemplazar el destino con la operación apropiada del sistema y sincronizar el directorio donde corresponda. No borrar el original como paso previo. Probar por separado cada plataforma soportada."
- S6 (decisión del usuario, 2026-11-27): la generación previa se conserva automáticamente en IndexedDB por proyecto y revisión; sin diálogo ni permisos extra. Si no se puede preservar, no se sobreescribe y se ofrece guardar como archivo nuevo. La copia se pierde con datos del sitio o por cuota: la interfaz lo comunica.

## Tasks

- T1 (S1, S4, S6) DONE: `ui/storage-contract.ts`, `ui/recovery-store.ts` con
  núcleo puro y adaptador IndexedDB; RED por módulos inexistentes, GREEN 6 tests.
- T2 (S2, S4) DONE: `ui/save-adapter.ts` y `writeVerifiedBytes` en `ui/files.ts`;
  conservar → escribir → releer → rotar; RED con handle falso, GREEN 4 tests.
- T3 (S3) DONE: descarga con bytes validados y aviso «descarga iniciada»; la
  garantía se expone como dato en el contrato. Sin cambio de copia.
- T4 (S4) DONE: `ui/RecoveryDialog.tsx` y menú «Recuperar versión…»; descarga
  como copia y borrado, nunca reparación del original; 4/4 e2e de foco.
- T5 (S1-S6) DONE: `docs/recuperacion-mixo.md`; `tsc` limpio, build OK,
  973/973 unitarios, 9/9 e2e de foco; los 2 fallos de `editor-smoke` siguen
  siendo los preexistentes documentados.

## Log

- L1: pedido verbatim: "dale" (respuesta a "¿Arranco la Fase 2?").
- L2: Fase 1 ya cerrada en `feat/guardado-seguro-mixo-v1` con commits
  `14c345c`, `b66b224`, `58eaea5`, `f82e49e`, `d0af81e`; recepción de revisión
  `review-df69b086edf5169c` quemada, no reutilizable.
- L3: no existe código Rust en el repo: S5 queda registrada como no aplicable
  hasta que exista el escritorio; no se inventa una implementación ni una
  prueba de plataforma.
- L4: decisión S6 tomada por la persona con la interfaz nativa: copia previa
  automática en IndexedDB. Alternativas descartadas: destino elegido por el
  usuario y modo dual.
- L5: documentación: `docs/recuperacion-mixo.md` documenta garantías, límites,
  persistencia y el hecho de que las copias no reparan el original.
- L6: modern-web-guidance: se buscaron guías para almacenamiento local y se
  consultaron `js` y `privacy`. Se aplicaron `structuredClone` para clonar
  bytes en la tienda en memoria, `toSorted`/`findLast` para no mutar, errores
  con `{ cause }` al envolver fallos de IndexedDB, `TextDecoder('latin1')` para
  el mapa de un byte por carácter, y minimización/transparencia: pocas
  generaciones, nota visible sobre datos del sitio y botón de borrado.
- L7: verificación real en Chromium: rechazo con copia del dibujo, adopción del
  handle elegido, «Guardar como…» con archivo abierto pidiendo destino y
  listado/descarga de versiones sin escribir el original. Fallos simulados:
  `write`/`close` con stubs. Sin prueba de corte de energía; S5 no aplicable.
- L8: Risk: item 1 (copias persistentes en IndexedDB y reemplazo de archivos
  del usuario) e item 3 (flujo de guardado compartido). Assess nativo sobre
  `7249a32`: `medium`, `review_due: false`, `under_budget` (14 paths, 1084
  líneas); no se abrió revisión.
- L9: verificador técnico independiente (ítems 1 y 3): sin bloqueadores;
  S1/S2/S3/S4/S6 met, S5 `not implemented` por no existir Rust. Reprodujo en
  scratch: fallo de cuota al preservar (archivo byte-idéntico, sin escritura),
  fallo de `close`, relectura distinta, archivo vacío, identidad por
  proyecto/revisión y contrato de garantías. Los 2 fallos de `editor-smoke`
  aparecen igual en la base. Avisos atendidos: la copia de un `.mixo` se
  descargaba como `.cad` (perdería atajos al re-guardarla) → conserva su
  extensión; se añadió el aviso de cuota al diálogo. Se agregaron sus 9 probes
  como `app/test/verifier-highrisk-probe.test.ts`. Recheck: `tsc` limpio,
  build OK, 982/982 unitarios y 9/9 e2e de foco. Scratch
  `/private/var/folders/yw/6bjyc44d1rgg5163wpzd1cr80000gn/T/opencode/cademixo-verify-QpF0bF`
  borrado.
- L10: límite no probado: agotamiento real de cuota y borrado de datos del sitio
  en navegador (no hay comando autorizado para forzarlos); el rechazo por cuota
  se probó a nivel de adaptador. Sin declaración de resistencia a cortes.

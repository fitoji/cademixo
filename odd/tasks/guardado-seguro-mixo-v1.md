# guardado-seguro-mixo-v1 — Fase 1: cerrar pérdidas silenciosas en v1

Feature: proteger los archivos `.mixo` v1 actuales sin esperar a Rust ni cambiar
su formato. Branch: `feat/guardado-seguro-mixo-v1`. Test runner: `pnpm test` y
`pnpm exec tsc --noEmit` desde `app/`.

## Specs

- S1 (pedido verbatim): "Añadir primero una prueba con un dibujo válido y una sección de atajos inválida que conserve la longitud esperada. La apertura normal debe rechazar el proyecto sin reemplazar el documento actual. Ofrecer recuperar el dibujo **como copia**, sin reutilizar el destino original; nunca sustituir silenciosamente los atajos por un conjunto vacío."
- S2 (pedido verbatim): "Capturar una revisión inmutable con identidad del documento, dibujo, atajos y metadatos persistentes. Codificarla a los bytes que realmente se van a escribir, volver a leer esos bytes y comparar el contenido con la revisión de entrada. Incluir caracteres fuera de ASCII para detectar conversiones con pérdida."
- S3 (pedido verbatim): "Distinguir cancelación, fallo, descarga iniciada y escritura confirmada. Solo limpiar los cambios pendientes de la revisión confirmada. Si el usuario edita los atajos mientras se guarda, cambia de documento o dispara dos guardados seguidos, una finalización anterior no debe marcar como guardado el documento equivocado ni sobrescribir una revisión posterior."
- S4 (pedido verbatim): "empezar por la fase 1 con una prueba de regresión que falle antes de la corrección. Informar qué escenarios se ejecutaron en navegador o disco real y cuáles solo con fallos simulados. No declarar resistencia a cortes de energía basándose únicamente en pruebas simuladas."
- S5 (alcance): primera entrega sólo Fase 1. No migrar v1 a v2, no escribir Rust,
  no rediseñar el solver ni el modelo eléctrico, no retirar el lector v1.

## Tasks

- T1 (S1, S4): prueba ROJA de apertura con dibujo válido y sidecar inválido de
  igual longitud; arreglar `mixo-open.ts` + `openLoaded` para rechazar sin
  reemplazar el documento y ofrecer recuperación como copia descargada.
  Route: inline. DONE — RED por módulo inexistente, GREEN con 5 tests + e2e real.
- T2 (S2): revisión inmutable + codec de bytes con verificación por relectura,
  compartiendo el codificador latin1 real del guardado. Route: inline. DONE —
  `format/mixo-revision.ts`, `format/latin1.ts`, `format/hash.ts`; 6 tests.
- T3 (S3): resultado del guardado (cancelado/fallo/descarga/confirmado) y
  coordinación por secuencia para que una finalización vieja no marque guardado
  ni gane a una revisión posterior. Route: inline. DONE — `save-coordinator.ts`
  con 3 tests; `App.tsx` serializa escrituras y adopta identidad sólo si la
  revisión sigue siendo la actual.
- T4 (S4): verificación unitaria, `tsc`, build y foco e2e; informar qué se probó
  en navegador real y qué queda simulado. Route: inline. DONE — `tsc` limpio,
  build OK, 960/960 dos corridas seguidas, 6/6 e2e de foco.

## Log

- L1: pedido verbatim: "implementa @docs/plan-guardado-seguro-mixo.md".
- L2: el plan está en `docs/plan-guardado-seguro-mixo.md` y pide empezar por la
  Fase 1. Estado inicial: `main` con cambios ajenos sin commitear
  (`app/.impeccable/design.json`, `.impeccable/`, `app/test/scope-default.test.ts`,
  el propio plan). No se tocan ni se incluyen en los commits de esta feature.
- L3: mapa del punto de partida: `parseMixo` valida largos en caracteres, sin
  checksum; `openLoaded` (App.tsx:476) usa `keys?.bindings ?? {}` y sustituye
  silenciosamente los atajos inválidos; `writeDocument` (App.tsx:600) compara
  sólo el texto del dibujo; el camino de descarga (App.tsx:679-713) marca
  guardado sin verificar el destino; `writeHandle` (files.ts:202) codifica
  latin1; `canOpenFile` (App.tsx:718) depende del booleano de `saveDocument`.
- L4: decisión de alcance: la recuperación "como copia" se ofrece como una
  descarga `.cad` del dibujo con nombre propio, sin usar `fileHandle.current`.
  La descarga iniciada no limpia `dirty`, pero sigue autorizando al guardián de
  apertura a reemplazar el documento (la copia ya fue entregada al navegador).
- L5: verificación: RED observado antes de cada arreglo (módulos inexistentes).
  GREEN: `tsc` limpio; `vite build` OK; `pnpm test` 960/960 en dos corridas; una
  corrida intermitente del test de rendimiento `wiring-performance` (2,57 y
  3,05 ms/evento contra 2,5 ms de umbral) pasa aislado (135 ms) y en las dos
  corridas finales; no relacionado con el guardado.
- L6: e2e real (Chromium): `mixo-safe-save.spec.ts` 1/1 — rechazo sin reemplazar
  el documento y descarga de recuperación con el dibujo exacto; los 5 tests de
  `component-shortcut.spec.ts` pasan. Los 2 fallos de `editor-smoke.spec.ts`
  (`starts with the first sample loaded` y el nombre de descarga) están
  documentados como preexistentes en `docs/reportes/fallos-e2e-preexistentes.md`.
- L7: no se probó corte de energía ni pérdida real de disco: Fase 1 no agrega
  copias previas ni transacciones atómicas; el Fallo durante `write`/`close` se
  cubre con el stub de `editor-smoke.spec.ts:243` (simulado). No declarar
  resistencia a cortes de energía.
- L8: Risk: item 3 (flujo de guardado compartido por Guardar, Guardar como,
  sidecar y descarga; helpers `drawingHash`/`encodeLatin1` movidos con
  re-export). Sin verifier independiente todavía; pendiente de la decisión de
  revisión nativa.

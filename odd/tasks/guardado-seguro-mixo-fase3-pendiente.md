# guardado-seguro-mixo-fase3 — PENDIENTE (feature futuro)

**Estado:** no implementado. La persona decidió dejar la Fase 3 anotada y
seguir trabajando con las Fases 1 y 2 cerradas. Plan de origen:
`docs/plan-guardado-seguro-mixo.md`.

## Objetivo (pedido verbatim del plan)

- "Definir un contrato de bytes independiente del lenguaje: cabecera y versión,
  orden de secciones, longitudes en **bytes**, codificación explícita y suma de
  verificación por sección (propuesta: SHA-256). Especificar exactamente qué
  bytes se verifican y cómo se valida el manifiesto. Preservar los bytes del
  dibujo CADe, incluidos registros no interpretados; usar UTF-8 para metadatos.
  Definir límites de tamaño, tratamiento de secciones desconocidas y errores de
  lectura antes de reservar memoria."
- "Seguir leyendo v1; abrirlo no debe migrarlo ni modificarlo. Ofrecer la
  primera conversión como copia. Mantener archivos de referencia independientes
  con contenido esperado: el futuro lector Rust deberá abrir los emitidos por
  TypeScript y viceversa. Una suma correcta prueba integridad de bytes, no que
  el editor haya incluido todos los componentes."

## Punto de partida

- Códec v1 vigente: `app/src/format/mixo.ts`, `mixo-revision.ts`, `latin1.ts`
  (Latin-1, largos en caracteres, sin checksum).
- Adaptador/coordinador vigentes: `app/src/ui/save-adapter.ts`,
  `recovery-store.ts`, `save-coordinator.ts`, `files.ts`.
- Validación de apertura: `app/src/ui/mixo-open.ts`.
- No migrar v1 ni tocar el lector actual: la conversión a v2 se ofrece como
  copia, con archivos de referencia compartidos TS ↔ Rust.
- No hay código Rust en el repo: el escritorio y las pruebas por plataforma
  quedan fuera de alcance hasta que exista.

## Pragmática para cuando se retome

Crear un documento ODD propio con Specs numeradas citando el plan verbatim;
empezar con una prueba de regresión roja; mantener el formato v1 legible; no
reutilizar las recepciones de revisión ya quemadas
(`review-df69b086edf5169c`).

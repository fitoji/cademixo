# Spike: atajos por componente en `.cad`

Objetivo: comprobar si CADe_SIMU V4 conserva un registro de metadata propio al abrir y volver a guardar el archivo. Es el gate de compatibilidad antes de escribir atajos en archivos del usuario.

## Archivos

| Archivo | Qué es |
|---|---|
| `atajos-cadesimu-base.cad` | copia exacta del fixture `ej0def.cad` (control) |
| `atajos-cadesimu.cad` | el mismo archivo + un registro extra al final |

El registro extra es:

```
*57*99999#SIMKEYS1:eyJ2ZXJzaW9uIjoxLCJiaW5kaW5ncyI6eyJRMSI6Im1vZCtxIiwiS00xIjoic2hpZnQrayJ9fQ##
```

Contiene `{"version":1,"bindings":{"Q1":"mod+q","KM1":"shift+k"}}` en base64url. `Q1` y `KM1` son designadores reales del fixture.

## Pasos en Windows

1. Abrir `atajos-cadesimu-base.cad` en CADe_SIMU y confirmar que se ve normal. Cerrar.
2. Abrir `atajos-cadesimu.cad` en CADe_SIMU.
   - ¿Abre sin error?
   - ¿Se ve igual que el control (mismos componentes, cables, textos)?
3. Guardar con **Archivo → Guardar** (o Guardar como) en una copia aparte, por ejemplo `atajos-cadesimu-guardado.cad`.
4. Buscar en el archivo guardado el texto `SIMKEYS1:`:
   ```sh
   grep -c "SIMKEYS1:" atajos-cadesimu-guardado.cad
   ```
   - `1` = CADe conservó el registro.
   - `0` = CADe lo descartó al guardar.
5. Comparar el guardado con el control:
   ```sh
   cmp -l atajos-cadesimu-base.cad atajos-cadesimu-guardado.cad | head
   ```
   CADe puede reordenar ids o reescribir el bloque de título; lo importante es si `SIMKEYS1:` sigue ahí.

## Qué reportar

- Abre / no abre, y si muestra algún mensaje.
- Si el dibujo se ve igual que el control.
- Si `SIMKEYS1:` sobrevive al guardado.
- El archivo guardado (o el diff), si es posible.

## Decisión

- **Sobrevive** → se implementa la metadata dentro del `.cad` (T4-T6 del plan).
- **No sobrevive** → plan B: sidecar `.cad.keys.json`; el `.cad` queda intacto.

Regenerar los archivos: `node scripts/make-shortcut-spike.ts` desde `app/`.

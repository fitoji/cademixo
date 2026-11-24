# Informe: el cajetín de CADe_SIMU V4

> Fecha: 2026-11-24. Estado: análisis cerrado e implementado en la app.
> Este informe es autocontenido; el detalle de offsets y format strings está en
> `docs/re/cajetin-formato.md`.

## 1. Resumen ejecutivo

CADe_SIMU guarda el cajetín (bloque de título) en **dos lugares** del `.cad`:

1. Un **registro `20000`** con la cabecera de hoja.
2. Un **trailer de ancho fijo** pegado al final del archivo, con los textos, los flags de
   visibilidad/alineación y los datos de página.

No hay magia: es texto plano Latin-1. El escritor del binario se localizó y sus format strings dan
el layout exacto. El mapeo completo de campos quedó confirmado con un experimento en la GUI real.
La app ya puede leer, editar y reescribir ese trailer sin tocar ningún otro byte del documento, y
tiene un diálogo `Editar → Cajetín` equivalente al de CADe.

## 2. Metodología (qué evidencia sostiene cada conclusión)

| Método | Qué aportó |
|--------|------------|
| Descompilación con Ghidra 12.1.4 vía REA MCP | Escritor `FUN_00432710`, armar de bloque `FUN_004315f0`, dibujante `FUN_00854d30`, format strings y offsets del objeto documento |
| `strings` sobre el PE | Tabla multilingüe de etiquetas del cajetín (`0x76e37c..0x76e50c`) |
| Comparación de ~35 fixtures `.cad`/`.cade` | Valores típicos, número de hoja, tamaño de página, variante de 12 tokens |
| Experimento en GUI real (`Editar → Cajetín`) | Mapeo campo↔etiqueta, significado de los 14 flags, validación de 20 caracteres |
| Diff del archivo guardado | Correspondencia exacta entre valores del diálogo y tokens del trailer |

Nota de entorno: el exe se copió a `%TEMP%` porque **Ghidra no analiza desde `E:` (FAT32)**.

## 3. Estructura en el archivo

### Registro 20000

```
*<id>*20000#XXX#########*<24 campos numéricos>#
```

No es necesariamente el último registro: CADe lo escribe y se puede seguir dibujando después
(`docs/cade-format.md`). Dos registros `20000` en un archivo = dos hojas reales.

### Trailer

```
$$$*<11 numéricos>&&&*<10 textos de ancho fijo>*<14 flags>***$$$&&&
```

Format strings extraídas del binario (Ghidra, image base `0x800000`; VA del PE = dir − `0x400000`):

| Cadena | Dirección Ghidra | Uso |
|--------|------------------|-----|
| `*%d*%d*...*%3d*%3d&&&` | `0xb4ccf4` | 11 numéricos |
| `*%-11s*%-11s*%-11s*%-11s*%-25s*%-25s*%-11s*%-11s*%-11s*%-21s` | `0xb4cca8` | 10 textos |
| `*%1d` ×14 | `0xb4cc64` | 14 flags |
| `***$$$&&&` | `0xb4cc58` | terminador |

Funciones: `FUN_00432710` (`0x432710`, escritor al guardar) y `FUN_004315f0` (`0x4315f0`, arma el
bloque). El dibujante es `FUN_00854d30` (`0x854d30`) y su gemelo `FUN_00857400` (`0x857400`).

## 4. Campos numéricos (11)

Valores típicos: `1,1,1,2,5,0,1,0,0,279,210`. Mapeo a offsets del objeto documento, leído de los
`PUSH` previos al `sprintf` (`0x4331cd..0x433258`) y validado contra el constructor del documento
`FUN_00408840` (`0x408840`):

| # | offset | por defecto | semántica |
|---|--------|-------------|-----------|
| 1 | `+0x88` | 1 | **formato de hoja**: 0 A4 Vertical, 1 A4 Horizontal, 2 A3 Formato 1, 3 A3 Formato 2, 4 Personalizado |
| 2 | `+0x8c` | 1 | **contorno** |
| 3 | `+0xa4` | 1 | **visualizar referenciado** |
| 4 | `+0x90` | 2 | **cajetín**: 0 Ninguno, 1 Cajetín 1, 2 Cajetín 2 |
| 5 | `+0x58` (double→`ftol`) | 2.0 | **zoom** de la vista al guardar (2..9) |
| 6 | `+0xa0` | 0 | **orientación del referenciado**: 0 Horizontal, 1 Vertical |
| 7 | `+0x80` | 1 | **rejilla** visible (`Ver → Rejilla`) |
| 8 | `+0xa8` | 0 | **visualizar conexiones símbolo** |
| 9 | `+0xac` | 0 | **visualizar número de cable** |
| 10 | `+0xc4` | 279 | **alto** de página (mm) |
| 11 | `+0xc0` | 210 | **ancho** de página (mm) |

Los 11 se verificaron en los dos sentidos. En el sentido GUI→archivo: A4 Horizontal→A4 Vertical
cambia el campo 1 de 1 a 0; destildar Contorno cambia el 2; Cajetín 2→Ninguno cambia el 4;
`Ver → Zoom +` sube el 5; `Ver → Rejilla` cambia el 7. En el sentido archivo→GUI se inyectaron
valores y se abrió el diálogo: `1=3` mostró «A3 Formato 2», `4=1` mostró «Cajetín 1», `5=3` abrió
con zoom 3, `6=1` mostró orientación «Vertical», `8=1` y `9=1` encendieron «conexiones símbolo» y
«número de cable», y `3=0` apagó «visualizar referenciado».

Corrección respecto del análisis inicial: el campo 1 **no** es el número de hoja. El número de hoja
está en los textos 8 y 9 («Número» y «De»), que el dibujante imprime como `"%s de %s"`.

El diálogo lee del documento el formato, el cajetín, el contorno, los checks de visualización y el
tamaño. Las opciones de impresión y la velocidad, en cambio, se guardan en `config.cfg` con otro
formato (`CADe_SIMU*%1d...*%0.4f...*%4d$$$`, cadena `0xb6f550`, escritor `0x878696`).

## 5. Campos de texto (10 o 12 tokens)

Mapeo confirmado con el experimento en GUI:

| # | ancho | etiqueta CADe | observación |
|---|-------|---------------|-------------|
| 1 | 11 | Dibujado (Fecha) | primera subcascilla |
| 2 | 11 | Dibujado (Nombre) | segunda subcascilla |
| 3 | 11 | Comprobado (Fecha) | |
| 4 | 11 | Comprobado (Nombre) | |
| 5 | 25 | Empresa | |
| 6 | 25 | Título | |
| 7 | 11 | Fecha | control de calendario |
| 8 | 11 | Número | |
| 9 | 11 | De | total de hojas |
| 10 | 21 | Archivo | nombre del archivo; valida ≤20 caracteres |

En el dibujante se ve la prueba directa:

```c
sprintf(local_130, "%s de %s", [obj+0xf8], [obj+0xfc]);  // "1 de 1"
sprintf(local_130, "%20s",     [obj+0x100]);              // nombre del archivo
```

Offsets de los textos: `+0xdc, +0xe0, +0xe4, +0xe8, +0xec, +0xf0, +0xf4, +0xf8, +0xfc, +0x100`.

### Experimento que cerró el mapeo

Se abrió `app/test/fixtures/pr1-rodolfo-giusti.cad` en CADe, `Editar → Cajetín`, se cargaron
valores distintivos (`DIB1`, `DIB2`, `COM1`, `COM2`, `EMPRESA`, `TITULO`, `NUM1`, `NUM2`) y se guardó
una copia (`app/test/fixtures/cajetin-probe.cad`). El trailer resultante fue:

```
$$$*1*1*1*2*5*0*1*0*0*279*210&&&*DIB1*DIB2*COM1*COM2*EMPRESA*TITULO*
02-nov.-202**1NUM1**1NUM2*pr1.cadARCH20*1*0*1*1*1*1*1*0*0*0*2*0*0*0***$$$&&&
```

Cada valor aparece en el campo esperado.

## 6. Flags (14): visibilidad + alineación

El diálogo tiene **7 filas**, cada una con un check «Mostrar» y tres radios de alineación
`Izq. / Cen. / Der.`. La **escritura** está confirmada con corridas de una sola variable:

- `flags[0..6]` → **visibilidad** de Dibujado, Comprobado, Entidad, Título, Fecha, Número, Archivo
  (`1` = visible, `0` = oculto).
- `flags[7..13]` → **alineación** de esas mismas filas (`0` Izq, `1` Cen, `2` Der).

| Cambio | Flags escritos |
|--------|----------------|
| estado del diálogo al aceptar | `0 1 0 0 0 0 0  0 0 0 0 0 0 0` |
| tildar Título | `0 1 0 1 0 0 0  0 0 0 0 0 0 0` |
| Dibujado en «Cen.» | `0 1 0 1 0 0 0  1 0 0 0 0 0 0` |

La **lectura** no está resuelta: un archivo con los 14 flags en `1` (el caso de
`pr1-rodolfo-giusti.cad`) abre con solo Comprobado tildado, y otro con `1×7 + 0×7` abre igual. El
loader no interpreta el bloque como el array lineal que sí escribe. Consecuencia: nuestra UI muestra
7 filas visibles para `pr1`, mientras CADe muestra una. Es una desviación conocida; hay que leer el
loader del binario para cerrarla.

## 7. Variante de 12 tokens

La mayoría de los archivos tiene 10 tokens de texto separados por `*`. Otros (incluido el probe y
varios fixtures de cursos) tienen `**` intercalados y 12 tokens, con campos vacíos entre fecha,
número y archivo:

```
...*02-nov.-202**1NUM1     **1NUM2     *pr1.cadARCH20        *1*0*...
```

Conclusión: **no es otra herramienta**, es lo que CADe escribe cuando el cajetín se editó/guardó con
ciertas casillas. El parser de la app acepta ambos layouts.

## 8. Etiquetas multilingües en el binario

En `0x76e37c..0x76e50c` (español, inglés, italiano, francés, portugués):
`Archivo:/Archives:/File:`, `Num:/Page:`, `Data:/Date:/Fecha:`, `Título/Title`,
`Entidad/Designed by`, `Dibujado/Drawn`, `Comprobado/Verificado`, `Firmas/Signature`,
`Nombre/Name`, `Fecha`.

El dibujante usa un índice `1..11` para colocarlas, que no coincide necesariamente con el orden de
serialización.

## 9. Implementación en la app

| Archivo | Qué hace |
|---------|----------|
| `app/src/model/title-block.ts` | `parseTitleBlock`, `titleValues`, `withTitleField`, `withTitleFlags`, `withTitleNumeric` y lectores `titleCajetin` / `titleContorno` / `titleZoom` / `titlePageSize`; preserva byte a byte el resto del documento y respeta el ancho original |
| `app/src/editor/state.ts` | `setTitleBlock(state, text)` pasa por `commit`, así que el cambio entra al undo/redo |
| `app/src/ui/TitleBlockDialog.tsx` | Diálogo con 7 filas, check, radios y campos; envía con Enter mediante `<form>` |
| `app/src/ui/App.tsx` | Opción **Editar → Cajetín** y cableado del diálogo |
| `app/test/title-block.test.ts` | 8 tests: round-trip, layouts 10/12, mapeo, edición de campo, flags, numéricos y sin cajetín |
| `app/test/fixtures/cajetin-probe.cad` | Evidencia del experimento en GUI |
| `app/e2e/title-block.spec.ts` | Editar título → guardar en el documento → reabrir y verificar |

Decisiones deliberadas:

- Se reescriben **sólo los tokens del trailer**, nunca los registros.
- Se aceptan 10 y 12 tokens de texto.
- El ancho original de cada campo se reutiliza como relleno y como `maxlength` nativo.
- Los flags se escriben individualmente; cambiar uno no altera los demás.
- No se inventa un registro propio nuevo (aprendido del gate T3 de los atajos: CADe descarta registros
  desconocidos al guardar).

## 10. Verificación

- `tsc --noEmit`: limpio.
- `node --test test/title-block.test.ts`: **8/8**.
- Suite completa: **854/855**; el único fallo es `wiring-performance.test.ts`, sensible a carga.
- `npx playwright test e2e/title-block.spec.ts`: **1/1**.
- Commits: `a137cbb` (modelo + parser + fixture + doc) y `6120456` (UI + menú + e2e), pusheados a `main`.

## 11. Preguntas respondidas y pendientes

| Pregunta | Estado |
|----------|--------|
| ¿Dónde se guarda? | Registro 20000 + trailer |
| ¿Formato exacto? | 4 format strings del binario |
| ¿Qué campos hay? | 10 (o 12) textos + 14 flags + 11 numéricos |
| ¿Mapping campo↔etiqueta? | Confirmado en GUI |
| ¿Cómo se edita en CADe? | `Editar → Cajetín`, 7 filas con check, alineación y texto |
| ¿Orden de los 14 flags? | Respondido: 7 visibilidad + 7 alineación (0/1/2), confirmado en el dibujante. En CADe son **de sólo escritura**: el diálogo no los restaura al abrir (probado con 4 archivos distintos) y el loader además lee 13, salteando `+0x108` |
| ¿Semántica de los 11 numéricos? | Respondido y verificado en ambos sentidos: formato, contorno, referenciado, cajetín, zoom, orientación, rejilla, conexiones símbolo, número de cable, alto y ancho |
| ¿Importar cajetín desde otro archivo? | No implementado (fuera de alcance) |

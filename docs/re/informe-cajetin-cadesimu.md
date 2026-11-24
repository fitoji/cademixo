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

Valores típicos: `1,1,1,2,5,0,1,0,0,279,210`.

- **Campo 1 = número de hoja**: confirmado, pasa a `2` en la segunda hoja de `inversion-giro-cej.cade`.
- **Campos 10 y 11 = ancho y alto de página**: `279×210` (A4 apaisado).
- El campo 5 viene de un `double` (`[obj+0x58]` → `ftol`); varía entre 2 y 6 según el archivo.
- El resto están sin semántica confirmada.

Mapeo a offsets del objeto documento (leído de los `PUSH` previos al `sprintf`, en
`0x4331cd..0x433258`): `+0x88, +0x8c, +0xa4, +0x90, +0x58(double), +0xa0, +0x80, +0xa8, +0xac,
+0xc4, +0xc0`.

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
`Izq. / Cen. / Der.`. Comparando los flags del probe con el estado final del diálogo:

- `flags[0..6]` → **visibilidad** de Dibujado, Comprobado, Empresa, Título, Fecha, Número, Archivo
  (`1` = visible, `0` = oculto).
- `flags[7..13]` → **alineación** de esas mismas filas (`0` Izq, `1` Cen, `2` Der).

El probe dio visibilidad `[1,0,1,1,1,1,1]` y alineación `[0,0,0,2,0,0,0]`: Título en «Der.»,
Comprobado sin check, el resto visible e «Izq.», tal como se veía en pantalla.

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
| `app/src/model/title-block.ts` | `parseTitleBlock`, `titleValues`, `withTitleField`, `withTitleFlags`; preserva byte a byte el resto del documento y respeta el ancho original |
| `app/src/editor/state.ts` | `setTitleBlock(state, text)` pasa por `commit`, así que el cambio entra al undo/redo |
| `app/src/ui/TitleBlockDialog.tsx` | Diálogo con 7 filas, check, radios y campos; envía con Enter mediante `<form>` |
| `app/src/ui/App.tsx` | Opción **Editar → Cajetín** y cableado del diálogo |
| `app/test/title-block.test.ts` | 6 tests: round-trip, layouts 10/12, mapeo, edición de campo, flags, sin cajetín |
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
- `node --test test/title-block.test.ts`: **6/6**.
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
| ¿Orden de los 14 flags? | 7 visibilidad + 7 alineación, en orden de fila |
| ¿Semántica de los 9 numéricos no obvios? | **Pendiente**: harían falta archivos con otra configuración de página/zoom |
| ¿Importar cajetín desde otro archivo? | No implementado (fuera de alcance) |

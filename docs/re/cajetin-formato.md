# Cajetín de CADe_SIMU: formato y estado del análisis

> Análisis inicial 2026-11-24. Evidencia: descompilación Ghidra vía REA + comparación de trailers
> en ~35 fixtures. Direcciones Ghidra con image base `0x800000` (VA del PE = dirección − `0x400000`).

## Dónde vive

El cajetín tiene **dos partes** en el `.cad`:

1. **Registro `20000`** (`cabecera de hoja`): `*<id>*20000#XXX#########*<24 campos numéricos>#`.
   No es el último registro: CADe lo escribe y se puede seguir dibujando después
   (`docs/cade-format.md`, sección «Bloque de hoja»). Dos `20000` en el archivo = dos hojas.
2. **Trailer al final del archivo**, pegado al último registro, con los textos y flags del cajetín.
   Empieza con `$$$` y termina con `***$$$&&&`. El parser actual lo conserva como texto opaco
   dentro del campo 11 del registro `20000` cuando éste es el último; si hay registros después,
   queda fuera de los campos parseados (ver más abajo).

El escritor es `FUN_00432710` (`0x432710`, VA `0x12710`); el que arma el bloque sin guardar es
`FUN_004315f0` (`0x4315f0`). Ambos usan las mismas cadenas de formato.

## Formato exacto del trailer (del binario)

```
$$$*%d*%d*%d*%d*%d*%d*%d*%d*%d*%3d*%3d&&&
   *%-11s*%-11s*%-11s*%-11s*%-25s*%-25s*%-11s*%-11s*%-11s*%-21s
   *%1d*%1d*%1d*%1d*%1d*%1d*%1d*%1d*%1d*%1d*%1d*%1d*%1d*%1d
   ***$$$&&&
```

Cadenas en Ghidra: `0xb4ccf4` (numérico), `0xb4cca8` (textos), `0xb4cc64` (flags), `0xb4cc58`
(`***$$$&&&`). En `FUN_004315f0` el terminador se.concatena **dos veces**; en los archivos reales
aparece una sola (o dos en `inversion-giro-cej.cade`, que tiene dos hojas).

### Campos numéricos (11)

Observados en casi todos los fixtures: `1,1,1,2,5,0,1,0,0,279,210`.
El primer campo es el **número de hoja** (pasa a `2` en la segunda hoja de
`inversion-giro-cej.cade`). Los dos últimos son el tamaño de página (`279×210`, A4 apaisado).

Mapeo a offsets del objeto documento, leído de los `PUSH` anteriores al `sprintf` en
`0x4331cd..0x433258` (cdecl: el último push es el primer argumento):

| # | offset | observado | interpretación |
|---|--------|-----------|----------------|
| 1 | `+0x88` | 1 / 2 | número de hoja (**confirmado** por archivo de 2 hojas) |
| 2 | `+0x8c` | 1 | sin confirmar |
| 3 | `+0xa4` | 1 | sin confirmar |
| 4 | `+0x90` | 2 | sin confirmar |
| 5 | `+0x58` (double → ftol) | 2..6 | valor en coma flotante; varía por archivo |
| 6 | `+0xa0` | 0 | sin confirmar |
| 7 | `+0x80` | 1 | sin confirmar |
| 8 | `+0xa8` | 0 | sin confirmar |
| 9 | `+0xac` | 0 | sin confirmar |
| 10 | `+0xc4` | 279 | ancho de página |
| 11 | `+0xc0` | 210 | alto de página |

### Campos de texto (10, ancho fijo)

Mapeo a offsets del documento desde los `PUSH` en `0x43328c..0x43330e`: `+0xdc`, `+0xe0`,
`+0xe4`, `+0xe8`, `+0xec`, `+0xf0`, `+0xf4`, `+0xf8`, `+0xfc`, `+0x100` (en ese orden).

| # | ancho | contenido típico | observación |
|---|-------|------------------|-------------|
| 1 | 11 | vacío | **Dibujado** (primera subcascilla) |
| 2 | 11 | vacío | **Dibujado** (segunda subcascilla / Nombre) |
| 3 | 11 | vacío | **Comprobado** (primera) |
| 4 | 11 | vacío | **Comprobado** (segunda) |
| 5 | 25 | vacío | **Empresa** |
| 6 | 25 | vacío | **Título** |
| 7 | 11 | `02-nov.-2026` | **Fecha** |
| 8 | 11 | `1` | **Número** |
| 9 | 11 | `1` | **De** (total de hojas) |
| 10 | 21 | `CADe_S1`, `ej0def.cad` | **Archivo** (nombre del archivo) |

El mapeo quedó **confirmado en GUI**: `Editar → Cajetín` tiene 7 filas (Dibujado, Comprobado,
Empresa, Título, Fecha, Número con dos subcascillas «Número/De», Archivo). Al cargar
`DIB1,DIB2,COM1,COM2,EMPRESA,TITULO,NUM1,NUM2` y guardar, esos valores aparecen exactamente en los
campos 1–6 y 8–9 del trailer. La fecha y el archivo son campos especiales: la fecha usa un control de
calendario y el archivo se edita como texto (validación: máximo 20 caracteres).

En el dibujante `FUN_00854d30` (`0x854d30`) se ve:

```c
sprintf(local_130, "%s de %s", [obj+0xf8], [obj+0xfc]);  // "1 de 1" → hoja x de y
sprintf(local_130, "%20s",     [obj+0x100]);              // nombre del archivo
```

### Flags (14 dígitos `0/1`)

Por defecto los 14 en `1`. En el experimento de GUI (tildar checks y cambiar alineación «Der.»
en una fila) el trailer guardado quedó:

```
1 0 1 1 1 1 1 0 0 0 2 0 0 0
```

Aparece un `2`, que corresponde a una alineación derecha (Izq=0, Cen=1, Der=2). Comparando ese
trailer con el estado final del diálogo (7 checks y 7 alineaciones) el mapeo quedó confirmado:

- `flags[0..6]` → **visibilidad** de Dibujado, Comprobado, Empresa, Título, Fecha, Número, Archivo
  (`1` = check puesto, `0` = sin check).
- `flags[7..13]` → **alineación** de esas mismas 7 filas (`0` Izq, `1` Cen, `2` Der).

El probe dio visibilidad `[1,0,1,1,1,1,1]` y alineación `[0,0,0,2,0,0,0]`: Título en «Der.»,
Comprobado sin check, el resto visible e «Izq.», tal como se veía en el diálogo.

## Etiquetas del cajetín en el binario

Tabla multilingüe en `0x76e37c..0x76e50c` (5 idiomas: español, inglés, italiano, francés,
portugués): `Archivo:/Archives:/File:`, `Num:/Page:`, `Data:/Date:/Fecha:`, `Título/Title`,
`Entidad/Designed by`, `Dibujado/Drawn`, `Comprobado/Verificado`, `Firmas/Signature`,
`Nombre/Name`, `Fecha`.

`FUN_00854d30` y `FUN_00857400` dibujan las etiquetas con un índice `1..11`:

| índice | etiqueta (es) |
|--------|---------------|
| 1 | Fecha |
| 2 | Nombre |
| 3 | Firmas |
| 4 | Dibujado |
| 5 | Comprobado |
| 6 | Entidad |
| 7 | Título |
| 8 | Fecha: |
| 9 | Num:/Page: |
| 10 | Archivo: |
| 11 | (otra celda) |

Este índice es del **dibujado**, no necesariamente el orden de los campos serializados. La
correspondencia exacta campo↔etiqueta sigue sin verified en GUI.

## Variantes observadas

La mayoría de los archivos usa `*campo*` con espacios de relleno y **10 campos de texto**. Los
fixtures `pr1-...-03.cad`, `marcha_motor.cad`, `motor_con_inversion_giro.cad` y
`short-cross-test.cad` tienen `**` entre algunos campos. El experimento de GUI reprodujo esa
variante: al guardar con casillas tildadas, CADe escribió **12 tokens de texto**, con campos vacíos
intercalados entre fecha, número y archivo:

```
...*02-nov.-202**1NUM1     **1NUM2     *pr1.cadARCH20        *1*0*...
```

Así que el formato `**` no parece de otra herramienta: es lo que CADe escribe cuando el cajetín se
editó/guardó con ciertos checks. El parser debe aceptar **10 o 12 tokens** y preservarlos byte a byte.

## Próximo paso para implementarlo

1. Experimento en GUI: editar cada celda del cajetín con un valor distintivo, guardar y hacer diff
   para confirmar campo↔etiqueta y el significado de los 14 flags.
2. Modelo tipado en `app/src/model/`: `TitleBlock { fields: string[10], flags: number[14], page: {w,h}, sheet: number }`.
3. Parser/serializer que lea y reescriba el trailer sin tocar los bytes de los otros registros
   (misma disciplina que `cade-shortcuts.ts` con el plan B de atajos).
4. UI: formulario en Propiedades o diálogo «Cajetín», con vista previa encapsulada en un módulo
   puro para poder testear sin DOM.

## Estado de las preguntas

| Pregunta | Estado |
|----------|--------|
| ¿Dónde se guarda? | Respondido: registro 20000 + trailer |
| ¿Formato exacto? | Respondido: 4 format strings del binario |
| ¿Qué campos hay? | Respondido: 10 (o 12) textos + 14 flags + 11 numéricos |
| ¿Mapping campo↔etiqueta? | **Respondido en GUI**: Dibujado×2, Comprobado×2, Empresa, Título, Fecha, Número, De, Archivo |
| ¿Cómo se edita en CADe? | Respondido: `Editar → Cajetín`, 7 filas con check, alineación Izq/Cen/Der y campos de texto |
| ¿Orden exacto de los 14 flags? | Respondido: 7 visibilidad + 7 alineación (0/1/2), en orden de fila del diálogo |
| ¿Implementación en la app? | Hecha: `src/model/title-block.ts` + `ui/TitleBlockDialog.tsx` en `Editar → Cajetín`; tests 6/6 y e2e 1/1 |

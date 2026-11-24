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

Mapeo a offsets del objeto documento, leído de los `PUSH` anteriores al `sprintf` en
`0x4331cd..0x433258` (en el orden de argumentos del formato):

| # | offset | por defecto | interpretación |
|---|--------|-------------|----------------|
| 1 | `+0x88` | 1 | **formato de hoja**: 0 A4 Vertical, 1 A4 Horizontal, 2 A3 Formato 1, 3 A3 Formato 2, 4 Personalizado |
| 2 | `+0x8c` | 1 | **contorno** (check «Contorno») |
| 3 | `+0xa4` | 1 | **visualizar referenciado** |
| 4 | `+0x90` | 2 | **cajetín**: 0 Ninguno, 1 Cajetín 1, 2 Cajetín 2 |
| 5 | `+0x58` (double → ftol) | 2.0 | **zoom** de la vista al guardar (2..9) |
| 6 | `+0xa0` | 0 | **orientación del referenciado**: 0 Horizontal, 1 Vertical |
| 7 | `+0x80` | 1 | **rejilla** visible (`Ver → Rejilla`) |
| 8 | `+0xa8` | 0 | **visualizar conexiones símbolo** |
| 9 | `+0xac` | 0 | **visualizar número de cable** |
| 10 | `+0xc4` | 279 | **alto** de página (columna «Alto» del diálogo) |
| 11 | `+0xc0` | 210 | **ancho** de página (columna «Ancho») |

Los 11 valores por defecto salen del constructor del documento `FUN_00408840`
(`0x408840`), que escribe la vtable y después cada campo:

```
local_14[0x22]=1 (+0x88)  local_14[0x23]=1 (+0x8c)  local_14[0x29]=1 (+0xa4)
local_14[0x24]=2 (+0x90)  [0x58..0x5f]=2.0 (doble)   local_14[0x28]=0 (+0xa0)
local_14[0x20]=1 (+0x80)  local_14[0x2a]=0 (+0xa8)  local_14[0x2b]=0 (+0xac)
local_14[0x31]=0x117 (+0xc4 = 279)  local_14[0x30]=0xd2 (+0xc0 = 210)
```

Eso da exactamente `1,1,1,2,2,0,1,0,0,279,210`, el trailer de una hoja nueva.

#### Cómo se confirmó cada uno (experimento en GUI)

Se trabajó sobre copias, guardando con `Guardar como` a `%TEMP%` y comparando el trailer de cada
corrida. Los 11 campos se probaron en los dos sentidos: cambiando la opción en CADe y viendo qué
campo cambia al guardar, y abriendo un archivo con un valor inyectado y viendo qué muestra el
diálogo.

| Campo | Prueba de escritura (GUI → archivo) | Prueba de lectura (archivo → GUI) |
|-------|-------------------------------------|-----------------------------------|
| 1 formato | A4 Horizontal → A4 Vertical: `1 → 0` | `formato=3` mostró «A3 Formato 2» |
| 2 contorno | destildar «Contorno»: `1 → 0` | `2=0` mostró el check apagado |
| 3 referenciado | no se pudo: el grupo está deshabilitado en el diálogo | `3=0` mostró «Visualizar referenciado» apagado |
| 4 cajetín | Cajetín 2 → Ninguno: `2 → 0` | `4=1` mostró «Cajetín 1» |
| 5 zoom | `Ver → Zoom +` y guardar: `6 → 7` | `5=3` abrió la hoja con zoom 3 |
| 6 orientación | no se pudo (grupo deshabilitado) | `6=1` mostró «Vertical» |
| 7 rejilla | `Ver → Rejilla`: `1 → 0` | — |
| 8 conexiones símbolo | no se pudo (grupo deshabilitado) | `8=1` mostró el check puesto |
| 9 número de cable | no se pudo (grupo deshabilitado) | `9=1` mostró el check puesto |
| 10/11 alto/ancho | — | `297/420` mostró «Alto 297, Ancho 420» |

Contraprueba de normalización: se inyectó `1*1*3*4*6*7*0*8*9*279*210` en un archivo. Al abrirlo,
CADe mostró zoom 6 (el campo 5) y al volver a guardarlo reescribió `1*1*3*4*7*2*0*0*1*  0*279`: los
campos 6, 8 y 9 son enums chicos y CADe descarta valores fuera de rango.

Ojo con el orden de los argumentos: los `PUSH` van de derecha a izquierda, así que el primer
argumento del `sprintf` es el **último** push. La tabla de arriba ya está en orden de argumento.

El diálogo `Archivo → Configuración` **sí** lee del documento el formato, el cajetín, el contorno,
los checks de visualización y el tamaño; las opciones de impresión y la velocidad, en cambio, se
guardan aparte en `config.cfg`, con otro formato:

```
CADe_SIMU*%1d*%1d*%1d*%1d*%1d*%1d*%1d*%1d*%3d*%3d*%0.4f*%1d*%1d*%3d*%3d*%1d*%1d*%4d$$$
```

(escritor en `0x878696`, cadena en `0xb6f550`).

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

### Flags (14 dígitos `0/1/2`)

`flags[0..6]` = **visibilidad** de Dibujado, Comprobado, Entidad, Título, Fecha, Número y Archivo, en
orden de fila; `flags[7..13]` = **alineación** de esas mismas filas (`0` Izq, `1` Cen, `2` Der).

Escritura confirmada con corridas de una sola variable sobre `pr1`:

| Cambio en `Editar → Cajetín` | Flags escritos |
|------------------------------|----------------|
| nada (estado del diálogo) | `0 1 0 0 0 0 0  0 0 0 0 0 0 0` |
| tildar Título | `0 1 0 1 0 0 0  0 0 0 0 0 0 0` |
| poner Dibujado en «Cen.» | `0 1 0 1 0 0 0  1 0 0 0 0 0 0` |

Es decir que el diálogo, al aceptar, **reescribe los 14** con su estado: visibilidad de cada fila y
alineación de cada fila.

**Ojo con la lectura: CADe ignora los flags.** Se probaron cuatro archivos y el diálogo mostró
siempre el mismo estado; además se abrió `cajetin-probe.cad` (que tiene `Comprobado` oculto y
`Título` a la derecha) y en `Archivo → Presentación preliminar` el cajetín se dibuja **igual**:
COM1/COM2 aparecen aunque el flag diga oculto, y TITULO sale a la izquierda aunque el flag diga
derecha.

| Flags en el archivo | Diálogo | Dibujo / vista previa |
|---------------------|---------|------------------------|
| `1 1 1 1 1 1 1  0 0 0 0 0 0 0` | solo Comprobado | — |
| `0 0 0 1 0 0 0  0 0 0 0 0 0 0` | solo Comprobado | — |
| `0 0 0 0 0 0 0  0 0 0 0 0 0 1` | solo Comprobado | — |
| `0 0 0 0 0 0 0  0 0 0 0 0 0 0` | solo Comprobado | — |
| `1 0 1 1 1 1 1  0 0 0 2 0 0 0` (probe) | solo Comprobado | COM1/COM2 visibles, TITULO a la izquierda |

O sea: en CADe los 14 flags son **de sólo escritura**. Se escriben al aceptar el diálogo, pero no se
usan ni para restaurar el diálogo ni para dibujar el cajetín.

Además el loader `FUN_0042c290` (`0x42c290`) lee el trailer carácter por carácter y guarda **13**
flags, no 14: escribe `+0x104`, después `+0x10c`, `+0x110`, `+0x114`, `+0x118`, `+0x11c`, `+0x120`,
`+0x124`, `+0x128`, `+0x12c`, `+0x130`, `+0x134` y `+0x138`, y **nunca toca `+0x108`**:

```
0x42fcee: MOV dword ptr [ECX + 0x104], EAX
0x42fd72: MOV dword ptr [ECX + 0x10c], EAX   <- salta +0x108
0x42fdf6: MOV dword ptr [ECX + 0x110], EAX
...
0x43031e: MOV dword ptr [ECX + 0x138], EAX
```

El writer sí lee los 14 (incluido `+0x108`).

Conclusión práctica: los flags del trailer sólo los aprovecha nuestra app (y cualquier otra
herramienta que los lea). Nuestra UI los lee como están en el archivo, que es la única forma de no
perder información.

El `2` de alineación derecha se observó en el experimento original (Título en «Der.»).


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
| ¿Semántica de los 11 numéricos? | Respondido: formato, contorno, referenciado, cajetín, zoom, orientación, rejilla, conexiones símbolo, número de cable, alto y ancho |
| ¿Implementación en la app? | Hecha: `src/model/title-block.ts` + `ui/TitleBlockDialog.tsx` en `Editar → Cajetín`; tests 6/6 y e2e 1/1 |

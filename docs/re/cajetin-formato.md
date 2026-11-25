# Cajetín de CADe_SIMU: referencia técnica

> Anexo de `docs/reportes/informe-cajetin-cadesimu.md`, que tiene la narrativa y la evidencia de cada
> conclusión. Acá van sólo offsets, formatos y direcciones.
>
> Direcciones de Ghidra con image base `0x800000`; VA del PE = dirección − `0x400000`.
> El exe se analizó desde una copia en `%TEMP%` porque Ghidra no abre desde `E:` (FAT32).

## Dónde vive

1. **Registro `20000`**: `*<id>*20000#XXX#########*<24 numéricos>#`. No es el último registro
   necesariamente; dos `20000` = dos hojas.
2. **Trailer al final del archivo**: `$$$…***$$$&&&`, pegado al último registro.

Funciones: escritor `FUN_00432710` (`0x432710`, VA `0x12710`), armador `FUN_004315f0` (`0x4315f0`),
constructor del documento `FUN_00408840` (`0x408840`), loader `FUN_0042c290` (`0x42c290`).

## Formato del trailer

```
$$$*%d*%d*%d*%d*%d*%d*%d*%d*%d*%3d*%3d&&&
   *%-11s*%-11s*%-11s*%-11s*%-25s*%-25s*%-11s*%-11s*%-11s*%-21s
   *%1d*%1d*%1d*%1d*%1d*%1d*%1d*%1d*%1d*%1d*%1d*%1d*%1d*%1d
   ***$$$&&&
```

Cadenas: `0xb4ccf4` (numéricos), `0xb4cca8` (textos), `0xb4cc64` (flags), `0xb4cc58` (terminador).
Los `PUSH` van de derecha a izquierda: el primer argumento es el último push. La tabla de abajo ya
está en orden de argumento.

### Numéricos (11)

| # | offset | default | semántica |
|---|--------|---------|-----------|
| 1 | `+0x88` | 1 | formato: 0 A4 Vertical, 1 A4 Horizontal, 2 A3 F1, 3 A3 F2, 4 Personalizado |
| 2 | `+0x8c` | 1 | contorno |
| 3 | `+0xa4` | 1 | visualizar referenciado |
| 4 | `+0x90` | 2 | cajetín: 0 Ninguno, 1 Cajetín 1, 2 Cajetín 2 |
| 5 | `+0x58` double→`ftol` | 2.0 | zoom de la vista al guardar |
| 6 | `+0xa0` | 0 | orientación del referenciado: 0 Horizontal, 1 Vertical |
| 7 | `+0x80` | 1 | rejilla visible (`Ver → Rejilla`) |
| 8 | `+0xa8` | 0 | visualizar conexiones símbolo |
| 9 | `+0xac` | 0 | visualizar número de cable |
| 10 | `+0xc4` | 279 | alto de página (mm) |
| 11 | `+0xc0` | 210 | ancho de página (mm) |

**Ocultar el cajetín**: CADe lo hace con el campo 4 (`+0x90`) a `0`, que corresponde a
`Archivo → Configuración → Cajetín: Ninguno`. Evidencia: `app/test/fixtures/arranque-paro-motor-3fcajetinoculto`
tiene los numéricos `1,0,1,0,2,0,1,0,0,279,210` y al abrirlo en CADe el diálogo muestra
«Ninguno» y la hoja no dibuja el bloque de título. Su versión sin ocultar
(`arranque-paro-motor-3f.cad`) tiene el campo 4 en `2` (Cajetín 2). Los 14 flags quedan en `1` en
ambos archivos: **no** son los que ocultan el cajetín; el trailer y sus textos siguen presentes.

Defaults del constructor (`FUN_00408840`): `local_14[0x22]=1 (+0x88)`, `[0x23]=1 (+0x8c)`,
`[0x29]=1 (+0xa4)`, `[0x24]=2 (+0x90)`, `[0x58]=2.0`, `[0x28]=0 (+0xa0)`, `[0x20]=1 (+0x80)`,
`[0x2a]=0 (+0xa8)`, `[0x2b]=0 (+0xac)`, `[0x31]=0x117 (+0xc4=279)`, `[0x30]=0xd2 (+0xc0=210)`.

Los 11 se verificaron en los dos sentidos; la evidencia está en el informe.

### Textos (10, ancho fijo)

Offsets en orden: `+0xdc`, `+0xe0`, `+0xe4`, `+0xe8`, `+0xec`, `+0xf0`, `+0xf4`, `+0xf8`, `+0xfc`,
`+0x100`.

| # | ancho | etiqueta | observación |
|---|-------|----------|-------------|
| 1 | 11 | Dibujado (fecha) | |
| 2 | 11 | Dibujado (nombre) | |
| 3 | 11 | Comprobado (fecha) | |
| 4 | 11 | Comprobado (nombre) | |
| 5 | 25 | Entidad | |
| 6 | 25 | Título | |
| 7 | 11 | Fecha | control de calendario |
| 8 | 11 | Número | |
| 9 | 11 | De | total de hojas |
| 10 | 21 | Archivo | valida ≤20 caracteres |

El dibujante `FUN_00854d30` (`0x854d30`) imprime `"%s de %s"` con `+0xf8`/`+0xfc` y `"%20s"` con
`+0x100`.

### Flags (14)

`flags[0..6]` = visibilidad de Dibujado, Comprobado, Entidad, Título, Fecha, Número, Archivo.
`flags[7..13]` = alineación de esas filas: `0` Izq, `1` Cen, `2` Der.

En CADe son **de sólo escritura**: el diálogo los reescribe al aceptar, pero no los usa ni para
restaurarse ni para dibujar (verificado con 5 archivos y con la vista previa). Además el loader lee
**13**, no 14: escribe `+0x104` y `+0x10c..+0x138`, y nunca `+0x108`:

```
0x42fcee: MOV dword ptr [ECX + 0x104], EAX
0x42fd72: MOV dword ptr [ECX + 0x10c], EAX   <- salta +0x108
0x42fdf6: MOV dword ptr [ECX + 0x110], EAX
...
0x43031e: MOV dword ptr [ECX + 0x138], EAX
```

## Etiquetas en el binario

Tabla multilingüe en `0x76e37c..0x76e50c` (es, en, it, fr, pt): `Archivo:/Archives:/File:`,
`Num:/Page:`, `Data:/Date:/Fecha:`, `Título/Title`, `Entidad/Designed by`, `Dibujado/Drawn`,
`Comprobado/Verificado`, `Firmas/Signature`, `Nombre/Name`, `Fecha`.

`FUN_00854d30` y `FUN_00857400` usan un índice propio `1..11` para dibujarlas (1 Fecha, 2 Nombre,
3 Firmas, 4 Dibujado, 5 Comprobado, 6 Entidad, 7 Título, 8 Fecha:, 9 Num:/Page:, 10 Archivo:,
11 otra celda). Ese índice no coincide con el orden de serialización.

## Variante de 12 tokens

CADe a veces escribe dos tokens vacíos extra entre fecha, número y archivo:

```
...*02-nov.-202**1NUM1     **1NUM2     *pr1.cadARCH20        *1*0*...
```

El parser acepta 10 o 12 tokens y los preserva byte a byte. La regla exacta que dispara la variante
queda pendiente.

## Configuración (fuera del `.cad`)

`Archivo → Configuración` guarda impresión y velocidad en `config.cfg`:

```
CADe_SIMU*%1d*%1d*%1d*%1d*%1d*%1d*%1d*%1d*%3d*%3d*%0.4f*%1d*%1d*%3d*%3d*%1d*%1d*%4d$$$
```

Cadena en `0xb6f550`, escritor en `0x878696`. Del documento sí lee formato, cajetín, contorno,
checks de visualización y tamaño.

## Pendientes

1. Regla exacta de la variante de 12 tokens.
2. Los 24 numéricos del registro `20000`.
3. Multi-hoja: `CADe_S1` tiene dos trailers con valores distintos.
4. Formato y validación de la fecha.

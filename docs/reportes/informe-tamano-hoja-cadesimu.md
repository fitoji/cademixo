# Informe: tamaño de hoja en CADe_SIMU V4 y su serialización

**Fecha**: 2026-11-28
**Alcance**: repasar cómo CADe configura el tamaño de la hoja (`Archivo → Configuración`),
dónde y cómo lo guarda en el `.cad`, y qué tiene que cambiar la app para respetarlo.

## Resumen ejecutivo

CADe ofrece **cinco formatos**: A4 vertical, A4 horizontal, A3 formato 1,
A3 formato 2 y Personalizado. La elección vive en el **primer numérico del
trailer** (`$$$*<11 numéricos>&&&`); el tamaño personalizado vive en los
numéricos **10 y 11** del mismo trailer (alto y ancho, en mm).

Los presets **no reescriben** el tamaño guardado: una hoja A3 puede tener
`300*400` en el trailer y CADe la abre igual como A3. El campo de formato manda;
los dos números son sólo la memoria de «Personalizado». Verificado guardando una
variante por cada opción desde la GUI y comparando los bytes.

La app hoy:

- lee `formato` y los dos tamaños, pero **sólo dibuja** el cajetín medido para
  A4 horizontal (formato 1);
- para el resto devuelve `null` y no hay página, así que «Encuadrar hoja» cae al
  encuadre del dibujo;
- no tiene UI para cambiar el formato.

El cambio propuesto: modelar el formato como fuente de verdad del tamaño, sumar
el selector a «Configuración del proyecto» y dibujar el marco de página para los
cinco formatos. El cajetín medido sigue siendo sólo el de A4 horizontal.

## Método

- Binario: `E:\FP SISTEMAS\CADe_SIMU V4\CADe_SIMU.exe`, corrido en Windows.
- Automatización de GUI: PowerShell + .NET (`AppActivate`, `mouse_event`,
  `CopyFromScreen`), sin instalar paquetes.
- Archivo base: copia de `app/test/fixtures/arranque-paro-motor-3f.cad`
  (`base.cad`), abierta en CADe. Cada variante se guardó con
  `Archivo → Guardar como…` a un archivo nuevo (`fmt0.cad` … `fmt4b.cad`).
- Comparación: lectura Latin-1 y `LastIndexOf('$$$*')` para aislar el trailer.
- Para el área de dibujo: `Ver → Zoom Todo` y conteo de píxeles verdes del marco
  en la captura. El zoom de CADe es isótropo (grilla de 3 px en ambos ejes), así
  que el cociente ancho/alto del marco es comparable entre formatos.
- Capturas y variantes en
  `C:\Users\fitoj\AppData\Local\Temp\opencode\cadesimu-pruebas\hoja\`.

## El diálogo

`Archivo → Configuración` muestra el grupo **Formato** con estas opciones y
medidas de página (alto × ancho, en mm):

| Opción | Alto | Ancho | Valor guardado |
| --- | ---: | ---: | ---: |
| A4 Vertical | 297 | 210 | 0 |
| A4 Horizontal | 210 | 297 | 1 |
| A3 Formato 1 | 297 | 420 | 2 |
| A3 Formato 2 | 297 | 420 | 3 |
| Personalizado | 1..800 | 1..800 | 4 |

Los dos campos de Personalizado son editables y validan **entero entre 1 y 800**
(mensaje observado: «Please enter an integer between 1 and 800.»). A4 vertical y
A4 horizontal comparten página girada; los dos A3 comparten medidas y difieren
en la hoja (formato de cajetín/contorno), no en el tamaño.

El campo «Alto» es el vertical y «Ancho» el horizontal: A4 horizontal es
210 × 297 aunque en el archivo se lean `279*210` (ver más abajo).

## Dónde se guarda

El trailer que escribe CADe al final de cada hoja es:

```
$$$*%d*%d*%d*%d*%d*%d*%d*%d*%d*%3d*%3d&&&
```

Once numéricos; el mapeo completo está en `docs/re/cajetin-formato.md`. Los tres
que importan acá:

| Índice | Campo | Ejemplo |
| --- | --- | --- |
| 0 | formato (0–4) | `1` |
| 9 | alto (mm) | `279` |
| 10 | ancho (mm) | `210` |

Evidencia: cada opción se eligió en la GUI, se aceptó y se guardó una copia. El
resto del archivo no cambió (mismo tamaño, mismos ids). Trailers resultantes:

| Archivo | Opción elegida | Trailer |
| --- | --- | --- |
| `fmt0.cad` | A4 Horizontal (base) | `$$$*1*1*1*2*5*0*1*0*0*279*210&&&` |
| `fmt0v.cad` | A4 Vertical | `$$$*0*1*1*2*5*0*1*0*0*279*210&&&` |
| `fmt2.cad` | A3 Formato 1 | `$$$*2*1*1*2*5*0*1*0*0*300*400&&&` |
| `fmt3.cad` | A3 Formato 2 | `$$$*3*1*1*2*5*0*1*0*0*300*400&&&` |
| `fmt4.cad` | A4 Vertical + tamaño editado | `$$$*0*1*1*2*5*0*1*0*0*300*400&&&` |
| `fmt4b.cad` | Personalizado 300 × 400 | `$$$*4*1*1*2*5*0*1*0*0*300*400&&&` |

Conclusiones que salen de la tabla:

1. **El formato es el índice 0.** Cambiar de A4H a A4V escribe `1 → 0`; A3 F1
   escribe `2`; A3 F2, `3`; Personalizado, `4`.
2. **Los presets no tocan los índices 9 y 10.** Al pasar por A4V, A3 F1 y A3 F2
   los valores `300*400` quedaron intactos: son la memoria de «Personalizado».
3. **El tamaño sólo se escribe al editar Personalizado.** `fmt4.cad` conserva
   formato 0 con `300*400`; al reabrir, CADe muestra A4 Vertical seleccionado y
   los campos de Personalizado con 300 y 400, sin usarlos.
4. **Al reabrir manda el formato.** `fmt3.cad` (formato 3 con `300*400`) abre en
   CADe como A3 Formato 2, no como Personalizado. Verificado en el diálogo.

### El área de dibujo no es la página

En los archivos A4 horizontal el trío es `1*279*210`, no `1*297*210`: CADe
guarda el **área útil**, no la página. La página A4 horizontal mide 297 × 210;
el marco que dibuja CADe mide 279 × 210, es decir **18 mm menos de ancho**
(9 mm por lado) y el alto completo. Es la misma medida con la que se midió el
cajetín en `docs/re/cajetin-render.md`.

Con `Ver → Zoom Todo` se midió el cociente ancho/alto del marco de cada preset:

| Formato | Página (mm) | Área útil esperada | Cociente teórico | Cociente medido |
| --- | --- | --- | ---: | ---: |
| A4 Horizontal | 297 × 210 | 279 × 210 | 1,329 | 1,33 |
| A4 Vertical | 210 × 297 | 192 × 297 | 0,646 | 0,63 |
| A3 (F1 y F2) | 420 × 297 | 402 × 297 | 1,353 | 1,34 |
| Personalizado 300 × 400 | 400 × 300 | 400 × 300 | 1,333 | 1,33 |

Regla: **al área útil se le restan 18 mm al lado ancho de la página** y el otro
lado queda completo. En Personalizado no se resta nada: el usuario ya escribe el
área. La medición por píxeles tiene ±3 % de error (marco punteado, 1 px), pero
alcanza para descartar las alternativas: A4V no es 210 × 279 (0,753) y A3 no es
420 × 297 (1,414).

### Prueba de que el preset manda sobre el tamaño guardado

Se inyectó por reemplazo byte-exacto `100*800` en el trailer de `fmt2.cad`
(formato 2, A3 F1) y se abrió en CADe. Si el editor usara los números guardados,
la hoja sería una tira de 800 × 100; el marco siguió siendo el de A3 (cociente
1,34). Conclusión: para los formatos 0–3 el tamaño sale del preset; los índices
9 y 10 sólo se usan con formato 4.

## Qué implica para la app

Hoy `titlePageSize()` devuelve los índices 9 y 10 y `titleBlockLayout()` usa
`max/min` de esos valores, así que:

- A4 vertical se dibujaría apaisado (279 × 210 en vez de 192 × 297);
- A3 se dibujaría con `300*400` si el archivo quedó con esa memoria, y con
  `279*210` en los archivos reales;
- cualquier formato distinto de 1 devuelve `null` y no hay página.

El modelo correcto es una tabla por formato:

| Formato | Área útil (ancho × alto) |
| --- | --- |
| 0 A4 Vertical | 192 × 297 |
| 1 A4 Horizontal | 279 × 210 |
| 2 A3 Formato 1 | 402 × 297 |
| 3 A3 Formato 2 | 402 × 297 |
| 4 Personalizado | ancho × alto guardados |

El cajetín medido (`TITLE_LAYOUT`, cajetín 1 y 2) sigue aplicándose sólo a A4
horizontal. Para A4 vertical y A3 se dibuja el marco de página y el contorno
(medidos), sin inventar el cajetín: falta medir esa geometría.

## Implementación

1. `app/src/model/title-block.ts`
   - `sheetAreaOf(block)`: tabla de arriba; para formato 4 usa 9/10.
   - `withSheetFormat(text, format, size?)`: escribe el índice 0 y, sólo con
     formato 4, los índices 9/10; preserva el ancho de los tokens y `&&&`.
2. `app/src/model/title-block-layout.ts`
   - `page` sale de `sheetAreaOf`.
   - El bloque y las franjas medidas se siguen dibujando sólo en A4 horizontal.
   - Para el resto: marco exterior, marco interior y nada más.
3. `app/src/ui/ProjectSettingsDialog.tsx`
   - Grupo «Formato» con las cinco opciones y los dos campos de Personalizado
     (validación 1..800), aplicados en el acto como el resto del diálogo.
4. Tests: tabla de áreas, escritura del trailer, ida y vuelta y página del
   layout por formato.

## Pendientes

- Geometría del cajetín en A4 vertical y A3 (no medida; no se inventa).
- Diferencia exacta entre A3 Formato 1 y A3 Formato 2 (misma página; cambia la
  hoja).
- Multi-hoja: el formato vive en el trailer de cada hoja; hoy el parser toma el
  último trailer del documento.

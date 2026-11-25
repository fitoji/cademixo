# Informe: cajetín — ocultamiento y guardado en CADe_SIMU V4

> Fecha: 2026-11-25. Complemento de `docs/re/informe-cajetin-cadesimu.md` (análisis completo) y de
> `docs/re/cajetin-formato.md` (anexo de offsets). Acá se concentra **cómo se oculta**, **qué pasa al
> guardar** y **qué implica para nuestro editor**.

## 1. Resumen

CADe guarda el cajetín en dos sitios: el registro `20000` (cabecera de hoja) y un trailer de ancho
fijo al final del archivo. El trailer lleva 11 numéricos, 10 textos y 14 flags:

```
$$$*<11 numéricos>&&&*<10 textos>*<14 flags>***$$$&&&
```

La **visibilidad del cajetín entero** no depende de los 14 flags sino del numérico 4
(offset `+0x90` del objeto documento): el selector «Cajetín» de `Archivo → Configuración`.

## 2. Cómo CADe oculta el cajetín

| Archivo | Numéricos del trailer | Resultado |
|---------|-----------------------|-----------|
| `app/test/fixtures/arranque-paro-motor-3f.cad` | `1,1,1,2,5,0,1,0,0,279,210` | Cajetín 2, se dibuja |
| `app/test/fixtures/arranque-paro-motor-3fcajetinoculto` | `1,0,1,0,2,0,1,0,0,279,210` | Cajetín: Ninguno, **no se dibuja** |

El campo 4 pasa de `2` a `0`. Verificado en GUI: al abrir el segundo archivo, `Archivo →
Configuración` muestra «Cajetín: Ninguno» y la hoja no muestra el bloque de título.

**Lo que NO oculta el cajetín**: los 14 flags. En ambos archivos siguen en `1` y los textos siguen
presentes (fecha `02-Aug-2026`, número `1`, de `1`, archivo con el nombre del archivo). CADe no
borra nada del trailer; simplemente deja de dibujarlo.

Selector completo del campo 4: `0` = Ninguno, `1` = Cajetín 1, `2` = Cajetín 2.

## 3. Qué ocurre al guardar con CADe

Observado comparando los dos fixtures y en experiments anteriores con `Guardar como`:

1. **Reescribe el trailer completo** desde el estado interno del documento. En el ejemplo,
   además del campo 4 cambiaron el contorno (`1 → 0`), el zoom (`5 → 2`) y el texto «Archivo»
   (`CADe_S1` → `arranque-paro-motor-3f.cad`, que CADe regenera del nombre guardado).
2. **Puede emitir 10 o 12 tokens de texto**. Al aceptar `Editar → Cajetín` con ciertas casillas,
   CADe intercala dos campos vacíos entre fecha, número y archivo (`...*02-nov.-202**1NUM1**...`).
   No es otra herramienta: lo escribe el propio CADe. Nuestro parser acepta ambos layouts.
3. **Descarta registros desconocidos**. El experimento T3 (fixture `SIMKEYS1:`) mostró que tras
   `Guardar como` el registro propio desaparece y los ids se renumeran. Por eso los atajos de
   componentes se guardan en un sidecar, nunca dentro del `.cad`.
4. **No restaura los flags al abrir**. Los 14 dígitos son de *sólo escritura* en CADe: el diálogo
   arranca siempre con su estado interno y la vista previa de impresión tampoco los usa. Además el
   loader lee 13 de 14 (nunca escribe `+0x108`). Un mismo archivo puede decir una cosa y CADe
   mostrar otra.
5. **Conserva el resto del documento**: el contenido de los registros de dibujo no se toca, pero
   los ids pueden reordenarse al guardar.

## 4. Consecuencias para nuestro editor

| Hecho de CADe | Decisión nuestra |
|---------------|------------------|
| El cajetín se oculta con el campo 4 = 0 | `titleCajetin(block)` expone el selector; el dibujo (cuando se implemente) debe condicionarse a `!== 0` |
| Los flags no se leen en CADe | Los leemos tal como están en el archivo: es la única forma de no perder información |
| CADe reescribe los 14 flags al aceptar el diálogo | Cambiar uno no altera los demás (`withTitleFlags`) |
| CADe descarta registros propios | Ningún registro inventado; los atajos van en sidecar |
| Variante de 12 tokens | El parser preserva 10 o 12 tokens byte a byte |
| `Archivo` se regenera del nombre | Nosotros respetamos el texto del archivo; no lo reescribimos |
| Guardar reordena ids | Nuestro serializer conserva el texto original salvo el trailer editado |

**Estado actual**: el lienzo todavía **no dibuja** el cajetín, así que no hay nada que ocultar en la
app. El diálogo `Editar → Cajetín` muestra las 7 filas incluso cuando el campo 4 es `0`; reflejar
«Ninguno» sería el paso siguiente para igualar al original.

## 5. Evidencia

- Fixtures: `app/test/fixtures/arranque-paro-motor-3f.cad` y
  `app/test/fixtures/arranque-paro-motor-3fcajetinoculto`.
- Test: `app/test/title-block.test.ts` — «ocultar el cajetín en CADe es el campo 4 a 0, no los flags»
  (campo 4, flags intactos, textos preservados y round-trip).
- GUI: `Archivo → Configuración` con «Cajetín: Ninguno» en el fixture oculto; vista previa de
  impresión del probe con `Comprobado` oculto y `Título` a la derecha, dibujados igual.
- Binario: escritor `FUN_00432710` (`0x432710`), armador `FUN_004315f0` (`0x4315f0`), constructor
  `FUN_00408840` (`0x408840`), loader `FUN_0042c290` (`0x42c290`).
- Dirección Ghidra con image base `0x800000`; VA del PE = dirección − `0x400000`.

## 6. Verificación y estado

- `npx tsc --noEmit`: limpio.
- `node --test test/title-block.test.ts`: **10/10**.
- Suite completa: **871/872** en la última pasada general; el único fallo es `wiring-performance`,
  sensible a carga.
- Reportes relacionados: `informe-cajetin-cadesimu.md`, `cajetin-formato.md`,
  `informe-calibracion-simbolos.md`.

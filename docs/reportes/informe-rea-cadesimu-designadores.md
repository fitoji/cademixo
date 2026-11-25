# Informe: semántica del designador en CADe_SIMU V4

**Fecha**: 2026-11-23
**Alcance**: verificar contra el binario real cómo CADe empareja un contacto
auxiliar con su aparato, y alinear con ese comportamiento el modelo de la app.

## Resumen ejecutivo

Las cinco pruebas iniciales y cuatro series adicionales responden las preguntas
que estaban abiertas. CADe empareja por **texto literal de designador**, agrupa
**todos** los componentes que lo comparten en un único aparato, y **no** permite
accionar el contacto auxiliar con el mouse. La serie I cierra el último hueco:
la misma regla rige para la bobina y sus contactos.

La app hacía tres cosas distintas: normalizaba el designador (y con eso unía
bobina y contactos que CADe separa), elegía solo la primera protección
coincidente y accionaba el aparato al clickear el auxiliar. Las tres quedaron
corregidas. La ambigüedad de designadores repetidos dejó de ser una pregunta:
CADe no elige, los acciona juntos.

## Método

- Autenticación del binario: `E:\FP SISTEMAS\CADe_SIMU V4\`, SHA-256
  `a5208930...` (idéntico al análisis previo). El volumen `E:` es FAT32, por eso
  Ghidra necesita staging en NTFS.
- Automatización de GUI: PowerShell + .NET (`AppActivate`, `mouse_event`,
  `CopyFromScreen`), sin instalar paquetes. Capturas antes/después de cada
  accionamiento, comparadas visualmente y por conteo de píxeles rojos.
- Variantes de archivo generadas por **reemplazo byte-exacto** sobre copias de
  `ej0def.cad`, `inversion-giro-cej.cade` y `arranque-paro-motor-3f.cad`, con
  codificación Latin-1 intacta. La variante `Q1 → QX` cambió 1 byte; las demás,
  sólo el campo designador.
- Todas las copias y capturas quedaron en
  `C:\Users\fitoj\AppData\Local\Temp\opencode\cadesimu-pruebas\`.

## Hallazgos

### Pruebas A–E (planos reales PR1/PR2 y catálogo)

| Prueba | Resultado |
| --- | --- |
| A / A2 | El `8018` sigue al disyuntor: pasa de 95-96 a 97-98 y se pinta de rojo. Confirmado en PR1 y PR2 |
| B | Con el auxiliar renombrado `Q1 → QX` deja de seguirlo. El vínculo es por designador |
| C | Cuatro puntos distintos del símbolo: clic sobre el `8018` no produce ningún cambio |
| D | Con catorce dispositivos `-F`, accionar una protección hace reaccionar al `8018` y a otros auxiliares |
| E | En el archivo original no se puede energizar `KM2` con un solo puntero (`S0` es momentáneo). Con la variante que lo vuelve latching, el auxiliar NC abre; el NA queda sin identificar |

### Serie F — el grupo es el aparato

Tres variantes de `ej0def.cad` (`6001 -F` + `8018 -F`):

| Variante | Designadores | Observación |
| --- | --- | --- |
| F0 | `6001 -F`, `8018 -F` | Línea de base 1:1, funciona |
| F1 | `6001 -F`, `6009 -F`, `8018 -F` | Cerrar uno cierra los tres; abrir uno abre los tres |
| F2 | `6001 -Z`, `6009 -F`, `8018 -F` | `6009` manda al `8018`; el `-Z` queda intacto |

**Conclusión**: CADe no aplica "el primero" ni "el más cercano". Todos los
componentes con el mismo designador comparten estado.

### Serie G — el designador se compara literal

Con la protección en `-F`, se cambió solo el designador del `8018`:

| Designador del auxiliar | ¿Conmutó? |
| --- | --- |
| `F` | No |
| `-f` | No |
| ` F` | No |

CADe distingue mayúsculas, guion inicial y espacios. `partKey` en la app, en
cambio, hacía `trim().toUpperCase().replace(/^[-\s]+/, '')`.

### Serie I — la literalidad alcanza a bobina y contactos

Era el punto que quedaba abierto: `partKey` también une la bobina con sus
contactos de potencia y auxiliares, y no había evidencia de que CADe usara la
misma regla ahí. Se probó sobre `arranque-paro-motor-3f.cad`, un arranque
directo con autorretención: al soltar STAR solo el auxiliar `-KM1 13/14`
sostiene la bobina, así que el resultado es binario (enclava o no).

| Variante | Bobina | Auxiliar de enclavamiento | Resultado |
| --- | --- | --- | --- |
| `I0-control.cad` | `-KM1` | `-KM1` | Enclava; el contactor de potencia cierra |
| `I1-literal-KM1.cad` | `-KM1` | `KM1` | No enclava; el auxiliar no cierra |
| `I2-ambos-KM1.cad` | `KM1` | `KM1` | Enclava, pero el contacto de potencia `-KM1` no cierra |

I2 funciona como control: con los dos textos iguales el enclavamiento vuelve, o
sea que la edición no rompe el archivo. Y su segunda lectura es igual de útil:
el contacto de potencia `-KM1` no sigue a una bobina `KM1`. La comparación es
literal en los dos sentidos, no una regla especial para protecciones.

### Serie H — desbloqueo de la prueba E

`H1-latch-S0.cade` cambia `S0` de `8001` (momentáneo) a `8008` (latching),
conservando pines `11`/`12`. Secuencia necesaria:

1. Cerrar el disyuntor principal `F1`: su auxiliar `97-98` alimenta el mando.
2. Cerrar `S0` (queda estable).
3. Mantener `S2` (`8000`, momentáneo). El circuito energiza y el contacto
   auxiliar NC de `-KM2` (`11`/`12`) pasa de cerrado a abierto. Al soltar `S2`
   el estado se mantiene por el contacto en paralelo.

## Cambios en la app

| Archivo | Cambio |
| --- | --- |
| `app/src/model/project.ts` | `apparatusKey`: clave del aparato por designador **literal**, con clave propia para registros sin designador. Es la única definición, compartida por netlist y simulación |
| `app/src/sim/apparatus.ts` | `linkedProtection` compara designador literal; `ProtectionStates` por designador; `groupIdsWith` para el disparo visual del grupo |
| `app/src/sim/netlist.ts` | `part` de cada Device sale de `apparatusKey`: se eliminó `partKey` y su normalización |
| `app/src/ui/App.tsx` | Estado de protecciones por designador; todas las piezas del grupo cambian juntas; clic sobre auxiliar enlazado sin efecto; el estado «vivo» de bobinas y contactos usa la misma clave |
| `app/test/simulacion-pr1.test.ts`, `simulacion-pr2.test.ts` | Claves de estado de id → designador |
| `app/test/aparato-designador.test.ts` | Nuevo: matching literal, grupo con dos protecciones, sin designador, conmutador libre |
| `app/test/netlist.test.ts`, `circuit.test.ts`, `conmutador.test.ts` | Expectativas actualizadas a designadores literales (`-KM1`, `-S1`, `-H1`), que es lo que dicen los fixtures |
| `docs/pruebas-cadesimu-windows.md` | Resultados A–E y series F/G/H/I, con la lección operativa de cada prueba |

Consecuencia de diseño: dos aparatos solo se vinculan si el usuario escribió el
mismo texto. Es exactamente lo que hace CADe, y el catálogo de la app ya entrega
prefijos con guion (`-KM`, `-S`, `-F`), así que los símbolos colocados desde la
paleta son consistentes entre sí.

## Verificación

- `npx tsc --noEmit`: limpio.
- Tests focalizados (`aparato-designador`, `simulacion-pr1`, `simulacion-pr2`,
  `netlist`, `circuit`, `conmutador`): 59/59.
- Suite completa: 736/737. El único fallo es
  `test/wiring-performance.test.ts` (17,9 ms/evento frente a un umbral de
  2,5 ms). Ese test importa únicamente `src/editor/state.ts`, que no se modificó;
  es un umbral sensible a la carga de la máquina y queda documentado como ajeno
  al cambio.

## Pendientes

- Identificar el auxiliar NA (`7000`) de `-KM2` dentro de la hoja
  `inversion-giro-cej.cade` para cerrar definitivamente la prueba E.
- Repetir la serie G con designadores que difieran sólo en espacios *finales*
  para saber si CADe recorta por la derecha. La app ya no recorta, así que sólo
  confirmaría la simetría.
- Evaluar un aviso en la UI cuando dos piezas parecen del mismo aparato pero el
  texto no coincide (por ejemplo `KM1` contra `-KM1`): hoy, como en CADe, el
  circuito simplemente no funciona y no hay explicación visible.

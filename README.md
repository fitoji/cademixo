# cadeMixo

Simulador eléctrico con manejo de cables moderno, compatible con archivos de **CADe_SIMU** (`.cade` / `.cad`).

**Versión actual:** 0.15.0 (release del 2026-11-27).

## Por qué existe

CADe_SIMU es freeware cerrado, escrito en MFC 4.2 sobre Visual C++ 6 a partir del año 2000, y solo corre en Windows. Su punto débil es la interacción: dibujar y mover cables es arcaico.

Este proyecto **no** intenta decompilar ni reconstruir CADe_SIMU. Lo reimplementa: lee sus archivos, los simula y ofrece una experiencia de edición moderna. Al ser código propio, se puede modificar sin límites.

## Roadmap

**v1 = app funcional** al cerrar la Fase 5: abre, edita y simula `.cade`, y se instala en macOS y Windows.

```
M1 ──────────● M2 ────────● M3 ────────● M4 ──────── M5
abrir/guardar   ver/dibujar  editar      simular      producto
                                        ▲
                                        estamos acá (M1-M4 cerrados, Fase 5 pendiente)
```

| Fase | Objetivo | Entregable que lo prueba | Estado |
|---|---|---|---|
| **0 — Reconocimiento** | entender el formato y el binario | tabla de códigos + gramática | 🟡 4/5 |
| **1 — Parser** | abrir y guardar sin pérdida | round-trip byte a byte | 🟢 5/5 |
| **2 — Render** | ver y dibujar el esquema | esquema en pantalla con zoom y símbolos | 🟢 5/5 |
| **3 — Cables** | editar cables como en 2026 | arrastrar extremo con auto-ruteo | 🟢 6/6 |
| **4 — Simulación** | que el circuito funcione | arranque directo e inversión de giro | 🟢 4/4 |
| **5 — Producto** | que se pueda usar a diario | instalador macOS + Windows | ⚪ 0/4 |

### Hitos

| Hito | Significa | Estado |
|---|---|---|
| **M1** | Abrir un `.cade` y guardarlo idéntico, sin perder un byte | ✅ |
| **M2** | Verlo dibujado y poder mover componentes | ✅ |
| **M3** | Editar cables con ruteo moderno | ✅ |
| **M4** | Simular el circuito | ✅ |
| **M5** | Instalarlo en la máquina y usarlo | ⬜ |

### Dónde estamos

Fecha: 2026-11-27 · rama `main` · v0.15.0

**Hecho**
- ✅ Parser `.cade`/`.cad` con round-trip byte a byte (107 tests, 3 archivos reales).
- ✅ Modelo de dominio `Project → Sheet → Component → Pin → Wire`.
- ✅ Editor con undo/redo, multi-selección, copiar/pegar y borrar sobre el texto.
- ✅ Librería de símbolos IEC 60617 con el catálogo real de CADe_SIMU (270 códigos extraídos del binario).
- ✅ App Vite + React + SVG corriendo: paleta, lienzo con zoom/pan/grilla/snap, inspector.
- ✅ UI sobre shadcn/ui con modo día/noche (la preferencia queda guardada).
- ✅ Pines derivados del archivo: cada borne dibujado es un extremo de cable real.
- ✅ Modelo de cable: número (`geometry[21]`), tramos, uniones (`4001`).
- ✅ Arrastrar extremos con snap a bornes y codo ortogonal automático.
- ✅ Validaciones de red en vivo con acciones de arreglo.
- ✅ Solver de contactores con enclavamiento y detección de lazos inestables, con simulación y avisos de fallo.
- ✅ Extracción de netlist: aparatos agrupados por designador, redes por proyección.
- ✅ **Barra de inserción de componentes**: teclear desde el lienzo, recorrer variantes con flechas, `Enter` prepara y el clic en el lienzo coloca. Misma búsqueda, catálogo y orden que la paleta. Flotante, arrastrable, acoplable al borde inferior y minimizable.
- ✅ Dos mundos visuales (clásico y moderno) con modo día/noche y preferencias persistidas.
- ✅ **Manejo de cables al mover componentes**: en **Ver → Configuración** se elige **Actual** o **Ortogonal (Wybrow)**. El modo ortogonal conserva los carriles escalonados, enruta alrededor de obstáculos y derivaciones interiores, y confirma sólo si los grupos de bornes no cambian; si no hay ruta válida, avisa el conflicto y deja el documento intacto.
- ✅ **Guardado seguro de proyectos `.mixo`**: revisión verificada por relectura, apertura que rechaza sidecars inválidos sin reemplazar el documento y recuperación del dibujo como copia.
- ✅ **Copias recuperables fuera del archivo candidato**: generación previa en IndexedDB antes de reemplazar, rotación sólo después de verificar la sucesora y menú «Recuperar versión…» que nunca repara el original. Ver [recuperación](docs/recuperacion-mixo.md).

**En curso (Fase 5)**
- 🟡 Empaquetado de escritorio (macOS y Windows): hoy se usa `pnpm dev` / `pnpm build`; todavía no hay configuración Tauri.
- 🟡 Tres fallos E2E preexistentes, confirmados también en `main`: ver [fallos E2E preexistentes](docs/reportes/fallos-e2e-preexistentes.md).

**Limitaciones declaradas**
- La rotación es visual: el formato no expuso el campo de orientación.
- Los registros nuevos se agregan al final porque los ids deben ser estrictamente crecientes.
- 1 de 161 registros sigue mal delimitado en `inversion-giro-cej.cade`.

**Siguiente**
1. Fase 5: empaquetar la app para macOS y Windows.
2. Corregir los tres fallos E2E preexistentes documentados y ampliar la cobertura de la barra de inserción.
3. Fase 3 del guardado seguro (contrato de bytes v2 y port a Rust), anotada como feature futuro en `odd/tasks/guardado-seguro-mixo-fase3-pendiente.md`.

Plan detallado con todas las tareas: [`odd/tasks/simuelectro.md`](odd/tasks/simuelectro.md).

## Stack

- **TypeScript** ejecutado por Node 24 sin build (type stripping nativo) en el núcleo; tests con `node:test` y sin dependencias.
- **Vite + React + SVG** para la UI, con **Tailwind**, **shadcn/ui** y **UI SDK** en los componentes interactivos.
- **Playwright** para pruebas E2E en Chrome.
- A futuro: **Tauri** para el binario de escritorio (macOS y Windows).

## Uso

El repo es un workspace de pnpm: los scripts se corren **desde la raíz** y se ejecutan en `app/`.

```bash
pnpm install

pnpm dev        # abre la app en http://localhost:5173
pnpm test       # 944 tests: formato, cables, símbolos, editor y simulación
pnpm test:e2e   # suite del editor en Chrome (Playwright): 53 pruebas
pnpm build      # typecheck + bundle de producción

# inventario de códigos de un archivo
pnpm report test/fixtures/arranque-paro-motor-3f.cad

# sube la versión según los commits convencionales del tramo
pnpm bump            # feat → minor, fix → patch, …! → major
pnpm bump --dry-run  # muestra el salto sin escribir
```

En el entorno de referencia, la suite E2E deja 49 pruebas en verde, 3 fallos preexistentes y 1 omitida; los detalles están en [fallos E2E preexistentes](docs/reportes/fallos-e2e-preexistentes.md). Dos pruebas de rendimiento (`parse-perf` y `wiring-performance`) pueden fluctuar con la carga de la máquina.

El tramo de `pnpm bump` arranca en el último commit que tocó `app/package.json`, así que no dependen de tags. También acepta el tipo forzado (`pnpm bump minor`) y `--tag` para crear `vX.Y.Z`.

Salida del inventario: cada código con su frecuencia, los designadores observados y los `layouts` cuando un registro no sigue el layout estándar de 11 campos.

## Estructura

```
app/
  src/format/cade.ts       parser + serializador + inventario (sin dependencias)
  src/model/project.ts     modelo de dominio y edición de registros
  src/editor/state.ts      estado del editor: undo/redo, selección, clipboard
  src/editor/pins.ts       bornes derivados de los extremos de cable
  src/editor/network.ts    red de cables, uniones y validaciones
  src/sim/netlist.ts       dibujo -> circuito: redes y aparatos
  src/sim/solver.ts        lógica de contactores con enclavamiento
  src/symbols/library.ts   símbolos en SVG, dibujados a semejanza de CADe_SIMU
  src/symbols/templates.ts plantillas crudas por código (generadas)
  src/ui/                  app React: canvas, paleta, inspector, barra de inserción
  src/ui/ComponentInsertionBar.tsx  barra flotante/acople con UI SDK Command
  src/ui/insertion-matches.ts       paridad de búsqueda con la paleta
  src/ui/symbol-presentation.ts     etiquetas y tonos compartidos de familia
  src/report.ts            CLI de inventario
  test/                    tests y fixtures reales
  e2e/                     pruebas de navegador (Playwright)
docs/cade-format.md        gramática del formato, verificado vs. hipótesis
docs/plan-barra-insercion.md  especificación de la barra de inserción
odd/tasks/                 plan de construcción por fases
```

## Barra de inserción de componentes

Con el lienzo enfocado, teclear un nombre o código abre la barra con el primer carácter ya incluido. Las flechas recorren las variantes, `Enter` prepara el símbolo y el clic en el lienzo lo coloca; confirmar en la barra nunca inserta por sí solo. Usa el mismo motor, catálogo y orden que la paleta, que sigue disponible.

Por defecto se muestran todos los componentes de la librería, incluidos los que CADe_SIMU no ofrece en su menú (`8016`, `8017`, `8018`). Si querés limitarte a los códigos extraídos del binario, activá **Ver → Solo componentes CADe_SIMU**.

La barra es flotante: se arrastra desde el tirador, se mueve con flechas (con `Mayús`, pasos grandes), `Inicio` la centra y el botón de esquina la fija a todo el ancho o la separa. Soltarla cerca del borde inferior también la acopla como franja fija, reservando su altura en el editor. El botón `-` la pliega a una pastilla con solo `Insertar:` y el `+` la restaura. La transición respeta `prefers-reduced-motion`.

Especificación: [`docs/plan-barra-insercion.md`](docs/plan-barra-insercion.md). Seguimiento: [`odd/tasks/component-insertion-bar.md`](odd/tasks/component-insertion-bar.md).

## Informes y auditorías

Las auditorías e informes técnicos están centralizados en el [índice de reportes](docs/reportes/indice_reporte.md): Auditoría del Electro-Simulador v0.3.0; Auditoría del sistema de avisos; Semántica del designador en CADe_SIMU V4; El cajetín de CADe_SIMU V4; y Auditoría de las 4D en cadeMixo.

## El formato, en cuatro ideas

Detalle completo en [`docs/cade-format.md`](docs/cade-format.md).

1. **Texto plano** Latin-1, dos delimitadores con roles distintos: `*` para campos numéricos, `#` para campos textuales.
2. **Sin cabecera de versión.** `CADe_SIMU` va seguido del primer registro, con forma `*<id>*<código>#`. El campo que parece "versión" es el id del primer registro.
3. **Los ids de registro son estrictamente crecientes.** Ese es el discriminante que separa un registro real de la cola de la geometría de un componente, que encaja en el mismo patrón.
4. **El código `8` es una etiqueta de texto**, y su contenido termina pegado al registro siguiente. Por eso la frontera de un registro puede caer dentro de un segmento: el parser trabaja con offsets sobre el texto, no con segmentos.

## Decisiones de diseño

- **Round-trip lossless**: `serialize(parse(x)) === x`, byte a byte. Es la garantía que permite abrir archivos sin miedo a corromperlos.
- **Registros opacos preservados**: un código desconocido se conserva íntegro y se reescribe igual. No hace falta entender los 200 códigos para poder editar cables.
- **El parser declara su incertidumbre**: los registros con layout inesperado se reportan, no se esconden.
- **Sin dependencias en el núcleo**: menos superficie, arranque instantáneo, tests sin instalación.

## Limitaciones conocidas

- 2 de 161 registros mal delimitados en `inversion-giro-cej.cade` (códigos `0` y `5`).
- La barra de inserción busca componentes del catálogo; no ejecuta comandos ni mantiene historial, favoritos o búsqueda remota.
- La simulación modela contactos y bobinas; no modela temporizadores ni disparo de protecciones.
- El motor se considera alimentado con dos o más fases con tensión (esquema unifilar), no por fase y neutro.

## Muestras y legalidad

Los fixtures de `app/test/fixtures/` son esquemas eléctricos de terceros, usados como datos de prueba. En `data/` (fuera de git) vive el binario propietario de CADe_SIMU, que **no** se versiona ni se redistribuye.

Este repositorio no contiene código de CADe_SIMU. El conocimiento del formato proviene de observar archivos de datos; la implementación es propia.

## Símbolos

Los símbolos son propios: SVG escritos en `app/src/symbols/` a semejanza de los que dibuja CADe_SIMU, con la caja de conexión medida sobre archivos reales. No se copian elementos de colecciones de terceros; por eso el repositorio no necesita créditos de símbolos.

Los bornes no los define el dibujo: salen del registro del `.cad`, así que un símbolo nuevo nunca cambia el formato ni el round-trip.

## Créditos

cadeMixo está inspirado en CADe_SIMU, pero no usa su código: el parser, el solver y los símbolos son propios.

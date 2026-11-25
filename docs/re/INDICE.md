# Índice de reportes de `docs/re/`

> Actualizado 2026-11-25. Aquí están todos los informes y anexos de ingeniería inversa de
> CADe_SIMU V4 que viven en esta carpeta.

## Informes

| Archivo | Contenido |
|---------|-----------|
| `informe-cajetin-cadesimu.md` | Informe completo del cajetín: dónde se guarda, formato del trailer, los 11 numéricos, los 10 textos, los 14 flags y la implementación en la app |
| `informe-cajetin-ocultamiento-y-guardado.md` | Cómo CADe oculta el cajetín (campo 4 = Ninguno), qué cambia al guardar y qué implica para nuestro editor |
| `informe-calibracion-simbolos.md` | Calibración raster de símbolos: mapeos de capturas, cuadrado de disparo, 6001/6002/6003/6004 y el verificador `overlay-diff` |
| `short-circuit-detection.md` | Detección de cortocircuitos y derivaciones a tierra: etiquetas de fase y `detectFaults()` |
| `cadesimu-v4-rea.md` | Identidad del PE, recursos, menú y funciones del serializer localizadas con Ghidra/REA |

## Anexos técnicos

| Archivo | Contenido |
|---------|-----------|
| `cajetin-formato.md` | Anexo de offsets y format strings del cajetín; tablas de numéricos, textos y flags |
| `componentes-completo.md` | Inventario de los 212 códigos del catálogo CADe_SIMU y los extras del proyecto |
| `cade-resource-strings.txt` | 1.248 cadenas únicas de la string table del binario |
| `bitmaps/` | 280 PNG extraídos: 12 primitivas de dibujo y recursos de UI |

## Traspasos y estado

| Archivo | Contenido |
|---------|-----------|
| `traspaso-windows.md` | Qué viaja con el repo y qué queda solo en la máquina Windows; checklist antes de apagarla |
| `traspaso-2026-11-24.md` | Detección de cortos, atajos por componente (gate T3) y entorno Windows verificado |
| `orientacion-handoff.md` | Handoff del trabajo de orientación de componentes |
| `pending-tasks.md` | Tareas derivadas del análisis REA (estado al 2026-11-05) |

## Reportes fuera de esta carpeta

- `docs/cade-format.md` — gramática del formato `.cad`/`.cade`.
- `docs/componentes.md` — catálogo de componentes renderizado desde la app.
- `docs/informe-rea-cadesimu-designadores.md` — análisis de designadores.

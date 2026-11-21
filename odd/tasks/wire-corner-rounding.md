# Esquinas redondeadas de los cables, sólo en el pintado

Los cables se guardan como un segmento por registro (`M x1 y1 L x2 y2`), así que un codo no existe en el modelo: son dos registros que comparten un vértice. El redondeo tiene que resolverse al pintar, sin tocar datos.

## Specs

- **S1.** El redondeo es **sólo de presentación**. No cambia el modelo, ni el `d` guardado, ni el parser, ni el formato `.cade`: el round-trip del parser sigue byte a byte y los tests de formato siguen verdes sin editarlos.
- **S2.** Radio de esquina fijo en **unidades de plano** (arranca en `1`), no en píxeles: el redondeo escala con el zoom como el resto del dibujo.
- **S3.** Se aplica **sólo en estilo moderno**. En clásico el cable conserva el quiebre seco de CADe_SIMU.
- **S4.** Sólo se redondea un vértice cuando lo comparten **exactamente dos** extremos de cable. No se redondea si en ese punto hay un borne de componente, un registro de unión (4001) o tres o más cables: ahí el empalme tiene que leerse recto.
- **S5.** El recorte por esquina se limita a **la mitad del segmento**: un tramo corto entre dos codos nunca se invierte ni se acorta de más.
- **S6.** Cables que no forman codo (extremos libres, uniones, empalmes) se pintan exactamente como hoy.
- **S7.** La función de geometría es pura y testeable sin DOM: recibe los segmentos y el radio, devuelve el camino por cable. Tests en `app/test/`.

## Tasks

| ID | Tarea | Specs | Ruta | Commit |
|----|-------|-------|------|--------|
| T1 | Pase de pintado con redondeo de vértices, cableado al estilo moderno, con tests | S1-S7 | worker | sí |

## Log

- **L1.** «en modo moderno quiero que las esquinas de los cables tengan un rounded md»
- **L2.** Se probó primero `stroke-linejoin: round` sólo con CSS: se aplica, pero el radio máximo es la mitad del ancho del trazo (0,17 u), imperceptible. El usuario no veía el cambio.
- **L3.** Restricción del usuario: «quiero que sea un cambio solo de ui, que no cambie nada de los cables, ya que quiero 100% compatibilidad con cadesimu».
- **L4.** El usuario eligió el redondeo de pintado. El modelo de cables es de un segmento por registro, así que el codo se resuelve por adyacencia en render.

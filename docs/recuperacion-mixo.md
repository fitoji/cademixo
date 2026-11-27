# Recuperación de proyectos `.mixo`

Fase 2 de [docs/plan-guardado-seguro-mixo.md](plan-guardado-seguro-mixo.md).
La recuperación vive **fuera del archivo candidato**: una copia no puede reparar
ni reescribir el original sin intervención del usuario.

## Destinos y garantías

| Destino | Garantía | Generación previa | Persistencia |
| --- | --- | --- | --- |
| Archivo con handle | Escritura verificada: se conserva la generación anterior, se escribe, se espera `close` y se relee para comparar bytes | Sí | En el archivo del usuario |
| Descarga | Bytes validados antes de entregarlos al navegador; se informa «descarga iniciada», nunca «guardado» | No | Depende del usuario |
| Copia de recuperación | Descarga aparte; nunca repara el archivo original | No | Hasta que se borren los datos del sitio |

`app/src/ui/storage-contract.ts` expone estas garantías como datos, para que la
interfaz no confunda una descarga iniciada con una escritura confirmada.

## Cómo funciona

Antes de reemplazar un archivo con handle, el adaptador:

1. lee el contenido actual y comprueba que sea un `.cad`/`.mixo` válido;
2. guarda esa generación en IndexedDB, identificada por proyecto y revisión;
3. escribe la candidata y espera el cierre del `WritableStream`;
4. vuelve a leer el archivo y compara los bytes; un fallo de cierre o de
   relectura **no** es guardado;
5. sólo después de verificar la sucesora poda las copias que exceden el mínimo
   (`keepLatestGenerations`, por defecto 3).

Si no se puede leer el archivo actual, no es una generación válida o no hay
espacio/permiso para conservarla, **no se sobreescribe**: se avisa y se ofrece
«Guardar como…» con otro destino.

## Ver copias

`Archivo → Recuperar versión…` lista las generaciones del proyecto actual con
su revisión, fecha y tamaño. Cada fila permite:

- **Descargar copia**: baja la revisión como `.cad` nuevo; el archivo abierto no
  se toca.
- **Borrar**: elimina esa copia del navegador.

Si al abrir un proyecto el sidecar de atajos es inválido, la apertura se
rechaza sin reemplazar el documento; el aviso ofrece recuperar el dibujo como
copia y, si hay generaciones guardadas, acceder a «Ver copias».

## Límites

- Las copias viven en el perfil del navegador: se pierden al borrar datos del
  sitio, al cambiar de navegador o por cuota. No sustituyen un respaldo en disco.
- Fase 1 no agregó copias previas ni transacciones atómicas; las pruebas de
  fallo de `write`/`close` son simuladas. Esto **no** declara resistencia a
  cortes de energía.
- No hay escritorio Rust en este repositorio, así que el protocolo de
  escritura temporal + `fsync` + reemplazo atómico queda especificado pero sin
  implementar ni probar en plataforma alguna.
- Una suma o verificación de bytes prueba integridad del contenedor, no que el
  editor haya incluido todos los componentes del esquema.

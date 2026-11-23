# Atajos por componente y persistencia en `.cad`

Objetivo: asignar una combinación de teclas a un componente desde Propiedades y accionarlo durante la simulación (por ejemplo, abrir y cerrar un automático), guardando la asociación dentro del `.cad` sin romper la compatibilidad con CADe_SIMU.

Rama: `main`. Runner: `pnpm test` / `pnpm exec tsc --noEmit` desde `app/`.

## Specs

- **S1.** El usuario quiere poder asignar atajos desde el menú de propiedades: «me gustaria tener la posibilidad de asignar a los componentes desde el menu de propiedades, para que cuando estamos en modo simulacion al presionar el atajo active ese componente, por ejemplo un automatico y entonces poder abrirlo y cerrarlo».
- **S2.** La persistencia tiene que vivir en el `.cad` sin romper CADe: «como podriamos guardar esa info en un archivo .cad sin romper compatibilidad con cadesimu y poder abrir un archivo que tenga componentes con atajos en cadesimu tambien».
- **S3.** La asociación se guarda por **designador** (`apparatusKey`), no por id de registro: CADe agrupa las piezas que comparten designador y el id puede cambiar al re-guardar. Un componente sin designador usa `#id:<id>`.
- **S4.** **Gate de compatibilidad:** no se escribe metadata en archivos del usuario hasta verificar en CADe_SIMU (Windows) que el archivo abre, se guarda y el registro de atajos sobrevive. Si CADe lo descarta, el plan B es un sidecar `.cad.keys.json` y el `.cad` queda intacto.
- **S5.** El codec de metadata es puro y conserva el round-trip byte a byte: sin metadata el texto es idéntico al original; con metadata, sólo se agrega/reemplaza el registro propio y ningún otro byte cambia.
- **S6.** Payload ASCII, versionado y sin los delimitadores `*`/`#`: `{version:1,bindings:{"-Q1":"mod+q"}}` codificado en base64url. Un payload roto se ignora sin lanzar.
- **S7.** El atajo se registra sólo para componentes accionables y sólo corre con la simulación activa. Reutiliza la semántica existente de `App.tsx` (`isPushable`, `isMomentary`, `isChangeover`, `isProtectionCode`) sin inventar estados nuevos.
- **S8.** `Escape` y `Espacio` quedan reservados; la combinación de componente no puede repetirse entre componentes ni contra los atajos globales.
- **S9.** El registro de atajos usa `id = max(id) + 1` para respetar la invariante de ids crecientes del parser y un código que CADe no usa (`99999`).

## Tasks

| ID | Tarea | Specs | Ruta | Estado |
|----|-------|-------|------|--------|
| T1 | Codec `format/cade-shortcuts.ts` + tests de round-trip y modelo | S5, S6, S9 | inline | DONE |
| T2 | Generador del spike + archivo `.cad` de prueba + instrucciones | S2, S4 | inline | DONE |
| T3 | Verificar en CADe_SIMU Windows: abrir, guardar, comparar bytes | S4 | usuario | DONE (negativo) |
| T4 | Store de atajos por componente + campo en Inspector | S1, S3, S8 | inline | DONE (plan B) |
| T5 | Activación en simulación reutilizando la lógica de clic | S7 | inline | DONE |
| T6 | e2e asignar → simular → presionar → abrir/cerrar | S1, S7 | inline | DONE |

## Log

- **L1.** «me gustaria tener la posibilidad de asignar a los componentes desde el menu de propiedades, para que cuando estamos en modo simulacion al presionar el atajo active ese componente, por ejemplo un automatico y entonces poder abrirlo y cerrarlo».
- **L2.** «ahora no se como seria el tema de guardar la informacion de atajos de los componentes, supongo que seria una propiedad custom de algunos componentes, como el nombre de designador y nombres de conexiones, el tema seria que a ser una feature custom que no esta disponible en cadesimu, como podriamos guardar esa info en un archivo .cad sin romper compatibilidad con cadesimu y poder abrir un archivo que tenga componentes con atajos en cadesimu tambien».
- **L3.** «dale, deja todo preparado , guarda engram , prepara el plan y los archivos y luego commit y push y lo pruebo en windows con cadesimu».
- **L4.** Evidencia: `serializeWith` escribe todos los `raw` y `parse` preserva registros de códigos desconocidos; `roundTrips` puede seguir dando `true` con el registro extra. El trailer del archivo es un bloque de título de ancho fijo (`$$$…&&&*…***$$$&&&`): no se toca.
- **L5.** Incógnita que decide el diseño: si CADe_SIMU conserva el registro `99999` al abrir y guardar. Se prepara el spike T2 para responderlo antes de escribir metadata en archivos del usuario.
- **L6.** T3 ejecutado en Windows 2026-11-23: `atajos-cadesimu.cad` abre sin error y se ve igual que el control, pero `Archivo → Guardar como` produce `atajos-cadesimu-guardado.cad` con `SIMKEYS1:` **ausente** (31 registros contra 32; CADe renumera ids, maxId 30 contra 57). El `.cad` queda intacto: se adopta el plan B, sidecar `.cad.keys.json`. El codec `cade-shortcuts.ts` queda como experimento documentado y no se usa en archivos del usuario.
- **L7.** T4-T6 implementados sobre el sidecar: `ui/component-shortcuts.ts` guarda los bindings en `localStorage` claveado por nombre de archivo, con formato serializable a `<archivo>.keys.json` (exportación implementada; importación desde archivo aún sin UI) y validación contra atajos globales y entre componentes. La activación reutiliza `activateRecord` (mismo camino que el mouse) y el e2e cubre asignar → simular → presionar → `closed` → `tripped`. Desviación: en el navegador no se puede leer/escribir un archivo hermano sin otro handle, así que el sidecar se persiste en storage y se exporta/importa como JSON; el `.cad` nunca se modifica.

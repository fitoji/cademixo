# Sonidos

Catálogo de sonidos disponibles y mapa de qué acción suena con qué.

Motor: **`cuelume@0.2.8`** (pineada exacta, sin `^`: los nombres de preset cambian
hasta 1.0), tema **`mech`**, volumen `0.6`, import diferido para que sus ~205 KB no
entren al bundle inicial.

- Tabla semántica: `app/src/ui/sound-cues.ts` → `CUES`.
- Emisión, desbloqueo y ajustes: `app/src/ui/sound.ts`.
- Preferencias: `app/src/ui/settings.ts` → `sonidosInterfaz`, `sonidosSimulacion`, `silenciado`.

## 1. Sonidos que tiene el repositorio

Los presets que trae `cuelume@0.2.8`. «En uso» dice si alguna acción los dispara hoy.

| Preset | Qué sugiere | En uso | Dónde |
| --- | --- | --- | --- |
| `open` | abrir, desplegar | **sí** | abrir un archivo · bobina que se desenergiza |
| `close` | cerrar, plegar | **sí** | bobina que se energiza · detener la simulación |
| `success` | operación cumplida | **sí** | guardar · guardar como · proyecto nuevo |
| `error` | algo falló | **sí** | los avisos de error |
| `warning` | atención, regla | **sí** | el rechazo en simulación · protección disparada |
| `toggle` | interruptor que cambia de estado | **sí** | llave, selector, interruptor, conmutador |
| `tap` | toque seco | **sí** | colocar componente · pulsador (aprieta y suelta) |
| `type` | tecleo | no | — |
| `select` | elegir en una lista | no | — |
| `navigate` | moverse entre secciones | no | — |
| `loading` | en curso | no | — |
| `ready` | listo para usar | **sí** | iniciar la simulación |
| `attention` | reclama la mirada | no | — |
| `count` | conteo, incremento | no | — |

Temas visuales del motor: `default`, `mech` (el que usa la app), `bubble`, `press`.

**Nombres heredados**, aceptados hasta la 1.0 pero a evitar en código nuevo:
`chime`, `sparkle`, `droplet`, `bloom`, `whisper`, `tick`, `press`, `release`,
`page`, `pulse`, `scan`, `arrival`.

> `press` / `release` aparecen en esa lista como *presets*, pero además son
> **métodos** del motor (`cuelume.press()` / `release()`). La app usa los métodos
> con el preset `tap`, no los presets heredados.

## 2. Acciones con sonido asignado

| Acción | Evento en `CUES` | Preset | Canal | Capa | Se dispara en |
| --- | --- | --- | --- | --- | --- |
| Abrir un archivo (selector, input o drop) | `abrir archivo` | `open` | interfaz | `play` | `openDocument` · `openDropped` |
| Guardar (escribe o descarga) | `guardar` | `success` | interfaz | `play` | `writeDocument` · `saveDocument` |
| Guardar como | `guardar como` | `success` | interfaz | `play` | `saveDocument('save-as')` |
| Proyecto nuevo | `proyecto nuevo` | `success` | interfaz | `play` | `newProject` |
| Cualquier aviso de error | `error` | `error` | interfaz | `play` | ramas de error del camino de archivo y validación |
| «detené la simulación para editar el circuito» | `rechazo` | `warning` | interfaz | `play` | guarda de edición en simulación |
| Accionar llave, selector, interruptor, conmutador | `accionar` | `toggle` | interfaz | `play` | handlers de mando en simulación |
| Apretar un pulsador momentáneo | `pulsador aprieta` | `tap` | interfaz | `press` | `strikeMomentary` |
| Soltar ese pulsador | `pulsador suelta` | `tap` | interfaz | `release` | fin del pulso de `strikeMomentary` |
| Colocar un componente | `colocar` | `tap` | interfaz | `play` | `onPlace` (rama `addComponent`) |
| Iniciar la simulación | `simulación inicia` | `ready` | interfaz | `play` | `toggleSimulation`, rama de arranque |
| Detener la simulación | `simulación detiene` | `close` | interfaz | `play` | `toggleSimulation`, rama de parada |
| Una bobina se energiza | `bobina energizada` | `close` | simulación | `play` | efecto de `lastEnergized`, por flanco |
| Una bobina se desenergiza | `bobina desenergizada` | `open` | simulación | `play` | efecto de `lastEnergized`, por flanco |
| Una protección dispara | `protección disparada` | `warning` | simulación | `play` | efecto de `lastEnergized`, por flanco |

## Los que no suenan, a propósito

`SILENT_EVENTS` en `sound-cues.ts`: seleccionar, deseleccionar, hover, snap,
paneo, zoom, marquesina, deshacer, rehacer, copiar y **el commit de cada cable**.

No es una lista de pendientes: es el contrato. Dibujar un esquema son decenas de
cables y una selección puede ocurrir veinte veces por minuto; un cue en cada una
no es feedback, es ruido. Los eventos sin cue tampoco se pueden agregar por
descuido: `SoundEvent` sale de las claves de `CUES`, así que un nombre nuevo en la
tabla es lo único que compila.

## Zumbido del motor (continuo)

No es un cue y **no viene de `cuelume`**: esa biblioteca no tiene loop ni
`stop` —su API pública es `play`, `press`, `release`, `setEnabled`,
`setTheme`, `setVolume`, `unlock`, `bind`, y todos sus presets son golpes con
decaimiento; el que más se le parece, `loading`, «fades within about a
second»—. Así que se **sintetiza con WebAudio** en `app/src/ui/motor-hum.ts`.

| | |
| --- | --- |
| Fuente | seis voces: 50 y 50,6 Hz (fundamental y batido), 100, 150, 151 y 300 Hz |
| Por qué tantas | un parlante de notebook no reproduce por debajo de ~150 Hz: con sólo 50/100 Hz el zumbido existe en el grafo y no se oye. Los parciales son además el timbre real de un motor, no un truco |
| Pasabajos | 1200 Hz, para que los parciales sobrevivan |
| Ganancia | 0,22 al nivel máximo; el pico teórico de las voces queda en ~0,41, con margen contra el recorte |
| Envolvente | ataque 250 ms, relajación 200 ms |
| Cantidad | **un solo** zumbido para todos los motores; el nivel sale de cuántos están energizados y tiene techo a los 3 |
| Disparo | por transición, nunca por tick: es un estado, no un evento |
| Coalescencia | no pasa por el coalescer de cues |
| Contexto | propio `AudioContext`, creado o reanudado dentro de un gesto |

**Cinco cortes** (`humLevel`, puro y testeado): sin motores energizados,
simulación detenida, mute maestro, «Sonido del motor» apagado, y pestaña oculta
(`visibilitychange`: baja a 0 al ocultarse y se restaura al volver).

Es el sonido más invasivo que puede tener la app, así que va con interruptor
propio y **encendido por defecto**, y nunca es la única señal: el motor ya se ve
girando. Los tres osciladores quedan andando con ganancia 0 en vez de arrancar y
frenar en cada flanco, que haría clic.

## Controles

| Control | Dónde | Qué hace |
| --- | --- | --- |
| 🔊 «Silenciar» / «Activar sonido» | barra, al lado de **Simular** | mute **maestro**: corta todo sin tocar las preferencias de canal |
| «Sonidos de interfaz» | Configuración → Sonidos | activa el canal `interfaz` (por defecto **sí**) |
| «Sonidos de simulación» | Configuración → Sonidos | activa el canal `simulacion` (por defecto **sí**) |
| «Sonido del motor» | Configuración → Sonidos | el zumbido continuo del motor (por defecto **sí**) |

Los tres canales suenan de entrada, en moderno y en clásico: los defaults son
uno solo, compartido por los dos estilos. Silenciar sigue siendo del usuario —
el mute maestro arranca apagado y cada interruptor conserva su preferencia.
Silenciar corta en `cue()` **antes** del coalescer, así que no consume turnos ni
despierta el `AudioContext`.

Arrancar y detener van por el canal **interfaz**, no por el de simulación: son
gestos del usuario sobre el modo de la app, así que suenan aunque «Sonidos de
simulación» esté apagado. Detener reusa `close` (el mismo gesto sonoro de «se
apaga») y arrancar usa `ready`, que no lo usaba ninguna otra acción.

## Reglas de emisión

- **Coalescencia**: mínimo 50 ms entre cues del mismo canal (`MIN_GAP_MS`). Como
  el canal de simulación es uno solo, esa ventana es además el tope total: dos
  bobinas que se energizan en el mismo paso son un único cue. La simulación corre
  a 10 fps y puede cerrar muchos contactos a la vez.
- **Flancos, no frames**: `visualStates` se reconstruye cada 100 ms aunque nada
  cambie, así que la simulación se compara contra el frame anterior.
- **Desbloqueo**: el navegador bloquea audio hasta el primer gesto, y `unlock()`
  sólo vale dentro de un gesto. Se desbloquea en el primer `pointerdown`/`keydown`
  y al apretar Simular.
- **Descarte deliberado**: si llega un cue antes de que resuelva el import
  diferido, se descarta en lugar de encolarse. Encolarlo dispararía una ráfaga
  juntas al despertar el `AudioContext`. El primer cue puede quedar mudo.
- **Sin `prefers-reduced-motion`**: `cuelume` no lo respeta. El respeto por quien
  no quiere sonido es el mute maestro, persistido.

## Cómo agregar un sonido

1. Sumá la entrada a `CUES` en `app/src/ui/sound-cues.ts`, con su preset, canal y
   capa. Un evento sin entrada no compila.
2. Llamá `cue('<evento>')` en el punto donde la acción se consuma —después de que
   la operación tenga éxito, no cuando se pide—. Si el cue viaja junto a un
   aviso de los que ya usan `flash`, alcanza con `flash(mensaje, '<evento>')`: el
   segundo parámetro es el cue, y así lo emiten hoy los errores, el rechazo, el
   proyecto nuevo y el guardado como.
3. Si el evento es de simulación, disparalo por flanco contra el frame anterior.
4. `cd app && npx tsc --noEmit && npm test`: los tests de `sound-cues` fijan la
   tabla y el silencio.

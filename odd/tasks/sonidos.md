# Sonidos de interfaz y de simulación

Primera capa de audio de la app. La propuesta salió de una auditoría read-only de
los puntos de interacción y del catálogo real de `cuelume` (0.2.8).

## Specs

- **S1** — «aplica sonidos a tu propuesta en interfaz y simulacion»
- **S2** — «Tema mech»

Decisiones derivadas de la propuesta aceptada (no son del usuario, son el
contrato que hace verificable S1):

- **S3 — Suena (interfaz).** `abrir archivo` (selector y drop) → `open`;
  `guardar`, `guardar como`, `proyecto nuevo` → `success`; los errores del
  camino de archivo y de validación → `error`; el rechazo «detené la simulación
  para editar el circuito» → `warning`; llave/selector/interruptor accionado en
  simulación → `toggle`; pulsador momentáneo → `press` al apretar y `release` al
  soltar; colocar componente → `tap`.
- **S4 — No suena.** Selección, deselección, hover, snap, paneo, zoom,
  marquesina, deshacer, rehacer, copiar, y **el commit de cada cable**. Tampoco
  suena ningún re-render autónomo por sí mismo.
- **S5 — Simulación por flancos.** Sólo transiciones: bobina que se energiza,
  bobina que se desenergiza y protección que dispara. Se detectan comparando
  contra el frame anterior, nunca por re-render.
- **S6 — Coalescencia.** `cuelume` no trae throttle general. Mínimo 50 ms entre
  cues de la misma clase, y un tope de un cue de simulación cada 50 ms en total.
  Coalescer es lógica pura y se testea.
- **S7 — Dos interruptores.** «Sonidos de interfaz» (por defecto **sí**) y
  «Sonidos de simulación» (por defecto **no**), en Configuración, persistidos en
  el store de ajustes existente. La ley de oro dice que CADe_SIMU es mudo: la
  desviación se elige, no se impone.
- **S8 — Versión y desbloqueo.** `cuelume` va pineada a `0.2.8` exacta (sin
  `^`): los nombres de preset cambian hasta 1.0. La importación es diferida,
  para que los ~205 KB no entren al bundle inicial. `unlock()` se llama dentro
  del primer gesto real (pointerdown o keydown), porque fuera de un gesto
  resuelve `false` y deja el audio mudo.
- **S9 — Mute maestro en la barra.** Al lado del botón «Simular» hay un botón de
  altavoz que activa o desactiva **todo** el sonido. Es un mute maestro, no un
  tercer canal: cuando está silenciado no suena nada, y los dos interruptores de
  Configuración conservan su preferencia y vuelven a valer al reactivar. Se
  persiste con los demás ajustes y se anuncia con `aria-pressed` y una etiqueta
  que diga la acción («Silenciar» / «Activar sonido»), no sólo el icono.
- **S10 — Zumbido continuo del motor.** `cuelume` no tiene sonidos continuos
  (API: `play`, `press`, `release`, `setEnabled`, `setTheme`, `setVolume`,
  `unlock`, `bind`; todos los presets son golpes con decaimiento, y `loading`
  «fades within about a second»), así que se **sintetiza con WebAudio**: sin
  dependencia nueva y sin archivo de audio. Un **solo** zumbido compartido, no
  uno por motor: la amplitud sube con la cantidad de motores energizados y tiene
  techo. Se enciende y se apaga por **transición**, nunca por tick. Interruptor
  propio «Sonido del motor», apagado por defecto. Nunca es la única señal: el
  motor ya se ve girando. El `AudioContext` es propio —cuelume no expone el
  suyo— y se crea o reanuda dentro de un gesto.

## Tasks

- T1 — Instalar `cuelume@0.2.8` exacta con pnpm. Spec S8. Parent. commit: —
- T2 — Módulo de sonido: import diferido, tema `mech`, `unlock` en el primer gesto, mapa de cues y coalescencia pura. Specs S3-S8. Writer. commit: —
- T3 — Dos interruptores en Configuración, persistidos en `simuelectro:ajustes`. Spec S7. Writer. commit: —
- T4 — Cues de interfaz en los puntos de S3. Specs S3-S4. Writer. commit: —
- T5 — Cues de simulación por flancos con coalescencia. Specs S5-S6. Writer. commit: —
- T6 — Botón de altavoz al lado de «Simular»: mute maestro persistido. Spec S9. Writer. commit: —
- T7 — Cues de iniciar y detener la simulación. Spec S3. Inline. commit: —
- T8 — Zumbido continuo del motor sintetizado, con interruptor propio. Spec S10. Writer. commit: —

## Log

- L1 — «hay alguna skill para hacer auditoria y proponer sonidos a la app? me
  imagino que al hacer click en los interruptores estaria bueno un sonido,
  tambien al abrir un documento, etc»
- L2 — Auditoría read-only: 31 eventos inventariados con `path:line`; 16
  mensajes distintos de `flash` (5 confirmaciones, 1 rechazo, 10 errores);
  `visualStates` se reconstruye cada 100 ms aunque nada cambie, así que la
  simulación necesita detección por flancos y no por frame.
- L3 — `cuelume` 0.2.8: MIT, ESM, cero dependencias runtime, presets con nombre
  (`tap`, `type`, `select`, `toggle`, `open`, `close`, `success`, `error`,
  `navigate`, `warning`, `loading`, `ready`, `attention`, `count`), temas
  `default`, `mech`, `bubble`, `press`. **No** respeta `prefers-reduced-motion`,
  así que el mute es nuestro. Bug abierto #22: cues pedidos mientras el
  `AudioContext` despierta suenan todos juntos y más fuerte — se mitiga
  desbloqueando temprano.
- L4 — El usuario elige implementar interfaz y simulación, con tema `mech`.
- L5 — El audio en sí no es verificable por automatización: lo que se verifica
  es que el cue se emita, que respete los interruptores y que no haya errores de
  consola. Que suene bien lo juzga el usuario.
- L6 — «cuando termines agrega al lado del icono de simular un icono de un
  speaker y que este boton active o desactive sonido». Es un cambio de
  requisito: agrega S9 y T6, y no reabre S7 (los dos interruptores de
  Configuración siguen siendo la preferencia por canal).
- L7 — T2 a T5 entregados: `sound-cues.ts` puro (13 eventos, `SoundEvent =
  keyof CUES` para que un evento mudo no compile, `Coalescer` de 50 ms con reloj
  inyectado), `sound.ts` con import diferido y `unlock` en el primer gesto, los
  dos campos en `Settings`, y los flancos de bobina y protección en el efecto de
  `lastEnergized`. 547/547 con `tsc` limpio. Costo encontrado: `test/settings.ts`
  afirma la forma exacta de `Settings`, así que cada campo nuevo obliga a
  actualizarlo — se acepta a cambio de que un campo sin default no pase
  inadvertido.
- L8 — «agrega un sonido cuando hago play a simulacion y stop». Agrega
  `simulación inicia` → `ready` y `simulación detiene` → `close`, ambos en el
  canal **interfaz**: son gestos sobre el modo de la app y tienen que sonar
  aunque «Sonidos de simulación» esté apagado, que es el default.
- L9 — «hay algun sonido continuo para poner al motor cuando se activa?».
  Respuesta verificada contra el paquete instalado: **no**, cuelume no expone
  loop ni stop. El usuario elige construirlo con interruptor propio, apagado por
  defecto.
- L10 — Los cinco cortes del zumbido: sin motores energizados, simulación
  detenida, mute maestro, «Sonido del motor» apagado y pestaña oculta (los
  navegadores suspenden audio en segundo plano, así que hay que manejar
  `visibilitychange` o queda sonando colgado).

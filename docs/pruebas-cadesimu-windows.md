# Qué hacer en Windows con CADe_SIMU

Checklist para correr las pruebas que dejaron abierta la pregunta del vínculo
entre un contacto auxiliar y su aparato. El inventario completo de pares está en
[`pruebas-contactos-auxiliares-cadesimu.md`](pruebas-contactos-auxiliares-cadesimu.md).

**Para qué**: hoy la app da por sentado que CADe empareja un `8018` con la
protección que comparte su designador, y que ese vínculo manda. Eso no está
verificado contra el programa. Con estos cinco resultados se cierra.

## 0. Preparación (5 minutos)

1. Copiar a la máquina Windows estos archivos del repo:

   | Archivo en el repo | Para qué sirve |
   | --- | --- |
   | `app/test_simu/PR1_Rodolfo_Giusti_03.cad` | prueba A, B y C |
   | `app/test_simu/PR2_Rodolfo_Giusti_vfinal.cad` | repetición de A con otro plano |
   | `app/test/fixtures/ej0def.cad` | tercer par `8018` + automático |
   | `docs/03/componentes02.cad` | prueba D (designador ambiguo) |
   | `app/test/fixtures/inversion-giro-cej.cade` | prueba E (contactos de contactor) |

2. Tener a mano un editor que respete **Latin-1** (Notepad++ sirve; el Bloc de
   notas también, pero guardá sin cambiar la codificación).

3. Para cada prueba, trabajar sobre una **copia** con nombre claro:
   `A-pr1.cad`, `B-pr1-renombrado.cad`, etc. El original no se toca.

4. Abrir CADe_SIMU, `Archivo → Abrir`, y entrar en **Simulación** antes de
   accionar nada.

## Reglas de edición del archivo (sólo prueba B)

- El designador es texto plano entre `#`. Se cambia **sólo eso**.
- **No** tocar los `id`, los bornes, la geometría ni los números del final.
- Guardar con el mismo nombre nuevo y la misma codificación.

Ejemplo, en el PR1: buscar `*2*8018#Q1#` y dejarlo `*2*8018#QX#`.

## A. Línea de base — ¿el aparato manda al auxiliar?

Archivo: `PR1_Rodolfo_Giusti_03.cad`

1. Simulación activa, nada accionado: anotar cómo están las lámparas H1 y H2.
2. Clic **sólo** en el **Q1 de potencia**, el de la derecha (código `6009`, `id 32`).
3. Mirar el **Q1 del mando**, arriba a la izquierda (código `8018`, `id 2`, bornes 95/97/96/98).

Anotar: ¿el conmutador cambió de posición? ¿se encendió H1 en vez de H2?

- **Si sigue al disyuntor** → el vínculo automático existe. Seguir con B.
- **Si no lo sigue** → el automatismo no existe y la app lo está inventando.

Repetir lo mismo con `PR2_Rodolfo_Giusti_vfinal.cad` (el `8018` es `id 2` y el
disyuntor `id 23`): un segundo plano con el mismo par da peso al resultado.

## B. ¿El emparejamiento es por el texto del designador?

1. Copiar el PR1 como `B-pr1-renombrado.cad`.
2. Cambiar `*2*8018#Q1#` por `*2*8018#QX#`. Nada más.
3. Abrir la copia en CADe y accionar el **Q1 de potencia** (que sigue llamándose `Q1`).

- **Si el conmutador del mando ya no lo sigue** → el emparejamiento es el texto
  del designador. La app está bien modelada.
- **Si lo sigue igual** → el vínculo vive en otro lado (no en el nombre) y hay
  que buscarlo; decime y lo investigamos con el archivo resultante.

## C. ¿El auxiliar responde al mouse?

Archivo: `PR1_Rodolfo_Giusti_03.cad`, sin cambios.

1. Simulación activa.
2. Clic **sólo** sobre el Q1 del mando (`8018`, arriba a la izquierda).

Anotar las tres cosas: ¿cambia el conmutador? ¿cambia el Q1 de potencia? ¿cambia
alguna lámpara?

- **No pasa nada** → no es accionable, y la app está bien.
- **Cambia sólo el conmutador** → CADe sí lo deja permutar a mano: hay que
  reabrir la decisión de cómo se comporta el clic en la app.
- **Cambian los dos** → el vínculo es bidireccional.

## D. Designador ambiguo

Archivo: `docs/03/componentes02.cad`. Tiene **catorce** dispositivos con `-F`,
entre ellos el `8018` (`id 25`) y cuatro automáticos.

1. Simulación activa.
2. Accionar **una** de las protecciones `-F`.
3. Ver si el `8018` reacciona y, si reacciona, a cuál de ellas parece seguir.

Es el caso que hoy rompe el modelo: la app toma el primer aparato que encuentra
con ese designador, sin avisar de la ambigüedad.

## E. Contactos auxiliares de un contactor

Archivo: `inversion-giro-cej.cade`, designador `-KM2`: conviven un contactor
`2001`, una bobina `9000` y dos auxiliares (`7000` NA y `7001` NC).

1. Energizar la bobina `-KM2` (accionando lo que corresponda en ese circuito).
2. Ver si el `7000` cierra y el `7001` abre, y si hay retardo apreciable.

Esto no depende de la app: sirve para saber si los auxiliares de contactor se
comportan como los estamos modelando (siguen a la bobina, sin retardo).

## Resultados

Copiar esta tabla y completarla; con eso alcanza, no hace falta explicar nada más.

| Prueba | Archivo | Qué accioné | Qué pasó | Veredicto |
| --- | --- | --- | --- | --- |
| A | PR1 | Q1 de potencia | El `8018` pasó de 95-96 cerrado a 97-98 cerrado y se pintó de rojo junto al disyuntor. H1/H2 no cambiaron (S0 abierto) | Sí: el auxiliar sigue al disyuntor |
| A2 | PR2 vfinal | Q1 de potencia | Idéntico a A: 95-96 → 97-98, todo en rojo | Sí, confirmado en un segundo plano |
| B | PR1 con el 8018 en `QX` | Q1 de potencia | El disyuntor cerró y se pintó de rojo, pero `QX` quedó gris e inmóvil en 95-96 | El emparejamiento es por texto de designador |
| C | PR1 | Q1 del mando | No pasó nada: ni el conmutador, ni el disyuntor, ni las lámparas (revalidado en 4 puntos del símbolo) | No es accionable por mouse. **La app sí lo acciona**: corrección pendiente |
| D | componentes02 | automático `-F` (fila inferior) | El `8018` reaccionó; hay 14 dispositivos `-F` y varios auxiliares reaccionan a la vez | Regla resuelta por la serie F: CADe agrupa **todos** los `-F` en un aparato |
| E | inversion-giro-cej | bobina `-KM2` | En el archivo original no se pudo (S0 momentáneo). Con la variante `H1` se energizó el circuito y el auxiliar NC de `-KM2` abrió | Parcial: NC confirmado, NA pendiente (ver serie H) |

Si algo no se puede hacer (por ejemplo, el `8018` no se deja seleccionar),
anotarlo tal cual: también es un resultado.

## Qué decide cada prueba

| Resultado | Consecuencia en la app |
| --- | --- |
| A dice que sí y B dice que sí | el modelo actual es correcto: asociado por nombre |
| A dice que no | hay que sacar el automatismo (`sim/apparatus.ts`) |
| B dice que no (sigue al aparato tras renombrar) | hay que encontrar el mecanismo real antes de tocar código |
| C dice que el auxiliar se permuta | hay que redefinir el clic sobre el `8018` |
| D muestra que sigue a una protección concreta | hay que definir qué hacer con designadores repetidos |

## Ejecución del 2026-11-22

Las pruebas A, A2, B, C y D se corrieron en la sesión interactiva de Windows
con automatización de GUI nativa (PowerShell + `.NET`, sin instalar nada):
`AppActivate` para enfocar CADe, `mouse_event` para los clics y
`CopyFromScreen` para las capturas. El veredicto de cada prueba se tomó
comparando capturas antes/después del accionamiento.

Detalle útil para repetirlas:

- Al abrir un archivo, CADe puede conservar el scroll anterior: ubicar el
  componente en el screenshot antes de clickear.
- Los pulsadores (`S0`, `S2`, ...) son **momentáneos**: cierran sólo mientras el
  mouse está apretado. Por eso la prueba E no se pudo completar con un solo
  puntero.
- Las capturas crudas quedaron en
  `C:\Users\fitoj\AppData\Local\Temp\opencode\cadesimu-pruebas\` (`A*.png`,
  `A2-*.png`, `B-*.png`, `C-*.png`, `D-*.png`, `E-*.png`).
- `B-pr1-renombrado.cad` se generó por reemplazo de bytes sobre una copia:
  1 solo byte distinto del original (`1` → `X`).

## Confirmación de las ambigüedades (2026-11-22, series F)

Para responder **cuál** de varios aparatos con el mismo designador manda, se
generaron copias byte-exactas de `app/test/fixtures/ej0def.cad` (que trae un
par limpio `6001 -F` + `8018 -F`):

| Variante | Designadores | qué se probó |
| --- | --- | --- |
| `F0-ej0def.cad` | `6001 -F`, `8018 -F`, `6009 Q1` | línea de base 1:1 |
| `F1-dos-F.cad` | `6001 -F`, `6009 -F`, `8018 -F` | dos protecciones con el mismo designador |
| `F2-solo-6009-F.cad` | `6001 -Z`, `6009 -F`, `8018 -F` | se mueve el `-F` a otro código |

Resultados (capturas `F0-*`, `F1-*`, `F2-*` en la carpeta temporal):

- **F0**: cerrar `6001 (-F)` conmuta el `8018 (-F)` a 97-98. El par 1:1 funciona.
- **F1**: al cerrar `6001`, **también se cerró `6009`**, que estaba abierto y
  gris. Al volver a abrir `6009`, **también se abrieron `6001` y el `8018`**.
  Los tres dispositivos `-F` comparten un único estado.
- **F2**: con `6001` renombrado a `-Z`, cerrar `6009 (-F)` conmuta el `8018 (-F)`
  y deja el `6001 (-Z)` intacto. La regla es puramente el texto del designador,
  sin importar el código ni el orden en el archivo.

**Conclusión**: CADe no elige "el primero" ni "el más cercano": agrupa **todos**
los componentes con el mismo designador en un único aparato lógico y los
acciona juntos.

### Impacto en la app

`app/src/sim/apparatus.ts:29` (`linkedProtection`) usa `records.find(...)`, es
decir, se queda con la **primera** protección que coincide. Eso reproduce el
caso 1:1 pero no el grupo:

- `changeoverPositions` lee `protectionStates[protection.id]` de un solo id.
- `App.tsx:954-963` guarda el estado sólo bajo `id` del componente clickeado.
- Para igualar a CADe, el estado y el accionamiento deberían ir por
  `partKey(designator)` y propagarse a todos los registros del grupo.

Además, la prueba C se repitió con cuatro puntos distintos del símbolo `8018`
sin respuesta: CADe **no** lo acciona con el mouse. En cambio `App.tsx:936-948`
sí acciona la protección al hacer clic sobre el conmutador enlazado. Esa
diferencia quedó marcada como corrección pendiente (la conclusión anterior de
"la app está bien" era prematura).

### Serie G — normalización del designador

Mismo archivo base, cambiando **sólo** el designador del `8018` (`-F`) por:

| Variante | Designador del `8018` | ¿Conmutó al cerrar `6001 -F`? |
| --- | --- | --- |
| `G1-sin-guion.cad` | `F` | **No** (protección sí cerró) |
| `G2-minuscula.cad` | `-f` | **No** (protección sí cerró) |
| `G3-F1.cad` | `F1` | Inconclusa (no se logró accionar la protección) |
| `G4-espacio.cad` | ` F` | **No** (protección sí cerró) |

**Conclusión**: CADe compara el designador **literal**: distingue mayúsculas,
guion inicial y espacios. En cambio `partKey` (`app/src/sim/netlist.ts:72`)
hace `trim().toUpperCase().replace(/^[-\s]+/, '')`, o sea que la app agrupa
casos que CADe separa. Otra corrección pendiente.

### Serie H — destrabando la prueba E

`H1-latch-S0.cade` cambia únicamente el `S0` de `8001` (pulsador momentáneo) a
`8008` (interruptor con enclavamiento), conservando pines `11`/`12`. Con eso:

1. Cerrar el disyuntor principal `F1` es obligatorio: su auxiliar `97-98`
   alimenta toda la red de mando.
2. `S0` queda cerrado de forma estable (rojo).
3. Manteniendo `S2` (`8000`, momentáneo) se energiza el circuito: se ven rojos
   el auxiliar `97-98`, `S0`, `S2`, el motor y `EV1`. Al soltar `S2` el estado
   permanece (auto-mantenimiento por el contacto auxiliar en paralelo).
4. El contacto `-KM2` NC (`11`/`12`) pasó de cerrado a abierto en ese estado,
   coherente con un `7001` que sigue a la bobina.

La identificación del `7000` NA dentro de esta hoja sigue siendo dudosa (hay
varios contactos `13`/`14` con designadores parecidos), así que E queda
**parcialmente respondida**: el auxiliar NC sigue a la bobina, sin retardo
apreciable; falta confirmar el NA.

# Pruebas en CADe_SIMU: contactos auxiliares asociados

Qué queremos averiguar, porque hoy no está verificado y el repo no tiene el
binario de CADe (`docs/re/traspaso-windows.md:19-27`, vive en
`E:\FP SISTEMAS\CADe_SIMU V4\`):

1. **¿Cómo empareja CADe un contacto auxiliar con su aparato?** El formato no
   guarda el vínculo: son 10 textos + 23 números fijos
   (`docs/re/cadesimu-v4-rea.md:132-139`) y ningún número del `8018` contiene el
   id del aparato acompañante. La única coincidencia entre ambos es el **texto
   del designador**.
2. **¿El contacto auxiliar responde al mouse** en la simulación, o su posición la
   marca siempre el aparato?
3. **¿Qué pasa cuando varios aparatos comparten designador?** En
   `docs/03/componentes02.cad` hay ocho dispositivos con `-F`.

Lo que la app hace hoy (`app/src/sim/apparatus.ts`): el `8018` sigue a la
protección `6000`-`6999` que comparte su designador normalizado; su posición no se
acciona por separado y el clic sobre él acciona el aparato. Los contactos
`70xx` siguen a la bobina/contactor del mismo designador.

## Antes de empezar

- El `8018` **no está en la paleta de CADe** (`docs/componentes.md:14`): no se
  puede colocar uno nuevo. Sólo se puede probar sobre archivos que ya lo tengan,
  editando el designador con un editor de texto.
- Los archivos son **Latin-1** y el designador es texto plano: se cambia sin
  tocar nada más. `*<id>*<código>` es la cabecera del registro; el designador es
  el campo siguiente.
- No cambiar los `id`, ni los bornes, ni la geometría: sólo el designador del
  registro indicado.
- Para cada prueba: abrir el archivo en CADe, entrar en **Simulación**, accionar
  el aparato y mirar el contacto auxiliar.

## Inventario de pares que ya existen en el repo

Generado desde los archivos reales: cada bloque es un designador compartido por
dos o más componentes, con al menos un contacto auxiliar. Las coordenadas son
del archivo (unidades CADe), para ubicarlos en la hoja.

### `app/test/fixtures/arranque-paro-motor-3f.cad`

| Designador | id | Código | Componente | Familia | x, y | ¿auxiliar? |
| --- | --- | --- | --- | --- | --- | --- |
| `-KM1` | 0 | `2001` | Contactor III | otro | 30, 99 | no |
|  | 26 | `9000` | Bobina monoestable | bobina/borne | 162, 132 | no |
|  | 27 | `7000` | Contacto auxiliar NA | contacto auxiliar | 183, 108 | **sí** |

### `app/test/fixtures/ej0def.cad`

| Designador | id | Código | Componente | Familia | x, y | ¿auxiliar? |
| --- | --- | --- | --- | --- | --- | --- |
| `-F` | 41 | `6001` | Automático IN | protección | 123, 60 | no |
|  | 44 | `8018` | Conmutador de dos posiciones | mando | 102, 42 | **sí** |

### `app/test/fixtures/inversion-giro-cej.cade`

| Designador | id | Código | Componente | Familia | x, y | ¿auxiliar? |
| --- | --- | --- | --- | --- | --- | --- |
| `-KM1` | 5 | `2001` | Contactor III | otro | 39, 108 | no |
|  | 127 | `7001` | Contacto auxiliar NC | contacto auxiliar | 210, 153 | **sí** |
| `-KM2` | 6 | `2001` | Contactor III | otro | 78, 108 | no |
|  | 50 | `9000` | Bobina monoestable | bobina/borne | 210, 186 | no |
|  | 62 | `7000` | Contacto auxiliar NA | contacto auxiliar | 225, 120 | **sí** |
|  | 185 | `7001` | Contacto auxiliar NC | contacto auxiliar | 240, 168 | **sí** |

### `app/test/fixtures/inversion-giro-mini.cade`

| Designador | id | Código | Componente | Familia | x, y | ¿auxiliar? |
| --- | --- | --- | --- | --- | --- | --- |
| `-KM1` | 7 | `9000` | Bobina monoestable | bobina/borne | 90, 100 | no |
|  | 5 | `7000` | Contacto auxiliar NA | contacto auxiliar | 114, 66 | **sí** |
|  | 10 | `7001` | Contacto auxiliar NC | contacto auxiliar | 150, 84 | **sí** |
| `-KM2` | 11 | `9000` | Bobina monoestable | bobina/borne | 150, 100 | no |
|  | 6 | `7001` | Contacto auxiliar NC | contacto auxiliar | 90, 84 | **sí** |
|  | 9 | `7000` | Contacto auxiliar NA | contacto auxiliar | 174, 66 | **sí** |

### `app/test/fixtures/pr1-rodolfo-giusti-03.cad`

| Designador | id | Código | Componente | Familia | x, y | ¿auxiliar? |
| --- | --- | --- | --- | --- | --- | --- |
| `Q1` | 32 | `6009` | Disyuntor III | protección | 183, 102 | no |
|  | 2 | `8018` | Conmutador de dos posiciones | mando | 57, 78 | **sí** |

### `app/test/fixtures/pr1-rodolfo-giusti.cad`

| Designador | id | Código | Componente | Familia | x, y | ¿auxiliar? |
| --- | --- | --- | --- | --- | --- | --- |
| `Q1` | 47 | `6009` | Disyuntor III | protección | 171, 78 | no |
|  | 2 | `8018` | Conmutador de dos posiciones | mando | 45, 54 | **sí** |

### `app/test_simu/PR1_Rodolfo_Giusti_03.cad`

| Designador | id | Código | Componente | Familia | x, y | ¿auxiliar? |
| --- | --- | --- | --- | --- | --- | --- |
| `Q1` | 32 | `6009` | Disyuntor III | protección | 183, 102 | no |
|  | 2 | `8018` | Conmutador de dos posiciones | mando | 57, 78 | **sí** |

### `app/test_simu/PR2_Rodolfo_Giusti.cad`

| Designador | id | Código | Componente | Familia | x, y | ¿auxiliar? |
| --- | --- | --- | --- | --- | --- | --- |
| `K1M` | 7 | `9000` | Bobina monoestable | bobina/borne | 66, 162 | no |
|  | 12 | `2006` | Contactor I | otro | 81, 144 | no |
|  | 30 | `2001` | Contactor III | otro | 183, 132 | no |
|  | 105 | `7001` | Contacto auxiliar NC | contacto auxiliar | 99, 123 | **sí** |
| `K2M` | 67 | `2001` | Contactor III | otro | 216, 132 | no |
|  | 119 | `9000` | Bobina monoestable | bobina/borne | 99, 162 | no |
|  | 104 | `7001` | Contacto auxiliar NC | contacto auxiliar | 66, 123 | **sí** |
|  | 106 | `7000` | Contacto auxiliar NA | contacto auxiliar | 114, 144 | **sí** |
| `Q1` | 31 | `6009` | Disyuntor III | protección | 183, 78 | no |
|  | 2 | `8018` | Conmutador de dos posiciones | mando | 57, 78 | **sí** |

### `app/test_simu/PR2_Rodolfo_Giusti_v2.cad`

| Designador | id | Código | Componente | Familia | x, y | ¿auxiliar? |
| --- | --- | --- | --- | --- | --- | --- |
| `K1M` | 7 | `9000` | Bobina monoestable | bobina/borne | 66, 162 | no |
|  | 12 | `2006` | Contactor I | otro | 81, 144 | no |
|  | 30 | `2001` | Contactor III | otro | 183, 132 | no |
|  | 105 | `7001` | Contacto auxiliar NC | contacto auxiliar | 99, 123 | **sí** |
| `K2M` | 67 | `2001` | Contactor III | otro | 216, 132 | no |
|  | 119 | `9000` | Bobina monoestable | bobina/borne | 99, 162 | no |
|  | 104 | `7001` | Contacto auxiliar NC | contacto auxiliar | 66, 123 | **sí** |
|  | 106 | `7000` | Contacto auxiliar NA | contacto auxiliar | 114, 144 | **sí** |
| `Q1` | 31 | `6009` | Disyuntor III | protección | 183, 78 | no |
|  | 2 | `8018` | Conmutador de dos posiciones | mando | 57, 78 | **sí** |

### `app/test_simu/PR2_Rodolfo_Giusti_vfinal.cad`

| Designador | id | Código | Componente | Familia | x, y | ¿auxiliar? |
| --- | --- | --- | --- | --- | --- | --- |
| `K1M` | 7 | `9000` | Bobina monoestable | bobina/borne | 66, 162 | no |
|  | 12 | `2006` | Contactor I | otro | 81, 144 | no |
|  | 22 | `2001` | Contactor III | otro | 183, 132 | no |
|  | 91 | `7001` | Contacto auxiliar NC | contacto auxiliar | 99, 123 | **sí** |
| `K2M` | 55 | `2001` | Contactor III | otro | 216, 132 | no |
|  | 105 | `9000` | Bobina monoestable | bobina/borne | 99, 162 | no |
|  | 90 | `7001` | Contacto auxiliar NC | contacto auxiliar | 66, 123 | **sí** |
|  | 92 | `7000` | Contacto auxiliar NA | contacto auxiliar | 114, 144 | **sí** |
| `Q1` | 23 | `6009` | Disyuntor III | protección | 183, 78 | no |
|  | 2 | `8018` | Conmutador de dos posiciones | mando | 57, 78 | **sí** |

### `docs/03/componentes02.cad`

| Designador | id | Código | Componente | Familia | x, y | ¿auxiliar? |
| --- | --- | --- | --- | --- | --- | --- |
| `-F` | 6 | `5000` | Fusible monofásico | otro | 15, 57 | no |
|  | 7 | `5001` | Fusible II | otro | 30, 54 | no |
|  | 8 | `5002` | Fusible II | otro | 54, 57 | no |
|  | 9 | `5003` | Fusible III | otro | 72, 57 | no |
|  | 10 | `5004` | (sin símbolo) | otro | 75, 42 | no |
|  | 11 | `6000` | Automático I | protección | 15, 78 | no |
|  | 12 | `6001` | Automático IN | protección | 33, 78 | no |
|  | 13 | `6002` | Automático II | protección | 54, 78 | no |
|  | 14 | `6003` | Automático III | protección | 75, 75 | no |
|  | 15 | `6005` | Diferencial IN | protección | 114, 30 | no |
|  | 16 | `6006` | Diferencial IIIN | protección | 114, 54 | no |
|  | 27 | `8016` | Lámpara de señalización | mando | 117, 111 | no |
|  | 25 | `8018` | Conmutador de dos posiciones | mando | 162, 108 | **sí** |
|  | 26 | `8017` | Contacto del térmico | mando | 138, 117 | **sí** |

### `docs/cadesimu-svg/reference/PR1_Rodolfo_Giusti_03.cad`

| Designador | id | Código | Componente | Familia | x, y | ¿auxiliar? |
| --- | --- | --- | --- | --- | --- | --- |
| `Q1` | 32 | `6009` | Disyuntor III | protección | 183, 102 | no |
|  | 2 | `8018` | Conmutador de dos posiciones | mando | 57, 78 | **sí** |

Total: 20 designadores compartidos en 12 archivos, de 33 archivos relevados.

## Pruebas

### A. Línea de base — ¿el aparato manda al auxiliar?

Archivo: `app/test_simu/PR1_Rodolfo_Giusti_03.cad` (el mismo del PR1).

1. Abrir y entrar en Simulación.
2. Accionar **sólo** el Q1 de potencia (el de la derecha, `id 32`, código `6009`).
3. Anotar si el Q1 del mando (`id 2`, código `8018`, arriba a la izquierda) cambia
   de posición y si enciende H1 en vez de H2.

Esperado si el vínculo es automático: sí. Las capturas 02 y 04 del repo ya
sugieren que sí (`_simu_play_02.png` cerrado → H1; `_simu_play_04.png` abierto → H2).

### B. ¿El emparejamiento es por nombre?

1. Copiar el PR1 a `pr1-designador-cambiado.cad`.
2. En el registro `*2*8018#Q1#` cambiar `Q1` por `QX` (queda `*2*8018#QX#`). Sólo eso.
3. Abrir la copia en CADe, Simulación, accionar el Q1 de potencia (sigue siendo `Q1`).

- Si el conmutador del mando **ya no** lo sigue → el emparejamiento es por texto
  de designador.
- Si **sigue** siguiéndolo → el vínculo está en otro lado y hay que buscarlo.

### C. ¿El auxiliar responde al mouse?

En el PR1 sin cambios, Simulación:

1. Clic **sólo** sobre el Q1 del mando (`8018`).
2. Anotar tres cosas: ¿cambia el conmutador? ¿cambia el Q1 de potencia? ¿cambia
   alguna lámpara?

Combinaciones posibles: (i) no pasa nada (no es accionable), (ii) cambia sólo el
conmutador, (iii) cambian los dos.

### D. Designador ambiguo

Archivo: `docs/03/componentes02.cad` — ocho dispositivos con `-F`, entre ellos un
`8018` (`id 25`) y protecciones `6000`-`6999`.

1. Abrir, Simulación, accionar **una** de las protecciones `-F`.
2. Anotar si el `8018` reacciona y, si reacciona, a cuál de ellas sigue.

Es el caso que hoy rompe el modelo de la app: `linkedProtection` toma el primer
aparato que encuentra con ese designador.

### E. Contactos de contactor (`70xx`)

Archivo: `app/test/fixtures/inversion-giro-cej.cade`, designador `-KM2`: conviven un
contactor `2001`, una bobina `9000` y dos contactos auxiliares (`7000`, `7001`).

1. Energizar la bobina `-KM2` (accionando lo que corresponda en el circuito).
2. Anotar si el `7000` (NA) cierra y el `7001` (NC) abre, y con qué retardo.

## Resultados

| Prueba | Archivo | Qué hice | Qué pasó | Conclusión |
| --- | --- | --- | --- | --- |
| A | PR1 | | | |
| B | PR1 con el 8018 renombrado a `QX` | | | |
| C | PR1 | | | |
| D | componentes02 | | | |
| E | inversion-giro-cej | | | |

Con A y C se decide si el `8018` se puede accionar a mano en CADe; con B, si el
vínculo es por designador; con D, qué hacer cuando el nombre es ambiguo.

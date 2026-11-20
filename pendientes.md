# Pendientes de captura

Qué componentes del catálogo **no tienen una captura de CADe_SIMU** contra la
cual calibrarlos, y qué falta en los que sí la tienen pero quedaron abiertos.
Generado el 2026-11-20 sobre `app/src/symbols/library.ts`.

## Cómo se calculó

Se cruzó el catálogo dibujable (227 códigos de `symbolList()` + `lineList()`)
contra los códigos de registro presentes en los planos que tienen captura:

| Plano | Captura | Códigos |
| --- | --- | --- |
| `docs/cadesimu-svg/reference/PR1_Rodolfo_Giusti_03.cad` | `PR1_Rodolfo_Giusti_03.png` | 28 |
| `docs/03/componentes01` (`*.cad` sin extensión; ojo: `componentes01.cad` es en realidad el PNG) | `componentes01.png` | 33 |
| `docs/03/componentes02.cad` | `componentes02.png` | 36 |
| `docs/02/pulsadores.cad` | `pulsadores.png` | 8 |

Unión: **49 códigos con captura**. Quedan **178 sin captura**.

Además hay **capturas por componente** sueltas en
`data/samples/components_png/`, que cubren los aparatos clásicos y no están
vinculadas a códigos por ningún índice:

```
bobina rele de contactor.png
disyuntor trifasico.png
fusible monofasico.png
interruptor automatico de proteccion contra cortocircuitos y sobrecargas.png
interruptor proteccion contra cortocircuitos monofasico.png
motor trifasico.png
pulsador nc.png
pulsador no.png
rele diferencial.png
rele termico.png
```

Si el componente que buscás está en esa lista, **no necesita captura nueva**:
necesita que se verifique su calibración contra ese PNG (varios ya lo están).

## 1. Sin captura en ningún plano (178)

Estos son los que hay que fotografiar en CADe_SIMU. Agrupados por familia para
poder pedirlos en tandas; el criterio es "no aparece en ninguno de los cuatro
planos con captura".

- **1xxx — motores y cargas (15):** 1001 1002 1003 1004 1005 1006 1007 1010
  1052 1053 1054 1055 1057 1058 1076
- **2xxx — contactores (3):** 2003 2004 2007
- **3xxx — borneras (8):** 3006 3007 3008 3009 3010 3012 3013 3014
- **4xxx — regletas (7):** 4011 4012 4013 4014 4015 4016 4019
- **5xxx — fusibles (4):** 5005 5006 5007 5008
- **6xxx — protecciones (8):** 6004 6007 6015 6016 6017 6018 6019 6020
- **7xxx — mando y aparamenta (100):** 7004 7005 7006 7007 7008 7009 7010 7011
  7012 7013 7014 7015 7016 7018 7019 7020 7021 · 7500-7517 · 7520-7537 ·
  7550-7564 · 7570-7582 7584-7595 · 7600-7605 · 7883
- **8xxx — señalización y pulsadores (12):** 8006 8007 8008 8009 8010 8011 8012
  8013 8100 8101 8102 8103
- **9xxx — bobinas y lámparas (9):** 9003 9004 9005 9006 9007 9010 9011 9012
  9013
- **10xxx — varios (12):** 10050 10051 10500 10502 10503 10504 10505 10506 10507
  10508 10509 10550

> Los 75xx y los 10xxx son familias grandes: conviene pedirlas como **una captura
> de plano con el grupo entero** (como se hizo con `pulsadores.png`), no una por
> componente.

## 2. Sin ninguna referencia conocida (1)

| Código | Qué es | Por qué falta |
| --- | --- | --- |
| 9004 | Temporizador a la conexión | No está en `componentes01`, ni en `componentes02`, ni en PR1, y no tiene PNG propio. Sus bornes además vinieron heredados del def de bobina, así que ni la posición de los terminales se puede verificar. |

## 3. Con captura, pero bloqueados técnicamente (2)

Del informe `docs/03/calibracion-pendientes.md`: tienen geometría medida pero no
se pueden definir/insertar completos.

| Código | Motivo |
| --- | --- |
| 5004 | 8 bornes; incompatible con `PIN_SLOTS`/plantillas (`app/src/symbols/place.ts`, `app/src/symbols/templates.ts`). |
| 6006 | 8 bornes; mismo bloqueo. |

## 4. Con captura, pendientes de cerrar (comp02)

Están en `componentes02.cad` pero no cierran contra `componentes02.png` con el
def actual:

| Código | Coord comp02 (x,y) | Estado |
| --- | --- | --- |
| 2000 | 153,36 | comp01 ok; comp02 pendiente |
| 2001 | 147,60 | comp02 pendiente/conflicto |
| 2006 | 138,36 | pendiente |
| 3001 | 24,36 | comp02 pendiente/conflicto |
| 3004 | 15,48 | comp02 pendiente/conflicto |
| 3005 | 42,48 | comp02 pendiente/conflicto |
| 3011 | 51,36 | comp02 pendiente/conflicto |
| 6000 | 15,78 | pendiente |
| 6001 | 33,78 | pendiente |
| 6002 | 54,78 | pendiente |
| 6003 | 75,75 | pendiente |
| 6005 | 114,30 | comp01 ok; comp02 pendiente |
| 6008 | 24,99 | comp01 ok; comp02 pendiente |
| 6009 | 57,102 | pendiente |
| 6010 | 114,81 | comp01 ok; comp02 pendiente |
| 6011 | 138,84 | pendiente |
| 8014 | 90,120 | pendiente (borrador probado, no `stray=0`) |

## 5. Estado ya resuelto (referencia)

Cerrados con evidencia `stray=0`: ver `docs/03/calibracion-pendientes.md`
comp01/comp02 y los `## Log` de `odd/tasks/cadesimu-docs03-calibration.md`,
`odd/tasks/cadesimu-pulsadores.md` y `odd/tasks/bornes-grilla-del-archivo.md`.

Al 2026-11-20 el barrido de bornes fuera de la tinta dejó **1** símbolo
(9004, sección 2): todos los demás con `anchor: 'origin'` tienen sus terminales
sobre la tinta del símbolo.

## Cómo pedir / agregar una captura

1. Captura de CADe_SIMU del componente **colocado en un plano**, con el nombre
   del archivo igual al de los existentes (`docs/03/…` o `docs/02/…`), y su
   `.cad` o `.cade` al lado si se puede exportar.
2. Registrar el mapeo px↔cad de esa captura (escala y `OX`/`OY`, medidos sobre
   los designadores de la propia imagen).
3. Gate de calibración, desde la raíz del repo:
   ```
   node --experimental-strip-types .agents/skills/cadesimu-calibration/assets/overlay-diff.ts \
     <png> <code> <x> <y> <S> <OX> <OY>
   ```
   `stray = 0` es la condición; `refOnly` aceptable son los rótulos.
4. Tests verdes (`symbol-anchors`, `rest-ink`) y `npx tsc --noEmit`. Si cambia
   la tinta en reposo, el hash de `app/test/rest-ink.test.ts` se regenera con su
   motivo escrito al lado.
5. Bornes: **los que declara el archivo** (filas 0/12 del registro). Si la tinta
   no llega, se mueve/estira la tinta, no los bornes
   (`odd/tasks/bornes-grilla-del-archivo.md`).

# Componentes de `docs/03` pendientes de calibrar

Informe generado el 2026-11-15. Alcance: unión de `docs/03/componentes01`+`componentes01.png` y `docs/03/componentes02.cad`+`componentes02.png`.

- Mapeos de captura: comp01 `S=4, OX=-17, OY=-101`; comp02 `S=4, OX=-2, OY=-60`.
- Gate de calibración: `stray=0` en `overlay-diff` (`refOnly` aceptable), con tests/`tsc`/suite verdes.
- **Marco del gate para símbolos anclados al origen:** la tinta medida va corrida `+12` en `y` para que los bornes del archivo (filas 0 y 12) caigan sobre ella, así que el gate corre con `oy = y_registro − 12` (`bornes-grilla-del-archivo`, L9). Correrlo en la fila cruda del registro no prueba nada: el 5000 da `stray=0` en `oy=45` y `stray=271` en `oy=57`.
- Rama al momento del informe: `main` en `f961287`.

## Resumen

- **Unión docs/03:** 41 códigos.
- **Cerrados con evidencia `stray=0` (registro actual):** 26 (por hoja/contexto, ver detalle).
- **Bloqueados:** 2 (5004, 6006).
- **Pendientes de calibrar/cerrar:** resto (ver detalle), incluyendo conflictos comp01↔comp02 por mismo código y conflictos de identidad/semántica.

## Cerrados con evidencia `stray=0`

- **Comp01 (`componentes01.png`):** 1050, 1051, 2000, 3002, 3003, 3004, 3005, 3011, 5000, 5002, 6005, 6008, 6010, 7000, 7001, 7002, 7003, 8015, 8017, 8018, 9001, 9002, 9009.
- **Comp02 (`componentes02.png`):** 3000, 3003, 5000, 5001, 5002, 5003, 8017.
- **Base ya anclada (S3), en alcance docs/03:** 3000, 3001, 9000 (revisar desvío en comp02; 3000 verificado en comp02).

> Nota: varios códigos comparten número entre comp01 y comp02 pero un solo `SymbolDef` por código no siempre cierra en ambas hojas (conflicto comp01↔comp02).

## Bloqueados

| Código | Motivo |
| --- | --- |
| 5004 | 8 bornes; incompatible con `PIN_SLOTS`/plantillas (`app/src/symbols/place.ts`, `app/src/symbols/templates.ts`). |
| 6006 | 8 bornes; mismo bloqueo (geometría medida, no insertable/definible completo). |

## Pendientes

### Comp02-only en cad (no están en `componentes01.cad`)

| Código | Coord comp02 (x,y) | Estado |
| --- | --- | --- |
| 2006 | 138,36 | Pendiente |
| 5001 | 30,54 | `stray=0` en comp02; revisar si requiere ajuste adicional en otros contextos |
| 5003 | 72,57 | `stray=0` en comp02; revisar si requiere ajuste adicional en otros contextos |
| 6000 | 15,78 | Pendiente |
| 6001 | 33,78 | Pendiente (no cerraba con def actual, L6) |
| 6002 | 54,78 | Pendiente |
| 6003 | 75,75 | Pendiente |
| 6009 | 57,102 | Pendiente |
| 6011 | 138,84 | Pendiente |
| 8014 | 90,120 | Pendiente (borrador probado, no `stray=0`) |

### Presentes en comp02, pendientes de cierre/conflicto en comp02

| Código | Coord comp02 (x,y) | Estado |
| --- | --- | --- |
| 2000 | 153,36 | Comp01 ok; comp02 pendiente/conflicto |
| 2001 | 147,60 | Base S3; comp02 pendiente/conflicto |
| 3001 | 24,36 | Base S3; comp02 pendiente/conflicto |
| 3004 | 15,48 | Comp01 ok; comp02 pendiente/conflicto |
| 3005 | 42,48 | Comp01 ok; comp02 pendiente/conflicto |
| 3011 | 51,36 | Comp01 ok; comp02 pendiente/conflicto |
| 6005 | 114,30 | Comp01 ok; comp02 pendiente |
| 6008 | 24,99 | Comp01 ok; comp02 pendiente |
| 6010 | 114,81 | Comp01 ok; comp02 pendiente |
| 8015 | 93,99 | Comp01 ok; comp02 pendiente |
| 8016 | 117,111 | **Conflicto identidad/semántica**: comp02-only como «Contacto térmico NC» (se alcanzó `stray=0` ref=113 ov=113, pero rompe uso como lámpara en spec/sim/tests/fixtures); definir estrategia |
| 8017 | 138,117 | Cerrado en comp02 (y comp01) |
| 8018 | 162,108 | Comp01 ok; comp02 pendiente/conflicto |
| 8019 | 162,84 | Pendiente |
| 9000 | 177,33 | Base S3; comp02 pendiente/conflicto |
| 9001 | 36,132 | Comp01 ok; comp02 pendiente/conflicto |
| 9002 | 186,78 | Comp01 ok; comp02 pendiente/conflicto |
| 9009 | 180,54 | Comp01 ok; comp02 pendiente/conflicto |

### Comp01-only en docs/03 (S2) — cerrados en comp01

1050, 1051, 3002, 7000, 7001, 7002, 7003.

## Lista corta (trabajo pendiente)

- **Calibrar en comp02:** 2006, 6000, 6001, 6002, 6003, 6009, 6011, 8014, 8016, 8018, 8019.
- **Resolver cierre/conflicto en comp02:** 2000, 2001, 3001, 3004, 3005, 3011, 6005, 6008, 6010, 8015, 9000, 9001, 9002, 9009.
- **Desbloquear soporte 8 bornes:** 5004, 6006.

## Notas

- 8016 y otros códigos con conflicto comp01↔comp02 requieren decisión de identidad/definición por hoja o estrategia de resolución antes de forzar `stray=0` en comp02.
- Untracked fuera de alcance en el repo al generar este informe: `docs/02/`, `docs/cadesimu-svg/src/`.

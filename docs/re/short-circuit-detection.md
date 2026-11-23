# Detección de cortocircuito en CADe_SIMU V4

> Evidencia de ingeniería inversa, 2026-11-23. Descompilación con Ghidra 12.1.4 vía REA MCP.
> Direcciones de Ghidra: image base `0x800000`; la VA del PE es la dirección menos `0x400000`.

## Qué hace CADe (verificado en el binario)

CADe_SIMU **no mide corriente ni resistencia**. Guarda una etiqueta de fase por extremo de cable
(`this+0x9019c + i*2` y `this+0x9113c + i*2`, dos bytes por registro), la propaga por los conductores
y compara las dos etiquetas al cerrar una conexión.

| Función | Ghidra | VA del PE | Rol |
|---------|--------|-----------|-----|
| `FUN_00854790` | `0x854790` | `0x454790` | Comparador de etiquetas: tabla de 42 pares ordenados |
| `FUN_008541c0` | `0x8541c0` | `0x4541c0` | Mensaje «Se ha producido un cortocircuito», para la simulación y resetea etiquetas |
| `FUN_008543b0` | `0x8543b0` | `0x4543b0` | Mensaje «Se ha producido una derivación a tierra», mismo reinicio |
| `FUN_004ffe60` | `0x4ffe60` | `0x0ffe60` | Recorre cables (`4000`, `0xfa9`, `0xfaa`, `0xfb2`, `0xfb3`, `0xfa1`) y llama al comparador |
| `FUN_0052be70` | `0x52be70` | `0x12be70` | Recorre registros, chequea la etiqueta de cada uno y copia el resultado a `this+0x7156c + i*0xf` |

Etiquetas: `'1'`, `'2'`, `'3'` (L1/L2/L3), `'N'`, `'+'`, `'-'`, `'P'` (tierra), `'0'` (sin asignar).
Los pares `Y`/`y` son casos especiales de bobinado y están fuera de este modelo.

- Fases distintas entre sí, fase contra `'N'`, y `'+'` contra `'-'` → **cortocircuito**.
- Cualquier par con `'P'` → **derivación a tierra**.
- Pares iguales y cualquier par con `'0'` → sin aviso.

Al dispararse, el handler escribe `this+0xa1b60 = 0` (para la simulación) y vuelve `'0'` la etiqueta
de los hasta 2000 registros. Los mensajes están en cinco idiomas: español, inglés, italiano,
francés y portugués.

## Implementación en esta app

- `app/src/sim/phase.ts`: tabla de incompatibilidad (`phaseConflict`).
- `app/src/sim/faults.ts`: `detectFaults(netlist, state)` siembra las etiquetas desde los símbolos de
  alimentación (`3000`..`3011`), une las nets de los polos cerrados en `SimState.closed` y reporta
  la primera incompatibilidad. Devuelve `kind`, las dos nets y los registros implicados.
- Fixtures: `app/test/fixtures/short-test.cad` (L–N) y `earth-test.cad` (L–PE), derivados de
  `luz-con-interruptor.cade` reemplazando la lámpara por un tramo y el neutro por un PE.

### Desviaciones deliberadas

1. **Etiqueta por red, no por extremo de cable.** `buildNetlist()` ya unifica los extremos con
   UnionFind, así que una etiqueta por componente conexo alcanza. Esto pierde la distinción CADe
   entre dos extremos de un mismo tramo; no afecta a los cortos que esta app puede dibujar.
2. **Sin `Y`/`y` ni magnitud de corriente.** No se modelan bobinados estrella/triángulo ni se
   calcula intensidad: CADe tampoco lo hace en esta rutina.
3. **No se serializa.** Las etiquetas son estado de simulación; el formato `.cad` no cambia.
4. **El detector no depende de `BuiltCircuit`.** Un corto directo L–N hace que `circuitFrom()`
   devuelva `null`; el detector trabaja sobre el netlist y igual avisa.

### Fuera de alcance

Disparo físico de fusibles, comportamiento del relé diferencial, la tabla de cinco idiomas (la UI de
esta app es española) y cualquier cambio en el formato de archivo.

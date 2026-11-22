# motor-direction-helper — sentido de giro desde la topología trifásica

**Objetivo:** detectar el sentido de giro del motor en CADe_SIMU comparando qué fase llega a U1/V1/W1, mediante un helper puro aguas abajo del solver, sin cambiar `Circuit`, `SimState` ni `simulate()`.
**Rama:** `feat/contraste-auditoria` (worktree actual).
**Runner:** `node --test` y `tsc --noEmit` desde `app/`.
**Estrategia de entrega:** commits por unidad de trabajo en la rama; push/PR decisión del usuario.

## Specs

- **S1 — "vamos con el tema del giro en el simulador"**. Con K1M cerrado el motor gira horario (`+1`); con K2M cerrado, antihorario (`-1`), porque ese contactor invierte dos fases. La detección se hace en los **bornes del motor**, no en qué contactor cerró.
- **S2 — "cadesimu tiene lineas trifasicas" / "nosotros estamos uniendo fase x fase de a uno"**. El helper reconstruye la topología fase por fase desde `BuiltCircuit.devices` (netlist sin colapsar) y `SimState.closed` (polos cerrados), conservando la identidad de L1/L2/L3 aunque `circuit.ts:194` colapse las redes para el solver.
- **S3**. Unión-find sobre nets originales; paridad de la permutación `[fase(U1), fase(V1), fase(W1)]`: par → `+1`, impar → `-1`. Sin fases resolubles → `+1`.
- **S4**. El sentido llega al glifo como `direction?: 1 | -1` opcional y se aplica con `animation-direction: reverse` (precedente `.wire.live.rev`). Se corrige el efecto del espejo del símbolo. Cero cambios en `simulate()` ni en sus ~10 callers.
- **S5**. `prefers-reduced-motion` sigue sin animar; el sentido no debe romper ese comportamiento. Sin cambios de formato CADe.

## Tasks

- T1 (S1-S3): `app/src/sim/direction.ts` con `motorDirections(built, state)`. DONE — 6 tests (incluye PR2 real). Nota: `SimState.closed` identifica polos por **índices de borne** (`id:a-b`), no por nets; corregido en el camino.
- T2 (S1, S4): `App.tsx` → `Canvas` → `Component` → `SymbolGlyph` con `direction?: 1|-1`; clase `motor-rotor rev` y regla CSS. DONE.
- T3 (S5): `rotorReversed(direction, mirror)` pura en `draw.ts`; `.motor-rotor.rev` neutralizado en reduced-motion. DONE — tests de espejo y CSS.

## Log

- **L1 (2026-11-22):** "vamos con el tema del giro en el simulador".
- **L2 (2026-11-22):** "cadesimu tiene lineas trifasicas".
- **L3 (2026-11-22):** "nosotros estamos uniendo fase x fase de a uno".
- **L4:** "empecemos con helper".
- **L5:** Mapa del explorador: `circuit.ts:189-194` colapsa L1/L2/L3 en `live`; `BuiltCircuit.devices` conserva `pinNames`/`nets`; `SimState.closed` trae los polos cerrados como `${recordId}:${a}-${b}` con nets remapeadas; `diagram.css:352-354` ya tiene `.wire.live.rev`. Riesgos: PE como polo, pines no cableados, espejo del glifo y reduced-motion.
- **L6:** Estado inicial: 701/701 tests, `tsc --noEmit` limpio.
- **L7 (2026-11-22):** Implementación cerrada. Evidencia: 709/709 tests, `tsc --noEmit` limpio, `simulate()` y `Circuit` intactos. Con `PR2_v2`: S1→K1M→`+1`, S2→K2M→`-1`. Descubrimiento: `SimState.closed` usa índices de borne (`31:0-3`), no nets; el primer intento del helper parseaba números de red y daba `-1` en todos los casos. Corregido. **Pendiente del usuario**: el archivo `PR2_Rodolfo_Giusti_v2.cad` SIGUE trayendo el junction 75 que cortocircuita dos fases en Q1 (verificado: `Q1 nets [14,15,16,4,4,5]`; al sacar el registro 75 en memoria pasa a `[15,16,17,4,5,6]` y el giro se detecta). El test de integración lo quita en memoria y lo documenta; no se editó el archivo sin autorización.

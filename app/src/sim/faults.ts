/**
 * Detección de cortocircuito y derivación a tierra estilo CADe_SIMU.
 *
 * El binario no mide corriente: propaga una etiqueta de fase por cada conductor
 * y compara las dos etiquetas cuando cierra una conexión (`FUN_00854790`,
 * Ghidra `0x854790`). Dos fases distintas → corto; alguna es `'P'` → tierra.
 * Acá las etiquetas son por RED, no por extremo de cable: `buildNetlist()` ya
 * unificó los extremos con UnionFind, así que basta una etiqueta por componente
 * conexo. Es la desviación deliberada respecto del binario, documentada en
 * `plans/004-short-circuit-detection.md`.
 *
 * El detector no depende de `BuiltCircuit`: un corto directo L–N hace que
 * `circuitFrom()` devuelva `null` (`live === ret`) y aun así debe avisar.
 */

import type { Netlist } from './netlist.ts';
import type { SimState } from './solver.ts';
import { phaseConflict, type PhaseConflict, type PhaseTag } from './phase.ts';

/**
 * Etiquetas por borne de cada símbolo de alimentación, en el mismo orden de
 * pines que usa `circuitFrom()` (`sim/circuit.ts`). Incluye los códigos de
 * corriente continua (`3008`..`3010`) y `3011` (L N PE), que el solver actual
 * no usa pero el comparador de fases de CADe sí reconoce.
 */
const SUPPLY_TAGS: Readonly<Record<number, readonly PhaseTag[]>> = {
  3000: ['1'],
  3001: ['N'],
  3002: ['P'],
  3003: ['1', 'N'],
  3004: ['1', '2', '3'],
  3005: ['1', '2', '3', 'P'],
  3006: ['1', '2', '3', 'N'],
  3007: ['1', '2', '3', 'N', 'P'],
  3008: ['+'],
  3009: ['-'],
  3010: ['+', '-'],
  3011: ['1', 'N', 'P'],
};

export interface SimulationFault {
  kind: PhaseConflict;
  /** nets involucradas, en orden de detección */
  nets: [number, number];
  /** registros que tocan esas nets, para resaltarlos en el lienzo */
  recordIds: number[];
}

class UnionFind {
  private readonly parent = new Map<number, number>();

  add(x: number): void {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }

  find(x: number): number {
    this.add(x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    while (this.parent.get(x) !== root) {
      const next = this.parent.get(x)!;
      this.parent.set(x, root);
      x = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

/**
 * Los ids de `SimState.closed` son `recordId:a-b`, donde `a` y `b` son
 * ÍNDICES DE BORNE (no nets). El netlist conserva esa correspondencia.
 */
function closedPoles(state: Pick<SimState, 'closed'>, devices: Netlist['devices']): [number, number][] {
  const byRecord = new Map(devices.map((device) => [device.recordId, device]));
  const poles: [number, number][] = [];
  for (const id of state.closed) {
    const sep = id.indexOf(':');
    if (sep < 0) continue;
    const device = byRecord.get(Number(id.slice(0, sep)));
    if (!device) continue;
    const [a, b] = id.slice(sep + 1).split('-').map(Number);
    if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
    const netA = device.nets[a];
    const netB = device.nets[b];
    if (netA === undefined || netB === undefined || netA < 0 || netB < 0) continue;
    poles.push([netA, netB]);
  }
  return poles;
}

export function detectFaults(netlist: Netlist, state: Pick<SimState, 'closed'>): SimulationFault | null {
  const uf = new UnionFind();
  for (const net of netlist.sizes.keys()) uf.add(net);

  // Los cables ya están unificados en el netlist, pero sus dos nets quedan
  // registradas en `recordNets`: unirlas de nuevo es idempotente y cubre
  // netlists construidos a mano en los tests.
  for (const nets of netlist.recordNets.values()) {
    if (nets.length >= 2) uf.union(nets[0], nets[1]);
  }
  for (const [a, b] of closedPoles(state, netlist.devices)) uf.union(a, b);

  const firstTag = new Map<number, PhaseTag>();
  const firstNet = new Map<number, number>();
  const conflicts: { kind: PhaseConflict; a: number; b: number }[] = [];

  for (const device of netlist.devices) {
    const tags = SUPPLY_TAGS[device.code];
    if (!tags) continue;
    for (let pin = 0; pin < Math.min(tags.length, device.nets.length); pin++) {
      const net = device.nets[pin];
      if (net === undefined || net < 0) continue;
      const tag = tags[pin];
      const root = uf.find(net);
      const seen = firstTag.get(root);
      if (seen === undefined) {
        firstTag.set(root, tag);
        firstNet.set(root, net);
        continue;
      }
      const kind = phaseConflict(seen, tag);
      if (kind) conflicts.push({ kind, a: firstNet.get(root)!, b: net });
    }
  }

  if (conflicts.length === 0) return null;
  // La derivación manda: CADe tiene handlers separados y el de tierra es el
  // más grave. Después gana la menor net para que el resultado sea estable.
  conflicts.sort((x, y) => {
    if (x.kind !== y.kind) return x.kind === 'earth' ? -1 : 1;
    return x.a - y.a || x.b - y.b;
  });
  const fault = conflicts[0];
  const recordIds = new Set<number>();
  for (const net of [fault.a, fault.b]) {
    for (const id of netlist.members.get(net) ?? []) recordIds.add(id);
  }
  return { kind: fault.kind, nets: [fault.a, fault.b], recordIds: [...recordIds].sort((a, b) => a - b) };
}

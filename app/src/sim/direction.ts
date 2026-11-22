/**
 * Sentido de giro de los motores, derivado de la topología trifásica real.
 *
 * El solver colapsa L1/L2/L3 en una sola red (`circuit.ts:194`) porque para
 * energizar bobinas y pintar cables alcanza con "hay tensión o no". Ese modelo
 * pierde el ORDEN de las fases, que es justamente lo que decide el giro.
 *
 * Este módulo es una vista pura aguas abajo: reconstruye la conectividad con
 * los nets ORIGINALES del netlist (`BuiltCircuit.devices`) y los polos que el
 * solver dejó cerrados (`SimState.closed`). No toca `simulate`, `Circuit` ni
 * `SimState`, así que ninguno de sus callers cambia.
 */

import type { BuiltCircuit } from './circuit.ts';
import type { SimState } from './solver.ts';

const PHASE_CODES = new Set([3004, 3005, 3006, 3007]);
const CLOSED_ID = /^(\d+):(-?\d+)-(-?\d+)$/;

class UnionFind {
  private parent = new Map<number, number>();

  find(x: number): number {
    const current = this.parent.get(x) ?? x;
    if (current === x) {
      this.parent.set(x, x);
      return x;
    }
    const root = this.find(current);
    this.parent.set(x, root);
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/**
 * Mapa `recordId -> +1 (horario) | -1 (antihorario)` para los motores del
 * circuito. Sin tres fases resolubles en U1/V1/W1 devuelve `+1`.
 */
export function motorDirections(built: BuiltCircuit, state: SimState): Map<number, 1 | -1> {
  const result = new Map<number, 1 | -1>();
  let phase: number[] = [];
  for (const device of built.devices) {
    if (!PHASE_CODES.has(device.code)) continue;
    const nets = [...new Set(device.nets)];
    if (phase.length === 0 && nets.length >= 3) phase = nets.slice(0, 3);
  }

  const byRecord = new Map(built.devices.map((d) => [d.recordId, d]));
  const uf = new UnionFind();

  // `SimState.closed` identifica el polo por ÍNDICES DE BORNE (`id:a-b`), no
  // por nets. Cada polo cerrado une sus dos nets originales: acá se conserva
  // la identidad de fase que el remap del solver había achatado.
  for (const id of state.closed) {
    const match = CLOSED_ID.exec(id);
    if (!match) continue;
    const device = byRecord.get(Number(match[1]));
    if (!device) continue;
    const i = Number(match[2]);
    const j = Number(match[3]);
    if (!device.poles.some(([a, b]) => a === i && b === j)) continue;
    const netA = device.nets[i]!;
    const netB = device.nets[j]!;
    if (netA < 0 || netB < 0) continue;
    uf.union(netA, netB);
  }

  for (const device of built.devices) {
    if (device.code !== 1000) continue;
    if (phase.length < 3) {
      result.set(device.recordId, 1);
      continue;
    }
    const u = device.pinNames.indexOf('U1');
    const v = device.pinNames.indexOf('V1');
    const w = device.pinNames.indexOf('W1');
    if (u < 0 || v < 0 || w < 0) {
      result.set(device.recordId, 1);
      continue;
    }
    const terminalNets = [device.nets[u], device.nets[v], device.nets[w]];
    if (terminalNets.some((net) => net === undefined || net < 0)) {
      result.set(device.recordId, 1);
      continue;
    }
    const order = terminalNets.map((net) => phase.findIndex((p) => uf.find(p) === uf.find(net!)));
    if (order.some((p) => p < 0) || new Set(order).size !== 3) {
      result.set(device.recordId, 1);
      continue;
    }
    let inversions = 0;
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        if (order[i]! > order[j]!) inversions++;
      }
    }
    result.set(device.recordId, inversions % 2 === 0 ? 1 : -1);
  }

  return result;
}

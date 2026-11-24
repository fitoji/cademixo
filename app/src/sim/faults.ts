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

import type { NetNode } from '../editor/network.ts';
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

/** ¿El código es un símbolo de alimentación (no un componente accionable)? */
export function isSupplyCode(code: number): boolean {
  return SUPPLY_TAGS[code] !== undefined;
}

export interface SimulationFault {
  kind: PhaseConflict;
  /** nets involucradas, en orden de detección */
  nets: [number, number];
  /** registros que tocan esas nets, para resaltarlos en el lienzo */
  recordIds: number[];
  /**
   * Contacto cerrado que une las dos etiquetas y por lo tanto genera el fallo.
   * `null` cuando el corto ya existe sin cerrar ningún polo (cables/uniones).
   */
  culprit: FaultCulprit | null;
  /** Las dos etiquetas que chocan, para poder seguir sus caminos por el cableado. */
  tags: [PhaseTag, PhaseTag];
  /**
   * Nodo de cableado donde se tocan las dos etiquetas: el cruce o unión que
   * genera el corto. `null` si el corte sólo existe por un polo cerrado.
   */
  shortNode: FaultNode | null;
}

export interface FaultCulprit {
  recordId: number;
  /** índices de borne del polo, en el orden de `Device.nets` */
  pins: [number, number];
}

export interface FaultNode {
  key: string;
  sheet: number;
  x: number;
  y: number;
  kind: NetNode['kind'];
  /** registros que pasan o terminan en el cruce, para resaltarlos */
  records: number[];
}

interface ClosedPole {
  recordId: number;
  pins: [number, number];
  netA: number;
  netB: number;
  keyA: string | null;
  keyB: string | null;
}

interface SupplyTag {
  net: number;
  tag: PhaseTag;
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
function closedPoleList(state: Pick<SimState, 'closed'>, netlist: Netlist): ClosedPole[] {
  const byRecord = new Map(netlist.devices.map((device) => [device.recordId, device]));
  const poles: ClosedPole[] = [];
  for (const id of state.closed) {
    const sep = id.indexOf(':');
    if (sep < 0) continue;
    const recordId = Number(id.slice(0, sep));
    const device = byRecord.get(recordId);
    if (!device) continue;
    const [a, b] = id.slice(sep + 1).split('-').map(Number);
    if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
    const netA = device.nets[a];
    const netB = device.nets[b];
    if (netA === undefined || netB === undefined || netA < 0 || netB < 0) continue;
    poles.push({
      recordId,
      pins: [a, b],
      netA,
      netB,
      keyA: device.pinNodes?.[a] ?? null,
      keyB: device.pinNodes?.[b] ?? null,
    });
  }
  return poles;
}

/** Etiquetas de alimentación ya resueltas a nets concretas. */
function supplyTags(netlist: Netlist): SupplyTag[] {
  const out: SupplyTag[] = [];
  for (const device of netlist.devices) {
    const tags = SUPPLY_TAGS[device.code];
    if (!tags) continue;
    for (let pin = 0; pin < Math.min(tags.length, device.nets.length); pin++) {
      const net = device.nets[pin];
      if (net === undefined || net < 0) continue;
      out.push({ net, tag: tags[pin] });
    }
  }
  return out;
}

/** ¿La gráfica actual ya junta dos etiquetas incompatibles de este tipo? */
function reachesKind(tags: readonly SupplyTag[], uf: UnionFind, kind: PhaseConflict): boolean {
  const seen = new Map<number, PhaseTag[]>();
  for (const { net, tag } of tags) {
    const root = uf.find(net);
    const list = seen.get(root) ?? [];
    for (const previous of list) {
      if (phaseConflict(previous, tag) === kind) return true;
    }
    list.push(tag);
    seen.set(root, list);
  }
  return false;
}

/**
 * Busca el polo cerrado que hace aparecer el fallo. Se parte de la conexión de
 * cables y se van cerrando los polos en orden estable: el primero que produce
 * el mismo tipo de fallo que se reporta es el que lo genera. En una cadena de
 * contactos, marca el último que completa el camino, no la alimentación.
 */
function findCulprit(
  netlist: Netlist,
  state: Pick<SimState, 'closed'>,
  kind: PhaseConflict,
): FaultCulprit | null {
  const tags = supplyTags(netlist);
  const uf = new UnionFind();
  for (const net of netlist.sizes.keys()) uf.add(net);
  for (const nets of netlist.recordNets.values()) {
    if (nets.length >= 2) uf.union(nets[0], nets[1]);
  }
  // Si los cables ya unen las etiquetas, no hay contacto culpable.
  if (reachesKind(tags, uf, kind)) return null;

  const poles = closedPoleList(state, netlist).map((pole) => ({
    culprit: { recordId: pole.recordId, pins: pole.pins } satisfies FaultCulprit,
    netA: pole.netA,
    netB: pole.netB,
  }));
  poles.sort(
    (x, y) =>
      x.culprit.recordId - y.culprit.recordId ||
      x.culprit.pins[0] - y.culprit.pins[0] ||
      x.culprit.pins[1] - y.culprit.pins[1],
  );
  for (const pole of poles) {
    uf.union(pole.netA, pole.netB);
    if (reachesKind(tags, uf, kind)) return pole.culprit;
  }
  return null;
}

/** Nodo de cada borne de alimentación, con su etiqueta. */
function supplySeeds(netlist: Netlist): { key: string; tag: PhaseTag }[] {
  const out: { key: string; tag: PhaseTag }[] = [];
  for (const device of netlist.devices) {
    const tags = SUPPLY_TAGS[device.code];
    if (!tags) continue;
    const pins = device.pinNodes ?? [];
    for (let pin = 0; pin < Math.min(tags.length, pins.length); pin++) {
      out.push({ key: pins[pin]!, tag: tags[pin] });
    }
  }
  return out;
}

/** Grafo de conducción: tramos de cable + polos cerrados. */
function conductionAdjacency(netlist: Netlist, state: Pick<SimState, 'closed'>): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  const add = (a: string | null, b: string | null): void => {
    if (a === null || b === null || a === b) return;
    const setA = adjacency.get(a) ?? new Set<string>();
    setA.add(b);
    adjacency.set(a, setA);
    const setB = adjacency.get(b) ?? new Set<string>();
    setB.add(a);
    adjacency.set(b, setB);
  };
  for (const segment of netlist.segments?.values() ?? []) add(segment.a, segment.b);
  // Un nodo `through` vive en el MEDIO de un tramo: hay que unirlo a los
  // extremos del tramo o el cruce queda aislado del cable que lo atraviesa.
  for (const node of netlist.nodes?.values() ?? []) {
    for (const segmentId of node.through) {
      const segment = netlist.segments?.get(segmentId);
      if (segment) add(node.key, segment.a);
    }
  }
  for (const pole of closedPoleList(state, netlist)) add(pole.keyA, pole.keyB);
  return adjacency;
}

/** Nodos alcanzables desde las fuentes, opcionalmente ignorando un tramo. */
function reachable(
  adjacency: Map<string, Set<string>>,
  sources: readonly string[],
  skip?: { a: string; b: string },
): Set<string> {
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const source of sources) {
    if (!seen.has(source)) {
      seen.add(source);
      queue.push(source);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]!;
    for (const next of adjacency.get(node) ?? []) {
      if (skip && ((node === skip.a && next === skip.b) || (node === skip.b && next === skip.a))) continue;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

/**
 * Ubica el cruce/uníon que genera un corto por cableado. Prueba cada tramo:
 * si al quitarlo las dos etiquetas en conflicto dejan de estar conectadas, ese
 * tramo es el puente. Se prefiere el extremo que cae en un nodo `through` o
 * `junction` (unión en T o cruce) y, entre iguales, el tramo más nuevo.
 */
function locateCableShort(
  netlist: Netlist,
  state: Pick<SimState, 'closed'>,
  tags: [PhaseTag, PhaseTag],
): FaultNode | null {
  if (!netlist.nodes || !netlist.segments) return null;
  const seeds = supplySeeds(netlist);
  const sourcesA = seeds.filter((seed) => seed.tag === tags[0]).map((seed) => seed.key);
  const sourcesB = seeds.filter((seed) => seed.tag === tags[1]).map((seed) => seed.key);
  if (sourcesA.length === 0 || sourcesB.length === 0) return null;
  const adjacency = conductionAdjacency(netlist, state);

  const candidates: { node: NetNode; records: number[]; score: number; segment: number }[] = [];
  for (const segment of netlist.segments.values()) {
    if (segment.a === segment.b) continue;
    const reachA = reachable(adjacency, sourcesA, segment);
    const reachB = reachable(adjacency, sourcesB, segment);
    let connected = false;
    for (const key of reachA) {
      if (reachB.has(key)) {
        connected = true;
        break;
      }
    }
    if (connected) continue;

    // El extremo del tramo que queda del lado de la segunda etiqueta.
    const aOnA = reachA.has(segment.a);
    const bOnA = reachA.has(segment.b);
    const side = aOnA && !bOnA ? [segment.b] : bOnA && !aOnA ? [segment.a] : [segment.a, segment.b];
    for (const key of side) {
      const node = netlist.nodes.get(key);
      if (!node || (node.through.length === 0 && !node.junction)) continue;
      const records = [...new Set([segment.id, ...node.through, ...node.ends])].sort((x, y) => x - y);
      candidates.push({ node, records, score: node.junction ? 2 : 1, segment: segment.id });
    }
  }
  if (candidates.length === 0) return null;
  // El tramo más nuevo es el que el usuario acaba de dibujar; entre varios
  // cortes en serie, ése es el que generó el corto. El nodo `through`/`junction`
  // desempata para quedarse con el cruce y no con un extremo suelto.
  candidates.sort(
    (x, y) =>
      y.segment - x.segment ||
      y.score - x.score ||
      x.node.key.localeCompare(y.node.key),
  );
  const best = candidates[0]!;
  return {
    key: best.node.key,
    sheet: best.node.sheet,
    x: best.node.x,
    y: best.node.y,
    kind: best.node.kind,
    records: best.records,
  };
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
  for (const pole of closedPoleList(state, netlist)) uf.union(pole.netA, pole.netB);

  const firstTag = new Map<number, PhaseTag>();
  const firstNet = new Map<number, number>();
  const conflicts: { kind: PhaseConflict; a: number; b: number; ta: PhaseTag; tb: PhaseTag }[] = [];

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
      if (kind) conflicts.push({ kind, a: firstNet.get(root)!, b: net, ta: seen, tb: tag });
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
  const tags: [PhaseTag, PhaseTag] = [fault.ta, fault.tb];
  return {
    kind: fault.kind,
    nets: [fault.a, fault.b],
    recordIds: [...recordIds].sort((a, b) => a - b),
    culprit: findCulprit(netlist, state, fault.kind),
    tags,
    shortNode: locateCableShort(netlist, state, tags),
  };
}

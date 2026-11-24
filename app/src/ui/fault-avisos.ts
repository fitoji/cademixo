/**
 * Puente entre un corte detectado por la simulación y el sistema de avisos.
 *
 * El detector (`sim/faults.ts`) devuelve las redes y los registros implicados,
 * pero no coordenadas: las redes son del netlist, no del dibujo. Acá se elige
 * un registro implicado y se calcula un punto para que el lienzo marque dónde
 * se detectó. Es puro para poder probarlo sin DOM.
 */

import type { Finding } from '../editor/network.ts';
import { attachPoints, type Point } from '../editor/pins.ts';
import { boundsOf, wirePoints, type CadeRecordModel } from '../model/project.ts';
import { isSupplyCode, type SimulationFault } from '../sim/faults.ts';

/**
 * Punto representativo del corte. Si el detector identificó el contacto que lo
 * genera, se marca ese contacto (mitad entre sus dos bornes cableados); si no,
 * se cae al primer registro implicado, como antes.
 */
export function faultLocation(records: readonly CadeRecordModel[], fault: SimulationFault): Point | null {
  // Un cruce/uníon de cables es más preciso que el componente que energiza:
  // es el lugar físico donde se tocan las dos etiquetas.
  if (fault.shortNode) return { x: fault.shortNode.x, y: fault.shortNode.y };

  const culprit = fault.culprit;
  if (culprit) {
    const record = records.find((candidate) => candidate.id === culprit.recordId);
    if (record) {
      const points = attachPoints([...records]).get(record.id) ?? [];
      const [a, b] = culprit.pins;
      const pa = points[a];
      const pb = points[b];
      if (pa && pb) return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
      if (pa) return { x: pa.x, y: pa.y };
      if (pb) return { x: pb.x, y: pb.y };
      const box = boundsOf(record);
      if (box) return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    }
  }

  const byId = new Map(records.map((record) => [record.id, record]));
  // Sin culpable identificable (corto directo por cables), se prueban primero
  // los registros que no son alimentación: marcar la fase es justo lo que este
  // cambio viene a evitar.
  const ordered = [
    ...new Set([
      ...fault.recordIds.filter((id) => {
        const record = byId.get(id);
        return record !== undefined && !isSupplyCode(record.code);
      }),
      ...fault.recordIds,
    ]),
  ];
  for (const id of ordered) {
    const record = byId.get(id);
    if (!record) continue;
    if (record.kind === 'connection') {
      const wire = wirePoints(record);
      if (wire) return { x: (wire.x1 + wire.x2) / 2, y: (wire.y1 + wire.y2) / 2 };
      continue;
    }
    const box = boundsOf(record);
    if (box) return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  }
  return null;
}

/** Aviso de error que se suma a los del documento mientras dure el corte. */
export function faultFinding(records: readonly CadeRecordModel[], fault: SimulationFault): Finding {
  const at = faultLocation(records, fault);
  const code = fault.kind === 'earth' ? 'earth-fault' : 'short-circuit';
  const base =
    fault.kind === 'earth'
      ? 'Derivación a tierra detectada al simular'
      : 'Cortocircuito detectado al simular';

  if (fault.shortNode) {
    return {
      level: 'error',
      code,
      message: `${base} en el cruce de conductores`,
      ids: [...fault.shortNode.records],
      at: { x: fault.shortNode.x, y: fault.shortNode.y },
    };
  }

  const culprit = fault.culprit
    ? records.find((candidate) => candidate.id === fault.culprit!.recordId)
    : null;
  const where = culprit?.designator ? ` en ${culprit.designator}` : '';
  return {
    level: 'error',
    code,
    message: `${base}${where}`,
    // Sólo el contacto culpable queda en rojo: marcar toda la red pintaba de
    // rojo también la alimentación y parecía que el fallo estaba en la fase.
    ids: fault.culprit ? [fault.culprit.recordId] : [...fault.recordIds],
    ...(at ? { at } : {}),
  };
}

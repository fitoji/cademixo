/**
 * Aparatos unidos mecánicamente: el contacto auxiliar y su disyuntor.
 *
 * En el PR1 el disyuntor de potencia (6009) y el conmutador del mando (8018)
 * comparten designador: son **el mismo aparato**. El conmutador es su contacto
 * auxiliar, así que su posición no se acciona por separado: la marca el
 * disyuntor. Con el disyuntor cerrado el conmutador queda en la posición de
 * maniobra (la salida 98, la que alimenta la red de la bobina) y con el
 * abierto en la de reposo (la salida 96).
 *
 * Medido contra CADe_SIMU V4 en la serie F (`docs/pruebas-cadesimu-windows.md`):
 * todos los componentes que comparten designador son **un único aparato** y se
 * accionan juntos. No hay "el primero" ni "el más cercano". La serie G confirmó
 * que la comparación es literal: `-F`, `F`, `-f` y ` F` son aparatos distintos.
 * Por eso el estado se clave por designador crudo, sin normalizar.
 */

import { isChangeover, startsOpen } from '../model/component-spec.ts';
import type { CadeRecordModel } from '../model/project.ts';

/** Estado de una protección: `'closed'` conduce, `'open'` corta. */
export type ProtectionState = 'closed' | 'open';

/** Estado de las protecciones, claveado por designador literal. */
export type ProtectionStates = Record<string, ProtectionState>;

/**
 * Clave de estado del aparato. Las piezas sin designador no forman grupo: CADe
 * no las empareja con nadie, así que cada una conserva su propio estado.
 */
export function apparatusKey(rec: CadeRecordModel): string {
  return rec.designator === '' ? `#id:${rec.id}` : rec.designator;
}

/**
 * La protección con el **mismo designador literal** que `rec`, si la hay.
 *
 * Sólo cuentan las protecciones (6000-6999): un contacto con otro contacto del
 * mismo aparato no se une mecánicamente a él. Se devuelve una sola protección
 * como testigo del grupo; el estado del grupo no vive en este registro sino en
 * la clave de designador (`ProtectionStates`).
 */
export function linkedProtection(
  records: CadeRecordModel[],
  rec: CadeRecordModel,
): CadeRecordModel | undefined {
  const designator = rec.designator;
  if (designator === '') return undefined;
  return records.find(
    (other) =>
      other.kind === 'component' &&
      other.id !== rec.id &&
      startsOpen(other.code) &&
      other.designator === designator,
  );
}

/**
 * Posición de cada conmutador del dibujo, por id de registro.
 *
 * Un conmutador con una protección del mismo designador sigue al aparato: es
 * su contacto auxiliar. Los demás conservan la posición que el usuario les haya
 * dado con el clic. El estado se lee por designador, así que todas las piezas
 * del grupo comparten posición.
 *
 * Los conmutados de TRES bornes (`11`/`12`/`14`) no están acá: no tienen
 * posición que elegir, porque sus dos tiros los resuelve el solver con la misma
 * regla de un contacto NA/NC — el `12` en reposo y el `14` cuando el aparato se
 * acciona o su bobina se energiza (`circuit.simKindsOf`).
 */
export function changeoverPositions(
  records: CadeRecordModel[],
  protectionStates: ProtectionStates,
  free: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = { ...free };
  for (const rec of records) {
    if (rec.kind !== 'component') continue;
    if (!isChangeover(rec.code)) continue;
    const protection = linkedProtection(records, rec);
    if (!protection) continue;
    const state = protectionStates[apparatusKey(rec)];
    const closed = state ? state === 'closed' : !startsOpen(protection.code);
    out[String(rec.id)] = closed ? 1 : 0;
  }
  return out;
}

/**
 * Ids de todas las piezas del aparato que comparte designador con `rec`.
 * CADe las acciona juntas; la app las marca como disparadas juntas.
 */
export function groupIdsWith(records: CadeRecordModel[], rec: CadeRecordModel): number[] {
  if (rec.designator === '') return [rec.id];
  return records
    .filter((other) => other.kind === 'component' && other.designator === rec.designator)
    .map((other) => other.id);
}

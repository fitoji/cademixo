import type { SymbolGroup } from '../symbols/library.ts';

/**
 * Orden de las categorías de la paleta, calcado del menú «Barras» de
 * CADe_SIMU V4 (verificado en la GUI con la clave shareware 4962).
 * Cada entrada indica la barra de la que viene. Nuestros grupos son más
 * gruesos, así que varias barras se juntan en una categoría.
 */
export const GROUP_ORDER: readonly SymbolGroup[] = [
  'alimentacion', // Barra de alimentaciones
  'fusible',      // Barra de fusibles (y seccionadores)
  'proteccion',   // Barra de automáticos
  'contactor',    // Barra de contactores
  'motor',        // Barras de motores y de accionamientos
  'potencia',     // Barra de potencia (resistencias, arrancadores, variadores)
  'mando',        // Barras de contactos, pulsadores, bobinas y relés electrónicos
  'sensor',       // Barra de detectores
  'senalizacion', // Barra de señalizaciones
  'otro',         // Barras de lógica, ladder, grafcet y E/S
  'neumatico',    // Barra de actuadores neumáticos
  'linea',        // Barra de conexiones
  'carga',
  'borne',
];

/**
 * Agrupa los símbolos dibujables y ordena cada grupo por código numérico.
 *
 * `GROUP_ORDER` decide el orden de las categorías; dentro de cada una, los
 * códigos van de menor a mayor para que las familias se lean en orden:
 * `6000, 6001, 6002, 6003, 6004…` en automáticos, `5000, 5001, 5002…` en
 * fusibles. El orden de declaración en `library.ts` no sirve: los defs están
 * agrupados por helper, no por número.
 */
export function groupSymbols<T extends { code: number; group: SymbolGroup }>(
  symbols: readonly T[],
): Map<SymbolGroup, T[]> {
  const byGroup = new Map<SymbolGroup, T[]>();
  for (const sym of symbols) {
    const list = byGroup.get(sym.group) ?? [];
    list.push(sym);
    byGroup.set(sym.group, list);
  }
  for (const list of byGroup.values()) list.sort((a, b) => a.code - b.code);
  return byGroup;
}

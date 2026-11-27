import { CATALOG } from '../symbols/catalog.ts';
import { lineList, symbolList, type SymbolDef } from '../symbols/library.ts';
import type { PaletteScope } from '../symbols/scope.ts';
import { searchSymbols } from '../symbols/search.ts';
import { codeOrder } from './palette-order.ts';

/** Catálogo dibujable que ve la paleta, con el mismo filtro por alcance. */
export function insertableSymbols(scope: PaletteScope): SymbolDef[] {
  return [...symbolList(), ...lineList()].filter(
    (sym) => scope === 'all' || CATALOG[sym.code] !== undefined,
  );
}

/**
 * Coincidencias para la barra de inserción. Compone el mismo par que la
 * paleta —`codeOrder` para desempatar y `searchSymbols` para ordenar— sin
 * crear un índice ni un ranking propio.
 */
export function insertionMatches(scope: PaletteScope, query: string): SymbolDef[] {
  if (query.trim() === '') return [];
  return searchSymbols(codeOrder(insertableSymbols(scope)), query);
}

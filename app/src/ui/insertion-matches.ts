import { CATALOG } from '../symbols/catalog.ts';
import { lineList, symbolList, type SymbolDef } from '../symbols/library.ts';
import type { PaletteScope } from '../symbols/scope.ts';
import { searchSymbols } from '../symbols/search.ts';
import { codeOrder } from './palette-order.ts';

export function insertableSymbols(scope: PaletteScope): SymbolDef[] {
  return [...symbolList(), ...lineList()].filter(
    (sym) => scope === 'all' || CATALOG[sym.code] !== undefined,
  );
}

// Mismo par que la paleta: codeOrder desempata, searchSymbols ordena.
export function insertionMatches(scope: PaletteScope, query: string): SymbolDef[] {
  if (query.trim() === '') return [];
  return searchSymbols(codeOrder(insertableSymbols(scope)), query);
}

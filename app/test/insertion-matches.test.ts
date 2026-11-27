/**
 * Paridad entre la barra de inserción y la paleta: mismo catálogo, mismo
 * orden de desempate y mismo motor de búsqueda. La barra no tiene ranking
 * propio: si este test falla, alguien introdujo un segundo índice.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { CATALOG } from '../src/symbols/catalog.ts';
import { lineList, symbolList, type SymbolDef } from '../src/symbols/library.ts';
import { codeOrder } from '../src/ui/palette-order.ts';
import { searchSymbols } from '../src/symbols/search.ts';
import { insertableSymbols, insertionMatches } from '../src/ui/insertion-matches.ts';

const codes = (syms: SymbolDef[]): number[] => syms.map((sym) => sym.code);

/** La composición original de Palette.tsx, sin pasar por el helper nuevo. */
function paletteMatches(scope: 'all' | 'cadesimu', query: string): SymbolDef[] {
  const available = [...symbolList(), ...lineList()].filter(
    (sym) => scope === 'all' || CATALOG[sym.code] !== undefined,
  );
  return query.trim() === '' ? [] : searchSymbols(codeOrder(available), query);
}

for (const scope of ['cadesimu', 'all'] as const) {
  for (const query of [
    'contactor',       // nombre
    '6007',            // código exacto
    '10',              // prefijo de código
    'alimentacion',    // acentos y errata del catálogo
    'dahalander',      // errata del catálogo
    'zzzz',            // sin coincidencias
    '',                // consulta vacía
  ]) {
    test(`barra y paleta coinciden en ${scope} con «${query}»`, () => {
      assert.deepEqual(codes(insertionMatches(scope, query)), codes(paletteMatches(scope, query)));
    });
  }
}

test('el catálogo insertable respeta el alcance de la paleta', () => {
  const all = insertableSymbols('all');
  const cadesimu = insertableSymbols('cadesimu');
  assert.deepEqual(cadesimu, all.filter((sym) => CATALOG[sym.code] !== undefined));
});

test('no se altera el orden de la lista recibida', () => {
  const original = insertableSymbols('all');
  const snapshot = [...original];
  insertionMatches('all', 'motor');
  assert.deepEqual(original, snapshot);
  assert.deepEqual(insertableSymbols('all'), snapshot);
});

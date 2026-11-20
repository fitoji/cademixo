/**
 * Buscador de componentes de la paleta: por código CADe_SIMU o por nombre.
 *
 * Los nombres vienen del binario del CAD, con acentos y erratas incluidas
 * («Fuente de alimentacióm», «Dahalander», «Contactor IIII»). Por eso el
 * matching normaliza los acentos y, como último recurso, tolera una o dos
 * letras de diferencia. El orden lo decide un ranking explícito y no el orden
 * del catálogo: sin eso, buscar «motor» devuelve quince resultados arbitrarios.
 *
 * La parte pura no toca React ni el DOM; el módulo sólo ordena símbolos.
 */

/** Símbolo mínimo que el buscador necesita: código visible y nombre. */
export interface SearchableSymbol {
  code: number;
  name: string;
}

/** Posiciones del ranking: menor es mejor. */
export const RANK = {
  exactCode: 0,
  codePrefix: 1,
  codeContains: 2,
  namePrefix: 3,
  nameContains: 4,
  fuzzyName: 5,
} as const;

const DIACRITICS = /[\u0300-\u036f]/g;

/** Minúsculas, sin acentos y con los espacios colapsados. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(DIACRITICS, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Distancia de edición acotada: corta apenas supera `max`, así una consulta
 * larga contra un nombre largo no cuesta más de lo necesario.
 */
function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      current.push(value);
      if (value < best) best = value;
    }
    if (best > max) return false;
    previous = current;
  }
  return previous[b.length]! <= max;
}

/**
 * Lugar que ocupa un símbolo para la consulta, o `null` si no coincide.
 * `digits` ya viene validado: sólo se arma cuando la consulta es numérica.
 */
function rankOf(sym: SearchableSymbol, query: string, tokens: string[], digits: string | null): number | null {
  const code = String(sym.code);
  if (digits !== null) {
    if (code === digits) return RANK.exactCode;
    if (code.startsWith(digits)) return RANK.codePrefix;
    if (code.includes(digits)) return RANK.codeContains;
  }

  const name = normalize(sym.name);
  if (name.startsWith(query)) return RANK.namePrefix;
  if (tokens.every((token) => name.includes(token))) return RANK.nameContains;

  // Erratas del catálogo: sólo con consultas de cierto largo, para no llenar
  // la lista de coincidencias casuales de dos o tres letras. Vale por palabra
  // suelta, así «fuente alimentacion» encuentra «Fuente de alimentacióm».
  if (!digits && query.length >= 4) {
    const max = query.length >= 8 ? 2 : 1;
    const words = name.split(' ');
    const close = (token: string): boolean =>
      token.length >= 4 &&
      (withinEdits(token, name, max) || words.some((word) => word.includes(token) || withinEdits(token, word, max)));
    if (close(query) || tokens.every(close)) return RANK.fuzzyName;
  }

  return null;
}

/**
 * Símbolos que coinciden con la consulta, del mejor al peor empate.
 *
 * Entre iguales se respeta el orden recibido (el del catálogo), así la lista no
 * baila entre renders. Sin consulta devuelve una lista vacía: la paleta decide
 * qué mostrar en ese caso y el buscador no impone un «mostrar todo».
 */
export function searchSymbols<T extends SearchableSymbol>(symbols: readonly T[], rawQuery: string): T[] {
  const query = normalize(rawQuery);
  if (query === '') return [];
  const tokens = query.split(' ');
  const digits = /^\d+$/.test(query) ? query : null;

  const hits: { sym: T; rank: number; index: number }[] = [];
  symbols.forEach((sym, index) => {
    const rank = rankOf(sym, query, tokens, digits);
    if (rank !== null) hits.push({ sym, rank, index });
  });

  hits.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return hits.map((hit) => hit.sym);
}

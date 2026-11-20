import type { CSSProperties, JSX } from 'react';
import { useState, useSyncExternalStore } from 'react';
import { BoxesIcon, ChevronDownIcon, HistoryIcon, SearchIcon, StarIcon, XIcon } from 'lucide-react';
import { lineList, symbolList, type SymbolDef, type SymbolGroup } from '../symbols/library.ts';
import { CATALOG } from '../symbols/catalog.ts';
import { searchSymbols } from '../symbols/search.ts';
import { getScope, subscribeScope } from '../symbols/scope.ts';
import { getSettings, nextOpenAccordion, nextOpenCats, subscribeSettings } from './settings.ts';
import { SymbolGlyph } from './SymbolGlyph.tsx';
import { ComponentTooltip } from './ComponentTooltip.tsx';
import { PanelHead } from './PanelHead.tsx';
import type { Sheet } from '../model/project.ts';
import { getFavorites, isFavorite, subscribeFavorites, toggleStoredFavorite } from './favorites.ts';
import { getRecent, recordRecentUse, subscribeRecent } from './recent.ts';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

const GROUP_LABEL: Record<SymbolGroup, string> = {
  motor: 'Motores',
  potencia: 'Potencia',
  proteccion: 'Protección',
  mando: 'Mando',
  alimentacion: 'Alimentación',
  senalizacion: 'Señalización y pulsadores',
  sensor: 'Sensores',
  linea: 'Líneas y cables',
  borne: 'Borneras',
  carga: 'Cargas',
  otro: 'Otros',
};

const GROUP_ORDER: SymbolGroup[] = [
  'alimentacion',
  'motor',
  'potencia',
  'proteccion',
  'mando',
  'senalizacion',
  'sensor',
  'linea',
  'carga',
  'borne',
  'otro',
];

/** Tono por familia: pinta las miniaturas, no el esquema. */
const GROUP_TONE: Record<SymbolGroup, string> = {
  alimentacion: 'var(--tone-alimentacion)',
  motor: 'var(--tone-motor)',
  potencia: 'var(--tone-potencia)',
  proteccion: 'var(--tone-proteccion)',
  mando: 'var(--tone-mando)',
  senalizacion: 'var(--tone-senalizacion)',
  sensor: 'var(--tone-sensor)',
  linea: 'var(--wire)',
  carga: 'var(--tone-otro)',
  borne: 'var(--tone-otro)',
  otro: 'var(--tone-otro)',
};

interface Props {
  placing: number | null;
  onPick: (code: number | null) => void;
  sheets: Sheet[];
  activeSheet: number;
  onSheet: (index: number) => void;
}

interface Category {
  key: string;
  label: string;
  tone: string;
  syms: SymbolDef[];
}

/** Bloques de atajo que van arriba de las familias: favoritos y últimos usados. */
function shortcutCategories(favorites: SymbolDef[], recent: SymbolDef[]): Category[] {
  const out: Category[] = [];
  if (favorites.length > 0) {
    out.push({ key: 'fav', label: 'Favoritos', tone: 'var(--tone-senalizacion)', syms: favorites });
  }
  if (recent.length > 0) {
    out.push({ key: 'recent', label: 'Recientes', tone: 'var(--tone-mando)', syms: recent });
  }
  return out;
}

export function Palette({ placing, onPick, sheets, activeSheet, onSheet }: Props): JSX.Element {
  const scope = useSyncExternalStore(subscribeScope, getScope, getScope);
  const { autoCierre, paneles } = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  const horizontal = paneles === 'horizontal';
  const available = [...symbolList(), ...lineList()].filter(
    (sym) => scope === 'all' || CATALOG[sym.code] !== undefined,
  );
  const byGroup = new Map<SymbolGroup, typeof available>();
  for (const sym of available) {
    const list = byGroup.get(sym.group) ?? [];
    list.push(sym);
    byGroup.set(sym.group, list);
  }
  // Categorías plegadas: con el catálogo completo la lista no entra de una vista.
  // El mismo estado sirve a las dos orientaciones; arrancan todas plegadas.
  const [openCats, setOpenCats] = useState<string[]>([]);
  // Mismo store que el panel Propiedades: marcar la estrella allá arma el grupo acá.
  const favorites = useSyncExternalStore(subscribeFavorites, getFavorites, getFavorites);
  const recentCodes = useSyncExternalStore(subscribeRecent, getRecent, getRecent);

  // Buscador: por código («6007», «6») o por nombre, con acentos incluidos.
  const [query, setQuery] = useState('');
  const searching = query.trim() !== '';
  const matches = searching ? searchSymbols(available, query) : [];
  const firstMatch = matches[0];

  const favSymbols = favorites
    .map((code) => available.find((sym) => sym.code === code))
    .filter((sym): sym is (typeof available)[number] => sym !== undefined);

  const recentSymbols = recentCodes
    .map((code) => available.find((sym) => sym.code === code))
    .filter((sym): sym is (typeof available)[number] => sym !== undefined);

  const groups = GROUP_ORDER.filter((g) => byGroup.has(g));

  const categories = [
    ...shortcutCategories(favSymbols, recentSymbols),
    ...groups.map((group) => ({
      key: group,
      label: GROUP_LABEL[group],
      tone: GROUP_TONE[group],
      syms: byGroup.get(group)!,
    })),
  ];

  // Elegir anota el código en recientes: el próximo armado arranca con el atajo.
  const pick = (code: number | null): void => {
    if (code !== null) recordRecentUse(code);
    onPick(code);
  };

  const toggleCategory = (key: string): void => {
    // Con «Auto cierre» prendido queda abierto sólo el último panel elegido; apagado,
    // se abren varios a la vez como siempre.
    setOpenCats((prev) => nextOpenCats(prev, key, autoCierre));
  };

  // El acordeón entrega el conjunto abierto después del clic; el auto cierre se
  // resuelve igual que en la barra horizontal.
  const changeAccordion = (values: string[]): void => {
    setOpenCats((prev) => nextOpenAccordion(prev, values, autoCierre));
  };

  // Estilo CADe_SIMU: una categoría por ícono; se despliega al hacer clic.
  if (horizontal) {
    return (
      <aside className="relative z-10 flex w-full shrink-0 flex-col border-b border-border bg-card shadow-chrome-down">
        <div className="flex items-stretch gap-2 px-2 py-1.5">
          <div className="flex w-[150px] shrink-0 items-center">
            <SearchField
              query={query}
              onQuery={setQuery}
              onEnter={() => firstMatch && pick(firstMatch.code)}
              compact
            />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {searching ? (
              <span className="shrink-0 px-1 text-[10px] text-muted-foreground">
                {matches.length === 1 ? '1 resultado' : `${matches.length} resultados`}
              </span>
            ) : (
              categories.map((cat) => {
                const expanded = openCats.includes(cat.key);
                const first = cat.syms[0];
                return (
                  <Button
                    key={cat.key}
                    variant={expanded ? 'secondary' : 'ghost'}
                    className="flex h-auto shrink-0 items-center gap-1.5 px-1.5 py-1"
                    title={cat.label}
                    aria-expanded={expanded}
                    onClick={() => toggleCategory(cat.key)}
                  >
                    {first && (
                      <span
                        className="pal-tone grid size-[26px] shrink-0 place-items-center rounded-md border"
                        style={{ '--ink': cat.tone } as CSSProperties}
                      >
                        <svg className="size-[22px]" viewBox="-4 -6 26 24" aria-hidden="true">
                          <SymbolGlyph code={first.code} pinNames={first.pins.map((p) => p.name)} w={18} h={15} />
                        </svg>
                      </span>
                    )}
                    <span className="flex flex-col items-start leading-tight">
                      <span className="text-[9px] font-semibold tracking-[0.3px] uppercase">{cat.label}</span>
                      <span className="text-[8px] text-muted-foreground">{cat.syms.length}</span>
                    </span>
                    <ChevronDownIcon className={expanded ? 'size-3 rotate-180 transition-transform' : 'size-3 transition-transform'} />
                  </Button>
                );
              })
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1 border-l border-border pl-2">
            {sheets.map((sheet, i) => (
              <Button
                key={sheet.index}
                variant={i === activeSheet ? 'secondary' : 'ghost'}
                size="icon-xs"
                className="font-mono text-[10px]"
                title={`Hoja ${i + 1}`}
                aria-current={i === activeSheet ? 'true' : undefined}
                onClick={() => onSheet(i)}
              >
                {String(i + 1).padStart(2, '0')}
              </Button>
            ))}
          </div>
        </div>
        {searching ? (
          <div className="flex items-center gap-1 overflow-x-auto border-t border-border/60 bg-background/40 px-2 py-1">
            {matches.length === 0 ? (
              <span className="px-1 py-1 text-[10px] text-muted-foreground">Sin resultados para «{query.trim()}»</span>
            ) : (
              matches.map((sym) => (
                <SymbolTile key={sym.code} sym={sym} group={sym.group} active={placing === sym.code} onPick={pick} />
              ))
            )}
          </div>
        ) : (
          categories
            .filter((cat) => openCats.includes(cat.key))
            .map((cat) => (
              <div
                key={cat.key}
                className="flex items-center gap-1 overflow-x-auto border-t border-border/60 bg-background/40 px-2 py-1"
              >
                {cat.syms.map((sym) => (
                  <SymbolTile key={sym.code} sym={sym} group={sym.group} active={placing === sym.code} onPick={pick} />
                ))}
              </div>
            ))
        )}
      </aside>
    );
  }

  // El ancho lo lleva el panel redimensionable del App; acá sólo se llena.
  return (
    <aside className="relative z-10 flex min-h-0 w-full flex-1 flex-col bg-card shadow-chrome-right">
      <PanelHead>Insertar componente</PanelHead>

      <div className="shrink-0 border-b border-border/60 px-1.5 py-1">
        <SearchField query={query} onQuery={setQuery} onEnter={() => firstMatch && pick(firstMatch.code)} />
      </div>

      {/*
        La paleta ocupa el mismo lugar del layout que la barra horizontal, un
        contenedor sin altura propia: la zona plegable lleva su altura acotada
        para poder scrollear sin empujar el lienzo.
      */}
      <ScrollArea className="min-h-0 flex-1">
        {searching ? (
          <div className="px-1.5 pb-3">
            <div className="px-1.5 py-1.5 text-[10px] tracking-[0.5px] text-muted-foreground uppercase">
              {matches.length === 1 ? '1 resultado' : `${matches.length} resultados`}
            </div>
            {matches.map((sym) => (
              <SymbolRow
                key={sym.code}
                sym={sym}
                group={sym.group}
                active={placing === sym.code}
                favorite={isFavorite(favorites, sym.code)}
                onPick={pick}
                onToggleFavorite={toggleStoredFavorite}
              />
            ))}
            {matches.length === 0 && (
              <Empty className="p-4">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SearchIcon />
                  </EmptyMedia>
                  <EmptyTitle>Sin resultados</EmptyTitle>
                  <EmptyDescription className="text-xs">
                    Ningún componente coincide con «{query.trim()}». Probá con el código o con parte del nombre.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        ) : (
          <div className="px-1.5 pb-3">
            <Accordion type="multiple" value={openCats} onValueChange={changeAccordion}>
              {categories.map((cat) => (
                <AccordionItem key={cat.key} value={cat.key} className="border-border/60">
                  <AccordionTrigger className="items-center gap-1.5 px-1.5 py-1.5 text-[10px] font-semibold tracking-[0.5px] text-muted-foreground uppercase hover:text-foreground hover:no-underline">
                    {cat.key === 'fav' ? (
                      <StarIcon className="size-3 shrink-0 fill-current text-[var(--tone-senalizacion)]" />
                    ) : cat.key === 'recent' ? (
                      <HistoryIcon className="size-3 shrink-0" style={{ color: cat.tone }} />
                    ) : (
                      <span className="size-1.5 shrink-0 rounded-full" style={{ background: cat.tone }} />
                    )}
                    <span className="truncate">{cat.label}</span>
                    <Badge variant="ghost" className="ml-auto h-4 shrink-0 px-1 font-mono text-[10px] font-normal">
                      {cat.syms.length}
                    </Badge>
                  </AccordionTrigger>
                  <AccordionContent className="pt-0.5 pb-1">
                    {cat.syms.map((sym) => (
                      <SymbolRow
                        key={sym.code}
                        sym={sym}
                        group={sym.group}
                        active={placing === sym.code}
                        favorite={isFavorite(favorites, sym.code)}
                        onPick={pick}
                        onToggleFavorite={toggleStoredFavorite}
                      />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            {available.length === 0 && (
              <Empty className="p-4">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BoxesIcon />
                  </EmptyMedia>
                  <EmptyTitle>Sin plantillas</EmptyTitle>
                  <EmptyDescription className="text-xs">
                    Corré <span className="font-mono">node scripts/make-templates.ts</span>.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        )}
      </ScrollArea>

      <div className="shrink-0 border-t border-border p-1.5">
        <div className="px-1.5 pt-1 pb-1 text-[10px] tracking-[0.5px] text-muted-foreground uppercase">Hojas</div>
        {sheets.map((sheet, i) => (
          <Button
            key={sheet.index}
            variant={i === activeSheet ? 'secondary' : 'ghost'}
            size="sm"
            className="w-full justify-start gap-2 px-1.5 text-xs"
            aria-current={i === activeSheet ? 'true' : undefined}
            onClick={() => onSheet(i)}
          >
            <Badge variant="outline" className="h-4 shrink-0 px-1 font-mono text-[10px] font-normal">
              {String(i + 1).padStart(2, '0')}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-left">
              Hoja {i + 1}
              {sheet.titleBlock?.raw.includes('CADe_S1') ? ' · PLC' : ''}
            </span>
          </Button>
        ))}
      </div>
    </aside>
  );
}

/** Campo de búsqueda: código exacto, prefijo de familia o nombre. */
function SearchField({
  query,
  onQuery,
  onEnter,
  compact = false,
}: {
  query: string;
  onQuery: (value: string) => void;
  onEnter: () => void;
  compact?: boolean;
}): JSX.Element {
  return (
    <div className="relative w-full">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          // Enter elige el primero del ranking; Escape limpia y vuelve al catálogo.
          if (event.key === 'Enter') {
            event.preventDefault();
            onEnter();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onQuery('');
          }
        }}
        placeholder={compact ? 'Buscar…' : 'Código o nombre'}
        aria-label="Buscar componente por código o nombre"
        className="h-7 rounded-md pr-7 pl-7 text-xs"
      />
      {query !== '' && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="absolute top-1/2 right-0.5 -translate-y-1/2"
          aria-label="Limpiar búsqueda"
          title="Limpiar búsqueda"
          onClick={() => onQuery('')}
        >
          <XIcon className="size-3" />
        </Button>
      )}
    </div>
  );
}

interface RowProps {
  sym: SymbolDef;
  group: SymbolGroup;
  active: boolean;
  favorite: boolean;
  onPick: (code: number | null) => void;
  onToggleFavorite: (code: number) => void;
}

/** Ícono compacto para la barra horizontal del estilo CADe_SIMU. */
function SymbolTile({
  sym,
  group,
  active,
  onPick,
}: {
  sym: SymbolDef;
  group: SymbolGroup;
  active: boolean;
  onPick: (code: number | null) => void;
}): JSX.Element {
  return (
    <ComponentTooltip sym={sym} label={GROUP_LABEL[group]} tone={GROUP_TONE[group]}>
      <Button
        variant={active ? 'secondary' : 'ghost'}
        className="flex h-auto w-[56px] flex-col items-center gap-0.5 px-0.5 py-1"
        aria-pressed={active}
        onClick={() => onPick(active ? null : sym.code)}
      >
        <span
          className="pal-tone grid size-[28px] shrink-0 place-items-center rounded-md border"
          style={{ '--ink': GROUP_TONE[group] } as CSSProperties}
        >
          <svg className="size-[24px]" viewBox="-4 -6 26 24" aria-hidden="true">
            <SymbolGlyph code={sym.code} pinNames={sym.pins.map((p) => p.name)} w={18} h={15} />
          </svg>
        </span>
        <span className="w-full truncate text-center text-[8px] leading-tight">{sym.name}</span>
      </Button>
    </ComponentTooltip>
  );
}

/** Una fila de la paleta: elegir el componente y marcarlo como favorito. */
function SymbolRow({ sym, group, active, favorite, onPick, onToggleFavorite }: RowProps): JSX.Element {
  return (
    <div className="flex items-center gap-0.5">
      <ComponentTooltip sym={sym} label={GROUP_LABEL[group]} tone={GROUP_TONE[group]}>
        <Button
          variant={active ? 'secondary' : 'ghost'}
          className="h-auto min-w-0 flex-1 justify-start gap-2 px-1.5 py-1"
          aria-pressed={active}
          onClick={() => onPick(active ? null : sym.code)}
        >
          <span
            className="pal-tone grid size-[30px] shrink-0 place-items-center rounded-md border"
            style={{ '--ink': GROUP_TONE[group] } as CSSProperties}
          >
            <svg className="size-[26px]" viewBox="-4 -6 26 24" aria-hidden="true">
              <SymbolGlyph code={sym.code} pinNames={sym.pins.map((p) => p.name)} w={18} h={15} />
            </svg>
          </span>
          <span className="min-w-0 flex-1 truncate text-left text-xs">{sym.name}</span>
          <Badge variant="outline" className="ml-auto h-4 shrink-0 px-1 font-mono text-[10px] font-normal">
            {sym.code}
          </Badge>
        </Button>
      </ComponentTooltip>
      <Button
        variant="ghost"
        size="icon-xs"
        className="shrink-0"
        aria-label={favorite ? `Quitar ${sym.name} de favoritos` : `Marcar ${sym.name} como favorito`}
        aria-pressed={favorite}
        title={favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
        onClick={() => onToggleFavorite(sym.code)}
      >
        <StarIcon className={favorite ? 'fill-current text-[var(--tone-senalizacion)]' : 'text-muted-foreground'} />
      </Button>
    </div>
  );
}

import type { CSSProperties, JSX } from 'react';
import { useSyncExternalStore } from 'react';
import { LAMP_COLORS, type LampColor } from '../model/project.ts';
import { resolveSymbol, type Shape } from '../symbols/library.ts';
import { bladeTransform, shapesBounds, type BladeState } from '../symbols/draw.ts';
import { getSettings, pinRadius, pinStroke, subscribeSettings } from './settings.ts';

interface Props {
  code: number;
  pinNames: string[];
  w: number;
  h: number;
  rotation?: number;
  selected?: boolean;
  /** Estado del contacto durante la simulación: cerrado o abierto. */
  closed?: boolean;
  /** Durante la simulación, un pulsador ya está apretado. */
  pressed?: boolean;
  /** Color guardado de la lámpara (códigos 9008/9009). `null` = tinta normal. */
  lampColor?: LampColor | null;
  /** Componente energizado por la simulación (pinta el rotor del motor). */
  live?: boolean;
  /**
   * Dónde se dibuja el símbolo:
   *
   * - `center` (default): dentro de la caja `(w, h)`. Es lo que usan las
   *   vistas previas de la paleta.
   * - `origin`: en el origen del registro, que es donde lo dibuja CADeSimu.
   *   Los símbolos anclados al origen (`SymbolDef.anchor`) traen su propia
   *   geometría en unidades del archivo, así que no se escalan con la caja.
   */
  place?: 'center' | 'origin';
}

/**
 * Estilo de una hoja móvil: gira sobre su pivote cuando cambia de pose.
 *
 * La pose la decide `bladeTransform` (pura, en `draw.ts`, S9): el NC se dibuja
 * apoyado, así que su giro (`deg` negativo) se aplica cuando está abierto; el
 * NA al revés. El pivote va en porcentaje de la caja de tinta del trazo para
 * que `fill-box` lo tome tal cual, también en los trazos de varios tramos.
 */
function bladeStyle(shape: Shape, state: BladeState): CSSProperties | undefined {
  const rot = bladeTransform(shape, state);
  if (!rot) return undefined;
  return {
    transformBox: 'fill-box',
    transformOrigin: `${rot.originX}% ${rot.originY}%`,
    transform: rot.angle === 0 ? 'none' : `rotate(${rot.angle}deg)`,
    transition: 'transform 140ms cubic-bezier(0.2, 0.7, 0.3, 1)',
  };
}

/** Dibuja un símbolo en su caja local (0,0)–(w,h). */
export function SymbolGlyph({
  code,
  pinNames,
  w,
  h,
  rotation = 0,
  selected = false,
  closed = false,
  pressed = false,
  lampColor = null,
  live = false,
  place = 'center',
}: Props): JSX.Element {
  // Tamaño de borne elegido en Configuración → Apariencia; sin preferencia, 1,4.
  const { pinSize } = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  const sym = resolveSymbol(code, pinNames);
  const shapes = sym.shapes(w, h);
  const labels = sym.labels?.(w, h) ?? [];
  const cx = w / 2;
  const cy = h / 2;
  const rotor = live && sym.group === 'motor';
  // Pose de las hojas móviles: el contacto que conduce y el aparato accionado.
  const bladeState: BladeState = { closed, pressed };
  const r = Math.min(w, h) * 0.42;
  const arrow = `M ${cx - r * 0.55} ${cy - r * 1.12} A ${r * 0.92} ${r * 0.92} 0 0 1 ${cx + r * 0.55} ${cy - r * 1.12}`;
  const head = `M ${cx + r * 0.55} ${cy - r * 1.12} l ${-r * 0.22} ${-r * 0.14} M ${cx + r * 0.55} ${cy - r * 1.12} l ${-r * 0.02} ${r * 0.28}`;

  // Un símbolo anclado al origen trae su geometría en unidades del archivo:
  // en el lienzo se dibuja tal cual (el origen del registro es el 0,0) y en
  // las vistas previas se centra en la caja.
  const anchored = sym.anchor === 'origin';
  const bounds = shapesBounds(shapes);
  const inkCx = (bounds.minX + bounds.maxX) / 2;
  const inkCy = (bounds.minY + bounds.maxY) / 2;
  const shift =
    anchored && place === 'origin'
      ? { x: 0, y: 0 }
      : anchored
        ? { x: cx - inkCx, y: cy - inkCy }
        : { x: 0, y: 0 };
  const pivot = anchored ? { x: inkCx + shift.x, y: inkCy + shift.y } : { x: cx, y: cy };

  return (
    <g
      className={selected ? 'sym sel' : 'sym'}
      data-lamp={lampColor === null ? undefined : LAMP_COLORS[lampColor]}
      transform={`translate(${shift.x} ${shift.y}) rotate(${rotation} ${pivot.x} ${pivot.y})`}
    >
      {shapes.map((s, i) => (
        <path
          key={`s${i}`}
          d={s.d}
          className={[s.fill ? 'fill' : '', s.thin ? 'thin' : '', s.dashed ? 'dashed' : '', s.lamp ? 'lamp' : ''].filter(Boolean).join(' ') || undefined}
          style={s.blade ? bladeStyle(s, bladeState) : undefined}
        />
      ))}
      {rotor && (
        <g className="motor-rotor" style={{ transformOrigin: `${cx}px ${cy}px` }}>
          <path className="motor-arrow" d={arrow} />
          <path className="motor-arrow" d={head} />
        </g>
      )}
      {anchored
        ? (sym.originPins ?? []).map((p) => (
            <circle
              key={`op-${p.name}`}
              className="pin"
              cx={p.x}
              cy={p.y}
              r={pinRadius(pinSize)}
              strokeWidth={pinStroke(pinSize)}
            >
              <title>{p.name}</title>
            </circle>
          ))
        : sym.pins.map((p) => (
            <circle
              key={`p-${p.name}`}
              className="pin"
              cx={p.nx * w}
              cy={p.ny * h}
              r={pinRadius(pinSize)}
              strokeWidth={pinStroke(pinSize)}
            >
              <title>{p.name}</title>
            </circle>
          ))}
      {labels.map((l, i) => (
        <text
          key={`t${i}`}
          x={l.x}
          y={l.y}
          className="designator"
          style={{ fontSize: l.size }}
          textAnchor={l.anchor ?? 'middle'}
          dominantBaseline="middle"
        >
          {l.value}
        </text>
      ))}
    </g>
  );
}

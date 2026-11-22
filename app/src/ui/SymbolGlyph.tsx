import type { CSSProperties, JSX } from 'react';
import { useSyncExternalStore } from 'react';
import { LAMP_COLORS, type LampColor } from '../model/project.ts';
import {
  IDENTITY,
  isIdentity,
  multiply,
  normalizeRotation,
  rotationMatrix,
  transformMatrix,
  type Matrix,
  type Transform,
} from '../model/transform.ts';
import { resolveSymbol, type Shape } from '../symbols/library.ts';
import { bladeTransform, rotorArrow, rotorReversed, shapesBounds, type BladeState } from '../symbols/draw.ts';
import { getSettings, pinRadius, pinStroke, subscribeSettings } from './settings.ts';

interface Props {
  code: number;
  pinNames: string[];
  /** Visibilidad por borne (flags del registro): false no dibuja el punto. */
  w: number;
  h: number;
  /**
   * Capa visual del editor (tecla `R`): gira ENCIMA de la orientación del
   * archivo. No se guarda — escribir `geometry[17]` sigue pendiente (S3).
   */
  rotation?: number;
  /**
   * Orientación leída del registro (`geometry[17]`): giro y espejo. El archivo
   * manda (S6), así que es la base sobre la que se compone la capa visual.
   */
  transform?: Transform;
  selected?: boolean;
  /** Estado del contacto durante la simulación: cerrado o abierto. */
  closed?: boolean;
  /** Durante la simulación, un pulsador ya está apretado. */
  pressed?: boolean;
  /** Color guardado de la lámpara (códigos 9008/9009). `null` = tinta normal. */
  lampColor?: LampColor | null;
  /** Componente energizado por la simulación (pinta el rotor del motor). */
  live?: boolean;
  /** Sentido de giro del motor: +1 horario, -1 antihorario. */
  direction?: 1 | -1;
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

/** Matriz afín en el atributo `transform`, sin la cola de decimales del float. */
function matrixAttr(m: Matrix): string {
  const n = (value: number): string => String(Math.round(value * 1000) / 1000);
  return `matrix(${n(m.a)} ${n(m.b)} ${n(m.c)} ${n(m.d)} ${n(m.e)} ${n(m.f)})`;
}

/** Dibuja un símbolo en su caja local (0,0)–(w,h). */
export function SymbolGlyph({
  code,
  pinNames,
  w,
  h,
  rotation = 0,
  transform = IDENTITY,
  selected = false,
  closed = false,
  pressed = false,
  lampColor = null,
  live = false,
  direction = 1,
  place = 'center',
}: Props): JSX.Element {
  // Tamaño de borne elegido en Configuración → Apariencia; sin preferencia, 1,4.
  const { pinSize } = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  const sym = resolveSymbol(code, pinNames);
  const shapes = sym.shapes(w, h);
  const labels = sym.labels?.(w, h) ?? [];
  const cx = w / 2;
  const cy = h / 2;
  // Flecha de giro del motor energizado. Gira sobre el centro del CUERPO, que
  // no es el de la caja cuando el símbolo está anclado al origen: el `1000`
  // dibuja su círculo en (6, 6) y la caja de 24×24 tiene el centro en (12, 12).
  // Por eso el pivote sale de `motorBody` y no de `cx`/`cy` (S4).
  const rotor = live && sym.group === 'motor' ? rotorArrow(sym.motorBody, w, h) : null;
  // Pose de las hojas móviles: el contacto que conduce y el aparato accionado.
  const bladeState: BladeState = { closed, pressed };

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

  // Orientación del archivo primero y capa visual del editor después (S6). Las
  // dos giran alrededor del mismo pivote, así que el símbolo no se corre.
  const fileMatrix = transformMatrix(transform, pivot);
  const composed = multiply(rotationMatrix(normalizeRotation(rotation), pivot), fileMatrix);
  const placement = `translate(${shift.x} ${shift.y}) ${matrixAttr(composed)}`;

  return (
    <g
      className={selected ? 'sym sel' : 'sym'}
      data-lamp={lampColor === null ? undefined : LAMP_COLORS[lampColor]}
      data-orientation={isIdentity(transform) ? undefined : `${transform.rotation}${transform.mirror ? 'm' : ''}`}
      transform={placement}
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
        <g
          className={rotorReversed(direction, transform.mirror) ? 'motor-rotor rev' : 'motor-rotor'}
          style={{ transformOrigin: `${rotor.x}px ${rotor.y}px` }}
        >
          <path className="motor-arrow" d={rotor.arrow} />
          <path className="motor-arrow" d={rotor.head} />
        </g>
      )}
      {anchored
        ? (sym.originPins ?? [])
            .map((p) => (
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
        : sym.pins
            .map((p) => (
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

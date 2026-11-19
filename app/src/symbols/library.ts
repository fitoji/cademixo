/**
 * Librería de símbolos IEC 60617 de Electro-Simulador.
 *
 * Por qué existe: el formato `.cade` guarda los NOMBRES de los bornes
 * (`1 3 5 2 4 6`, `U1 V1 W1 PE`) pero no sus coordenadas. La geometría real
 * de cada borne vive en la librería de símbolos del CAD, no en el archivo.
 *
 * Consecuencia de diseño: esta librería ES la fuente de verdad de la geometría
 * de pines. Por eso el prototipo del spike conectaba al lugar equivocado — no
 * tenía librería, sólo un reparto aproximado sobre el perímetro.
 *
 * Los dibujos se calculan a partir de la caja declarada (w, h) del registro,
 * así el símbolo escala con lo que el archivo dice, sin inventar dimensiones.
 */

export type SymbolGroup =
  | 'motor'
  | 'potencia'
  | 'proteccion'
  | 'mando'
  | 'alimentacion'
  | 'senalizacion'
  | 'sensor'
  | 'linea'
  | 'borne'
  | 'carga'
  | 'otro';

import {
  cadesimuLamp,
  circle,
  contact,
  left,
  line,
  pinsBoth,
  rect,
  right,
  threePole,
} from './draw.ts';
import { FAMILY_SYMBOLS, LINE_SYMBOLS, polesInCadeOrder } from './families.ts';
import { QET_SYMBOLS } from './qet.ts';
import { withQetGeometry } from './qet-adapter.ts';

export interface SymbolPin {
  name: string;
  /** posición normalizada del centro del borne dentro de la caja: 0..1 */
  nx: number;
  ny: number;
  side: 'left' | 'right' | 'top' | 'bottom';
}

/**
 * Pose en la que la hoja móvil está girada.
 *
 * Por defecto la decide el signo de `deg`, que es la convención de todos los
 * contactos: positivo cierra la hoja dibujada abierta (NA) y negativo abre la
 * dibujada apoyada (NC). `active` gira la hoja cuando el aparato está accionado
 * — apretado a mano o cerrado por el circuito — y es lo que necesita el
 * pulsador conmutado (8003), cuya pose sigue al accionamiento.
 */
export type BladeWhen = 'closed' | 'open' | 'active';

export interface Blade {
  /** pivote del giro, en unidades del símbolo */
  px: number;
  py: number;
  /** giro que lleva la hoja a la otra pose, en grados con signo */
  deg: number;
  /** pose que gira la hoja; sin dato la decide el signo de `deg` */
  when?: BladeWhen;
}

export interface Shape {
  d: string;
  fill?: boolean;
  /** trazo fino para detalles (ejes, marcas) */
  thin?: boolean;
  /** trazo punteado: el acoplamiento mecánico entre dos contactos */
  dashed?: boolean;
  /**
   * Vidrio de una lámpara: se pinta con el color guardado en el archivo cuando
   * el registro lo trae. Sin color queda con la tinta normal del dibujo.
   */
  lamp?: boolean;
  /** Hoja móvil de un contacto: gira sobre su pivote al cambiar de pose. */
  blade?: Blade;
}

export interface Label {
  x: number;
  y: number;
  value: string;
  size: number;
  anchor?: 'start' | 'middle' | 'end';
}

export interface SymbolDef {
  code: number;
  name: string;
  group: SymbolGroup;
  pins: SymbolPin[];
  /** Tamaño con el que se inserta el componente (sólo si no hay plantilla real). */
  size?: { w: number; h: number };
  /**
   * Anclaje del dibujo respecto del registro.
   *
   * `box` (default) dibuja el símbolo dentro de la caja declarada, que es la
   * grilla de conexión de 6 unidades. `origin` lo dibuja en el ORIGEN del
   * registro, con geometría intrínseca en unidades del archivo: es el modelo de
   * CADeSimu, donde la caja declarada es la grilla de conexión y no el marco
   * del dibujo.
   */
  anchor?: 'box' | 'origin';
  /**
   * Bornes en unidades absolutas del archivo, relativos al origen, para los
   * símbolos anclados al origen. El nombre del borne sigue siendo el del
   * archivo: esto sólo dice DÓNDE se conecta.
   */
  originPins?: OriginPin[];
  shapes(w: number, h: number): Shape[];
  labels?(w: number, h: number): Label[];
}

/** Borne de un símbolo anclado al origen, en unidades del archivo. */
export interface OriginPin {
  name: string;
  x: number;
  y: number;
}

// --- helpers de dibujo -------------------------------------------------------
// (line, rect, circle, left, right, spread, pinsBoth, contact, threePole y
// poles viven en draw.ts: las familias generadas los comparten.)

const genericPins = (names: string[]): SymbolPin[] =>
  names.length === 0 ? pinsBoth(2, ['1', '2']) : pinsBoth(names.length, names);

// --- símbolos ---------------------------------------------------------------

/**
 * Motor trifásico (el 1000), anclado al origen, como lo dibuja CADeSimu:
 * los cuatro bornes caen sobre la fila del registro (`U1` en el origen,
 * `V1`/`W1`/`PE` cada 6 unidades) y la tinta empieza 6 unidades arriba,
 * tapando el cable igual que en CADe. Círculo de r=9 centrado en (6,6);
 * cada stub baja hasta ~0,15 del borde del círculo (el hueco visual que
 * deja CADe). La terminal del `PE` es un arco concéntrico al cuerpo
 * (r=9,75), no una marca de tierra. Geometría medida sobre
 * `docs/cadesimu-svg/reference/PR1_Rodolfo_Giusti_03.png` (M1 en (183,168)).
 */
const motor: SymbolDef = {
  code: 1000,
  name: 'Motor trifásico',
  group: 'motor',
  pins: [
    { name: 'U1', nx: 0, ny: 0, side: 'top' },
    { name: 'V1', nx: 0.25, ny: 0, side: 'top' },
    { name: 'W1', nx: 0.5, ny: 0, side: 'top' },
    { name: 'PE', nx: 0.75, ny: 0, side: 'top' },
  ],
  anchor: 'origin',
  originPins: [
    { name: 'U1', x: 0, y: 0 },
    { name: 'V1', x: 6, y: 0 },
    { name: 'W1', x: 12, y: 0 },
    { name: 'PE', x: 18, y: 0 },
  ],
  size: { w: 24, h: 24 },
  shapes() {
    return [
      { d: circle(6, 6, 9) },
      // Bajadas de los bornes, hasta ~0,15 del borde del círculo.
      { d: line(0, -6, 0, -0.375) },
      { d: line(6, -6, 6, -2.875) },
      { d: line(12, -6, 12, -0.875) },
      // El PE baja hasta la altura del centro y entra con un gancho.
      { d: line(18, -6, 18, 6) },
      { d: line(18, 6, 15.5, 6) },
      // Terminal del PE: arco concéntrico al cuerpo, pegado al borde derecho.
      { d: 'M15.55 4a9.75 9.75 0 0 1 0 4', thin: true },
    ];
  },
  labels() {
    return [
      { x: 6, y: 3, value: 'M', size: 2.8, anchor: 'middle' },
      { x: 6, y: 7.5, value: '3~', size: 2.5, anchor: 'middle' },
    ];
  },
};

const powerContact: SymbolDef = {
  code: 2001,
  name: 'Contactor III',
  group: 'potencia',
  pins: polesInCadeOrder(3, { w: 18, h: 15 }),
  anchor: 'origin',
  // Registro 31 del fixture PR1 (`*183*132*...*-12*-3*18*15*`): bornes 1-3-5
  // en la fila superior y 2-4-6 en la inferior, columnas 0/6/12.
  originPins: [
    { name: '1', x: 0, y: 0 },
    { name: '3', x: 6, y: 0 },
    { name: '5', x: 12, y: 0 },
    { name: '2', x: 0, y: 12 },
    { name: '4', x: 6, y: 12 },
    { name: '6', x: 12, y: 12 },
  ],
  size: { w: 18, h: 15 },
  // Medido sobre la captura PR1 a 4 px por unidad: stub superior (p,−6)→(p,−3)
  // —1 px negro alineado sobre el borde de la caja, donde el cable (gris de
  // CADe) se apoya—, hoja (p−3,−3)→(p,+3) con pivote en (p,+3) y montante
  // (p,+3)→(p,+6): de +6 a la fila inferior +12 el tramo lo dibuja el
  // ruteador (queda bajo el relleno de la caja). El guion mecánico
  // discontinuo en y=0 arranca en el cruce de la hoja 1 (−1,5) y termina en
  // el de la hoja 3 (+10,5).
  shapes() {
    return [
      ...[0, 6, 12].flatMap((p) => [
        { d: line(p, -6, p, -3) },
        { d: line(p - 3, -3, p, 3) },
        { d: line(p, 3, p, 6) },
      ]),
      { d: line(-1.5, 0, 0.5, 0), thin: true },
      { d: line(3.5, 0, 5.5, 0), thin: true },
      { d: line(8.5, 0, 10.5, 0), thin: true },
    ];
  },
};

/**
 * Contactor bipolar (el 2000), anclado al origen.
 *
 * Medido sobre `docs/03/componentes01.png` (S=4, OX=-17, OY=-101), registro
 * `*2000#-KM##1#3#2#4####*…*27*126*…*-12*-3*12*15*`: por polo (columnas 0/6)
 * el conductor superior baja de 0 a 3, la hoja sale del borne inferior (p,9)
 * hasta (p−3,3) y la bajada cierra en la fila de abajo. El guion mecánico
 * punteado va a media hoja (y=6), del cruce de la hoja 1 al de la hoja 2:
 * −1,5 … 4,5 en tramos de 1,75 con hueco de 2,5.
 */
const powerContact2: SymbolDef = {
  code: 2000,
  name: 'Contactor II',
  group: 'potencia',
  pins: polesInCadeOrder(2, { w: 12, h: 15 }),
  anchor: 'origin',
  originPins: [
    { name: '1', x: 0, y: 0 },
    { name: '3', x: 6, y: 0 },
    { name: '2', x: 0, y: 12 },
    { name: '4', x: 6, y: 12 },
  ],
  size: { w: 12, h: 15 },
  shapes() {
    return [
      ...[0, 6].flatMap((p) => [
        { d: line(p, 0, p, 3) },
        { d: line(p, 9, p - 3, 3), blade: { px: p, py: 9, deg: PUSH_BLADE_DEG } },
        { d: line(p, 9, p, 12) },
      ]),
      { d: line(-1.5, 6, 0.25, 6), thin: true },
      { d: line(2.75, 6, 4.5, 6), thin: true },
    ];
  },
};

/**
 * Disyuntor motor unipolar (el 6010), anclado al origen.
 *
 * Medido sobre `docs/03/componentes01.png` (S=4, OX=-17, OY=-101), registro
 * `*6010#-Q##1#2######*…*156*120*…*-21*-3*6*24*`: el polo ocupa la columna 0
 * (conductor de 0 a 3, hoja (0,9)→(−3,3), bajada 9→12), la caja doble va de
 * (−3,12) a (3,18) con la divisoria en y=15, el gancho del térmico se abre a la
 * derecha entre 12,75 y 14 y el disparo magnético es el cuadrado con cruz
 * (−8,4)-(−4,8), enlazado al polo por una línea en y=6 y un punteado en x=−6.
 */
const breakerMotor1: SymbolDef = {
  code: 6010,
  name: 'Disyuntor I',
  group: 'proteccion',
  pins: [left(0.5, '1'), right(0.5, '2')],
  anchor: 'origin',
  originPins: [
    { name: '1', x: 0, y: 0 },
    { name: '2', x: 0, y: 21 },
  ],
  size: { w: 6, h: 24 },
  shapes() {
    return [
      // Polo: conductor superior, hoja y bajada hasta la caja.
      { d: line(0, 0, 0, 3) },
      { d: line(0, 9, -3, 3), blade: { px: 0, py: 9, deg: PUSH_BLADE_DEG } },
      { d: line(0, 9, 0, 12) },
      // Caja doble con la divisoria del térmico.
      { d: rect(-3, 12, 6, 6) },
      { d: line(-3, 15, 3, 15) },
      // Gancho del elemento térmico.
      { d: line(0, 12, 0, 12.75) },
      { d: 'M0 12.75H1.25V14H0', thin: true },
      { d: line(0, 14, 0, 15) },
      // Dos puntos del térmico.
      { d: line(1.25, 16, 1.25, 16) },
      { d: line(1.25, 16.5, 1.25, 16.5) },
      // Disparo magnético: cuadrado con cruz y su acometida.
      { d: rect(-8, 4, 4, 4) },
      { d: line(-6, 4, -6, 8) },
      { d: line(-10, 6, -2.25, 6) },
      { d: line(-10, 4, -10, 8) },
      // Enlace mecánico punteado hasta la caja.
      { d: line(-6, 8.25, -6, 9) },
      { d: line(-6, 10, -6, 11) },
      { d: line(-6, 13.25, -5.25, 13.25) },
      { d: line(-4, 13.25, -3, 13.25) },
      // Bajada al borne inferior.
      { d: line(0, 18, 0, 21) },
    ];
  },
};

/**
 * Resistencia I (la 1050), anclada al origen.
 *
 * Medido sobre `docs/03/componentes01.png` (S=4, OX=-17, OY=-101), registro
 * `*1050#-R##1#2######*…*12*75*…*-12*-3*6*18*`: el cuerpo es un rectángulo
 * vertical de 2,75 de ancho pegado al conductor, de y=3 a y=12, con los bornes
 * en la fila superior y en la inferior (y=15).
 */
const resistor1: SymbolDef = {
  code: 1050,
  name: 'Resistencia I',
  group: 'potencia',
  pins: [left(0.5, '1'), right(0.5, '2')],
  anchor: 'origin',
  originPins: [
    { name: '1', x: 0, y: 0 },
    { name: '2', x: 0, y: 15 },
  ],
  size: { w: 6, h: 18 },
  shapes() {
    return [
      { d: line(0, 0, 0, 3) },
      { d: rect(-1.5, 3, 2.75, 9) },
      { d: line(0, 12, 0, 15) },
    ];
  },
};

/**
 * Bobina biestable (la 9001), anclada al origen.
 *
 * Medido sobre `docs/03/componentes01.png` (S=4, OX=-17, OY=-101), registro
 * `*9001#-K##A1#B1#A2#####*…*21*105*…*-15*-3*9*15*`: dos patas de entrada en
 * x=−3 y x=3 que bajan hasta el cuerpo, rectángulo de (−4,4) a (4,8) con las
 * dos diagonales de la bobina doble, y la pata de salida en el centro hasta la
 * fila inferior (y=12).
 */
const coilBistable: SymbolDef = {
  code: 9001,
  name: 'Bobina biestable',
  group: 'mando',
  pins: [left(0.4, 'A1'), left(0.6, 'B1'), right(0.5, 'A2')],
  anchor: 'origin',
  originPins: [
    { name: 'A1', x: -3, y: 0 },
    { name: 'B1', x: 3, y: 0 },
    { name: 'A2', x: 0, y: 12 },
  ],
  size: { w: 9, h: 15 },
  shapes() {
    return [
      { d: line(-3, 0, -3, 4) },
      { d: line(3, 0, 3, 4) },
      { d: rect(-4, 4, 8, 4) },
      { d: line(-1.25, 4.25, -3, 7.75), thin: true },
      { d: line(1, 4.25, 2.75, 7.75), thin: true },
      { d: line(0, 8, 0, 12) },
    ];
  },
};

/**
 * Telerruptor (el 9002), anclado al origen.
 *
 * Medido sobre `docs/03/componentes01.png`, registro
 * `*9002#-K##A1#A2######*…*42*108*…*-15*-3*9*15*`: conductor de 0 a 4,
 * rectángulo de (−4,4) a (4,8) con el chevrón biestable pegado al borde
 * izquierdo y la barra vertical en x=−1, y salida hasta la fila inferior.
 */
const telerruptor: SymbolDef = {
  code: 9002,
  name: 'Telerruptor',
  group: 'mando',
  pins: [left(0.3, 'A1'), right(0.3, 'A2')],
  anchor: 'origin',
  originPins: [
    { name: 'A1', x: 0, y: 0 },
    { name: 'A2', x: 0, y: 12 },
  ],
  size: { w: 9, h: 15 },
  shapes() {
    return [
      { d: line(0, 0, 0, 4) },
      { d: rect(-4, 4, 8, 4) },
      { d: line(-1, 4.25, -4, 6), thin: true },
      { d: line(-4, 6, -1, 7.75), thin: true },
      { d: line(-1, 4.25, -1, 7.75), thin: true },
      { d: line(0, 8, 0, 12) },
    ];
  },
};

/**
 * Resistencia III (la 1051), anclada al origen.
 *
 * Medido sobre `docs/03/componentes01.png`, registro
 * `*1051#-R##1#3#5#2#4#6##*…*33*81*…*-12*-3*18*18*`: tres cuerpos verticales
 * idénticos al de la 1050 sobre las columnas 0/6/12, de y=3 a y=12, con los
 * bornes en las filas 0 y 15.
 */
const resistor3: SymbolDef = {
  code: 1051,
  name: 'Resistencia III',
  group: 'potencia',
  pins: polesInCadeOrder(3, { w: 18, h: 18 }),
  anchor: 'origin',
  originPins: [
    { name: '1', x: 0, y: 0 },
    { name: '3', x: 6, y: 0 },
    { name: '5', x: 12, y: 0 },
    { name: '2', x: 0, y: 15 },
    { name: '4', x: 6, y: 15 },
    { name: '6', x: 12, y: 15 },
  ],
  size: { w: 18, h: 18 },
  shapes() {
    return [0, 6, 12].flatMap((p) => [
      { d: line(p, 0, p, 3) },
      { d: rect(p - 1.5, 3, 2.75, 9) },
      { d: line(p, 12, p, 15) },
    ]);
  },
};

/**
 * Diferencial IN (el 6005), anclado al origen.
 *
 * Medido sobre `docs/03/componentes01.png` (S=4, OX=-17, OY=-101), registro
 * `*6005#-F##1#3#2#4####*…*183*102*…*-21*-3*12*21*`: dos polos con el patrón de
 * siempre (conductor 0→3, hoja (p,9)→(p−3,3), bajada 9→12), el toroide del
 * diferencial de (0,12) a (6,15) con un arco a cada lado (radio 1,52, panza de
 * 1,75) y el disparo magnético a la izquierda, enlazado por el punteado de x=−6.
 */
const differentialDef = (code: number, name: string, n: number): SymbolDef => {
  const cols = Array.from({ length: n }, (_, i) => i * 6);
  const w = n * 6;
  // El toroide va del primer polo al último, no del borde al borde de la caja.
  const span = (n - 1) * 6;
  return {
    code,
    name,
    group: 'proteccion',
    pins: polesInCadeOrder(n, { w, h: 21 }),
    anchor: 'origin',
    originPins: [
      ...cols.map((x, i) => ({ name: String(1 + i * 2), x, y: 0 })),
      ...cols.map((x, i) => ({ name: String(2 + i * 2), x, y: 18 })),
    ],
    size: { w, h: 21 },
    shapes() {
      return [
        ...cols.flatMap((p) => [
          { d: line(p, 0, p, 3) },
          { d: line(p, 9, p - 3, 3), blade: { px: p, py: 9, deg: PUSH_BLADE_DEG } },
          { d: line(p, 9, p, 12) },
          { d: line(p, 15, p, 18) },
        ]),
        // Toroide del diferencial, con un arco a cada lado.
        { d: rect(0, 12, span, 3) },
        { d: 'M0 12A1.52 1.52 0 0 0 0 15', thin: true },
        { d: `M${span} 12A1.52 1.52 0 0 1 ${span} 15`, thin: true },
        // Disparo magnético y su acometida.
        { d: rect(-8, 4, 4, 4) },
        { d: line(-6, 4, -6, 8) },
        { d: line(-10, 6, -2.25, 6) },
        { d: line(-10, 4, -10, 8) },
        // Enlace mecánico punteado hasta el toroide.
        { d: line(-6, 8.25, -6, 9.75) },
        { d: line(-6, 12.25, -6, 13) },
        { d: line(-6, 13.25, -5.25, 13.25) },
        { d: line(-3, 13.25, -1.75, 13.25) },
      ];
    },
  };
};

const differential1: SymbolDef = differentialDef(6005, 'Diferencial IN', 2);

// 6006 («Diferencial IIIN») queda pendiente: su registro real tiene **ocho**
// bornes (1 3 5 7 2 4 6 8) y la inserción sintetiza sobre plantillas base de
// siete como máximo, así que todavía no se puede declarar sin romper la
// inserción. El dibujo ya está medido (cuatro polos, caja 24×21, toroide de
// 0 a 18) y se puede cablear en cuanto exista una base de ocho bornes.

/**
 * Contacto auxiliar conmutado (7003), anclado al origen.
 *
 * Medido sobre `docs/03/componentes01.png` (S=4, OX=-17, OY=-101), registro
 * `*7003#-K##11#12#14#####*…*117*78*…*-12*-3*12*15*`: común 11 arriba en x=3,
 * fijos 12 (NC, x=0) y 14 (NO, x=6) abajo. El actuador queda a la izquierda
 * fuera del cuerpo de contacto; se omite (refOnly aceptable) para no introducir
 * strays sin evidencia geométrica completa.
 */
const auxCO7003: SymbolDef = {
  code: 7003,
  name: 'Contacto auxiliar conmutado',
  group: 'mando',
  pins: [left(0.3, '11'), left(0.7, '12'), right(0.5, '14')],
  anchor: 'origin',
  originPins: [
    { name: '11', x: 3, y: 0 },
    { name: '12', x: 0, y: 12 },
    { name: '14', x: 6, y: 12 },
  ],
  size: { w: 12, h: 15 },
  shapes() {
    return [
      { d: line(3, 0, 3, 3.25) },
      { d: line(3, 3.25, 1, 8), blade: { px: 3, py: 3.25, deg: -26 } },
      { d: line(0, 8.25, 1, 8.25) },
      { d: line(0, 8.25, 0, 12) },
      { d: line(6, 8.25, 4.75, 8.25) },
      { d: line(6, 8.25, 6, 12) },
    ];
  },
};

/**
 * Conmutador de dos posiciones (8015), anclado al origen.
 *
 * Medido sobre `docs/03/componentes01.png`, registro
 * `*8015#-S##11#12#14#####*…*162*36*…*-18*-3*12*15*`: mismo cuerpo de contacto
 * conmutado que el 7003; el mecanismo de mando (círculo/brazo a la izquierda)
 * queda como refOnly.
 */
const selectorCO8015: SymbolDef = {
  code: 8015,
  name: 'Contacto final de carrera conmutado',
  group: 'senalizacion',
  pins: [left(0.3, '11'), left(0.7, '12'), right(0.5, '14')],
  anchor: 'origin',
  originPins: [
    { name: '11', x: 3, y: 0 },
    { name: '12', x: 0, y: 12 },
    { name: '14', x: 6, y: 12 },
  ],
  size: { w: 12, h: 15 },
  shapes() {
    return [
      { d: line(3, 0, 3, 3.25) },
      { d: line(3, 3.25, 0.75, 8.5), blade: { px: 3, py: 3.25, deg: -23 } },
      { d: line(0, 9, 0.75, 8.5) },
      { d: line(0, 9, 0, 12) },
      { d: line(6, 9, 6, 12) },
    ];
  },
};

/** Bornes de los aparatos tripolares: 1-3-5 arriba, 2-4-6 abajo. */
const SIX_POLES: SymbolPin[] = [
  left(0.18, '1'),
  left(0.5, '3'),
  left(0.82, '5'),
  right(0.18, '2'),
  right(0.5, '4'),
  right(0.82, '6'),
];

/** Detalle de disparo magnético/térmico que distingue al automático. */
function tripDetail(w: number, h: number): Shape[] {
  const cy = h / 2;
  const mx = w / 2;
  return [
    { d: rect(mx - w * 0.06, cy - h * 0.3, w * 0.12, h * 0.12), thin: true },
    { d: line(mx, cy - h * 0.3, mx, cy - h * 0.4), thin: true },
  ];
}

const fuse: SymbolDef = {
  code: 6009,
  name: 'Disyuntor III',
  group: 'proteccion',
  pins: SIX_POLES,
  shapes(w, h) {
    return threePole(w, h, false);
  },
};

const breaker: SymbolDef = {
  code: 6003,
  name: 'Automático III',
  group: 'proteccion',
  pins: SIX_POLES,
  shapes(w, h) {
    return [...threePole(w, h, false), ...tripDetail(w, h)];
  },
};

const thermalRelay: SymbolDef = {
  code: 6007,
  name: 'Relé térmico',
  group: 'proteccion',
  pins: SIX_POLES,
  shapes(w, h) {
    const cy = h / 2;
    return [
      ...threePole(w, h, false),
      { d: rect(w * 0.36, cy - h * 0.12, w * 0.28, h * 0.24), thin: true },
      { d: line(w * 0.36, cy + h * 0.12, w * 0.64, cy - h * 0.12), thin: true },
    ];
  },
};

/**
 * Automático II: dos polos con el detalle de disparo.
 *
 * El automático IN (6001) tiene su propia definición, anclada al origen y con
 * la geometría medida en CADeSimu (`draw.ts:cadesimuPole`).
 */
const breaker4: SymbolDef = {
  code: 6002,
  name: 'Automático II',
  group: 'proteccion',
  pins: [left(0.3, '1'), left(0.7, '3'), right(0.3, '2'), right(0.7, '4')],
  shapes(w, h) {
    return [...threePole(w, h, false), ...tripDetail(w, h)];
  },
};

/**
 * Bobina monoestable (el 9000), anclada al origen, como la dibuja CADeSimu:
 * conductora continua de −5,875 a +5,875 atravesando un rectángulo de −4 a
 * +4 por −2 a +2, sin letra adentro. El tramo de conductor hasta el borne A2
 * (12 unidades abajo) lo dibuja el ruteador, no el símbolo. Geometría medida
 * sobre `docs/cadesimu-svg/reference/PR1_Rodolfo_Giusti_03.png` (K1M en
 * (66,141)).
 */
const coil: SymbolDef = {
  code: 9000,
  name: 'Bobina monoestable',
  group: 'mando',
  pins: [left(0.5, 'A1'), right(0.5, 'A2')],
  anchor: 'origin',
  originPins: [
    { name: 'A1', x: 0, y: 0 },
    { name: 'A2', x: 0, y: 12 },
  ],
  size: { w: 9, h: 15 },
  shapes() {
    return [{ d: line(0, -5.875, 0, 5.875) }, { d: rect(-4, -2, 8, 4) }];
  },
};

/**
 * Contacto auxiliar NA (7000), anclado al origen.
 * Medido sobre `docs/03/componentes01.png` (S=4, OX=-17, OY=-101), en (114,33).
 */
const auxContact: SymbolDef = {
  code: 7000,
  name: 'Contacto auxiliar NA',
  group: 'mando',
  pins: [left(0.5, '13'), right(0.5, '14')],
  anchor: 'origin',
  originPins: [
    { name: '13', x: 0, y: 0 },
    { name: '14', x: 0, y: 12 },
  ],
  size: { w: 6, h: 15 },
  shapes() {
    return [
      { d: line(0, 0, 0, 3) },
      { d: line(0, 9, -3, 3), blade: { px: 0, py: 9, deg: PUSH_BLADE_DEG } },
      { d: line(0, 9, 0, 12) },
    ];
  },
};

/**
 * Contacto auxiliar NC (7001), anclado al origen.
 * Medido sobre `docs/03/componentes01.png` (S=4, OX=-17, OY=-101), en (114,54).
 */
const auxContactNC: SymbolDef = {
  code: 7001,
  name: 'Contacto auxiliar NC',
  group: 'mando',
  pins: [left(0.5, '11'), right(0.5, '12')],
  anchor: 'origin',
  originPins: [
    { name: '11', x: 0, y: 0 },
    { name: '12', x: 0, y: 12 },
  ],
  size: { w: 6, h: 15 },
  shapes() {
    return [
      { d: line(0, 0, 0, 3.5) },
      { d: line(0, 3.5, 3.25, 3.5) },
      { d: line(0, 9, 2.5, 3.75), blade: { px: 0, py: 9, deg: -PUSH_BLADE_DEG } },
      { d: line(0, 9, 0, 12) },
    ];
  },
};

/**
 * Giro de la paleta de los pulsadores al cambiar de estado.
 *
 * CADeSimu dibuja la paleta abierta a 26,57° de la vertical y cerrada a
 * 9,46°, frenando a 1 unidad del conductor (medido sobre las capturas
 * `app/test_simu/*_simu_play*.png`): el giro entre las dos poses es 17,1°.
 */
const PUSH_BLADE_DEG = 17.1;

/**
 * Pulsador NA (el 8000), vertical y anclado al origen, como lo dibuja
 * CADeSimu: el borne 13 arriba en el origen y el 14 doce unidades abajo.
 * La geometría está medida sobre
 * `docs/cadesimu-svg/reference/PR1_Rodolfo_Giusti_03.png` (S1 en (66,123)).
 */
const pushNO: SymbolDef = {
  code: 8000,
  name: 'Contacto pulsador NA',
  group: 'mando',
  pins: [left(0.5, '13'), right(0.5, '14')],
  anchor: 'origin',
  originPins: [
    { name: '13', x: 0, y: 0 },
    { name: '14', x: 0, y: 12 },
  ],
  size: { w: 9, h: 15 },
  shapes() {
    return [
      // Conductores arriba y abajo del corte.
      { d: line(0, -6, 0, -3.25) },
      { d: line(0, 3, 0, 5.75) },
      // Paleta abierta, con el pivote en el borne de abajo; el lienzo la gira
      // al cerrar hasta frenar a 1 unidad del conductor.
      { d: line(0, 3, -3, -3), blade: { px: 0, py: 3, deg: PUSH_BLADE_DEG } },
      // Guion que toca la paleta en reposo y arranca 3 unidades a la izquierda.
      { d: line(-3, 0, -1.5, 0), thin: true },
      // Operador: corchete E con el brazo central más largo y separado.
      { d: line(-6, -1.5, -5, -1.5), thin: true },
      { d: line(-6, 1.25, -5, 1.25), thin: true },
      { d: line(-6, -1.5, -6, 1.25), thin: true },
      { d: line(-6, 0, -4.25, 0), thin: true },
    ];
  },
};

/**
 * Pulsador NC (el 8001), espejo del NA: el borne 11 arriba y el 12 abajo.
 * En reposo la paleta está apoyada hacia la derecha cruzando la barra del
 * contacto fijo; al presionar gira al lado contrario del NA y abre.
 */
const pushNC: SymbolDef = {
  code: 8001,
  name: 'Contacto pulsador NC',
  group: 'mando',
  pins: [left(0.5, '11'), right(0.5, '12')],
  anchor: 'origin',
  originPins: [
    { name: '11', x: 0, y: 0 },
    { name: '12', x: 0, y: 12 },
  ],
  size: { w: 9, h: 15 },
  shapes() {
    return [
      // Tramo superior hasta la barra del contacto fijo, en (0,-2.5).
      { d: line(0, -6, 0, -2.5) },
      { d: line(0, -2.5, 3.25, -2.5) },
      // Paleta apoyada (estado de reposo, cerrado), pivote en el borne de
      // abajo; el giro negativo lo aplica el lienzo cuando el contacto abre.
      { d: line(0, 3, 3, -3), blade: { px: 0, py: 3, deg: -PUSH_BLADE_DEG } },
      { d: line(0, 3, 0, 5.75) },
      // Guiones a la altura del origen: el derecho toca la paleta y el
      // izquierdo queda separado, espejo de los del NA.
      { d: line(0, 0, 1.5, 0), thin: true },
      { d: line(-3, 0, -1.25, 0), thin: true },
      // Mismo operador E que el NA.
      { d: line(-6, -1.5, -5, -1.5), thin: true },
      { d: line(-6, 1.25, -5, 1.25), thin: true },
      { d: line(-6, -1.5, -6, 1.25), thin: true },
      { d: line(-6, 0, -4.25, 0), thin: true },
    ];
  },
};

const selectorNO: SymbolDef = {
  code: 8012,
  name: 'Contacto final de carrera NA',
  group: 'mando',
  pins: [left(0.5, '13'), right(0.5, '14')],
  shapes(w, h) {
    const cy = h / 2;
    return [...contact(w, cy, false), { d: line(w / 2, cy, w * 0.72, cy - h * 0.3), thin: true }];
  },
};

const selectorNC: SymbolDef = {
  code: 8013,
  name: 'Contacto final de carrera NC',
  group: 'mando',
  pins: [left(0.5, '11'), right(0.5, '12')],
  shapes(w, h) {
    const cy = h / 2;
    return [...contact(w, cy, true), { d: line(w / 2, cy, w * 0.72, cy - h * 0.3), thin: true }];
  },
};

/**
 * Lámpara de señalización, anclada al origen (el borne X1).
 *
 * El círculo va **centrado en el medio de los dos bornes** y las puntas de la
 * X sobresalen un poco del círculo, como en CADeSimu. La geometría está
 * medida en `draw.ts:cadesimuLamp()`.
 */
const lamp: SymbolDef = {
  code: 8016,
  name: 'Lámpara de señalización',
  group: 'mando',
  pins: [left(0.5, '97'), right(0.5, '98')],
  anchor: 'origin',
  originPins: [
    { name: '97', x: 0, y: 0 },
    { name: '98', x: 0, y: 12 },
  ],
  size: { w: 12, h: 15 },
  shapes() {
    return cadesimuLamp();
  },
};

/**
 * Metadata de la paleta móvil del contacto del térmico (8017).
 *
 * La paleta se dibuja con varios trazos medidos; los catorce llevan esta misma
 * metadata, así que giran como una sola pieza. El pivote está en el extremo de
 * la barra fija: al abrir, la punta se separa del conductor (x = −5,75) y la
 * paleta se ve levantada (S4).
 */
const PALETA_TERMICO: Blade = { px: -3.25, py: -8.25, deg: -30 };

/**
 * Contacto del térmico (8017), anclado al origen.
 * Medido sobre `docs/03/componentes02.png` (S=4, OX=-2, OY=-60), en (138,117).
 */
const thermalContact: SymbolDef = {
  code: 8017,
  name: 'Contacto del térmico',
  group: 'mando',
  pins: [left(0.5, '95'), right(0.5, '96')],
  anchor: 'origin',
  originPins: [
    { name: '95', x: -5.75, y: 0 },
    { name: '96', x: -5.75, y: 12 },
  ],
  size: { w: 12, h: 15 },
  shapes() {
    return [
      // Conductor principal (superior e inferior)
      { d: line(-5.75, -12, -5.75, -8.5) },
      { d: line(-5.75, -6, -5.75, -6) },
      { d: line(-5.75, -3.25, -5.75, -0.25) },
      // Marcas superiores/inferiores
      { d: line(-4.25, -11.5, -3, -11.5) },
      { d: line(-4.25, -10.75, -4.25, -10.75) },
      { d: line(-3, -11, -3, -11) },
      { d: line(-4.25, -10, -3, -10) },
      { d: line(-4.25, -2.5, -3, -2.5) },
      { d: line(-4.25, -1.75, -4.25, -1.75) },
      { d: line(-3, -2, -3, -2) },
      { d: line(-4.25, -1, -3, -1) },
      // Barra fija del contacto (no se mueve).
      { d: line(-5.75, -8.5, -2.5, -8.5) },
      // Paleta móvil del contacto NC: los catorce trazos medidos, uno por uno,
      // con su `d` y su peso original. La tinta es la del dibujo calibrado (no
      // se altera), y el movimiento no lo da la forma sino la metadata `blade`
      // que llevan todos: así la paleta entera gira sobre el mismo pivote (S4).
      { d: line(-2.75, -9, -2.75, -9), blade: PALETA_TERMICO },
      { d: line(-3, -8.75, -3, -8.75), blade: PALETA_TERMICO },
      { d: line(-3.25, -8.25, -3.25, -8), blade: PALETA_TERMICO },
      { d: line(-3.5, -7.75, -3.5, -7.25), blade: PALETA_TERMICO },
      { d: line(-3.75, -7.25, -3.75, -6.75), blade: PALETA_TERMICO },
      { d: line(-4, -6.75, -4, -6.25), blade: PALETA_TERMICO },
      { d: line(-4.25, -6.25, -4.25, -5.75), blade: PALETA_TERMICO },
      { d: line(-4.5, -5.75, -4.5, -5.25), blade: PALETA_TERMICO },
      { d: line(-4.75, -5.25, -4.75, -4.75), blade: PALETA_TERMICO },
      { d: line(-5, -4.75, -5, -4.25), blade: PALETA_TERMICO },
      { d: line(-5.25, -4.25, -5.25, -3.75), blade: PALETA_TERMICO },
      { d: line(-5.5, -3.75, -5.5, -3.25), blade: PALETA_TERMICO },
      { d: line(-5.75, -3.25, -5.75, -3.25), blade: PALETA_TERMICO },
      { d: line(-5.75, -3, -5.75, -3), blade: PALETA_TERMICO },
      // Elemento térmico
      { d: line(-2, -8, -2, -7) },
      { d: line(-2, -7, -0.75, -7) },
      { d: line(-0.75, -7, -0.75, -5) },
      { d: line(-2, -5, -1, -5) },
      { d: line(-2, -5, -2, -4.75) },
      // Actuador izquierdo
      { d: line(-11.75, -6, -11.75, -4.25) },
      { d: line(-10.5, -5.75, -10.5, -4.25) },
      { d: line(-10, -6, -7, -6) },
      { d: line(-5.75, -6, -4.25, -6) },
    ];
  },
};

/**
 * Señalización óptica intermitente (9009): lámpara con el destello de
 * intermitencia, medida sobre `docs/03/componentes01` (9 px/u aprox en
 * captura original no aplica; verificada en `componentes01.png` con
 * S=4, OX=-17, OY=-101). Misma base que la lámpara CADe (círculo centrado
 * entre bornes, aspa) más la marca de intermitencia a la derecha.
 */
const flashingLamp: SymbolDef = {
  code: 9009,
  name: 'Señalización óptica intermitente',
  group: 'senalizacion',
  pins: [left(0.5, 'X1'), right(0.5, 'X2')],
  anchor: 'origin',
  originPins: [
    { name: 'X1', x: 0, y: 0 },
    { name: 'X2', x: 0, y: 12 },
  ],
  size: { w: 12, h: 15 },
  shapes() {
    return [
      ...cadesimuLamp(),
      // Marca de intermitencia (destello), medida en px sobre componentes01.png.
      { d: 'M6 5.25H6.75', thin: true, lamp: true },
      { d: 'M6 5.25V6.5H5.5', thin: true, lamp: true },
      { d: 'M6.75 5.25V6.5H7.25', thin: true, lamp: true },
    ];
  },
};

/**
 * Fusibles 5001/5003 medidos sobre `docs/03/componentes02.cad` /
 * `docs/cadesimu-svg/reference/componentes02.png` (S=4, OX=-2, OY=-60).
 * Fusibles seccionadores multipolares: cuerpos arriba del origen y
 * prolongaciones inferiores hasta los bornes de salida.
 */
const fuse5001: SymbolDef = {
  code: 5001,
  name: 'Fusible II',
  group: 'proteccion',
  pins: [left(0.3, '1'), left(0.7, '3'), right(0.3, '2'), right(0.7, '4')],
  anchor: 'origin',
  originPins: [
    { name: '1', x: -6, y: 0 },
    { name: '3', x: 0, y: 0 },
    { name: '2', x: -6, y: 12 },
    { name: '4', x: 0, y: 12 },
  ],
  size: { w: 12, h: 15 },
  shapes() {
    return [
      // Cuerpos superiores (medidos en comp02; refOnly en terminales inferiores).
      { d: line(-7.25, -6, -7.25, -3) },
      { d: line(-5.75, -6, -5.75, -0.25) },
      { d: line(-4.5, -6, -4.5, -3) },
      { d: line(0.25, -6, 0.25, -0.25) },
      { d: line(-7.25, -3, -4.75, -3) },
      { d: line(-0.75, -3, 1, -3) },
    ];
  },
};

const fuse5003: SymbolDef = {
  code: 5003,
  name: 'Fusible III',
  group: 'proteccion',
  pins: [left(0.18, '1'), left(0.5, '3'), left(0.82, '5'), right(0.18, '2'), right(0.5, '4'), right(0.82, '6')],
  anchor: 'origin',
  originPins: [
    { name: '1', x: -6, y: 0 },
    { name: '3', x: 0, y: 0 },
    { name: '5', x: 6, y: 0 },
    { name: '2', x: -6, y: 12 },
    { name: '4', x: 0, y: 12 },
    { name: '6', x: 6, y: 12 },
  ],
  size: { w: 18, h: 15 },
  shapes() {
    return [-6, 0, 6].flatMap((x) => [
      // Cuerpos superiores (medidos en comp02; refOnly en mecanismo inferior).
      { d: line(x - 1.25, -6, x - 1.25, -3) },
      { d: line(x + 0.25, -6, x + 0.25, -0.25) },
      { d: line(x + 1.5, -6, x + 1.5, -3) },
      { d: line(x - 1.25, -3, x + 1.25, -3) },
    ]);
  },
};

/**
 * Fusible monofásico (5000), anclado al origen.
 * Medido sobre `docs/03/componentes02.png` (S=4, OX=-2, OY=-60), en (15,57).
 */
const fuse1: SymbolDef = {
  code: 5000,
  name: 'Fusible monofásico',
  group: 'proteccion',
  pins: [left(0.5, '1'), right(0.5, '2')],
  anchor: 'origin',
  originPins: [
    { name: '1', x: -5.75, y: 0 },
    { name: '2', x: -5.75, y: 12 },
  ],
  size: { w: 6, h: 15 },
  shapes() {
    return [
      // Cuerpo superior y conductor (medidos en comp02; mecanismo inferior refOnly)
      { d: line(-7.25, -6, -7.25, -3) },
      { d: line(-5.75, -6, -5.75, -0.25) },
      { d: line(-4.5, -6, -4.5, -3) },
      { d: line(-7.25, -3, -4.75, -3) },
      { d: line(-5.75, 9, -5.75, 11.75) },
    ];
  },
};

/**
 * Fusible II (5002), anclado al origen.
 * Medido sobre `docs/03/componentes02.png` (S=4, OX=-2, OY=-60), en (54,57).
 */
const fuse2: SymbolDef = {
  code: 5002,
  name: 'Fusible II',
  group: 'proteccion',
  pins: [left(0.3, '1'), left(0.7, '3'), right(0.3, '2'), right(0.7, '4')],
  anchor: 'origin',
  originPins: [
    { name: '1', x: -5.75, y: 0 },
    { name: '3', x: 0.25, y: 0 },
    { name: '2', x: -5.75, y: 12 },
    { name: '4', x: 0.25, y: 12 },
  ],
  size: { w: 12, h: 15 },
  shapes() {
    return [
      // Cuerpos superiores y conductores (medidos en comp02; mecanismo inferior refOnly)
      { d: line(-7.25, -6, -7.25, -3) },
      { d: line(-5.75, -6, -5.75, -0.25) },
      { d: line(-4.5, -6, -4.5, -3) },
      { d: line(-1.25, -6, -1.25, -3) },
      { d: line(0.25, -6, 0.25, -0.25) },
      { d: line(1.5, -6, 1.5, -3) },
      { d: line(-7.25, -3, -4.75, -3) },
      { d: line(-1.25, -3, 1.25, -3) },
      { d: line(-5.75, 9, -5.75, 11.75) },
      { d: line(0.25, 9, 0.25, 11.75) },
    ];
  },
};

/**
 * Conmutador de dos posiciones (8018), anclado al origen.
 * Medido sobre `docs/03/componentes01.png` (S=4, OX=-17, OY=-101), en (144,90).
 */
const changeover: SymbolDef = {
  code: 8018,
  name: 'Conmutador de dos posiciones',
  group: 'mando',
  pins: [
    { name: '95', nx: 0, ny: 0, side: 'top' },
    { name: '97', nx: 0.6, ny: 0, side: 'top' },
    { name: '96', nx: 0, ny: 12 / 15, side: 'bottom' },
    { name: '98', nx: 0.6, ny: 12 / 15, side: 'bottom' },
  ],
  anchor: 'origin',
  originPins: [
    { name: '95', x: 0, y: 0 },
    { name: '97', x: 9, y: 0 },
    { name: '96', x: 0, y: 12 },
    { name: '98', x: 9, y: 12 },
  ],
  size: { w: 15, h: 15 },
  shapes() {
    return [
      // NC (95-96), columna 0.
      { d: line(0, 0, 0, 3) },
      { d: line(0, 3.5, 3.25, 3.5) },
      { d: line(0, 9, 2.5, 3.75), blade: { px: 0, py: 9, deg: -PUSH_BLADE_DEG } },
      { d: line(0, 9, 0, 12) },
      // NA (97-98), columna 9.
      { d: line(9, 0, 9, 3) },
      { d: line(9, 9, 6, 3), blade: { px: 9, py: 9, deg: PUSH_BLADE_DEG } },
      { d: line(9, 9, 9, 12) },
      // Enlace mecánico.
      { d: 'M-6 6H-4.25 M-3 6H-1.25 M0 6H1.75 M3 6H4.75 M6 6H7.5', thin: true },
      { d: line(-6, 6.25, -6, 7.75), thin: true },
      { d: line(-4.75, 6.25, -4.75, 7.75), thin: true },
      // Operador derecho.
      { d: line(12.75, 4, 12.75, 5), thin: true },
      { d: line(12.75, 7, 12.75, 7.75), thin: true },
    ];
  },
};

/** Electroválvula: bobina con designador EV (código 9003). */
const electrovalve: SymbolDef = {
  ...coil,
  code: 9003,
  name: 'Electroválvula',
  labels(w, h) {
    return [{ x: w / 2, y: h / 2, value: 'EV', size: Math.min(w, h) * 0.28, anchor: 'middle' }];
  },
};

// --- catálogo extendido ------------------------------------------------------
//
// Cada código de acá sale de `catalog.ts`, que se extrae del binario: nombre y
// designador son los que usa CADe_SIMU, no una suposición. El registro para
// insertarlos lo sintetiza `place.ts` clonando la forma de un componente real
// del mismo tamaño en bornes.

/** Motor con la misma caja que el trifásico pero con sus propios bornes. */
const motorVariant = (code: number, name: string, pins: SymbolPin[]): SymbolDef => ({
  code,
  name,
  group: 'motor',
  pins,
  size: { w: 24, h: 24 },
  shapes(w, h) {
    const r = Math.min(w, h) * 0.42;
    const cx = w / 2;
    const cy = h / 2;
    const out: Shape[] = [{ d: circle(cx, cy, r) }];
    for (const p of pins) {
      if (p.side === 'left') out.push({ d: line(0, p.ny * h, cx - r, p.ny * h) });
      else if (p.side === 'right') out.push({ d: line(cx + r, p.ny * h, w, p.ny * h) });
      else if (p.side === 'bottom') out.push({ d: line(cx, cy + r, cx, h) });
      else out.push({ d: line(p.nx * w, 0, p.nx * w, cy - r) });
    }
    return out;
  },
  labels(w, h) {
    return [{ x: w / 2, y: h / 2, value: 'M', size: Math.min(w, h) * 0.34, anchor: 'middle' }];
  },
});

const motorSingle: SymbolDef = motorVariant(1002, 'Motor monofásico', [left(0.38, 'U1'), left(0.66, 'U2')]);

const motorDahlander: SymbolDef = motorVariant(1003, 'Motor Dahlander', [
  left(0.22, 'U1'),
  left(0.5, 'V1'),
  left(0.78, 'W1'),
  right(0.22, 'U2'),
  right(0.5, 'V2'),
  right(0.78, 'W2'),
]);

const motorWound: SymbolDef = motorVariant(1004, 'Motor rotor bobinado', [
  left(0.22, 'U1'),
  left(0.5, 'V1'),
  left(0.78, 'W1'),
  right(0.22, 'K'),
  right(0.5, 'L'),
  right(0.78, 'M'),
]);

const motorTwoSpeeds: SymbolDef = motorVariant(1005, 'Motor dos velocidades', [
  left(0.22, 'U1'),
  left(0.5, 'V1'),
  left(0.78, 'W1'),
  right(0.22, 'U2'),
  right(0.5, 'V2'),
  right(0.78, 'W2'),
]);

const motorAsSingle: SymbolDef = motorVariant(1010, 'Motor trifásico como monofásico', [
  left(0.38, 'L'),
  left(0.66, 'N'),
]);

/** Alimentación: barra con un borne por conductor y su rótulo. */
const feed = (code: number, name: string, pins: SymbolPin[], label?: string): SymbolDef => ({
  code,
  name,
  group: 'alimentacion',
  pins,
  size: { w: 12, h: Math.max(12, pins.length * 6) },
  shapes(w, h) {
    const bar = w * 0.35;
    return [
      { d: line(bar, 0, bar, h), thin: true },
      ...pins.map((p) => ({ d: line(bar, p.ny * h, w, p.ny * h) })),
    ];
  },
  labels(w, h) {
    if (!label) return [];
    return [{ x: w * 0.62, y: h / 2, value: label, size: Math.min(w, h) * 0.42, anchor: 'middle' }];
  },
});

/**
 * Terminal de alimentación de un solo conductor, anclado al origen.
 *
 * En CADeSimu es un círculo pequeño **tangente por encima** del extremo del
 * cable, con la letra (L/N) encima. Medido sobre la captura real
 * (`data/samples/tests01/test01.png`, 6 px por unidad del archivo): círculo de
 * radio 1 unidad con el centro 3,2 unidades por encima del origen, y un hilo
 * que baja desde el círculo hasta el origen.
 *
 * Antes se dibujaba como una barra vertical con la letra al lado, 3 unidades a
 * la derecha del cable: ése era el error de anclaje, no de forma.
 */
const feedTerminal = (code: number, name: string, letter: string): SymbolDef => ({
  code,
  name,
  group: 'alimentacion',
  pins: [],
  anchor: 'origin',
  size: { w: 6, h: 3 },
  shapes() {
    return [{ d: circle(0, -3.2, 1) }, { d: line(0, -2.2, 0, 0) }];
  },
  labels() {
    return [{ x: 0, y: -4.9, value: letter, size: 2.4, anchor: 'middle' }];
  },
});

const feedL: SymbolDef = feedTerminal(3000, 'Alimentación L', 'L');
const feedN: SymbolDef = feedTerminal(3001, 'Alimentación N', 'N');
/**
 * Terminales de alimentación medidos sobre `docs/03/componentes01.png`
 * (S=4, OX=-17, OY=-101): círculo de radio 1 centrado en (p, -2.5) con
 * vástago bajando a (p, -0.25), repetido en columnas de 6 unidades.
 */
const feedTerminalCols = (code: number, name: string, cols: number[]): SymbolDef => ({
  code,
  name,
  group: 'alimentacion',
  pins: [],
  anchor: 'origin',
  size: { w: Math.max(6, cols.length * 6), h: 3 },
  shapes() {
    return cols.flatMap((x) => [
      // Círculo pequeño medido: tapa en y=-3, lados en -2.75/-2.5, cierre en -2.25.
      { d: `M${x - 1} -3L${x - 0.75} -2.75L${x - 0.75} -2.5L${x - 0.25} -2.25` },
      { d: `M${x + 0.75} -3L${x + 0.5} -2.75L${x + 0.5} -2.5L${x} -2.25` },
      { d: line(x, -2, x, -0.25) },
    ]);
  },
});

const feedLN: SymbolDef = feedTerminalCols(3003, 'Alimentación L N', [0, 6]);
const feed3PE: SymbolDef = {
  ...feedTerminalCols(3005, 'Alimentación L1 L2 L3 PE', [0, 6, 12]),
  size: { w: 24, h: 3 },
};
const feedPE: SymbolDef = feedTerminalCols(3002, 'Alimentación PE', [0]);

const feed3: SymbolDef = feedTerminalCols(3004, 'Alimentación L1 L2 L3', [0, 6, 12]);
const feedLNP3011: SymbolDef = feedTerminalCols(3011, 'Alimentación L N PE', [0, 6, 12]);

const feed3N: SymbolDef = feed(3006, 'Alimentación L1 L2 L3 N', [
  right(0.15, 'L1'),
  right(0.38, 'L2'),
  right(0.62, 'L3'),
  right(0.85, 'N'),
]);

const feed3NPE: SymbolDef = feed(3007, 'Alimentación L1 L2 L3 N PE', [
  right(0.1, 'L1'),
  right(0.3, 'L2'),
  right(0.5, 'L3'),
  right(0.7, 'N'),
  right(0.9, 'PE'),
]);

const feedPos: SymbolDef = feed(3008, 'Alimentación +', [right(0.5, '+')]);

const feedDC: SymbolDef = feed(3010, 'Alimentación + -', [right(0.3, '+'), right(0.7, '-')]);

/** Aparato de un polo: un solo corte más el detalle de disparo. */
const onePole = (code: number, name: string): SymbolDef => ({
  code,
  name,
  group: 'proteccion',
  pins: [left(0.5, '1'), right(0.5, '2')],
  size: { w: 12, h: 15 },
  shapes(w, h) {
    return [...contact(w, h / 2, false), ...tripDetail(w, h)];
  },
});

const auto1: SymbolDef = onePole(6000, 'Automático I');

// 6010 («Disyuntor I») se midió contra `componentes01`: vive arriba como
// `breakerMotor1`, anclado al origen y con el disparo magnético propio.

/**
 * Disyuntor II (6008), anclado al origen.
 *
 * Medido sobre `docs/03/componentes01.png` (S=4, OX=-17, OY=-101), registro
 * `*6008#-Q##1#3#2#4####*…*195*39*…*-21*-3*12*24*`: dos polos (columnas 0/6)
 * con la cuchilla habitual, disparo magnético (-10,4)-( -4,8) con acometida en
 * y=6, doble cuerpo térmico (-3,12)-(9,18) con ganchos en 12,75-14 y marcas en
 * 16-16,5, y enlace mecánico punteado en x=-6.
 */
const disyuntor2: SymbolDef = {
  code: 6008,
  name: 'Disyuntor II',
  group: 'proteccion',
  pins: polesInCadeOrder(2, { w: 12, h: 24 }),
  anchor: 'origin',
  originPins: [
    { name: '1', x: 0, y: 0 },
    { name: '3', x: 6, y: 0 },
    { name: '2', x: 0, y: 21 },
    { name: '4', x: 6, y: 21 },
  ],
  size: { w: 12, h: 24 },
  shapes() {
    return [
      // Polos: conductor superior, hoja y bajada hasta la caja.
      ...[0, 6].flatMap((p) => [
        { d: line(p, 0, p, 3) },
        { d: line(p, 9, p - 3, 3), blade: { px: p, py: 9, deg: PUSH_BLADE_DEG } },
        { d: line(p, 9, p, 12) },
      ]),
      // Disparo magnético: caja con acometida.
      { d: line(-10, 4, -10, 8) },
      { d: line(-10, 4, -10, 4) },
      { d: line(-8, 4, -4, 4) },
      { d: line(-4, 4, -4, 8) },
      { d: line(-8, 8, -4, 8) },
      { d: line(-8, 4, -8, 4.25) },
      { d: line(-6, 4.25, -6, 4.25) },
      { d: line(-8, 7.75, -8, 8) },
      { d: line(-6, 7.75, -6, 8) },
      { d: line(-10, 6, -2.25, 6) },
      // Enlace mecánico punteado hasta la caja.
      { d: line(-6, 8.25, -6, 8.75) },
      { d: line(-6, 10, -6, 11) },
      { d: line(-6, 12.25, -6, 13.25) },
      { d: line(-6, 13.25, -5.25, 13.25) },
      { d: line(-4, 13.25, -3, 13.25) },
      // Cuerpo térmico doble.
      { d: rect(-3, 12, 12, 6) },
      { d: line(-3, 15, 9, 15) },
      // Ganchos del térmico (fila superior del cuerpo).
      { d: line(0, 12, 0, 12.75) },
      { d: 'M0 12.75H1.25V14H0', thin: true },
      { d: line(0, 14, 0, 15) },
      { d: line(6, 12, 6, 12.75) },
      { d: 'M6 12.75H7.25V14H6', thin: true },
      { d: line(6, 14, 6, 15) },
      // Marcas del térmico (fila inferior del cuerpo).
      { d: line(1.25, 16, 1.25, 16.5) },
      { d: line(7.25, 16, 7.25, 16.5) },
      // Bajadas a bornes inferiores.
      { d: line(0, 18, 0, 21) },
      { d: line(6, 18, 6, 21) },
    ];
  },
};

/**
 * Contacto auxiliar NA-NC (7002), anclado al origen.
 * Medido sobre `docs/03/componentes01.png` (S=4, OX=-17, OY=-101), en (93,75).
 * NC en columna 0 (11-12) y NA en columna 9 (13-14).
 */
const auxNANC: SymbolDef = {
  code: 7002,
  name: 'Contacto auxiliar NA-NC',
  group: 'mando',
  pins: [left(0.3, '13'), left(0.7, '11'), right(0.3, '14'), right(0.7, '12')],
  anchor: 'origin',
  originPins: [
    { name: '11', x: 0, y: 0 },
    { name: '13', x: 9, y: 0 },
    { name: '12', x: 0, y: 12 },
    { name: '14', x: 9, y: 12 },
  ],
  size: { w: 15, h: 15 },
  shapes() {
    return [
      // NC (11-12), columna 0.
      { d: line(0, 0, 0, 3) },
      { d: line(0, 3.5, 3.25, 3.5) },
      { d: line(0, 9, 2.5, 3.75), blade: { px: 0, py: 9, deg: -PUSH_BLADE_DEG } },
      { d: line(0, 9, 0, 12) },
      // NA (13-14), columna 9.
      { d: line(9, 0, 9, 3) },
      { d: line(9, 9, 6, 3), blade: { px: 9, py: 9, deg: PUSH_BLADE_DEG } },
      { d: line(9, 9, 9, 12) },
      // Actuador.
      { d: line(-12, -12, -12, -0.25), thin: true },
    ];
  },
};

const relayCoil: SymbolDef = {
  ...coil,
  code: 7016,
  name: 'Rele',
  pins: [left(0.5, 'A1'), right(0.5, 'A2')],
  labels(w, h) {
    return [{ x: w / 2, y: h / 2, value: 'KA', size: Math.min(w, h) * 0.28, anchor: 'middle' }];
  },
};

const timerOn: SymbolDef = {
  ...coil,
  code: 9004,
  name: 'Temporizador a la conexión',
  size: { w: 15, h: 15 },
  shapes(w, h) {
    return [
      { d: rect(w * 0.2, h * 0.2, w * 0.6, h * 0.6) },
      { d: circle(w * 0.72, h * 0.78, Math.min(w, h) * 0.14), thin: true },
      { d: line(w * 0.72, h * 0.78, w * 0.72, h * 0.72), thin: true },
    ];
  },
  labels(w, h) {
    return [{ x: w / 2, y: h / 2, value: 'KT', size: Math.min(w, h) * 0.28, anchor: 'middle' }];
  },
};

const buzzer: SymbolDef = {
  code: 9011,
  name: 'Zumbador',
  group: 'senalizacion',
  pins: [left(0.5, 'X1'), right(0.5, 'X2')],
  size: { w: 15, h: 15 },
  shapes(w, h) {
    const cy = h / 2;
    const r = Math.min(w, h) * 0.3;
    const cx = w / 2;
    return [
      { d: line(0, cy, cx - r, cy) },
      { d: line(cx + r, cy, w, cy) },
      { d: circle(cx, cy, r) },
      { d: `M${cx - r * 0.5} ${cy + r * 0.4}a${r} ${r} 0 0 1 ${r} 0`, thin: true },
    ];
  },
};

const pushNANC: SymbolDef = {
  code: 8002,
  name: 'Contacto pulsador NA-NC',
  group: 'senalizacion',
  pins: [left(0, '11'), left(0.6, '13'), right(0, '12'), right(0.6, '14')],
  anchor: 'origin',
  // Medido sobre docs/02/pulsadores.png (9 px/u), NA-NC en (528,198): el NC
  // ocupa la columna 0 y el NO la 9, con el enlace mecánico discontinuo en
  // y=0. Los bornes van en el extremo visible de cada ramal: CADe_SIMU imprime
  // el rótulo del borne ahí (medido en y≈−5,4) y la tinta termina en −6/5,75.
  originPins: [
    { name: '11', x: 0, y: -6 },
    { name: '13', x: 9, y: -6 },
    { name: '12', x: 0, y: 5.75 },
    { name: '14', x: 9, y: 5.75 },
  ],
  size: { w: 15, h: 15 },
  shapes() {
    return [
      // Corchete del operador, igual al del NA.
      { d: line(-6, -1.5, -5, -1.5), thin: true },
      { d: line(-6, 1.25, -5, 1.25), thin: true },
      { d: line(-6, -1.5, -6, 1.25), thin: true },
      { d: line(-6, 0, -4.25, 0), thin: true },
      // Contacto NC (11-12): tramo, barra fija y paleta apoyada.
      { d: line(0, -6, 0, -2.5) },
      { d: line(0, -2.5, 3.5, -2.5) },
      { d: line(0, 3, 3, -3), blade: { px: 0, py: 3, deg: -PUSH_BLADE_DEG } },
      { d: line(0, 3, 0, 5.75) },
      // Contacto NO (13-14): paleta abierta hacia la izquierda.
      { d: line(9, -6, 9, -3) },
      { d: line(9, 3, 6, -3), blade: { px: 9, py: 3, deg: PUSH_BLADE_DEG } },
      { d: line(9, 3, 9, 5.75) },
      // Enlace mecánico discontinuo que une los dos contactos.
      { d: line(-3, 0, -1, 0), thin: true },
      { d: line(0, 0, 2, 0), thin: true },
      { d: line(3, 0, 5, 0), thin: true },
      { d: line(6, 0, 7.5, 0), thin: true },
    ];
  },
};

/**
 * Pulsador conmutado (8003): común arriba y dos tiros abajo.
 *
 * Medido sobre `docs/02/pulsadores.png` (9 px/u), en (798,198): el común sube
 * en x=3, la cuchilla en reposo apoya en el tiro NC (x=0) y el tiro NO (x=6)
 * queda con su barra corta apuntando hacia la cuchilla.
 */
const pushChangeover: SymbolDef = {
  code: 8003,
  name: 'Contacto pulsador conmutado',
  group: 'senalizacion',
  pins: [left(0.25, '11'), right(0, '12'), right(0.5, '14')],
  anchor: 'origin',
  originPins: [
    { name: '11', x: 3, y: -6 },
    { name: '12', x: 0, y: 5.75 },
    { name: '14', x: 6, y: 5.75 },
  ],
  size: { w: 12, h: 15 },
  shapes() {
    return [
      { d: line(-6, -1.5, -5, -1.5), thin: true },
      { d: line(-6, 1.25, -5, 1.25), thin: true },
      { d: line(-6, -1.5, -6, 1.25), thin: true },
      { d: line(-6, 0, -4.25, 0), thin: true },
      // Común y cuchilla apoyada en el tiro NC. La cuchilla es móvil: pivota en
      // el común y, al accionar el pulsador, gira -45,24° (el espejo del tiro
      // NC respecto del común) hasta apoyar la punta en el tiro NO (S3). Como es
      // un conmutado, la pose sigue al aparato accionado (`when: 'active'`).
      { d: line(3, -6, 3, -3) },
      { d: line(3, -3, 0.5, 3), blade: { px: 3, py: -3, deg: -45.24, when: 'active' } },
      // Tiro NC.
      { d: line(0, 2.33, 0, 5.75) },
      { d: line(0, 2.33, 1.2, 2.33) },
      // Tiro NO.
      { d: line(6, 2.33, 6, 5.75) },
      { d: line(4.78, 2.33, 6, 2.33) },
      // Guiones del enlace mecánico hasta la cuchilla.
      { d: line(-3, 0, -1, 0), thin: true },
      { d: line(0, 0, 2, 0), thin: true },
    ];
  },
};

/**
 * Pulsador tipo seta: el actuador es una cúpula (semicírculo) con vástago,
 * como lo dibuja CADe_SIMU en `docs/02/pulsadores.png` (9 px/u): radio 2 con
 * el lado plano en x=-6 y el vástago hasta -4,1. El contacto es el del NA
 * (8004) o el del NC (8005), medido en la misma captura.
 */
const mushroom = (code: number, name: string, nc: boolean): SymbolDef => ({
  code,
  name,
  group: 'senalizacion',
  pins: nc ? [left(0.5, '11'), right(0.5, '12')] : [left(0.5, '13'), right(0.5, '14')],
  anchor: 'origin',
  originPins: nc
    ? [
        { name: '11', x: 0, y: -6 },
        { name: '12', x: 0, y: 5.75 },
      ]
    : [
        { name: '13', x: 0, y: -6 },
        { name: '14', x: 0, y: 5.75 },
      ],
  size: { w: 6, h: 15 },
  shapes() {
    // Cúpula de la seta: CADe la dibuja con una curva que no es un círculo
    // (se aplana cerca del lado plano y llega a −8 en el medio). La polilínea
    // sigue los píxeles medidos, así el raster calza dentro de 2 px.
    const dome =
      'M-6 -1.9L-6.35 -1.7L-6.7 -1.5L-7 -1.3L-7.3 -1.1L-7.55 -0.9L-7.8 -0.6L-7.95 -0.3' +
      'L-8 0L-7.95 0.3L-7.8 0.6L-7.55 0.9L-7.3 1.1L-7 1.3L-6.7 1.5L-6.35 1.7L-6 1.9';
    const chord = line(-6, -2, -6, 2);
    if (nc) {
      return [
        { d: dome },
        { d: chord },
        { d: line(-6, 0, -4.1, 0) },
        { d: line(0, -6, 0, -2.5) },
        { d: line(0, -2.5, 3.25, -2.5) },
        { d: line(0, 3, 3, -3), blade: { px: 0, py: 3, deg: -PUSH_BLADE_DEG } },
        { d: line(0, 3, 0, 5.75) },
        { d: line(0, 0, 1.5, 0), thin: true },
        { d: line(-3, 0, -1.25, 0), thin: true },
      ];
    }
    return [
      { d: dome },
      { d: chord },
      { d: line(-6, 0, -4.1, 0) },
      { d: line(0, -6, 0, -3.25) },
      { d: line(0, 3, -3, -3), blade: { px: 0, py: 3, deg: PUSH_BLADE_DEG } },
      { d: line(0, 3, 0, 5.75) },
      { d: line(-3, 0, -1.5, 0), thin: true },
    ];
  },
});

const mushroomNA: SymbolDef = mushroom(8004, 'Contacto pulsador seta NA', false);
const mushroomNC: SymbolDef = mushroom(8005, 'Contacto pulsador seta NC', true);

const switchNO: SymbolDef = {
  code: 8008,
  name: 'Contacto interruptor NA',
  group: 'senalizacion',
  pins: [left(0.5, '13'), right(0.5, '14')],
  size: { w: 9, h: 15 },
  shapes(w, h) {
    const cy = h / 2;
    return [...contact(w, cy, false), { d: line(w * 0.62, cy - h * 0.2, w * 0.72, cy - h * 0.34), thin: true }];
  },
};

const switchNANC: SymbolDef = {
  code: 8010,
  name: 'Contacto interruptor NA-NC',
  group: 'senalizacion',
  pins: [left(0.3, '13'), left(0.7, '11'), right(0.3, '14'), right(0.7, '12')],
  size: { w: 9, h: 15 },
  shapes(w, h) {
    return [
      ...contact(w, h * 0.3, false),
      ...contact(w, h * 0.7, true),
      { d: line(w * 0.62, h * 0.3, w * 0.72, h * 0.12), thin: true },
    ];
  },
};

const ALL: SymbolDef[] = [
  motor,
  powerContact,
  powerContact2,
  breakerMotor1,
  differential1,
  resistor1,
  resistor3,
  coilBistable,
  telerruptor,
  feedL,
  feedN,
  feedLN,
  feed3PE,
  feedPE,
  feed3,
  feedLNP3011,
  feed3N,
  feed3NPE,
  feedPos,
  feedDC,
  fuse,
  fuse5001,
  fuse5003,
  fuse1,
  fuse2,
  breaker,
  thermalRelay,
  breaker4,
  coil,
  auxContact,
  auxContactNC,
  pushNO,
  pushNC,
  selectorNO,
  selectorNC,
  lamp,
  flashingLamp,
  thermalContact,
  changeover,
  electrovalve,
  motorSingle,
  motorDahlander,
  motorWound,
  motorTwoSpeeds,
  motorAsSingle,
  auto1,
  disyuntor2,
  auxNANC,
  auxCO7003,
  selectorCO8015,
  relayCoil,
  timerOn,
  buzzer,
  pushNANC,
  pushChangeover,
  mushroomNA,
  mushroomNC,
  switchNO,
  switchNANC,
  ...FAMILY_SYMBOLS,
];

const BY_CODE = new Map<number, SymbolDef>(ALL.map((s) => [s.code, s]));

// La fidelidad CADeSimu manda: una definición propia con caja declarada es la
// grilla de conexión medida en archivos reales y gana sobre el elemento
// importado de EN 60617. QET sólo pisa las definiciones viejas que no declaran
// caja (geometría horizontal sin grilla), que es lo que venía haciendo.
for (const [code, qet] of Object.entries(QET_SYMBOLS)) {
  const sym = BY_CODE.get(Number(code));
  if (sym && sym.size === undefined) BY_CODE.set(Number(code), withQetGeometry(sym, qet));
}

export function symbolFor(code: number): SymbolDef | undefined {
  return BY_CODE.get(code);
}

export function symbolList(): SymbolDef[] {
  return [...ALL];
}

/** Cables: se dibujan como una línea y se insertan como tramo, no como componente. */
export function lineList(): SymbolDef[] {
  return [...LINE_SYMBOLS];
}

/**
 * Símbolo genérico para códigos sin definición.
 *
 * No es un hueco: es la contraparte visual de S1. Un código desconocido debe
 * seguir dibujándose (caja rotulada) para que el archivo nunca sea ilegible,
 * del mismo modo que el modelo lo preserva como registro opaco.
 */
export function fallbackSymbol(code: number, pinNames: string[]): SymbolDef {
  return {
    code,
    name: `Genérico ${code}`,
    group: 'otro',
    pins: genericPins(pinNames),
    shapes(w, h) {
      return [{ d: rect(0.5, 0.5, w - 1, h - 1) }];
    },
    labels(w, h) {
      return [{ x: w / 2, y: h / 2, value: String(code), size: Math.min(w, h) * 0.4, anchor: 'middle' }];
    },
  };
}

/** Resuelve el símbolo de un componente, con fallback si el código es nuevo. */
export function resolveSymbol(code: number, pinNames: string[]): SymbolDef {
  // Los cables viven en LINE_SYMBOLS (no en BY_CODE) porque se insertan como
  // tramo y no como componente; igual tienen dibujo propio y no deben caer al
  // genérico cuando algo pide su símbolo (miniaturas, documentación).
  return BY_CODE.get(code) ?? LINE_SYMBOLS.find((sym) => sym.code === code) ?? fallbackSymbol(code, pinNames);
}

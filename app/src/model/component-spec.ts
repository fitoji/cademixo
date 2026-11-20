/**
 * ComponentSpec — una sola tabla de semántica por código de componente.
 *
 * La semántica de cada código vivía repartida en cinco tablas que se
 * contradecían (`netlist.kindOf`, `circuit.simKindOf`, los sets de `visual`,
 * `App.PUSH_CODES` y `project.LAMP_CODES`), y esa divergencia producía la
 * clase de bugs 8005/8100/8101: un código presionable en la UI y `unknown` en
 * el solver, un glifo de lámpara que nunca fue `lamp`. Este módulo es la
 * fuente única: cada consumidor deriva su dimensión de acá.
 *
 * La tabla se define por rangos más excepciones explícitas, sembrada del
 * inventario de `odd/tasks/component-spec.md` y de las tablas que reemplaza
 * (`netlist.ts` y `circuit.ts`). Paridad congelada (S6): sólo cambian los
 * códigos que ese documento declara — 8100, 8101, 8102, 8103, 8016, 2002,
 * 8018 y 9004-9007.
 */

export type SimKind =
  | 'coil'
  | 'contact'
  | 'pushbutton'
  | 'selector'
  /** conmutador de dos posiciones: una sola de sus dos salidas está conectada */
  | 'changeover'
  | 'lamp'
  | 'thermal'
  | 'fuse'
  | 'motor'
  | 'terminal'
  | 'unknown';

export interface ComponentSpec {
  /** qué es el aparato para el solver */
  kind: SimKind;
  /**
   * Polaridad de reposo NA/NC tal como la trata el solver. En kinds sin
   * polaridad (fusibles, lámparas, motores...) es declarativa y vale 'open'.
   */
  rest: 'open' | 'closed';
  /** el usuario puede accionarlo con un clic */
  pressable: boolean;
  /**
   * Pulsador de verdad: además de accionarse con el clic, vuelve solo a su
   * estado inicial (el clic es un pulso, no una posición). Sin este campo el
   * pulsador se comportaba como interruptor.
   */
  momentary?: boolean;
  /** protección que el usuario puede abrir/disparar en simulación */
  protection: boolean;
  /** modo de retardo, si el aparato es temporizado */
  timer?: 'on' | 'off' | 'both';
  /** bobina biestable: mantiene su estado tras desenergizarse */
  latching?: boolean;
  /**
   * El registro cierra su cabecera con el índice de color del vidrio
   * (`LAMP_COLORS`): el token no es un borne. 8016 no lo lleva: sus bornes
   * son 97/98 y su color es nulo.
   */
  colorSlot?: boolean;
}

const UNKNOWN_SPEC: ComponentSpec = { kind: 'unknown', rest: 'open', pressable: false, protection: false };

function buildTable(): Readonly<Record<number, ComponentSpec>> {
  const table: Record<number, ComponentSpec> = {};
  const range = (from: number, to: number, spec: ComponentSpec): void => {
    for (let code = from; code <= to; code++) table[code] = spec;
  };
  const one = (code: number, spec: ComponentSpec): void => {
    table[code] = spec;
  };

  // Motores: trifásicos, Dahlander, rotativo, dos velocidades, CC, etc.
  const motor: ComponentSpec = { kind: 'motor', rest: 'open', pressable: false, protection: false };
  range(1000, 1010, motor);
  one(10508, motor);
  one(10509, motor);

  // Borneras y símbolos de alimentación.
  range(3000, 3999, { kind: 'terminal', rest: 'open', pressable: false, protection: false });

  // Protecciones: fusibles, automáticos, disyuntores y diferenciales conducen
  // mientras no se modelen disparos. 6007 cae en el rango pero es térmico.
  range(6000, 6999, { kind: 'fuse', rest: 'open', pressable: false, protection: true });
  one(6007, { kind: 'thermal', rest: 'open', pressable: false, protection: true });
  // 8017 es el contacto auxiliar NC del relé térmico: el solver lo trata NC.
  one(8017, { kind: 'thermal', rest: 'closed', pressable: false, protection: true });

  // Contactos: 7000/7001 auxiliares, 2001/2006 los de potencia del contactor,
  // 8018 el auxiliar NC doble. 2002 era CONTACT en visual y unknown en el
  // solver.
  const contactNO: ComponentSpec = { kind: 'contact', rest: 'open', pressable: false, protection: false };
  one(7000, contactNO);
  one(7001, { kind: 'contact', rest: 'closed', pressable: false, protection: false });
  one(2001, contactNO);
  one(2002, contactNO);
  one(2006, contactNO);
  // El 8018 es un conmutador de dos posiciones, no dos contactos independientes.
  // En el PR1 (`app/test_simu/PR1_Rodolfo_Giusti_03.cad`) los bornes 95 y 97
  // están enlazados en el dibujo (es el común) y las salidas son 96 y 98: con
  // las dos cerradas a la vez la fase llegaba a las dos redes y se encendían
  // H1 y H2, cosa que en CADeSimu nunca pasa. Medido en las capturas: con la
  // salida 98 cerrada se enciende H1 y con la 96 se enciende H2, nunca las dos.
  one(8018, { kind: 'changeover', rest: 'open', pressable: false, protection: false });

  // Contactos temporizados: 7004-7007 a la conexión, 7008-7011 a la
  // desconexión, 7012-7015 a ambos. Los terminados en 5/9/3 son NC: así los
  // dibujaba `visual.TIMED_NC` y así lo declaraba el campo `timerNC`, pero el
  // solver los trataba como NA. `solver.ts:155-172` ya conmuta contactNC
  // temporizado, así que la polaridad de la tabla es ahora la verdadera.
  for (let code = 7004; code <= 7015; code++) {
    const timer = code <= 7007 ? 'on' : code <= 7011 ? 'off' : 'both';
    const rest = code === 7005 || code === 7009 || code === 7013 ? 'closed' : 'open';
    one(code, { kind: 'contact', rest, pressable: false, protection: false, timer });
  }

  // Pulsadores (NA/NC/NA-NC/conmutado) y setas de emergencia: presionables.
  // NC en el solver: 8001, 8005 y 8009.
  //
  // El catálogo separa dos familias por el nombre: 8000-8007 son «Contacto
  // pulsador» — se accionan y vuelven solos — y 8008-8011 son «Contacto
  // interruptor», que se quedan donde el usuario los deja. Por eso el rango
  // lleva `momentary` sólo hasta 8007: la clasificación sale del nombre del
  // catálogo, no de suponer que todo lo presionable es momentáneo. `pressable`
  // sigue diciendo «el clic lo acciona»; `momentary` agrega «y vuelve solo».
  for (let code = 8000; code <= 8011; code++) {
    const rest = code === 8001 || code === 8005 || code === 8009 ? 'closed' : 'open';
    const spec: ComponentSpec = { kind: 'pushbutton', rest, pressable: true, protection: false };
    if (code <= 8007) spec.momentary = true;
    one(code, spec);
  }

  // 8100 figura en CATALOG como «Pulsador» (designador -S) y estaba en
  // PUSH_CODES, pero el solver lo ignoraba: como contacto, el cierre dependía de
  // una bobina homónima y presionarlo no hacía nada. Es un pulsador.
  one(8100, { kind: 'pushbutton', rest: 'open', pressable: true, protection: false });

  // Selectores y finales de carrera: se accionan como pulsadores.
  // NC en el solver: 8013 y 8015.
  for (let code = 8012; code <= 8015; code++) {
    const rest = code === 8013 || code === 8015 ? 'closed' : 'open';
    one(code, { kind: 'selector', rest, pressable: true, protection: false });
  }

  // Señalización óptica. 8016 ya era lamp en el solver; 8101/8102/8103
  // tenían glifo de lámpara (o ni glifo) pero nunca fueron lamp. Todas
  // menos 8016 cierran la cabecera con el índice de color del vidrio.
  const lamp: ComponentSpec = { kind: 'lamp', rest: 'open', pressable: false, protection: false };
  one(8016, lamp);
  one(8101, { ...lamp, colorSlot: true });
  one(8102, { ...lamp, colorSlot: true });
  one(8103, { ...lamp, colorSlot: true });
  one(9008, { ...lamp, colorSlot: true });
  one(9009, { ...lamp, colorSlot: true });

  // Bobinas: lo que se energiza. 9000 monoestable, 9001 biestable, 7018 la de
  // contactor. 9004-9007 son temporizadores: el TIMER_COIL de visual esperaba
  // `timerReady` pero el Device nunca llevaba `timer`; ahora la bobina
  // declara su modo (9004 conexión, 9005 desconexión, 9006 ambos, 9007
  // intermitente — cicla en ambos sentidos).
  one(9000, { kind: 'coil', rest: 'open', pressable: false, protection: false });
  // 9003 es «Electroválvula» (CATALOG, -EV): la capa visual ya la trataba como
  // bobina pero el solver la ignoraba. Eléctricamente es una carga inductiva.
  one(9003, { kind: 'coil', rest: 'open', pressable: false, protection: false });
  one(9001, { kind: 'coil', rest: 'open', pressable: false, protection: false, latching: true });
  one(7018, { kind: 'coil', rest: 'open', pressable: false, protection: false });
  one(9004, { kind: 'coil', rest: 'open', pressable: false, protection: false, timer: 'on' });
  one(9005, { kind: 'coil', rest: 'open', pressable: false, protection: false, timer: 'off' });
  one(9006, { kind: 'coil', rest: 'open', pressable: false, protection: false, timer: 'both' });
  one(9007, { kind: 'coil', rest: 'open', pressable: false, protection: false, timer: 'both' });

  return table;
}

const SPEC = buildTable();

/**
 * Semántica de un código. Función total: nunca lanza; los códigos sin
 * semántica de simulación reciben el spec `unknown`.
 */
export function specOf(code: number): ComponentSpec {
  return SPEC[code] ?? UNKNOWN_SPEC;
}

/** Presionable con un clic: pulsadores y selectores. */
export function isPushable(code: number): boolean {
  return specOf(code).pressable;
}

/**
 * Pulsador momentáneo: el clic lo acciona y vuelve solo a su estado inicial.
 * Son los «Contacto pulsador» del catálogo (8000-8007); los «Contacto
 * interruptor» (8008-8011) y el conmutador 8018 no lo son.
 */
export function isMomentary(code: number): boolean {
  return specOf(code).momentary ?? false;
}

/**
 * Paso del reloj de simulación de la app: `App.tsx` avanza `tick` de a este
 * intervalo y cada tick es un paso del solver. Vive en este módulo porque la
 * duración del pulso de un pulsador se deriva de él (`MOMENTARY_PULSE_MS`) y la
 * app y los tests tienen que medir el mismo paso.
 */
export const SIMULATION_TICK_MS = 100;

/**
 * Cuánto dura accionado un pulsador momentáneo: tres pasos de simulación.
 *
 * El solver sólo ve el contacto en los pasos que calcula, y un paso es un tick
 * del reloj (100 ms). Un pulso de un solo tick podría nacer y morir entre dos
 * pasos —o perderse si el navegador retrasa el intervalo—, así que la ventana
 * se toma con holgura: 300 ms contienen siempre al menos dos pasos con el
 * contacto cerrado, cualquiera sea el instante del clic respecto del reloj, y
 * siguen siendo imperceptibles para el usuario (nadie percibe un "pegajoso" de
 * 300 ms). El valor se expresa en ticks justamente para que no sea un número
 * arbitrario: si el reloj cambia, el pulso cambia con él.
 */
export const MOMENTARY_PULSE_MS = SIMULATION_TICK_MS * 3;

/** Qué hace un clic de simulación sobre un aparato. */
export type ClickAction = 'pulse' | 'press' | 'release' | 'none';

/**
 * Decisión pura del clic durante la simulación, por código y por estado actual:
 *
 * - `pulse`: pulsador momentáneo. Siempre acciona, incluso si ya estaba
 *   accionado: un segundo clic reinicia el pulso, no lo apaga (no acumula
 *   estados, porque el aparato es un pulsador y no un interruptor).
 * - `press`/`release`: interruptor o selector, que alterna como antes.
 * - `none`: el código no se acciona con el clic; cada camino (conmutador,
 *   protecciones) decide por su cuenta como hasta hoy.
 */
export function clickActionOf(code: number, pressed: boolean): ClickAction {
  if (!isPushable(code)) return 'none';
  if (isMomentary(code)) return 'pulse';
  return pressed ? 'release' : 'press';
}

/**
 * Conjunto de aparatos accionados después de un clic. Puro: la app sólo guarda
 * el resultado de `setTimeout` que suelta el pulso. Aplicarlo dos veces con el
 * mismo estado no duplica ni acumula nada.
 */
export function applyClick(pressed: readonly number[], id: number, code: number): readonly number[] {
  switch (clickActionOf(code, pressed.includes(id))) {
    case 'none':
      return pressed;
    case 'pulse':
    case 'press':
      return pressed.includes(id) ? pressed : [...pressed, id];
    case 'release':
      return pressed.filter((p) => p !== id);
  }
}

/** Conmutador de dos posiciones: el clic lo pasa de una salida a la otra. */
export function isChangeover(code: number): boolean {
  return specOf(code).kind === 'changeover';
}

/**
 * Protecciones que arrancan **abiertas**, como en CADeSimu: hasta que el
 * usuario las cierra no dejan pasar la fase.
 *
 * Son los automáticos, disyuntores y diferenciales (6000-6999). El contacto
 * auxiliar del relé térmico (8017) no corta: es un contacto y arranca cerrado,
 * como antes.
 */
export function startsOpen(code: number): boolean {
  return code >= 6000 && code < 7000;
}

export function isLamp(code: number): boolean {
  return specOf(code).kind === 'lamp';
}

/** El registro cierra su cabecera con el índice de color del vidrio. */
export function hasColorSlot(code: number): boolean {
  return specOf(code).colorSlot ?? false;
}

/** Protecciones que el usuario puede abrir/disparar en simulación. */
export function isProtection(code: number): boolean {
  return specOf(code).protection;
}

/** Polaridad de reposo: 'closed' = NC, 'open' = NA. */
export function restStateOf(code: number): 'open' | 'closed' {
  return specOf(code).rest;
}

export function timerOf(code: number): 'on' | 'off' | 'both' | undefined {
  return specOf(code).timer;
}

export function isLatching(code: number): boolean {
  return specOf(code).latching ?? false;
}

import type { SymbolGroup } from '../symbols/library.ts';

/** Etiqueta de familia compartida por la paleta y la barra de inserción. */
export const GROUP_LABEL: Record<SymbolGroup, string> = {
  motor: 'Motores',
  potencia: 'Potencia',
  contactor: 'Contactores',
  fusible: 'Fusibles',
  proteccion: 'Automáticos',
  mando: 'Mando',
  alimentacion: 'Alimentación',
  senalizacion: 'Señalización',
  sensor: 'Sensores',
  neumatico: 'Actuadores neumáticos',
  linea: 'Líneas y cables',
  borne: 'Borneras',
  carga: 'Cargas',
  otro: 'Otros',
};

/** Tono por familia: pinta las miniaturas, no el esquema. */
export const GROUP_TONE: Record<SymbolGroup, string> = {
  alimentacion: 'var(--tone-alimentacion)',
  motor: 'var(--tone-motor)',
  potencia: 'var(--tone-potencia)',
  contactor: 'var(--tone-potencia)',
  fusible: 'var(--tone-proteccion)',
  proteccion: 'var(--tone-proteccion)',
  mando: 'var(--tone-mando)',
  senalizacion: 'var(--tone-senalizacion)',
  sensor: 'var(--tone-sensor)',
  linea: 'var(--wire)',
  carga: 'var(--tone-otro)',
  borne: 'var(--tone-otro)',
  neumatico: 'var(--tone-otro)',
  otro: 'var(--tone-otro)',
};

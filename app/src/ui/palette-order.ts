import type { SymbolGroup } from '../symbols/library.ts';

/**
 * Orden de las categorías de la paleta, calcado del menú «Barras» de
 * CADe_SIMU V4 (verificado en la GUI con la clave shareware 4962).
 * Cada entrada indica la barra de la que viene. Nuestros grupos son más
 * gruesos, así que varias barras se juntan en una categoría.
 */
export const GROUP_ORDER: readonly SymbolGroup[] = [
  'alimentacion', // Barra de alimentaciones
  'proteccion',   // Barras de fusibles y de automáticos
  'potencia',     // Barras de contactores y de potencia
  'motor',        // Barras de motores y de accionamientos
  'mando',        // Barras de contactos, bobinas y relés electrónicos
  'sensor',       // Barra de detectores
  'senalizacion', // Barra de señalizaciones
  'otro',         // Barras de lógica, ladder, grafcet, E/S y neumáticos
  'linea',        // Barra de conexiones
  'carga',
  'borne',
];

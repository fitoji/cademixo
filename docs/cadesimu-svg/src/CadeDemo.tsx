import React from 'react';
import { CadeSymbol } from './CadeSymbol';

/** Visual test only. Does not parse the .cad or claim pixel-perfect fidelity. */
export default function CadeDemo() {
  return <svg viewBox="0 0 520 250" width="100%" xmlns="http://www.w3.org/2000/svg" aria-label="Galería de símbolos CADe_SIMU">
    <defs><pattern id="cade-dots" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="0.5" cy="0.5" r="0.3" fill="#aaa" /></pattern></defs>
    <rect width="520" height="250" fill="white"/><rect width="520" height="250" fill="url(#cade-dots)"/>
    <g stroke="#cc0000" strokeWidth="0.7" fill="none">
      <path d="M55 30 V60 M55 96 V125 H155 V60 M155 96 V125 H255 V60 M255 96 V125 H355 V60 M355 96 V125"/>
    </g>
    <CadeSymbol kind="8000" x={55} y={78} label="S1"/>
    <CadeSymbol kind="8001" x={155} y={78} label="S0"/>
    <CadeSymbol kind="9000" x={255} y={78} label="KM"/>
    <CadeSymbol kind="9008" x={355} y={78} label="H1"/>
    <CadeSymbol kind="1000" x={445} y={83} label="M1"/>
    <g fill="#111" fontSize="10" fontFamily="Arial,sans-serif" textAnchor="middle">
      <text x="55" y="155">8000 · NA</text><text x="155" y="155">8001 · NC</text>
      <text x="255" y="155">9000 · Bobina</text><text x="355" y="155">9008 · Piloto</text>
      <text x="445" y="155">1000 · Motor</text>
    </g>
    <text x="16" y="222" fill="#555" fontFamily="Arial,sans-serif" fontSize="10">Geometría preliminar · requiere validación contra CADe_SIMU</text>
  </svg>;
}

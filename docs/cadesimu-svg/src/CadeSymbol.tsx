import React from 'react';

/** Geometry in local SVG units. Reference-derived proportions are preliminary. */
export type CadeKind = '8000'|'8001'|'9000'|'9008'|'1000';
export type CadeSymbolProps = {
  kind: CadeKind;
  x?: number;
  y?: number;
  rotation?: number;
  label?: string;
  stroke?: string;
  strokeWidth?: number;
};

export const terminals: Record<CadeKind, ReadonlyArray<readonly [number, number]>> = {
  '8000': [[0,-18],[0,18]],
  '8001': [[0,-18],[0,18]],
  '9000': [[0,-18],[0,18]],
  '9008': [[0,-18],[0,18]],
  '1000': [[-12,-12],[0,-12],[12,-12]],
};

/** All geometry shares one local origin, including terminal locations. */
export function CadeSymbol({kind,x=0,y=0,rotation=0,label,stroke='#111',strokeWidth=0.8}:CadeSymbolProps) {
  const common = {stroke, strokeWidth, fill:'none' as const, strokeLinecap:'square' as const, strokeLinejoin:'miter' as const};
  return <g transform={`translate(${x} ${y}) rotate(${rotation})`}>
    <g {...common}>
      {kind === '8000' && <>
        <path d="M0 -18 V-7 M0 7 V18 M0 7 L-6 -6" />
        <path d="M-7 -7 H-4" />
      </>}
      {kind === '8001' && <>
        <path d="M0 -18 V-7 M0 7 V18 M0 7 L-6 -6 M-9 -1 H4" />
      </>}
      {kind === '9000' && <>
        <path d="M0 -18 V-8 M0 8 V18" />
        <rect x="-8" y="-8" width="16" height="16" />
      </>}
      {kind === '9008' && <>
        <path d="M0 -18 V-8 M0 8 V18" />
        <circle r="8" /><path d="M-5.6 -5.6 L5.6 5.6 M5.6 -5.6 L-5.6 5.6" />
      </>}
      {kind === '1000' && <>
        <path d="M-12 -12 V-9 M0 -12 V-9 M12 -12 V-9" />
        <circle r="15" />
        <text x="0" y="0" textAnchor="middle" dominantBaseline="middle" fill={stroke} stroke="none" fontFamily="Arial,sans-serif" fontSize="8">M</text>
        <text x="0" y="9" textAnchor="middle" fill={stroke} stroke="none" fontFamily="Arial,sans-serif" fontSize="7">3~</text>
      </>}
    </g>
    {label && <text x="-12" y="-1" fontSize="6" textAnchor="end" fontFamily="Arial,sans-serif" fill={stroke}>{label}</text>}
  </g>;
}

export function transformTerminal([px,py]: readonly [number,number], x:number,y:number,angleDeg:number) {
  const a=angleDeg*Math.PI/180;
  return {x:x+px*Math.cos(a)-py*Math.sin(a), y:y+px*Math.sin(a)+py*Math.cos(a)};
}

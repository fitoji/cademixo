import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { applyAppearance, readMode, readStyle } from './appearance.ts';
import '../index.css';
import './diagram.css';

// Antes del primer render: sin esto el arranque pinta el tema de día y salta.
applyAppearance(readMode(), readStyle());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

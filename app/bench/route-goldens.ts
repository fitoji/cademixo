/**
 * Captura las rutas exactas que devuelve `routeOrthogonal` hoy.
 *
 * Escenarios sobre la hoja cableada grande (corredor libre, desvío, borde y
 * empate sintético) más una trayectoria representativa del gesto de dibujar.
 * El JSON se guarda como fixture y el test exige las mismas secuencias después
 * de cambiar el router.
 *
 * Uso: node bench/route-goldens.ts  (escribe test/fixtures/route-goldens.json)
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEditor, projectOf } from '../src/editor/state.ts';
import { boundsOf } from '../src/model/project.ts';
import type { Box } from '../src/editor/wiring/router.ts';
import type { Point } from '../src/editor/pins.ts';
import { routeOrthogonal } from '../src/editor/wiring/router.ts';
import { wiredSheetText } from './wired-sheet.ts';

const sheet = wiredSheetText(9787);
const project = projectOf(createEditor(sheet.text));
const obstacles: Box[] = project.records
  .filter((rec) => rec.kind === 'component')
  .map((rec) => boundsOf(rec))
  .filter((b): b is NonNullable<typeof b> => b !== null)
  .map((b) => ({ minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h }));

const midX = Math.floor(sheet.blocks / 2) * 400;

interface Scenario {
  name: string;
  from: Point;
  to: Point;
  obstacles: Box[];
}

const synthetic = (minX: number, minY: number, maxX: number, maxY: number): Box => ({ minX, minY, maxX, maxY });

const scenarios: Scenario[] = [
  // Corredor libre lejos del dibujo: ruta recta.
  { name: 'corredor', from: { x: midX, y: 1200 }, to: { x: midX + 320, y: 1200 }, obstacles },
  // Desvío: extremos a los lados de un obstáculo.
  { name: 'desvio', from: { x: midX - 40, y: 40 }, to: { x: midX + 260, y: 40 }, obstacles },
  // Borde del obstáculo inflado.
  { name: 'borde', from: { x: midX - 2, y: 20 }, to: { x: midX + 200, y: 20 }, obstacles },
  // Empate sintético: dos obstáculos simétricos dejan dos rutas equivalentes.
  {
    name: 'empate',
    from: { x: 0, y: 0 },
    to: { x: 200, y: 100 },
    obstacles: [synthetic(80, 40, 120, 60), synthetic(80, 40, 120, 60)],
  },
  // Trayectoria representativa del gesto de dibujar cable.
  { name: 'gesto', from: { x: midX + 153, y: 159 }, to: { x: midX + 273, y: 231 }, obstacles },
];

const goldens = scenarios.map((sc) => {
  const result = routeOrthogonal({ from: sc.from, to: sc.to, obstacles: sc.obstacles });
  return {
    name: sc.name,
    from: sc.from,
    to: sc.to,
    obstacleCount: sc.obstacles.length,
    waypoints: result.waypoints,
    length: result.length,
    bends: result.bends,
  };
});

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, '..', 'test', 'fixtures', 'route-goldens.json'), JSON.stringify(goldens, null, 2) + '\n');
console.log(JSON.stringify(goldens.map((g) => ({ name: g.name, points: g.waypoints.length, length: g.length, bends: g.bends })), null, 1));

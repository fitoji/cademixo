#!/usr/bin/env node
/**
 * Sube la versión del proyecto leyendo los commits convencionales.
 *
 *   feat: …   → minor   (0.9.2 → 0.10.0)
 *   fix: …    → patch   (0.9.2 → 0.9.3)
 *   …!: …    → major   (0.9.2 → 1.0.0)
 *
 * El resto (`docs`, `chore`, `refactor`, `test`, `style`, `perf`, `build`, `ci`)
 * sube el parche: un release siempre avanza, nunca se queda igual.
 *
 * El tramo sale del último commit que tocó `app/package.json`, así que no hacen
 * falta tags para que la cuenta cierre. `--since <rev>` lo pisa.
 *
 *   node scripts/bump-version.ts                 # infiere desde los commits
 *   node scripts/bump-version.ts minor           # fuerza el tipo
 *   node scripts/bump-version.ts --dry-run       # muestra sin escribir
 *   node scripts/bump-version.ts --tag           # además crea vX.Y.Z
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type BumpKind = 'patch' | 'minor' | 'major';

const KINDS: readonly BumpKind[] = ['patch', 'minor', 'major'];

const FEAT = /^feat(\([^)]*\))?!?:/;
const FIX = /^fix(\([^)]*\))?!?:/;
const BANG = /^[a-z]+(\([^)]*\))?!:/i;
const BREAKING = /^BREAKING[ -]CHANGE:/m;

/** Cuántos commits de cada tipo hay en el tramo. */
export function summarize(messages: string[]): {
  total: number;
  feat: number;
  fix: number;
  breaking: number;
} {
  let feat = 0;
  let fix = 0;
  let breaking = 0;

  for (const message of messages) {
    const subject = message.split('\n', 1)[0] ?? '';
    if (BANG.test(subject) || BREAKING.test(message)) breaking += 1;
    if (FEAT.test(subject)) feat += 1;
    else if (FIX.test(subject)) fix += 1;
  }

  return { total: messages.length, feat, fix, breaking };
}

/**
 * Qué tipo de salto piden los commits: gana el más alto.
 *
 * La ausencia de features y fixes no es "sin cambios" sino parche: la versión
 * publicada tiene que poder distinguirse de la anterior.
 */
export function bumpKind(messages: string[]): BumpKind {
  const counts = summarize(messages);
  if (counts.breaking > 0) return 'major';
  if (counts.feat > 0) return 'minor';
  return 'patch';
}

/** `major.minor.patch` → siguiente versión, o `null` si el texto no es semver. */
export function nextVersion(current: string, kind: BumpKind): string | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** Mensajes completos del tramo; `null` = todo el historial. */
function commitsOf(range: string, cwd: string): string[] {
  const out = git(['log', '--format=%B%x00', range], cwd);
  return out
    .split('\0')
    .map((message) => message.trim())
    .filter((message) => message !== '');
}

/** Último commit que tocó el `package.json` de la app: ahí arranca el tramo. */
function versionBase(root: string, pkgPath: string): string | null {
  const relative = pkgPath.slice(root.length + 1);
  const hash = git(['log', '-1', '--format=%H', '--', relative], root);
  return hash === '' ? null : hash;
}

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.vite']);

/** Todos los `package.json` del árbol, sin entrar a dependencias ni builds. */
function packageFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      packageFiles(join(dir, entry.name), found);
    } else if (entry.name === 'package.json') {
      found.push(join(dir, entry.name));
    }
  }
  return found;
}

/** Reemplaza la versión sin reformatear el archivo. */
function setVersion(path: string, from: string, to: string): boolean {
  const text = readFileSync(path, 'utf8');
  const pattern = new RegExp(`("version":\\s*")${from.replaceAll('.', '\\.')}(")`);
  if (!pattern.test(text)) return false;
  writeFileSync(path, text.replace(pattern, `$1${to}$2`));
  return true;
}

function usage(): string {
  return [
    'uso: node scripts/bump-version.ts [patch|minor|major] [--since <rev>] [--dry-run] [--tag]',
    '',
    '  patch  bugfix         0.9.2 → 0.9.3',
    '  minor  feature        0.9.2 → 0.10.0',
    '  major  incompatible   0.9.2 → 1.0.0',
    '',
    'Sin tipo, se infiere de los commits convencionales del tramo.',
  ].join('\n');
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return;
  }

  const root = git(['rev-parse', '--show-toplevel'], process.cwd());
  const pkgPath = join(root, 'app', 'package.json');
  const current = JSON.parse(readFileSync(pkgPath, 'utf8')).version as string;

  const sinceAt = argv.indexOf('--since');
  const since = sinceAt >= 0 ? argv[sinceAt + 1] : undefined;
  const explicit = argv.find((arg) => KINDS.includes(arg as BumpKind)) as BumpKind | undefined;
  const dryRun = argv.includes('--dry-run');
  const tag = argv.includes('--tag');

  const base = since ?? versionBase(root, pkgPath);
  const range = base === null ? 'HEAD' : `${base}..HEAD`;
  const messages = commitsOf(range, root);
  const counts = summarize(messages);

  if (messages.length === 0 && explicit === undefined) {
    console.log(`Sin commits nuevos en ${range}: no hay nada que subir.`);
    return;
  }

  const kind = explicit ?? bumpKind(messages);
  const next = nextVersion(current, kind);
  if (next === null) {
    console.error(`La versión actual («${current}») no es major.minor.patch.`);
    process.exitCode = 1;
    return;
  }

  const targets = packageFiles(root).filter((path) => {
    try {
      return JSON.parse(readFileSync(path, 'utf8')).version === current;
    } catch {
      return false;
    }
  });

  console.log(`versión ${current} → ${next} (${kind})`);
  console.log(`  tramo ${range}: ${counts.total} commits (${counts.feat} feat, ${counts.fix} fix, ${counts.breaking} breaking)`);
  for (const path of targets) console.log(`  actualiza ${path.slice(root.length + 1)}`);

  if (dryRun) {
    console.log('  --dry-run: no se escribió nada');
    return;
  }

  let written = 0;
  for (const path of targets) {
    if (setVersion(path, current, next)) written += 1;
  }
  if (written === 0) {
    console.error('No se encontró el campo «version» en ningún package.json.');
    process.exitCode = 1;
    return;
  }

  if (tag) {
    git(['tag', '-a', `v${next}`, '-m', `v${next}`], root);
    console.log(`  tag v${next}`);
  }

  console.log('');
  console.log(`siguiente: git commit -am "chore(release): v${next}"${tag ? '' : ` && git tag v${next}`}`);
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) main();

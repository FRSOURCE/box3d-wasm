// Reads the pinned Box3D headers and the C shim, and reports how much of the
// engine API the shim wraps. Shared by test/parity.test.ts and the update script.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const HEADER_DIR = join(
  ROOT,
  'node_modules/@erincatto/box3d/include/box3d',
);
export const CSRC_DIR = join(ROOT, 'csrc');
export const MANIFEST_PATH = join(ROOT, 'parity/manifest.json');

// Headers that make up the public engine API. config.h and id.h hold no functions we wrap.
const API_HEADERS = [
  'base.h',
  'box3d.h',
  'collision.h',
  'constants.h',
  'types.h',
];

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function readHeaders() {
  return API_HEADERS.map((name) =>
    stripComments(readFileSync(join(HEADER_DIR, name), 'utf8')),
  );
}

/** Every `B3_API` function name declared by the engine. */
export function extractFunctions() {
  const names = new Set();
  for (const text of readHeaders()) {
    for (const m of text.matchAll(/\bB3_API\b[^;{]*?\b(b3\w+)\s*\(/g))
      names.add(m[1]);
  }
  return [...names].sort();
}

/** `{ b3ShapeType: ['b3_capsuleShape', ...] }` with explicit `= value` kept in the member string. */
export function extractEnums() {
  const enums = {};
  for (const text of readHeaders()) {
    for (const m of text.matchAll(
      /typedef\s+enum\s+(b3\w+)\s*\{([\s\S]*?)\}\s*\1\s*;/g,
    )) {
      enums[m[1]] = m[2]
        .split(',')
        .map((member) => member.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    }
  }
  return sortKeys(enums);
}

/** `{ b3BodyDef: ['b3BodyType type', ...] }` for every `*Def` struct. */
export function extractDefs() {
  const defs = {};
  for (const text of readHeaders()) {
    for (const m of text.matchAll(
      /typedef\s+struct\s+(b3\w*Def)\s*\{([\s\S]*?)\}\s*\1\s*;/g,
    )) {
      defs[m[1]] = m[2]
        .split(';')
        .map((field) => field.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    }
  }
  return sortKeys(defs);
}

/** `#define B3_NAME value` constants from constants.h. */
export function extractConstants() {
  const out = {};
  const text = stripComments(
    readFileSync(join(HEADER_DIR, 'constants.h'), 'utf8'),
  );
  for (const m of text.matchAll(/^#define\s+(B3_\w+)\s+(.+)$/gm))
    out[m[1]] = m[2].trim();
  return sortKeys(out);
}

/** Engine functions that appear as identifiers anywhere in the shim. */
export function wrappedFunctions(functions = extractFunctions()) {
  const source = readdirSync(CSRC_DIR)
    .filter((f) => f.endsWith('.c') || f.endsWith('.h'))
    .map((f) => readFileSync(join(CSRC_DIR, f), 'utf8'))
    .join('\n');
  const idents = new Set(source.match(/\bb3\w+/g));
  return functions.filter((name) => idents.has(name));
}

export function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

export function engineSha() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return (
    (pkg.devDependencies?.['@erincatto/box3d'] ?? '').split('#')[1] ?? 'unknown'
  );
}

function sortKeys(obj) {
  return Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)),
  );
}

/** The field name of a struct member declaration such as `float* heights` or `b3Vec3 position[4]`. */
export function fieldName(declaration) {
  const m = /([A-Za-z_]\w*)\s*(\[[^\]]*\])?\s*$/.exec(
    declaration.replace(/=.*$/, '').trim(),
  );
  return m ? m[1] : declaration;
}

/**
 * Def struct fields the shim never mentions: `{ b3BodyDef: ['userData', ...] }`.
 * A field counts as mapped when its name appears as an identifier in csrc.
 */
export function unmappedDefFields(defs = extractDefs()) {
  const source = readdirSync(CSRC_DIR)
    .filter((f) => f.endsWith('.c') || f.endsWith('.h'))
    .map((f) => readFileSync(join(CSRC_DIR, f), 'utf8'))
    .join('\n');
  const out = {};
  for (const [name, fields] of Object.entries(defs)) {
    const missing = [];
    for (const declaration of fields) {
      const field = fieldName(declaration);
      if (!new RegExp(`(?:\\.|->)${field}\\b`).test(source))
        missing.push(field);
    }
    if (missing.length > 0) out[name] = missing;
  }
  return sortKeys(out);
}

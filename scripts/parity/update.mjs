// Rewrites parity/manifest.json from the pinned headers.
//
// - Enum, def-struct and constant snapshots are replaced with the current ones.
//   Run this only after you have reviewed the diff and updated the shim, the
//   layouts and the hardcoded enum maps to match.
// - Functions the shim does not wrap keep their recorded reason. New ones are
//   added as `todo: new upstream API` so the gate stays red until each is
//   either wrapped or given an explicit `skip:` reason.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  MANIFEST_PATH,
  engineSha,
  extractConstants,
  extractDefs,
  extractEnums,
  extractFunctions,
  loadManifest,
  unmappedDefFields,
  wrappedFunctions,
} from './extract.mjs';

let previous = { unwrapped: {} };
try {
  previous = loadManifest();
} catch {
  // first run
}

const functions = extractFunctions();
const wrapped = new Set(wrappedFunctions(functions));
const unwrapped = {};
for (const name of functions) {
  if (wrapped.has(name)) continue;
  unwrapped[name] = previous.unwrapped?.[name] ?? 'todo: new upstream API';
}

const unmappedFields = {};
for (const [def, fields] of Object.entries(unmappedDefFields())) {
  unmappedFields[def] = {};
  for (const field of fields) {
    unmappedFields[def][field] =
      previous.unmappedDefFields?.[def]?.[field] ??
      'todo: new upstream def field';
  }
}

const manifest = {
  engineSha: engineSha(),
  // Reason strings start with `skip:` (deliberately not wrapped) or `todo:` (backlog).
  unwrapped,
  enums: extractEnums(),
  // def struct fields the shim does not map, with the reason
  unmappedDefFields: unmappedFields,
  defs: extractDefs(),
  constants: extractConstants(),
};
mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

const todo = Object.values(unwrapped).filter((r) =>
  r.startsWith('todo:'),
).length;
process.stdout.write(
  `parity: ${functions.length} engine functions, ${wrapped.size} wrapped, ${todo} todo, ${Object.keys(unwrapped).length - todo} skipped\n`,
);

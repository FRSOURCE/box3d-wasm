// emcc --emit-tsd leaves the RuntimeExports namespace out of the pthread
// build's declaration while still referencing it, which makes MainModule
// collapse to any under skipLibCheck. Copy the namespace from the standard
// declaration and add what the deluxe runtime exports on top.
import { readFileSync, writeFileSync } from 'node:fs';

const [standardPath, deluxePath] = process.argv.slice(2);
const standard = readFileSync(standardPath, 'utf8');
const deluxe = readFileSync(deluxePath, 'utf8');

const namespace = standard.match(
  /declare namespace RuntimeExports \{[\s\S]*?\n\}\n/,
);
if (!namespace) {
  throw new Error(`${standardPath} has no RuntimeExports namespace`);
}
if (deluxe.includes('declare namespace RuntimeExports')) {
  process.exit(0);
}
const withPThread = namespace[0].replace(
  /\n\}\n$/,
  '\n    let PThread: { unusedWorkers: unknown[]; runningWorkers: unknown[]; terminateAllThreads(): void };\n}\n',
);
writeFileSync(deluxePath, deluxe.replace(/^export \{\};\n/m, withPThread));

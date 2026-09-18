// Regenerates src/version.ts from package.json.
//
// Runs automatically through the "version" npm lifecycle hook, so `npm run bump`
// (and any other `npm version ...`) keeps the two in sync. Can also be run on
// its own to re-sync after a hand edit.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.\-+]+)?$/;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = join(repoRoot, 'package.json');
const outPath = join(repoRoot, 'src', 'version.ts');

const version = JSON.parse(readFileSync(packagePath, 'utf8')).version;

if (typeof version !== 'string' || !SEMVER.test(version)) {
  console.error(`write-version: package.json has no usable "version" (got ${String(version)}).`);
  process.exit(1);
}

const contents = `// GENERATED FILE - do not edit by hand.
// Regenerate with: npm run bump   (or: node scripts/write-version.mjs)
//
// The version is baked in at bump time rather than read from package.json at
// runtime, because package.json is not reliably reachable from inside the pkg
// ESM snapshot - see docs/plans/windows-tray.md.
export const VERSION = '${version}';
`;

let current = null;
try {
  current = readFileSync(outPath, 'utf8');
} catch {
  // First run, or the file was deleted; fall through and write it.
}

if (current === contents) {
  console.log(`write-version: src/version.ts already at ${version}.`);
} else {
  writeFileSync(outPath, contents);
  console.log(`write-version: src/version.ts -> ${version}`);
}

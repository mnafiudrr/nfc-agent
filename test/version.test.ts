import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/version.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('src/version.ts matches package.json', () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
    version?: unknown;
  };
  assert.equal(
    VERSION,
    pkg.version,
    'src/version.ts is stale - run "npm run bump" rather than editing package.json by hand, ' +
      'or "node scripts/write-version.mjs" to re-sync.',
  );
});

test('the version is a plain semver triple', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.\-+]+)?$/);
});

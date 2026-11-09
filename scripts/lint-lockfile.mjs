#!/usr/bin/env node
/**
 * Lockfile audit: fail if package-lock.json shows signs of registry
 * poisoning.
 *
 * Checks every entry in `packages`:
 *   1. Any `resolved` URL must point at registry.npmjs.org.
 *   2. Every entry must have a `version` field, except the root ("")
 *      entry and legitimate `link: true` (workspace symlink) or
 *      `inBundle: true` (bundled dependency) entries.
 *
 * A local registry proxy previously wrote localhost `resolved` URLs and
 * versionless stub entries into the lockfile, breaking npm ci.
 * This runs from `npm run check` so a poisoned lockfile is caught before it ships.
 *
 * No dependencies  plain Node. Optional argv[2] overrides the lockfile
 * path (used by tests).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ALLOWED_HOST = 'registry.npmjs.org';

const lockfilePath = resolve(process.argv[2] || 'package-lock.json');

let lock;
try {
  lock = JSON.parse(readFileSync(lockfilePath, 'utf8'));
} catch (err) {
  console.error(`✖ lint:lockfile  cannot read ${lockfilePath}: ${err.message}`);
  process.exit(1);
}

const packages = lock.packages || {};
const errors = [];

for (const [name, entry] of Object.entries(packages)) {
  if (entry.resolved) {
    let host;
    try {
      host = new URL(entry.resolved).host;
    } catch {
      // Non-URL `resolved` (e.g. file: specifiers parse fine; anything
      // unparseable is suspicious).
      errors.push(`  ${name || '(root)'}: unparseable resolved URL: ${entry.resolved}`);
      continue;
    }
    if (host && host !== ALLOWED_HOST) {
      errors.push(`  ${name || '(root)'}: resolved from ${host}  ${entry.resolved}`);
    }
  }

  const isRoot = name === '';
  const isLink = entry.link === true;
  const isBundled = entry.inBundle === true;
  if (!isRoot && !isLink && !isBundled && !entry.version) {
    errors.push(`  ${name}: missing version field (registry-proxy stub entry)`);
  }
}

if (errors.length > 0) {
  console.error(
    [
      `✖ lint:lockfile  ${lockfilePath} appears poisoned (${errors.length} problem${errors.length === 1 ? '' : 's'}):`,
      '',
      ...errors,
      '',
      '  Fix: regenerate the lockfile from the public registry:',
      '',
      '    rm -rf node_modules package-lock.json',
      '    npm install --registry=https://registry.npmjs.org',
      '',
    ].join('\n')
  );
  process.exit(1);
}

const count = Object.keys(packages).length;
console.log(`✔ lint:lockfile  ${count} entries OK (all resolved from ${ALLOWED_HOST})`);

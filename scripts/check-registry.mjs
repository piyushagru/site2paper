#!/usr/bin/env node
/**
 * Preinstall guard: refuse to install from anything but the public npm
 * registry.
 *
 * Why: this machine's shell environment sets NPM_CONFIG_REGISTRY to a local
 * registry proxy (e.g. http://localhost:17539). Env vars beat the project
 * .npmrc in npm's config precedence, so an `npm install` run from such a
 * shell would silently rewrite package-lock.json with localhost `resolved`
 * URLs and versionless stub entries, breaking `npm ci` everywhere else.
 *
 * Detection:
 *   1. Ask `npm config get registry` for the effective value (authoritative
 *      across CLI flags, env vars, and all .npmrc layers). Hard fail for
 *      non-public hosts; pass otherwise, even if a shell env var still
 *      points at the proxy, since npm will not use it.
 *   2. Only if npm cannot be spawned: scan process.env for any
 *      case-insensitive npm_config_registry variable. Values are trimmed
 *      and stripped of whitespace and control characters before parsing,
 *      because CI environments can hand us non-byte-clean strings.
 *
 * No dependencies, plain Node, safe to run before node_modules exists.
 */

import { execFileSync } from 'node:child_process';

const ALLOWED_HOST = 'registry.npmjs.org';

/** Strips whitespace, control characters, and zero-width characters. */
function sanitize(value) {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff\s]/g, '');
}

/** Returns the URL host, or '' if unparseable/empty (npm then uses its default). */
function hostOf(registry) {
  try {
    return new URL(registry).host;
  } catch {
    return '';
  }
}

function diagnose(source, rawValue, parsedHost) {
  return [
    `  Detected via:       ${source}`,
    `  Raw value:          ${JSON.stringify(rawValue)}`,
    `  Parsed host:        ${JSON.stringify(parsedHost)}`,
    `  Expected host:      ${ALLOWED_HOST}`,
  ];
}

function fail(source, rawValue, parsedHost) {
  console.error(
    [
      '',
      '\u2716 Refusing to install: npm registry is not the public registry.',
      '',
      ...diagnose(source, rawValue, parsedHost),
      '',
      '  Installing via a local registry proxy poisons package-lock.json',
      '  with localhost URLs and breaks npm ci for everyone else.',
      '',
      '  Fix: run the install pinned to the public registry:',
      '',
      '    npm install --registry=https://registry.npmjs.org',
      '',
      '  or unset the override in your shell:',
      '',
      '    unset NPM_CONFIG_REGISTRY',
      '',
    ].join('\n')
  );
  process.exit(1);
}

// 1. Effective npm config: authoritative across CLI flags, env vars, and all
// .npmrc layers. This is the registry npm will actually use, so a public
// result passes even if a shell env var still points at the proxy (that is
// exactly the `npm install --registry=...` override this script recommends).
let effectiveChecked = false;
try {
  const registry = execFileSync('npm', ['config', 'get', 'registry'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 15000,
  }).trim();
  effectiveChecked = true;
  const host = hostOf(registry);
  if (host && host !== ALLOWED_HOST) fail('npm config get registry', registry, host);
} catch {
  // npm not spawnable from here (unusual). Fall back to the env scan below;
  // the committed project .npmrc still covers user/global .npmrc poisoning.
}

// 2. Fallback env scan, case-insensitive (NPM_CONFIG_REGISTRY, npm_config_registry, ...).
if (!effectiveChecked) {
  for (const [key, value] of Object.entries(process.env)) {
    if (key.toLowerCase() !== 'npm_config_registry' || !value) continue;
    const host = hostOf(sanitize(value));
    if (!host || host === ALLOWED_HOST) continue;
    fail(`env var ${key}`, value, host);
  }
}

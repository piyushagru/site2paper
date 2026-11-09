#!/usr/bin/env bash
# Repo standards gate, run by `npm run check`, the pre-commit hook and CI.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
pass() { printf 'PASS  %s\n' "$1"; }
bad()  { printf 'FAIL  %s\n      hint: %s\n' "$1" "$2"; fail=1; }

EMDASH=$(printf '\xe2\x80\x94')
if grep -rlIF -- "$EMDASH" .kiro scripts bin src test .github ./*.md 2>/dev/null; then
  bad 'no em-dash' 'use a comma, colon or new sentence'
else
  pass 'no em-dash'
fi

if node scripts/lint-lockfile.mjs >/dev/null 2>&1; then
  pass 'lockfile resolved from registry.npmjs.org'
else
  bad 'lockfile resolved from registry.npmjs.org' 'rm -rf node_modules package-lock.json && npm install --registry=https://registry.npmjs.org'
fi

exit "$fail"

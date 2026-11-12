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

PACK_BUDGET="${PACK_BUDGET:-30000}"
packed=$(npm pack --dry-run --json 2>/dev/null | node -e 'const [p] = JSON.parse(require("fs").readFileSync(0, "utf8")); console.log(p.size)' 2>/dev/null || echo 0)
if [ "$packed" -gt 0 ] && [ "$packed" -le "$PACK_BUDGET" ]; then
  pass "packed size ${packed} B within ${PACK_BUDGET} B"
else
  bad "packed size ${packed} B within ${PACK_BUDGET} B" 'check the "files" field in package.json, or raise PACK_BUDGET with a reason in the commit'
fi

exit "$fail"

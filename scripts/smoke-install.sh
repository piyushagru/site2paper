#!/usr/bin/env bash
# New-user smoke test: install and run the package the way a stranger does, from an empty
# directory, an empty HOME and an empty npm cache, with nothing from this repo on the path.
#
#   npm run smoke               packs the working tree and runs the tarball (before publish)
#   npm run smoke -- 0.1.2      runs site2paper@0.1.2 from the public registry (after publish)
#
# Catches what unit tests cannot: a lifecycle script that references a file outside "files",
# a missing dependency, a bin that does not resolve, an engines floor that is wrong.
set -euo pipefail
cd "$(dirname "$0")/.."

version="${1:-}"
url="${SMOKE_URL:-https://example.com}"
sb=$(mktemp -d "${TMPDIR:-/tmp}/site2paper-smoke.XXXXXX")
trap 'rm -rf "$sb"' EXIT
mkdir -p "$sb/home" "$sb/work"

if [ -n "$version" ]; then
  spec="site2paper@$version"
else
  tgz=$(npm pack --pack-destination "$sb" --json 2>/dev/null | node -e 'const [p] = JSON.parse(require("fs").readFileSync(0, "utf8")); console.log(p.filename)')
  spec="$sb/$tgz"
fi

echo "smoke: npx -y --package=$spec site2paper $url --limit 1"
cd "$sb/work"
# env -i: no inherited npm config, PATH or HOME, so the run sees only what a fresh machine has.
if env -i HOME="$sb/home" PATH="$(dirname "$(command -v node)"):/usr/bin:/bin" \
  npm_config_cache="$sb/npmcache" npm_config_registry=https://registry.npmjs.org npm_config_update_notifier=false \
  npx -y --package="$spec" site2paper "$url" --limit 1 --out "$sb/work/out" > "$sb/run.log" 2>&1; then
  test -f "$sb/work/out/report.json" || { echo "FAIL  no report.json written"; cat "$sb/run.log"; exit 1; }
  echo "PASS  new-user install and run ($(grep -c . "$sb/run.log") lines of output)"
else
  echo "FAIL  exit $? for a new user"; cat "$sb/run.log"
  echo "      npm log: $(ls -t "$sb/npmcache/_logs" 2>/dev/null | head -1)"
  exit 1
fi

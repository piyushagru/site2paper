#!/usr/bin/env bash
# End-to-end smoke: install and run the package the way people do, against the local fixture site
# (scripts/fixture-site.mjs, loopback only), from an empty dir, HOME and npm cache, nothing from this repo on PATH.
#
#   npm run smoke              pack the working tree; run it as a new user, and as an old user upgrading
#                              from an older release (npx cache and global install)
#   npm run smoke -- 0.1.3     the same against a published version, waiting out registry lag
#
# Required before every commit and every push (AGENTS.md). Unit tests cannot see a lifecycle script that
# needs a file outside "files", a dependency missing from the tarball, or a bin that does not resolve.
set -euo pipefail
cd "$(dirname "$0")/.."
REG=https://registry.npmjs.org
version="${1:-}"
sb=$(mktemp -d "${TMPDIR:-/tmp}/site2paper-smoke.XXXXXX")
pids=()
trap 'for p in ${pids[@]+"${pids[@]}"}; do kill "$p" 2>/dev/null || true; wait "$p" 2>/dev/null || true; done; rm -rf "$sb"' EXIT
trap 'echo "FAIL  smoke: over the 20 min deadline"; exit 124' TERM
perl -e 'sleep 1200; kill "TERM", getppid()' & pids+=($!)
mkdir -p "$sb/home" "$sb/work" "$sb/global"

# cap <secs> cmd...: runs cmd in its own process group and kills the whole group (npx, the CLI, Chrome) on timeout.
cap() {
  perl -e '$t = shift; $p = fork // die; if (!$p) { setpgrp(0, 0); exec @ARGV or exit 127 }
    $SIG{ALRM} = sub { kill "TERM", -$p; sleep 2; kill "KILL", -$p; waitpid($p, 0); exit 124 }; alarm $t;
    waitpid($p, 0); exit($? & 127 ? 128 + ($? & 127) : $? >> 8)' "$@"
}

if [ -n "$version" ]; then
  spec="site2paper@$version"; want="$version"
  # Retry only registry lag (npm view says E404 "No match found for version"), for 300 s; any other error fails now.
  t0=$SECONDS
  until left=$((t0 + 300 - SECONDS)); [ "$left" -gt 0 ] && out=$(cap $((left < 30 ? left : 30)) npm view "$spec" version --registry=$REG 2>&1); do
    left=$((t0 + 300 - SECONDS))
    if ! grep -qE 'No match found for version|ETARGET' <<< "$out" || [ "$left" -le 0 ]; then echo "FAIL  registry: $spec"; echo "$out" | tail -3; exit 1; fi
    echo "smoke: waiting for the registry to list $version"; sleep $((left < 10 ? left : 10))
  done
else
  spec="$sb/$(cap 120 npm pack --pack-destination "$sb" --json 2>/dev/null | node -e 'console.log(JSON.parse(require("fs").readFileSync(0, "utf8"))[0].filename)')"
  want=$(node -p 'require("./package.json").version')
fi
# Old user: newest installable release before the one under test (latest when it is unpublished), else none.
# 0.1.0 and 0.1.1 never installed (their preinstall needed a file outside "files"), so nobody runs them.
old=$(cap 30 npm view site2paper versions --json --registry=$REG 2>/dev/null | node -e '
  const all = [].concat(JSON.parse(require("fs").readFileSync(0, "utf8")));
  const ok = all.filter((v) => !v.includes("-") && !["0.1.0", "0.1.1"].includes(v));
  const i = ok.indexOf(process.argv[1]);
  console.log(i > 0 ? ok[i - 1] : i < 0 ? ok.at(-1) ?? "" : "")' "$want" || true)

fixture() { # file to write the URL into, then env for the server. Not in $(): pids must reach the trap.
  local out="$1"; shift
  env "$@" node scripts/fixture-site.mjs > "$out" & pids+=($!)
  for _ in $(seq 50); do [ -s "$out" ] && return; sleep 0.1; done
  echo "smoke: fixture did not start"; exit 1
}
fixture "$sb/site.url"; site=$(cat "$sb/site.url")
fixture "$sb/nomap.url" FIXTURE_SITEMAP=0; nomap=$(cat "$sb/nomap.url")
printf '%s\n%smissing\n' "$site" "$site" > "$sb/work/pages.txt"

fails=0
# name, expected exit, command... under env -i: a fresh machine sees no inherited npm config, PATH or HOME.
check() {
  local name="$1" want_exit="$2" got=0 t0=$SECONDS; shift 2
  (cd "$sb/work" && cap 300 env -i HOME="$sb/home" PATH="$sb/global/bin:$(dirname "$(command -v node)"):/usr/bin:/bin" \
    npm_config_cache="$sb/npmcache" npm_config_prefix="$sb/global" npm_config_registry=$REG \
    npm_config_update_notifier=false "$@") < /dev/null > "$sb/$name.log" 2>&1 || got=$?
  local took="$((SECONDS - t0))s"
  if [ "$got" = "$want_exit" ]; then echo "PASS  $name ($took)"; else echo "FAIL  $name: exit $got, want $want_exit ($took)"; tail -15 "$sb/$name.log"; fails=1; fi
}
report() { # name, report.json, pages, failed
  if node -e 'const r = require(process.argv[1]); process.exit(r.pages.length === +process.argv[2] && r.failed.length === +process.argv[3] ? 0 : 1)' "$2" "$3" "$4" 2>/dev/null
  then echo "PASS  $1"; else echo "FAIL  $1: want $3 pages, $4 failed in $2"; fails=1; fi
}
run=(npx -y --package="$spec" site2paper)

echo "smoke: $spec, fixture $site, old user from ${old:-none}"
check new-version 0 sh -c "test \"\$(${run[*]} --version)\" = '$want'"
check new-sitemap 0 "${run[@]}" "$site" --out out-sitemap
report new-sitemap-report "$sb/work/out-sitemap/report.json" 4 0
check new-crawl 0 "${run[@]}" "$nomap" --limit 3 --out out-crawl
report new-crawl-report "$sb/work/out-crawl/report.json" 3 0
check new-failed-page 3 "${run[@]}" "$site" --pages pages.txt --retries 0 --format compare --out out-failed
report new-failed-report "$sb/work/out-failed/report.json" 1 1
if [ -n "$old" ]; then
  check old-npx-warm 0 npx -y --package="site2paper@$old" site2paper --help
  check old-npx-upgrade 0 sh -c "test \"\$(${run[*]} --version)\" = '$want'"
  check old-global-install 0 npm install -g "site2paper@$old"
  check old-global-upgrade 0 npm install -g "$spec"
  check old-global-version 0 sh -c "test \"\$(site2paper --version)\" = '$want'"
  check old-global-run 0 site2paper "$site" --limit 1 --out out-global
else
  echo "SKIP  old user: no installable release older than $want"
fi
[ "$fails" = 0 ] && echo "PASS  smoke ($want)" || { echo "FAIL  smoke ($want)"; exit 1; }

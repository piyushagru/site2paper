import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const run = (env) => spawnSync("bash", ["scripts/check-standards.sh"], { encoding: "utf8", env: { ...process.env, ...env } });

test("packed size check fails when the package is over budget", () => {
  const r = run({ PACK_BUDGET: "10" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FAIL {2}packed size \d+ B within 10 B/);
});

test("packed size check passes under the default budget", () => {
  const r = run({});
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /PASS {2}packed size \d+ B within 30000 B/);
});

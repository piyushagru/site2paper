import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Argument handling only: every case here exits before a browser is launched.
const cli = (...args) => spawnSync(process.execPath, ["bin/site2paper.mjs", ...args], { encoding: "utf8" });
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));

test("--version and -v print the package version", () => {
  for (const flag of ["--version", "-v"]) {
    const r = cli(flag);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), version);
  }
});

test("--help exits 0 and lists --version", () => {
  const r = cli("--help");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--version/);
});

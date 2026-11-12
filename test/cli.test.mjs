import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// No real browser: cases exit before launch or get a fake one.
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

test("a failure while a spinner is live clears it before the error surfaces", async () => {
  const { chromium } = await import("playwright-core");
  const { run } = await import("../src/cli.mjs");
  const { launch } = chromium;
  const { write, isTTY } = process.stderr;
  const ci = process.env.CI;
  const out = [];
  chromium.launch = async () => ({ version: () => { throw new Error("boom"); }, close: async () => {} });
  process.stderr.isTTY = true;
  process.stderr.write = (s) => out.push(String(s));
  delete process.env.CI;
  try {
    await assert.rejects(run(["http://127.0.0.1:9/", "--out", mkdtempSync(join(tmpdir(), "s2p-"))]), /boom/);
  } finally {
    Object.assign(process.stderr, { write, isTTY });
    chromium.launch = launch;
    if (ci !== undefined) process.env.CI = ci;
  }
  assert.match(out.join(""), /Opening Chrome/);
  assert.ok(out.at(-1).endsWith("\x1b[J"), "last write clears the live block");
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
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

test("a bad option value exits 2 naming the flag, before Chrome launches or anything is written", () => {
  const bin = new URL("../bin/site2paper.mjs", import.meta.url).pathname;
  const good = "http://127.0.0.1:9/";
  const cases = [
    [[good, "--format", "pdf"], /--format pdf/],
    [[good, "--paper", "a3"], /--paper a3/],
    [[good, "--columns", "0"], /--columns 0/],
    [[good, "--width", "abc"], /--width abc/],
    [[good, "--limit=0"], /--limit 0/],
    [[good, "--retries=-1"], /--retries -1/],
    [[good, "--columns", "5"], /--columns 5/],
    [[good, "--width", "32768"], /--width 32768/],
    [[good, "--width", "99999999999999999999"], /--width 9{20}/],
    [[good, "--bogus"], /Unknown option '--bogus'/],
    [[good, "--out", "x.pdf", "--format", "compare"], /--out x\.pdf/],
    [["http://exa mple.com"], /not an http\(s\) URL/],
    [["httpx://foo"], /not an http\(s\) URL/],
    [["ftp://example.com"], /not an http\(s\) URL/],
  ];
  for (const [args, want] of cases) {
    const cwd = mkdtempSync(join(tmpdir(), "s2p-"));
    const r = spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", cwd });
    assert.equal(r.status, 2, args.join(" "));
    assert.match(r.stderr, want);
    assert.match(r.stderr, /run site2paper --help/);
    assert.equal(existsSync(join(cwd, "site2paper")), false, "no output dir before validation passes");
  }
});

test("startUrl keeps an explicit scheme instead of nesting it under https://", async () => {
  const { startUrl } = await import("../src/cli.mjs");
  assert.equal(startUrl("HTTP://example.com").href, "http://example.com/");
  assert.equal(startUrl("localhost:3000").href, "https://localhost:3000/");
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

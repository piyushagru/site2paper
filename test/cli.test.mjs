import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  const badList = "https://example.com/\nhttps://exa mple.com/team\n";
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
    [[good, "--pages", "missing.txt"], /--pages missing\.txt: ENOENT/],
    [[good, "--pages", "pages.txt"], /--pages pages\.txt line 2: https:\/\/exa mple\.com\/team is not a URL/, { pages: badList }],
    [[good, "--pages", "-"], /--pages - line 2: https:\/\/exa mple\.com\/team is not a URL/, { input: badList }],
    [["http://exa mple.com"], /not an http\(s\) URL/],
    [["httpx://foo"], /not an http\(s\) URL/],
    [["ftp://example.com"], /not an http\(s\) URL/],
  ];
  for (const [args, want, { pages, input } = {}] of cases) {
    const cwd = mkdtempSync(join(tmpdir(), "s2p-"));
    if (pages) writeFileSync(join(cwd, "pages.txt"), pages);
    const r = spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", cwd, input });
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

test("listedPages keeps the user's order, drops repeats and comments, resolves relative paths", async () => {
  const { listedPages } = await import("../src/cli.mjs");
  const file = join(mkdtempSync(join(tmpdir(), "s2p-")), "pages.txt");
  writeFileSync(file, "  # list\r\nhttps://example.com/b\r\n \r\n/a\nhttps://example.com/b\nhttps://example.com/a#top\nhttps://example.com/a/\n");
  assert.deepEqual(listedPages(file, "https://example.com/"), [
    "https://example.com/b",
    "https://example.com/a",
    "https://example.com/a#top",
    "https://example.com/a/",
  ]);
});

test("pageStatus names a lost, blank, cut or filmstrip page before calling it ok, and where it ended up", async () => {
  const { pageStatus } = await import("../src/cli.mjs");
  const u = "https://x.test/a";
  const shot = (blank, extra = {}, rows = 100) => ({ blankRows: Uint8Array.from({ length: rows }, (_, i) => (i < blank ? 1 : 0)), height: rows, truncated: false, filmstrips: 0, finalUrl: u, ...extra });
  assert.deepEqual(pageStatus(u, shot(100), "HTTP 500"), { url: u, status: "failed", reason: "HTTP 500" });
  assert.deepEqual(pageStatus(u, undefined), { url: u, status: "ok" }, "a native-only run has no screenshot to judge");
  assert.deepEqual(pageStatus(u, shot(99, { truncated: true, maxHeight: 32767, filmstrips: 1 })), { url: u, height: 100, status: "skipped", reason: "blank page" });
  assert.deepEqual(pageStatus(u, shot(98, { truncated: true, maxHeight: 32767, filmstrips: 1 })), { url: u, height: 100, status: "cut", maxHeight: 32767 }, "98 percent flat is still a page");
  assert.deepEqual(pageStatus(u, shot(2376, {}, 2400)), { url: u, height: 2400, status: "ok" }, "a tall page with one heading (24 ink rows, 99 percent flat) is still a page");
  assert.deepEqual(pageStatus(u, shot(2377, {}, 2400)), { url: u, height: 2400, status: "skipped", reason: "blank page" });
  assert.deepEqual(pageStatus(u, shot(98, { filmstrips: 2, finalUrl: "https://x.test/login" })), { url: u, finalUrl: "https://x.test/login", height: 100, status: "filmstrip" });
  assert.deepEqual(pageStatus(u, shot(98)), { url: u, height: 100, status: "ok" }, "finalUrl is written only when the page moved");
});

test("an unexpected error ends with the bug link, a site error does not", () => {
  const dir = mkdtempSync(join(tmpdir(), "s2p-"));
  const helper = join(dir, "fake-browser.mjs");
  writeFileSync(helper, `import { chromium } from ${JSON.stringify(import.meta.resolve("playwright-core"))};
chromium.launch = async () => ({ version: () => { if (process.env.S2P_FAKE === "boom") throw new Error("boom"); return "fake"; }, close: async () => {} });
`);
  const bin = new URL("../bin/site2paper.mjs", import.meta.url).pathname;
  const go = (fake, args, input) => spawnSync(process.execPath, ["--import", helper, bin, "http://127.0.0.1:9/", "--out", dir, "--retries", "0", ...args], { encoding: "utf8", input, env: { ...process.env, S2P_FAKE: fake } });
  const bug = go("boom", []);
  assert.equal(bug.status, 1);
  assert.match(bug.stderr, /site2paper: boom\nif this looks like a bug, report it at https:\/\/github\.com\//);
  const site = go("fake", ["--pages", "-"], "http://127.0.0.1:9/from-stdin\n");
  assert.equal(site.status, 1);
  assert.match(site.stderr, /127\.0\.0\.1:9\/from-stdin/, "the stdin list reached capture");
  assert.match(site.stderr, /site2paper: every page failed\n$/);
  const empty = go("fake", ["--pages", "-"], "# nothing listed\n");
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /site2paper: no pages found\n$/);
  const crawl = go("fake", []);
  assert.equal(crawl.status, 1);
  assert.match(crawl.stderr, /site2paper: no pages found: could not open http:\/\/127\.0\.0\.1:9\/ \(.+\)\n$/);
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

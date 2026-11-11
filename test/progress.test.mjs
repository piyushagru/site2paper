import assert from "node:assert/strict";
import { test } from "node:test";
import { bar, createProgress, eta, fit, formatDuration } from "../src/progress.mjs";

const ESC = "\x1b[";
const sink = (isTTY) => { const out = []; return { isTTY, columns: 60, out, write: (s) => out.push(s) }; };

test("durations read short to long", () => {
  assert.equal(formatDuration(1234), "1.2s");
  assert.equal(formatDuration(42_000), "42s");
  assert.equal(formatDuration(192_000), "3m 12s");
  assert.equal(formatDuration(3_900_000), "1h 05m");
});

test("bar, eta and fit", () => {
  assert.equal(bar(1, 4, 8), "██░░░░░░");
  assert.equal(bar(9, 4, 4), "████");
  assert.equal(eta(0, 10, 5000), null);
  assert.equal(eta(2, 10, 4000), 16_000);
  assert.equal(fit("abcdef", 4), "abc…");
  assert.equal(fit("abc", 4), "abc");
});

test("off a TTY: plain lines, no ANSI, nothing animated", () => {
  const s = sink(false);
  const p = createProgress({ stream: s, env: {} });
  p.start("Capturing 0/2");
  p.label("Capturing 1/2");
  p.item("1/2 https://x.test/");
  p.fail("https://x.test/a HTTP 404");
  p.done("Captured 1/2 pages");
  const text = s.out.join("");
  assert.equal(p.live, false);
  assert.ok(!text.includes(ESC));
  assert.match(text, /^ {2}Capturing 0\/2\n {4}1\/2 https:\/\/x\.test\/\n✗ https:\/\/x\.test\/a HTTP 404\n✓ Captured 1\/2 pages {2}\d/);
});

test("on a TTY: live line with spinner, cleared before the done line", () => {
  const s = sink(true);
  const p = createProgress({ stream: s, env: {} });
  p.start("Opening Chrome");
  p.item("starting");
  p.done("Opened Chrome");
  const text = s.out.join("");
  assert.equal(p.live, true);
  assert.match(text, /⠋/);
  assert.ok(text.includes(`${ESC}J`));
  assert.match(text, /✓.* Opened Chrome/);
});

test("CI, TERM=dumb and NO_COLOR are respected", () => {
  assert.equal(createProgress({ stream: sink(true), env: { CI: "true" } }).live, false);
  assert.equal(createProgress({ stream: sink(true), env: { TERM: "dumb" } }).live, false);
  const s = sink(true);
  const p = createProgress({ stream: s, env: { NO_COLOR: "1" } });
  p.start("x");
  p.done("y");
  assert.ok(!["31m", "32m", "36m"].some((c) => s.out.join("").includes(ESC + c)));
});

test("quiet writes nothing", () => {
  const s = sink(true);
  const p = createProgress({ stream: s, env: {}, quiet: true });
  p.start("x");
  p.done("y");
  assert.equal(s.out.length, 0);
});

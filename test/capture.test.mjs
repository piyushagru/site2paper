import assert from "node:assert/strict";
import { test } from "node:test";
import { heightCap, scrollWalk } from "../src/capture.mjs";

test("height cap stays under Chromium's 32767 device pixel limit", () => {
  assert.equal(heightCap(1), 32767);
  assert.equal(heightCap(2), 16383);
  assert.ok(heightCap(1.5) * 1.5 <= 32767);
});

test("scroll walk follows a growing page and stops at the cap", async () => {
  const ys = [];
  const doc = { body: { scrollHeight: 1000 }, documentElement: { scrollHeight: 1000 }, images: [] };
  Object.assign(globalThis, {
    document: doc,
    innerHeight: 1000,
    scrollTo: (_x, y) => { ys.push(y); doc.body.scrollHeight = Math.min(doc.body.scrollHeight + 1000, 10_000); },
  });
  try {
    await scrollWalk(2500);
  } finally {
    for (const k of ["document", "innerHeight", "scrollTo"]) delete globalThis[k];
  }
  assert.deepEqual(ys, [0, 500, 1000, 1500, 2000, 0]);
});

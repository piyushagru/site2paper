import assert from "node:assert/strict";
import { test } from "node:test";
import { STORY_STOPS, clipStories, filmstripLayout, findStoriesScript, rulerSvg, storyRows } from "../src/story.mjs";

test("filmstrip slots fill the page width with even gaps", () => {
  const l = filmstripLayout({ width: 1440, frameW: 1440, frameH: 900, count: 4 });
  assert.equal(l.slots.length, 4);
  assert.equal(l.slots[0].left, 24);
  assert.equal(l.slots[1].left - l.slots[0].left, l.slots[0].w + 12);
  const right = l.slots[3].left + l.slots[3].w;
  assert.ok(right <= 1440 - 24 && right >= 1440 - 24 - 4, `right edge ${right}`);
  assert.equal(l.slots[0].h, Math.round(l.slots[0].w * 900 / 1440));
  assert.ok(l.height < 900, "a story prints far shorter than one viewport");
});

test("ruler labels every stop and the scroll range", () => {
  const l = filmstripLayout({ width: 1440, frameW: 1440, frameH: 900, count: 4 });
  const svg = rulerSvg(l, { width: 1440, stops: STORY_STOPS, scrollPx: 2880 });
  for (const label of ["0%", "33%", "67%", "100%", "scroll 0 to 2880 px"]) assert.ok(svg.includes(`>${label}<`), label);
  assert.ok(svg.startsWith("<svg"));
});

test("story detection script is valid JavaScript", () => {
  assert.doesNotThrow(() => new Function(findStoriesScript()));
});

test("storyRows reads the runways that still exist and drops collapsed ones", () => {
  const els = { "body > main:nth-child(1)": { top: 100, height: 900 }, "body > main:nth-child(2)": { top: 1000, height: 0 } };
  Object.assign(globalThis, { scrollY: 50, document: { querySelector: (p) => els[p] && { getBoundingClientRect: () => els[p] } } });
  try {
    const rows = storyRows([{ id: "0", path: "body > main:nth-child(1)" }, { id: "1", path: "body > main:nth-child(2)" }, { id: "2", path: "body > nav:nth-child(9)" }]);
    assert.deepEqual(rows, [{ id: "0", top: 150, height: 900 }]);
  } finally {
    for (const k of ["scrollY", "document"]) delete globalThis[k];
  }
});

test("clipStories sorts, drops near duplicates and stops print rows at the next story", () => {
  const out = clipStories([
    { id: "2", top: 5580, height: 1575 },
    { id: "0", top: 0, height: 2700 },
    { id: "1", top: 2700, height: 3780 },
    { id: "3", top: 2720, height: 3700 },
  ]);
  assert.deepEqual(out, [
    { id: "0", top: 0, height: 2700, end: 2700 },
    { id: "1", top: 2700, height: 3780, end: 5580 },
    { id: "2", top: 5580, height: 1575, end: 7155 },
  ]);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { columnScale, flowPages, sheetFor } from "../src/layout.mjs";

const sheet = sheetFor();
const colH = sheet.height - 2 * sheet.margin;
const scale = columnScale(1440, sheet);
const columnPx = Math.floor((colH - sheet.label) / scale);

function coverage(placed, heights) {
  heights.forEach((h, page) => {
    let top = 0;
    for (const part of placed.filter((p) => p.page === page)) {
      assert.equal(part.srcTop, top);
      top += part.srcHeight;
    }
    assert.equal(top, h);
  });
}

test("every pixel of every page is placed once, in order", () => {
  const heights = [8000, 900, 1700, 5200, 1500];
  coverage(flowPages(heights, scale, sheet), heights);
});

test("no column overflows and each page gets one label", () => {
  const heights = [8000, 900, 1700, 5200, 1500];
  const placed = flowPages(heights, scale, sheet);
  for (const p of placed) assert.ok(p.y + p.srcHeight * scale * p.squeeze <= colH + 0.001);
  assert.equal(placed.filter((p) => p.labelY !== undefined).length, heights.length);
});

test("a page 30px past the column is squeezed in, not split into a sliver", () => {
  const heights = [columnPx + 30, 400];
  const placed = flowPages(heights, scale, sheet);
  const first = placed.filter((p) => p.page === 0);
  assert.equal(first.length, 1);
  assert.equal(first[0].srcHeight, columnPx + 30);
  assert.ok(first[0].squeeze < 1 && first[0].squeeze > 0.95, `squeeze ${first[0].squeeze}`);
  assert.ok(first[0].y + first[0].srcHeight * scale * first[0].squeeze <= colH + 0.001);
  assert.equal(placed.find((p) => p.page === 1).column, 1);
  coverage(placed, heights);
});

test("a tail taller than the minimum still gets its own column at full size", () => {
  const placed = flowPages([columnPx + 500], scale, sheet);
  assert.equal(placed.length, 2);
  assert.ok(placed.every((p) => p.squeeze === 1));
});

test("a page that fits one column is never split", () => {
  const heights = [columnPx, columnPx - 10, 300];
  const placed = flowPages(heights, scale, sheet);
  heights.forEach((_, page) => assert.equal(placed.filter((p) => p.page === page).length, 1));
});

test("snap moves a cut up to the row it returns", () => {
  const snapped = flowPages([8000], scale, sheet, { snap: (_p, y) => y - 100 });
  coverage(snapped, [8000]);
  assert.equal(snapped[0].srcHeight, columnPx - 100);
});

test("letter portrait with 1 column still fits", () => {
  const s = sheetFor({ paper: "letter", landscape: false, columns: 1 });
  const sc = columnScale(390, s);
  const placed = flowPages([5000, 400], sc, s);
  for (const p of placed) assert.ok(p.y + p.srcHeight * sc <= s.height - 2 * s.margin + 0.001);
  assert.equal(new Set(placed.map((p) => p.column)).size, 1);
});

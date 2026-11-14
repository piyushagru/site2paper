import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { buildBook, buildSheets, fitLabel } from "../src/book.mjs";
import { sheetFor } from "../src/layout.mjs";

const shot = async (height) => ({
  png: await sharp({ create: { width: 40, height, channels: 3, background: "#ffffff" } }).png().toBuffer(),
  width: 40,
  height,
  blankRows: new Uint8Array(height),
});
const info = { title: "example.test 14/11/2026, 18:04:11 IST", subject: "https://example.test/", creator: "site2paper 0.0.0" };

for (const [name, build] of [["book", buildBook], ["sheet", buildSheets]]) {
  test(`${name} PDF carries title, subject and creator, so an archive file still says what it is`, async () => {
    const { bytes } = await build([await shot(30)], ["1. /"], sheetFor(), { info });
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getTitle(), info.title);
    assert.equal(pdf.getSubject(), info.subject);
    assert.equal(pdf.getCreator(), info.creator);
  });
}

test("no info leaves pdf-lib's own creator, so a caller without one still gets a valid file", async () => {
  const { bytes } = await buildSheets([await shot(30)], ["1. /"], sheetFor());
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getTitle(), undefined);
  assert.match(pdf.getCreator(), /pdf-lib/);
});

test("fitLabel cuts the path first and keeps the start URL and stamp, so the first label stays in its column", async () => {
  const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
  const tail = "   https://example.test/   1440px   14/11/2026, 18:04:11 IST";
  const label = `1. /a/very/long/path/that/keeps/going/and/going/until/it/overflows${tail}`;
  const colW = 392;
  assert.ok(font.widthOfTextAtSize(label, 8) > colW, "the fixture label must overflow a two-column A4 column");
  const fitted = fitLabel(label, colW, font);
  assert.ok(font.widthOfTextAtSize(fitted, 8) <= colW);
  assert.ok(fitted.endsWith(tail));
  assert.match(fitted, /^1\. \/a\/very\/long\/path\/[^ ]*\.\.\. {3}https/);
  assert.equal(fitLabel("2. /about", colW, font), "2. /about");
  const onlyTailFits = font.widthOfTextAtSize(`...${tail}`, 8);
  assert.equal(fitLabel(label, onlyTailFits, font), `...${tail}`, "the whole tail must win over the first path character");
});

test("fitLabel cuts the whole line when the tail alone is wider than a narrow column", async () => {
  const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
  const label = "1. /pricing   https://example.test/   1440px   14/11/2026, 18:04:11 IST";
  const fitted = fitLabel(label, 110, font);
  assert.ok(font.widthOfTextAtSize(fitted, 8) <= 110);
  assert.match(fitted, /^1\. \/pricing {3}https:\/\/exa[^ ]*\.\.\.$/);
  const later = fitLabel("2. /a/path/with/no/stamp/that/is/still/too/long/for/the/column", 110, font);
  assert.ok(font.widthOfTextAtSize(later, 8) <= 110);
  assert.match(later, /^2\. \/a\/path\/[a-z/]+\.\.\.$/);
});

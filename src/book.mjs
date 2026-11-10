import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import { columnScale, flowPages } from "./layout.mjs";

const SNAP_SEARCH_PX = 600;

/** Lays captured pages into multi-column sheets, page after page, with no blank tails. */
export async function buildBook(shots, labels, sheet, { quality = 82 } = {}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const width = shots[0].width;
  const scale = columnScale(width, sheet);
  const colW = width * scale;
  const snap = (page, y) => {
    const blank = shots[page].blankRows;
    for (let row = y; row > Math.max(0, y - SNAP_SEARCH_PX); row--) if (blank[row]) return row;
    return y;
  };
  const sheets = [];
  for (const part of flowPages(shots.map((s) => s.height), scale, sheet, { snap })) {
    while (sheets.length <= part.sheet) sheets.push(pdf.addPage([sheet.width, sheet.height]));
    const target = sheets[part.sheet];
    const x = sheet.margin + part.column * (colW + sheet.gap);
    const topY = sheet.height - sheet.margin;
    if (part.labelY !== undefined) {
      target.drawText(labels[part.page], { x, y: topY - part.labelY - 9, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
    }
    const jpg = await sharp(shots[part.page].png)
      .extract({ left: 0, top: part.srcTop, width, height: part.srcHeight })
      .jpeg({ quality })
      .toBuffer();
    const h = part.srcHeight * scale * part.squeeze;
    target.drawImage(await pdf.embedJpg(jpg), { x, y: topY - part.y - h, width: colW * part.squeeze, height: h });
  }
  sheets.forEach((s, i) => s.drawText(`${i + 1}/${sheets.length}`, { x: sheet.width - sheet.margin - 20, y: 8, size: 7, font, color: rgb(0.5, 0.5, 0.5) }));
  return { bytes: await pdf.save(), sheets: sheets.length };
}

/** One page per sheet, scaled to fit: the simple format for short sites. */
export async function buildSheets(shots, labels, sheet, { quality = 82 } = {}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const usableW = sheet.width - 2 * sheet.margin;
  const usableH = sheet.height - 2 * sheet.margin - sheet.label;
  for (const [i, shot] of shots.entries()) {
    const page = pdf.addPage([sheet.width, sheet.height]);
    page.drawText(labels[i], { x: sheet.margin, y: sheet.height - sheet.margin - 9, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
    const scale = Math.min(usableW / shot.width, usableH / shot.height);
    const jpg = await sharp(shot.png).jpeg({ quality }).toBuffer();
    page.drawImage(await pdf.embedJpg(jpg), {
      x: sheet.margin,
      y: sheet.height - sheet.margin - sheet.label - shot.height * scale,
      width: shot.width * scale,
      height: shot.height * scale,
    });
  }
  return { bytes: await pdf.save(), sheets: shots.length };
}

/** Merges Chrome's per-URL PDFs into one file. */
export async function mergePdfs(buffers) {
  const out = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return { bytes: await out.save(), sheets: out.getPageCount() };
}

// Paper sizes in PDF points.
export const PAPER = {
  a4: { width: 595, height: 842 },
  letter: { width: 612, height: 792 },
};

export function sheetFor({ paper = "a4", landscape = true, columns = 2, margin = 22, gap = 14, label = 14 } = {}) {
  const size = PAPER[paper] ?? PAPER.a4;
  const [width, height] = landscape ? [size.height, size.width] : [size.width, size.height];
  return { width, height, margin, gap, label, columns };
}

/** Scale (pt per px) that makes a screenshot exactly one column wide. */
export function columnScale(imgWidth, sheet) {
  const colW = (sheet.width - 2 * sheet.margin - (sheet.columns - 1) * sheet.gap) / sheet.columns;
  return colW / imgWidth;
}

/**
 * Flows page screenshots top to bottom through the columns like newspaper text.
 * A page that fits in one column is never split: it moves to the next column instead.
 * A taller page must split; `snap(page, y)` may pull each cut up to a blank row so cards stay whole.
 * A tail shorter than `tailMinPx` (or 5 percent of a column) is not worth a column of its own: the last
 * piece is drawn a few percent smaller (`squeeze` < 1) so it ends in the current column.
 * Returns placements in pt: { sheet, column, page, srcTop, srcHeight, y, squeeze, labelY? } with y measured down from the top margin.
 */
export function flowPages(pageHeights, scale, sheet, { minStartPt = 60, tailMinPx = 120, snap = (_page, y) => y } = {}) {
  const colH = sheet.height - 2 * sheet.margin;
  const tailMin = Math.max(tailMinPx, Math.floor(0.05 * colH / scale));
  const out = [];
  let slot = 0;
  let used = 0;
  const next = () => { slot += 1; used = 0; };
  pageHeights.forEach((heightPx, page) => {
    const needPt = sheet.label + heightPx * scale;
    const fitsOneColumn = needPt <= colH;
    if (used > 0 && (fitsOneColumn ? colH - used < needPt : colH - used < sheet.label + minStartPt)) next();
    const labelY = used;
    used += sheet.label;
    let srcTop = 0;
    let first = true;
    while (srcTop < heightPx) {
      if (Math.floor((colH - used) / scale) < 1) next();
      const room = Math.floor((colH - used) / scale);
      const rest = heightPx - srcTop;
      let squeeze = 1;
      let srcHeight = Math.min(rest, room);
      if (rest > room && rest - room < tailMin) {
        squeeze = room / rest;
        srcHeight = rest;
      } else if (srcTop + srcHeight < heightPx) {
        const cut = snap(page, srcTop + srcHeight);
        if (cut > srcTop && cut <= srcTop + srcHeight) srcHeight = cut - srcTop;
      }
      out.push({
        sheet: Math.floor(slot / sheet.columns),
        column: slot % sheet.columns,
        page,
        srcTop,
        srcHeight,
        y: used,
        squeeze,
        ...(first ? { labelY } : {}),
      });
      first = false;
      srcTop += srcHeight;
      if (srcTop < heightPx) next();
      else used += srcHeight * scale * squeeze;
    }
  });
  return out;
}

// Scroll-driven stories: a viewport-sized frame pinned inside a tall section, animated by scroll position.
// Printed as a filmstrip of viewport stops with a scroll ruler, in place of the section. Pure, no browser.

export const STORY_STOPS = [0, 1 / 3, 2 / 3, 1];
/** Milliseconds after a gate press at which its reveal is shot; the first frame is taken before the press. */
export const GATE_STOPS = [0, 1000, 2000, 3500];

/** Ruler for a gate strip: the pressed label, then seconds since the press. */
export function gateRuler(label, stops = GATE_STOPS) {
  return { ticks: stops.map((ms, i) => (i === 0 ? "before" : `${(ms / 1000).toFixed(1)} s`)), caption: `after pressing "${label}"` };
}

/** Runs in the page: marks the runway of every pinned frame with data-s2p-story and returns its document-px rows. */
export function findStoriesScript() {
  return `(() => {
    const rows = [];
    for (const el of document.querySelectorAll("*")) {
      const pos = getComputedStyle(el).position;
      if (pos !== "sticky" && pos !== "fixed") continue;
      const r = el.getBoundingClientRect();
      if (r.width < innerWidth * 0.6 || r.height < innerHeight * 0.6) continue;
      const p = el.parentElement;
      if (!p || p === document.body || p === document.documentElement || p.hasAttribute("data-s2p-story")) continue;
      const pr = p.getBoundingClientRect();
      if (pr.height < innerHeight * 1.5) continue;
      p.setAttribute("data-s2p-story", String(rows.length));
      const path = [];
      for (let n = p; n && n !== document.body; n = n.parentElement) path.unshift(n.tagName.toLowerCase() + ":nth-child(" + ([...n.parentElement.children].indexOf(n) + 1) + ")");
      rows.push({ id: String(rows.length), top: Math.round(pr.top + scrollY), height: Math.round(pr.height), path: "body > " + path.join(" > ") });
    }
    return rows;
  })()`;
}

/** Runs in the page (Playwright serialises its source): where each runway sits in this document; gone ones are dropped. */
export function storyRows(paths) {
  return paths.map(({ id, path }) => {
    const p = document.querySelector(path);
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { id, top: Math.round(r.top + scrollY), height: Math.round(r.height) };
  }).filter((s) => s && s.height > 0);
}

/** Sorted print rows per story: a runway often overlaps the next section where its frame unsticks, so rows stop there. */
export function clipStories(rows) {
  const out = [];
  for (const s of [...rows].sort((a, b) => a.top - b.top)) {
    const prev = out[out.length - 1];
    if (prev && s.top < prev.top + 200) continue;
    if (prev) prev.end = Math.min(prev.end, s.top);
    out.push({ ...s, end: s.top + s.height });
  }
  return out;
}

/** Frame slots across the page width, plus the strip height. */
export function filmstripLayout({ width, frameW, frameH, count, pad = 24, gap = 12, rulerH = 56 }) {
  const w = Math.floor((width - pad * 2 - gap * (count - 1)) / count);
  const h = Math.round(w * frameH / frameW);
  const slots = Array.from({ length: count }, (_, i) => ({ left: pad + i * (w + gap), top: pad, w, h }));
  return { slots, height: pad + h + rulerH, barY: pad + h + 18, pad, gap };
}

export function rulerSvg(layout, { width, stops = [], scrollPx, ticks = stops.map((t) => `${Math.round(t * 100)}%`), caption = `scroll 0 to ${scrollPx} px` }) {
  const { slots, height, barY } = layout;
  const tickMarks = ticks.map((label, i) => {
    const x = slots[i].left;
    return `<line x1="${x}" y1="${barY - 5}" x2="${x}" y2="${barY + 5}" stroke="#777"/>` +
      `<text x="${x}" y="${barY + 20}" font-size="12" fill="#777">${label}</text>`;
  }).join("");
  const right = slots[slots.length - 1].left + slots[slots.length - 1].w;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="Helvetica, Arial, sans-serif">` +
    `<line x1="${slots[0].left}" y1="${barY}" x2="${right}" y2="${barY}" stroke="#3a8bd6" stroke-width="2"/>${tickMarks}` +
    `<text x="${right}" y="${barY + 20}" font-size="12" fill="#777" text-anchor="end">${caption}</text></svg>`;
}

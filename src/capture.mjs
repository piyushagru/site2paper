import sharp from "sharp";
import { pageCss, pagePrepScript } from "./rules.mjs";
import { STORY_STOPS, clipStories, filmstripLayout, findStoriesScript, rulerSvg, storyRows } from "./story.mjs";

const ERROR_TEXT = /This page couldn.t load|Application error|Internal Server Error|Unhandled Runtime Error|404 Not Found/;
// Chromium refuses screenshots over 32767 device pixels on a side (Playwright enforces it off macOS).
export const heightCap = (scale) => Math.floor(32_767 / scale);

/** Opens a page once and returns its same-origin link hrefs (used by the crawler). */
export async function linksOn(browser, url, { width }) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status() ?? "none"}`);
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    return await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
  } finally {
    await page.close().catch(() => {});
  }
}

/** Full-page screenshot of one URL as visitors see it, with blank-row map for cut placement. */
export async function capture(browser, url, { width, keepFooter, hide = [], scale = 1 }) {
  const maxH = heightCap(scale);
  const pages = [];
  const open = async (reducedMotion) => {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: scale, reducedMotion });
    pages.push(page);
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const status = res?.status() ?? 0;
    if (status >= 400) throw new Error(`HTTP ${status}`);
    // Analytics beacons keep some sites from ever going idle, so this wait is bounded.
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    if (await page.evaluate((re) => new RegExp(re).test(document.body?.innerText ?? ""), ERROR_TEXT.source)) {
      throw new Error("error page rendered");
    }
    await page.addStyleTag({ content: pageCss({ hide, keepFooter }) });
    await page.evaluate(scrollWalk, maxH);
    return page;
  };
  try {
    // Stories play only without reduced motion; the static shot wants it, so a page with stories is loaded twice.
    let page = await open("no-preference");
    const stories = await captureStories(page);
    if (stories.length) {
      // One WebGL page at a time: two live swiftshader contexts of a story site crashed the browser.
      await page.close().catch(() => {});
      page = await open("reduce");
    }
    await page.evaluate(pagePrepScript());
    await page.evaluate(scrollWalk, maxH);
    const height = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
    const truncated = height > maxH;
    const rows = clipStories(await page.evaluate(storyRows, stories.map(({ id, path }) => ({ id, path }))));
    let png = Buffer.from(await page.screenshot({
      fullPage: !truncated,
      clip: truncated ? { x: 0, y: 0, width, height: maxH } : undefined,
      type: "png",
      animations: "disabled",
    }));
    for (const row of rows.filter((s) => s.end <= Math.min(height, maxH)).reverse()) {
      const { frames, scrollPx } = stories.find((s) => s.id === row.id);
      png = await spliceStoryboard(png, { ...row, frames, scrollPx }, scale);
    }
    return { ...(await describe(png)), truncated, maxHeight: maxH };
  } finally {
    for (const p of pages) await p.close().catch(() => {});
  }
}

/** Viewport screenshots at each scroll stop of every pinned story section, taken before the page is flattened. */
async function captureStories(page) {
  const stories = await page.evaluate(findStoriesScript());
  const innerHeight = page.viewportSize().height;
  for (const s of stories) {
    s.frames = [];
    s.scrollPx = Math.max(0, s.height - innerHeight);
    for (const t of STORY_STOPS) {
      await page.evaluate((y) => scrollTo(0, y), s.top + t * s.scrollPx);
      // Scroll-driven animations ease towards the target over a few frames.
      await page.waitForTimeout(500);
      s.frames.push(Buffer.from(await page.screenshot({ type: "png" })));
    }
  }
  return stories;
}

/** Replaces the story's rows in the page screenshot with its filmstrip, so layout sees one shorter page. */
async function spliceStoryboard(png, story, scale) {
  const meta = await sharp(png).metadata();
  const frame = await sharp(story.frames[0]).metadata();
  const layout = filmstripLayout({ width: meta.width, frameW: frame.width, frameH: frame.height, count: story.frames.length });
  const top = Math.min(meta.height, Math.round(story.top * scale)), bottom = Math.min(meta.height, Math.round(story.end * scale));
  const frames = await Promise.all(story.frames.map(async (f, i) => ({ input: await sharp(f).resize(layout.slots[i].w, layout.slots[i].h).png().toBuffer(), left: layout.slots[i].left, top: layout.slots[i].top })));
  const svg = rulerSvg(layout, { width: meta.width, stops: STORY_STOPS, scrollPx: story.scrollPx });
  const strip = await sharp({ create: { width: meta.width, height: layout.height, channels: 3, background: "#fff" } })
    .composite([...frames, { input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer();
  const parts = [];
  if (top > 0) parts.push(await sharp(png).extract({ left: 0, top: 0, width: meta.width, height: top }).png().toBuffer());
  parts.push(strip);
  if (bottom < meta.height) parts.push(await sharp(png).extract({ left: 0, top: bottom, width: meta.width, height: meta.height - bottom }).png().toBuffer());
  const total = top + layout.height + (meta.height - bottom);
  let y = 0;
  const layers = [];
  for (const p of parts) { layers.push({ input: p, left: 0, top: y }); y += (await sharp(p).metadata()).height; }
  return sharp({ create: { width: meta.width, height: total, channels: 3, background: "#fff" } }).composite(layers).png().toBuffer();
}

/** Runs inside the page (Playwright serialises its source), so it may only touch its argument and browser globals. */
export async function scrollWalk(maxH) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const docHeight = () => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  // Lazy feeds grow while scrolling, so the height is re-read every step and only the cap ends the walk.
  for (let y = 0; y < Math.min(docHeight(), maxH); y += innerHeight / 2) { scrollTo(0, y); await sleep(100); }
  const pending = [...document.images].filter((i) => !i.complete);
  const settle = pending.map((i) => new Promise((r) => { i.onload = i.onerror = r; }));
  // fonts.ready covers only fonts requested by the time it is called, so it runs after the walk pulled lazy content in.
  if (document.fonts) settle.push(document.fonts.ready);
  if (settle.length) await Promise.race([Promise.all(settle), sleep(8000)]);
  scrollTo(0, 0);
  await sleep(800);
}

/** Chrome's own Print-to-PDF of one URL: the traditional baseline for `--format native` and `compare`. */
export async function printNative(browser, url, { paper = "a4", landscape = false }) {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    return Buffer.from(await page.pdf({ format: paper.toUpperCase(), landscape, printBackground: true }));
  } finally {
    await page.close().catch(() => {});
  }
}

/** Screenshot plus a per-row "one flat colour" map; cuts are placed on such rows. */
async function describe(png) {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const blankRows = new Uint8Array(info.height);
  for (let y = 0; y < info.height; y++) {
    let min = 255;
    let max = 0;
    for (let x = 0, o = y * info.width; x < info.width; x++, o++) {
      const v = data[o];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    blankRows[y] = max - min < 6 ? 1 : 0;
  }
  return { png, width: info.width, height: info.height, blankRows };
}

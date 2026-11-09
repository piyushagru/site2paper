import sharp from "sharp";
import { FOOTER_ONCE_CSS, carouselCss, hideCss, pagePrepScript } from "./rules.mjs";

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
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: scale, reducedMotion: "reduce" });
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const status = res?.status() ?? 0;
    if (status >= 400) throw new Error(`HTTP ${status}`);
    // Analytics beacons keep some sites from ever going idle, so this wait is bounded.
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    if (await page.evaluate((re) => new RegExp(re).test(document.body?.innerText ?? ""), ERROR_TEXT.source)) {
      throw new Error("error page rendered");
    }
    await page.addStyleTag({ content: hideCss(hide) + carouselCss() + (keepFooter ? "" : FOOTER_ONCE_CSS) });
    await page.evaluate(pagePrepScript());
    await page.evaluate(scrollWalk, maxH);
    const height = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
    const truncated = height > maxH;
    const png = await page.screenshot({
      fullPage: !truncated,
      clip: truncated ? { x: 0, y: 0, width, height: maxH } : undefined,
      type: "png",
      animations: "disabled",
    });
    return { ...(await describe(Buffer.from(png))), truncated, maxHeight: maxH };
  } finally {
    await page.close().catch(() => {});
  }
}

/** Runs inside the page (Playwright serialises its source), so it may only touch its argument and browser globals. */
export async function scrollWalk(maxH) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const docHeight = () => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  // Lazy feeds grow while scrolling, so the height is re-read every step and only the cap ends the walk.
  for (let y = 0; y < Math.min(docHeight(), maxH); y += innerHeight / 2) { scrollTo(0, y); await sleep(100); }
  const pending = [...document.images].filter((i) => !i.complete);
  if (pending.length) await Promise.race([Promise.all(pending.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))), sleep(8000)]);
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

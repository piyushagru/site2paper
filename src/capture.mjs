import sharp from "sharp";
import { FOOTER_ONCE_CSS, carouselCss, hideCss, pagePrepScript } from "./rules.mjs";

const ERROR_TEXT = /This page couldn.t load|Application error|Internal Server Error|Unhandled Runtime Error|404 Not Found/;
const MAX_HEIGHT_PX = 40_000;

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
    // Walk the page so lazy images and IntersectionObserver content load like a real scroll.
    await page.evaluate(async (maxH) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const total = Math.min(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight), maxH);
      for (let y = 0; y < total; y += innerHeight / 2) { scrollTo(0, y); await sleep(100); }
      const pending = [...document.images].filter((i) => !i.complete);
      await Promise.race([Promise.all(pending.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))), sleep(8000)]);
      scrollTo(0, 0);
      await sleep(800);
    }, MAX_HEIGHT_PX);
    const height = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
    const png = await page.screenshot({
      fullPage: height <= MAX_HEIGHT_PX,
      clip: height > MAX_HEIGHT_PX ? { x: 0, y: 0, width, height: MAX_HEIGHT_PX } : undefined,
      type: "png",
      animations: "disabled",
    });
    return await describe(Buffer.from(png));
  } finally {
    await page.close().catch(() => {});
  }
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

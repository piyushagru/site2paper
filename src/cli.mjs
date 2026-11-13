import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildBook, buildSheets, mergePdfs } from "./book.mjs";
import { launchBrowser } from "./browser.mjs";
import { capture, linksOn, printNative } from "./capture.mjs";
import { crawl, fromSitemap, orderPages } from "./discover.mjs";
import { PAPER, sheetFor } from "./layout.mjs";
import { bar, createProgress, eta, formatDuration } from "./progress.mjs";

const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")).version;

const HELP = `site2paper: print a website the way visitors see it.

  npx site2paper <url> [options]

  --pages <file>      one URL per line instead of discovering them (sitemap.xml, then crawl)
  --limit <n>         max pages to discover (default 50)
  --width <px>        viewport width: 1440 desktop (default), 768 tablet, 390 phone
  --format <name>     book (default): pages flow through columns, footer once
                      sheet: one page per sheet
                      native: Chrome's Print-to-PDF of each page, merged (the traditional result)
                      compare: book and native, with a side-by-side table
  --columns <n>       columns per sheet for book, 1 to 4 (default 2)
  --paper <size>      a4 (default) or letter
  --portrait          portrait sheets (default landscape)
  --hide <css>        extra selectors to hide, comma separated
  --retries <n>       retry rounds for failed pages (default 2)
  --out <path>        output file or directory (default ./site2paper/)
  --quiet
  --version
`;

const FORMATS = ["book", "sheet", "native", "compare"];
const usage = (message) => Object.assign(new Error(message), { code: "USAGE" });

function parseOptions(argv) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        pages: { type: "string" },
        limit: { type: "string", default: "50" },
        width: { type: "string", default: "1440" },
        format: { type: "string", default: "book" },
        columns: { type: "string", default: "2" },
        paper: { type: "string", default: "a4" },
        portrait: { type: "boolean", default: false },
        hide: { type: "string", default: "" },
        retries: { type: "string", default: "2" },
        out: { type: "string", default: "" },
        quiet: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
      },
    });
  } catch (error) {
    throw usage(error.message.split(/\.\s/)[0]);
  }
}

export function startUrl(arg) {
  const text = /^[a-z][a-z0-9+.-]*:\/\//i.test(arg) ? arg : `https://${arg}`;
  let url;
  try { url = new URL(text); } catch { url = null; }
  if (!["http:", "https:"].includes(url?.protocol)) throw usage(`${arg}: not an http(s) URL`);
  return url;
}

function listedPages(file, start) {
  let text;
  try { text = readFileSync(file, "utf-8"); } catch (error) { throw usage(`--pages ${file}: ${error.message}`); }
  return text.split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#")).map((s) => new URL(s, start).href);
}

export async function run(argv) {
  const { values: o, positionals } = parseOptions(argv);
  if (o.version) { console.log(VERSION); return 0; }
  if (o.help || !positionals[0]) { console.log(HELP); return o.help ? 0 : 2; }
  const url = startUrl(positionals[0]);
  const start = url.href;
  if (!FORMATS.includes(o.format)) throw usage(`--format ${o.format}: use ${FORMATS.join(", ")}`);
  if (!PAPER[o.paper]) throw usage(`--paper ${o.paper}: use ${Object.keys(PAPER).join(", ")}`);
  for (const [flag, min, max] of [["width", 1, 32_767], ["columns", 1, 4], ["limit", 1], ["retries", 0]]) {
    const n = /^\d+$/.test(o[flag]) ? Number(o[flag]) : NaN;
    if (!(n >= min && n <= (max ?? Number.MAX_SAFE_INTEGER))) throw usage(`--${flag} ${o[flag]}: use a whole number ${max ? `from ${min} to ${max}` : `of at least ${min}`}`);
  }
  if (o.out.endsWith(".pdf") && o.format === "compare") throw usage(`--out ${o.out}: compare writes two PDFs, pass a directory`);
  const listed = o.pages ? listedPages(o.pages, start) : null;
  const log = o.quiet ? () => {} : (s) => process.stdout.write(`${s}\n`);
  const p = createProgress({ quiet: o.quiet });
  const width = Number(o.width);
  const limit = Number(o.limit);
  const hide = o.hide.split(",").map((s) => s.trim()).filter(Boolean);
  const sheet = sheetFor({ paper: o.paper, landscape: !o.portrait, columns: Number(o.columns) });
  const host = url.host.replace(/[^a-z0-9.-]/gi, "_");
  const date = new Date().toISOString().slice(0, 10);
  const outDir = o.out && !o.out.endsWith(".pdf") ? resolve(o.out) : resolve("site2paper");
  mkdirSync(outDir, { recursive: true });
  const outFile = (suffix) => (o.out.endsWith(".pdf") && suffix === o.format ? resolve(o.out) : resolve(outDir, `${host}-${date}-${width}px-${suffix}.pdf`));

  const report = { start, width, format: o.format, pages: [], failed: [], truncated: [], outputs: [] };
  let browser;
  try {
    p.start("Opening Chrome");
    browser = await launchBrowser({ log: (s) => p.log(s) });
    p.done(`Opened browser ${browser.version()}`);
    let pages;
    if (listed) {
      pages = listed;
    } else {
      p.start(`Reading ${new URL(start).origin}/robots.txt and sitemap`);
      pages = await fromSitemap(start, { limit, onError: (u, m) => p.fail(`${u}  ${m}`) });
      if (pages.length) p.done(`Found ${pages.length} page(s) in the sitemap`);
      else {
        p.done("No sitemap pages, crawling links instead");
        p.start(`Crawling links  0/${limit} pages`);
        let why = "";
        pages = await crawl(start, {
          limit,
          openPage: (u) => linksOn(browser, u, { width }),
          onVisit: (u, n) => { p.label(`Crawling links  ${n.kept}/${limit} pages, ${n.seen} links seen`); p.item(u); },
          onError: (u, m) => { why ||= `${u} (${m})`; p.fail(`${u}  ${m}`); },
        });
        if (!pages.length) throw new Error(`no pages found: could not open ${why || start}`);
        p.done(`Found ${pages.length} page(s) by crawling`);
      }
      pages = orderPages(pages, start);
    }
    if (!pages.length) throw new Error("no pages found");
    p.log(`  ${pages.length} page(s) at ${width}px`);

    const wantBook = ["book", "sheet", "compare"].includes(o.format);
    const wantNative = ["native", "compare"].includes(o.format);
    const shots = new Array(pages.length);
    const natives = new Array(pages.length);
    const errors = new Map();
    const shoot = async (i) => {
      try {
        if (wantBook) {
          const onStep = (step) => p.live && p.item(`${i + 1}/${pages.length} ${pages[i]}  ${step}`);
          shots[i] = await capture(browser, pages[i], { width, keepFooter: i === pages.length - 1, hide, onStep });
          if (shots[i].truncated) p.log(`  cut at ${shots[i].maxHeight}px: ${pages[i]}`);
        }
        if (wantNative) natives[i] = await printNative(browser, pages[i], { paper: o.paper, landscape: !o.portrait });
        errors.delete(i);
      } catch (error) {
        errors.set(i, error instanceof Error ? error.message : String(error));
        p.fail(`${pages[i]}  ${errors.get(i).split("\n")[0]}`);
      }
    };
    const n = pages.length;
    const t0 = Date.now();
    const status = (done) => {
      const left = eta(done, n, Date.now() - t0);
      p.label(`Capturing  ${done}/${n}  ${bar(done, n)}  ${Math.round((done / n) * 100)}%${left ? `  about ${formatDuration(left)} left` : ""}`);
    };
    p.start(`Capturing  0/${n}`);
    for (let i = 0; i < n; i++) { status(i); p.item(`${i + 1}/${n} ${pages[i]}`); await shoot(i); }
    p.done(`Captured ${n - errors.size}/${n} page(s)`);
    const rounds = Number(o.retries);
    for (let round = 1; round <= rounds && errors.size > 0; round++) {
      p.start(`Retrying ${errors.size} page(s), round ${round}/${rounds}`);
      await new Promise((r) => setTimeout(r, 3000 * round));
      for (const i of [...errors.keys()]) { p.item(pages[i]); await shoot(i); }
      p.done(`Retry ${round}: ${errors.size} page(s) still failing`);
    }

    const kept = pages.map((_, i) => i).filter((i) => !errors.has(i));
    if (!kept.length) throw new Error("every page failed");
    const stamp = new Date().toLocaleString("en-IN", { hour12: false });
    const cut = (i) => (shots[i]?.truncated ? ` (cut at ${shots[i].maxHeight}px)` : "");
    const labels = kept.map((i) => `${i + 1}. ${new URL(pages[i]).pathname}${cut(i)}${i === kept[0] ? `   ${start}   ${width}px   ${stamp}` : ""}`);
    report.pages = kept.map((i) => pages[i]);
    report.failed = [...errors].map(([i, reason]) => ({ url: pages[i], reason }));
    report.truncated = kept.filter((i) => shots[i]?.truncated).map((i) => ({ url: pages[i], maxHeight: shots[i].maxHeight }));

    const save = async (suffix, build) => {
      p.start(`Writing ${suffix} PDF`);
      const { bytes, sheets } = await build();
      p.stop();
      const file = outFile(suffix);
      writeFileSync(file, bytes);
      report.outputs.push({ format: suffix, file, sheets, bytes: bytes.length });
      log(`  ${suffix}: ${sheets} sheet(s), ${(bytes.length / 1e6).toFixed(1)} MB -> ${file}`);
      return { sheets, bytes: bytes.length };
    };
    const results = {};
    if (o.format === "book" || o.format === "compare") results.book = await save("book", () => buildBook(kept.map((i) => shots[i]), labels, sheet));
    if (o.format === "sheet") results.sheet = await save("sheet", () => buildSheets(kept.map((i) => shots[i]), labels, sheet));
    if (wantNative) results.native = await save("native", () => mergePdfs(kept.map((i) => natives[i])));
    if (o.format === "compare") {
      const row = (k, v) => `  ${k.padEnd(22)} ${String(v.native).padStart(10)} ${String(v.book).padStart(10)}`;
      log("");
      log(`  ${"".padEnd(22)} ${"Ctrl+P".padStart(10)} ${"site2paper".padStart(10)}`);
      log(row("sheets", { native: results.native.sheets, book: results.book.sheets }));
      log(row("file size (MB)", { native: (results.native.bytes / 1e6).toFixed(1), book: (results.book.bytes / 1e6).toFixed(1) }));
      log(row("looks like", { native: "print CSS", book: "the screen" }));
      log(row("carousel slides", { native: "first", book: "all" }));
      log(row("footer repeats", { native: "every page", book: "once" }));
    }
    for (const f of report.failed) console.error(`  left out: ${f.url} (${f.reason})`);
    writeFileSync(resolve(outDir, "report.json"), JSON.stringify(report, null, 2));
    return report.failed.length ? 3 : 0;
  } finally {
    p.stop(); // a live spinner left on screen would swallow the fatal error line
    await browser?.close();
  }
}

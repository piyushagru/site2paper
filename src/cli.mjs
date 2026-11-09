import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildBook, buildSheets, mergePdfs } from "./book.mjs";
import { launchBrowser } from "./browser.mjs";
import { capture, linksOn, printNative } from "./capture.mjs";
import { crawl, fromSitemap, orderPages } from "./discover.mjs";
import { sheetFor } from "./layout.mjs";

const HELP = `site2paper: print a website the way visitors see it.

  npx site2paper <url> [options]

  --pages <file>      one URL per line instead of discovering them (sitemap.xml, then crawl)
  --limit <n>         max pages to discover (default 50)
  --width <px>        viewport width: 1440 desktop (default), 768 tablet, 390 phone
  --format <name>     book (default): pages flow through columns, footer once
                      sheet: one page per sheet
                      native: Chrome's Print-to-PDF of each page, merged (the traditional result)
                      compare: book and native, with a side-by-side table
  --columns <n>       columns per sheet for book (default 2)
  --paper <size>      a4 (default) or letter
  --portrait          portrait sheets (default landscape)
  --hide <css>        extra selectors to hide, comma separated
  --retries <n>       retry rounds for failed pages (default 2)
  --out <path>        output file or directory (default ./site2paper/)
  --quiet
`;

export async function run(argv) {
  const { values: o, positionals } = parseArgs({
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
    },
  });
  if (o.help || !positionals[0]) { console.log(HELP); return o.help ? 0 : 2; }
  const start = positionals[0].startsWith("http") ? positionals[0] : `https://${positionals[0]}`;
  const log = o.quiet ? () => {} : (s) => process.stdout.write(`${s}\n`);
  const width = Number(o.width);
  const limit = Number(o.limit);
  const hide = o.hide.split(",").map((s) => s.trim()).filter(Boolean);
  const sheet = sheetFor({ paper: o.paper, landscape: !o.portrait, columns: Number(o.columns) });
  const host = new URL(start).host.replace(/[^a-z0-9.-]/gi, "_");
  const date = new Date().toISOString().slice(0, 10);
  const outDir = o.out && !o.out.endsWith(".pdf") ? resolve(o.out) : resolve("site2paper");
  mkdirSync(outDir, { recursive: true });
  const outFile = (suffix) => (o.out.endsWith(".pdf") && suffix === o.format ? resolve(o.out) : resolve(outDir, `${host}-${date}-${width}px-${suffix}.pdf`));

  const browser = await launchBrowser({ log });
  const report = { start, width, format: o.format, pages: [], failed: [], truncated: [], outputs: [] };
  try {
    let pages;
    if (o.pages) {
      pages = readFileSync(o.pages, "utf-8").split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#")).map((s) => new URL(s, start).href);
    } else {
      pages = await fromSitemap(start, { limit });
      log(pages.length ? `  sitemap.xml: ${pages.length} page(s)` : "  no sitemap.xml, crawling same-origin links");
      if (!pages.length) pages = await crawl(start, { limit, openPage: (u) => linksOn(browser, u, { width }) });
      pages = orderPages(pages, start);
    }
    if (!pages.length) throw new Error("no pages found");
    log(`  ${pages.length} page(s) at ${width}px`);

    const wantBook = ["book", "sheet", "compare"].includes(o.format);
    const wantNative = ["native", "compare"].includes(o.format);
    const shots = new Array(pages.length);
    const natives = new Array(pages.length);
    const errors = new Map();
    const shoot = async (i) => {
      try {
        if (wantBook) {
          shots[i] = await capture(browser, pages[i], { width, keepFooter: i === pages.length - 1, hide });
          if (shots[i].truncated) log(`    cut at ${shots[i].maxHeight}px, rest left out`);
        }
        if (wantNative) natives[i] = await printNative(browser, pages[i], { paper: o.paper, landscape: !o.portrait });
        errors.delete(i);
      } catch (error) {
        errors.set(i, error instanceof Error ? error.message : String(error));
        log(`    failed: ${pages[i]} (${errors.get(i)})`);
      }
    };
    for (let i = 0; i < pages.length; i++) { log(`  ${i + 1}/${pages.length} ${pages[i]}`); await shoot(i); }
    const rounds = Number(o.retries);
    for (let round = 1; round <= rounds && errors.size > 0; round++) {
      log(`  retry ${round}/${rounds}: ${errors.size} page(s)`);
      await new Promise((r) => setTimeout(r, 3000 * round));
      for (const i of [...errors.keys()]) await shoot(i);
    }

    const kept = pages.map((_, i) => i).filter((i) => !errors.has(i));
    if (!kept.length) throw new Error("every page failed");
    const stamp = new Date().toLocaleString("en-IN", { hour12: false });
    const cut = (i) => (shots[i]?.truncated ? ` (cut at ${shots[i].maxHeight}px)` : "");
    const labels = kept.map((i) => `${i + 1}. ${new URL(pages[i]).pathname}${cut(i)}${i === kept[0] ? `   ${start}   ${width}px   ${stamp}` : ""}`);
    report.pages = kept.map((i) => pages[i]);
    report.failed = [...errors].map(([i, reason]) => ({ url: pages[i], reason }));
    report.truncated = kept.filter((i) => shots[i]?.truncated).map((i) => ({ url: pages[i], maxHeight: shots[i].maxHeight }));

    const save = async (suffix, { bytes, sheets }) => {
      const file = outFile(suffix);
      writeFileSync(file, bytes);
      report.outputs.push({ format: suffix, file, sheets, bytes: bytes.length });
      log(`  ${suffix}: ${sheets} sheet(s), ${(bytes.length / 1e6).toFixed(1)} MB -> ${file}`);
      return { sheets, bytes: bytes.length };
    };
    const results = {};
    if (o.format === "book" || o.format === "compare") results.book = await save("book", await buildBook(kept.map((i) => shots[i]), labels, sheet));
    if (o.format === "sheet") results.sheet = await save("sheet", await buildSheets(kept.map((i) => shots[i]), labels, sheet));
    if (wantNative) results.native = await save("native", await mergePdfs(kept.map((i) => natives[i])));
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
    await browser.close();
  }
}

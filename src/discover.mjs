// Finds the pages of a site: sitemap.xml first, then a same-origin crawl of <a href> links.

import { gunzipSync } from "node:zlib";

// sitemaps.org cap on an uncompressed sitemap; also stops a small .gz from inflating to gigabytes
const MAX_MB = 50;

export function normalize(href, base, { keepQuery = false } = {}) {
  let url;
  try { url = new URL(href, base); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  url.hash = "";
  if (!keepQuery) url.search = "";
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
  if (/\.(pdf|zip|png|jpe?g|gif|svg|webp|mp4|xml|json|txt|ico|css|js)$/i.test(url.pathname)) return null;
  return url.href;
}

export function sameOrigin(a, b) {
  return new URL(a).origin === new URL(b).origin;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function unescapeXml(text) {
  return text.replace(/&(?:(amp|lt|gt|quot|apos)|#x([\da-f]+)|#(\d+));/gi, (ref, name, hex, dec) => {
    if (name) return ENTITIES[name.toLowerCase()];
    const code = hex ? parseInt(hex, 16) : Number(dec);
    return code <= 0x10ffff ? String.fromCodePoint(code) : ref;
  });
}

/** `<loc>` values of a urlset or index, or the lines of a plain-text sitemap (one URL per line). */
export function parseSitemap(body) {
  if (!body.includes("<")) return { locs: body.split("\n").map((l) => l.trim()).filter((l) => /^https?:\/\//i.test(l)), isIndex: false };
  const xml = body.replace(/<!--[\s\S]*?-->/g, "");
  const locs = [...xml.matchAll(/<loc>(?:\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*|([^<]*))<\/loc>/g)]
    .map((m) => (m[1] ?? unescapeXml(m[2])).trim())
    .filter(Boolean);
  const isIndex = /<sitemapindex/i.test(xml);
  return { locs, isIndex };
}

async function fetchText(url, timeoutMs = 15_000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "site2paper" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // shortcut: a plain body is read whole before the size check, stream it if a real site ever hits the cap
    let body = Buffer.from(await res.arrayBuffer());
    // fetch inflates content-encoding only; a .gz file arrives as gzip bytes
    if (body[0] === 0x1f && body[1] === 0x8b) body = gunzipSync(body, { maxOutputLength: MAX_MB << 20 });
    if (body.length > MAX_MB << 20) throw new Error(`over ${MAX_MB} MB`);
    return body.toString();
  } catch (error) {
    // undici says "fetch failed" and keeps ENOTFOUND or ECONNREFUSED in error.cause
    let reason = error.cause?.code ?? error.message;
    if (error.name === "TimeoutError") reason = `timed out after ${timeoutMs / 1000} s`;
    if (error.code === "ERR_BUFFER_TOO_LARGE") reason = `over ${MAX_MB} MB`;
    throw new Error(reason, { cause: error });
  }
}

/** Every `Sitemap:` value in a robots.txt: field name case-insensitive, `#` starts a comment. */
export function parseRobots(txt) {
  return [...txt.matchAll(/^[ \t\uFEFF]*sitemap[ \t]*:[ \t]*([^\s#]+)/gim)].map((m) => m[1]);
}

async function sitemapUrls(origin) {
  const named = await fetchText(`${origin}/robots.txt`).then(parseRobots, () => []);
  const own = named.filter((u) => { try { return new URL(u).origin === origin; } catch { return false; } });
  return [...new Set(own)];
}

export async function fromSitemap(start, { limit, onError = () => {} }) {
  const { origin, host, protocol } = new URL(start);
  const seen = new Set();
  const out = [];
  const keep = (locs) => {
    for (const loc of locs) {
      // a sitemap is the owner's own list: ?page=2 and ?lang=fr are pages, not tracking
      const page = normalize(loc, origin, { keepQuery: true });
      const url = page && new URL(page);
      // same host on the other scheme is this site: generators that still write http:// locs are never fixed
      if (url && url.host === host) {
        url.protocol = protocol;
        if (!seen.has(url.href)) { seen.add(url.href); out.push(url.href); }
      }
      if (out.length >= limit) return true;
    }
    return false;
  };
  const read = (url, quiet = false) => fetchText(url).then(parseSitemap, (error) => {
    if (!(quiet && error.message === "HTTP 404")) onError(url, error.message);
    return { locs: [], isIndex: false };
  });
  const root = `${origin}/sitemap.xml`;
  const onSite = (url) => URL.canParse(url) && new URL(url).origin === origin;
  const named = await sitemapUrls(origin);
  const walk = async (url, quiet) => {
    const { locs, isIndex } = await read(url, quiet);
    if (!isIndex) return keep(locs);
    // one child at a time: an index may list thousands of 50 000-URL files, the limit is usually 50
    for (const child of locs) {
      // the protocol allows children on the index's own site only, so another origin is never fetched
      if (!onSite(child)) { onError(child, `not on ${origin}`); continue; }
      if (keep((await read(child)).locs)) return true;
    }
    return false;
  };
  for (const url of named) if (await walk(url, false)) return out;
  // the root is guessed last, only when the named ones gave no page; a missing guess is the normal "no sitemap" answer
  if (!out.length && !named.includes(root)) await walk(root, true);
  return out;
}

/** Breadth-first same-origin crawl using the browser, so client-rendered nav links count too. */
export async function crawl(start, { limit, openPage, onVisit = () => {}, onError = () => {} }) {
  const root = normalize(start, start);
  const seen = new Set([root]);
  const queue = [root];
  const out = [];
  while (queue.length && out.length < limit) {
    const url = queue.shift();
    onVisit(url, { kept: out.length, seen: seen.size });
    let hrefs;
    try { hrefs = await openPage(url); } catch (error) { onError(url, error instanceof Error ? error.message.split("\n")[0] : String(error)); continue; }
    out.push(url);
    for (const href of hrefs) {
      const u = normalize(href, url);
      if (u && sameOrigin(u, root) && !seen.has(u)) { seen.add(u); queue.push(u); }
    }
  }
  return out;
}

/** Home first, then shallow paths before deep ones, alphabetical within a depth. */
export function orderPages(urls, start) {
  const root = normalize(start, start);
  const depth = (u) => new URL(u).pathname.split("/").filter(Boolean).length;
  return [...new Set(urls)].sort((a, b) => (a === root ? -1 : b === root ? 1 : depth(a) - depth(b) || a.localeCompare(b)));
}

// Finds the pages of a site: sitemap.xml first, then a same-origin crawl of <a href> links.

export function normalize(href, base) {
  let url;
  try { url = new URL(href, base); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  url.hash = "";
  url.search = "";
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
  if (/\.(pdf|zip|png|jpe?g|gif|svg|webp|mp4|xml|json|txt|ico|css|js)$/i.test(url.pathname)) return null;
  return url.href;
}

export function sameOrigin(a, b) {
  return new URL(a).origin === new URL(b).origin;
}

export function parseSitemap(xml) {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  const isIndex = /<sitemapindex/i.test(xml);
  return { locs, isIndex };
}

async function fetchText(url, timeoutMs = 15_000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "site2paper" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (error) {
    // undici says "fetch failed" and keeps ENOTFOUND or ECONNREFUSED in error.cause
    throw new Error(error.name === "TimeoutError" ? `timed out after ${timeoutMs / 1000} s` : error.cause?.code ?? error.message, { cause: error });
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
  const origin = new URL(start).origin;
  const seen = new Set();
  const out = [];
  const keep = (locs) => {
    for (const loc of locs) {
      const u = normalize(loc, origin);
      if (u && sameOrigin(u, start) && !seen.has(u)) { seen.add(u); out.push(u); }
      if (out.length >= limit) return true;
    }
    return false;
  };
  const read = (url, quiet = false) => fetchText(url).then(parseSitemap, (error) => {
    if (!(quiet && error.message === "HTTP 404")) onError(url, error.message);
    return { locs: [], isIndex: false };
  });
  const named = await sitemapUrls(origin);
  // a guessed /sitemap.xml that is missing is the normal "no sitemap" answer, not an error
  for (const url of named.length ? named : [`${origin}/sitemap.xml`]) {
    const { locs, isIndex } = await read(url, !named.length);
    if (!isIndex && keep(locs)) return out;
    // one child at a time: an index may list thousands of 50 000-URL files, the limit is usually 50
    for (const child of isIndex ? locs : []) if (keep((await read(child)).locs)) return out;
  }
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

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
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "site2paper" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function fromSitemap(start, { limit }) {
  const origin = new URL(start).origin;
  let xml;
  try { xml = await fetchText(`${origin}/sitemap.xml`); } catch { return []; }
  let { locs, isIndex } = parseSitemap(xml);
  if (isIndex) {
    const nested = await Promise.all(locs.slice(0, 10).map((u) => fetchText(u).then((t) => parseSitemap(t).locs, () => [])));
    locs = nested.flat();
  }
  const seen = new Set();
  const out = [];
  for (const loc of locs) {
    const u = normalize(loc, origin);
    if (u && sameOrigin(u, start) && !seen.has(u)) { seen.add(u); out.push(u); }
    if (out.length >= limit) break;
  }
  return out;
}

/** Breadth-first same-origin crawl using the browser, so client-rendered nav links count too. */
export async function crawl(start, { limit, openPage }) {
  const root = normalize(start, start);
  const seen = new Set([root]);
  const queue = [root];
  const out = [];
  while (queue.length && out.length < limit) {
    const url = queue.shift();
    let hrefs;
    try { hrefs = await openPage(url); } catch { continue; }
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

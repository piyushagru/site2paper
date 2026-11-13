import assert from "node:assert/strict";
import { test } from "node:test";
import { crawl, fromSitemap, normalize, orderPages, parseRobots, parseSitemap, sameOrigin } from "../src/discover.mjs";

test("normalize strips hash, query, trailing slash and non-page files", () => {
  const base = "https://x.test/a/";
  assert.equal(normalize("/b/?q=1#top", base), "https://x.test/b");
  assert.equal(normalize("c.pdf", base), null);
  assert.equal(normalize("mailto:a@b.c", base), null);
  assert.equal(normalize("/", base), "https://x.test/");
});

test("sameOrigin compares scheme, host and port", () => {
  assert.ok(sameOrigin("https://x.test/a", "https://x.test/b"));
  assert.ok(!sameOrigin("https://x.test/a", "https://cdn.x.test/b"));
});

test("parseSitemap reads urlset and detects an index", () => {
  const { locs, isIndex } = parseSitemap("<urlset><url><loc>https://x.test/</loc></url><url><loc> https://x.test/p </loc></url></urlset>");
  assert.deepEqual(locs, ["https://x.test/", "https://x.test/p"]);
  assert.equal(isIndex, false);
  assert.equal(parseSitemap("<sitemapindex><sitemap><loc>https://x.test/s1.xml</loc></sitemap></sitemapindex>").isIndex, true);
});

test("crawl stays on origin, dedupes and honours the limit", async () => {
  const graph = {
    "https://x.test/": ["/a", "/b", "https://other.test/", "/a#frag"],
    "https://x.test/a": ["/c", "/"],
    "https://x.test/b": ["/d"],
    "https://x.test/c": [],
    "https://x.test/d": [],
  };
  const pages = await crawl("https://x.test", { limit: 4, openPage: async (u) => graph[u] ?? [] });
  assert.deepEqual(pages, ["https://x.test/", "https://x.test/a", "https://x.test/b", "https://x.test/c"]);
});

test("orderPages puts home first, then shallow before deep", () => {
  const out = orderPages(["https://x.test/z/y", "https://x.test/b", "https://x.test/", "https://x.test/a"], "https://x.test/");
  assert.deepEqual(out, ["https://x.test/", "https://x.test/a", "https://x.test/b", "https://x.test/z/y"]);
});

test("crawl reports each page it opens and each one that fails", async () => {
  const visits = [];
  const errors = [];
  const openPage = async (u) => { if (u.endsWith("/b")) throw new Error("net::ERR_NAME_NOT_RESOLVED\nCall log: ..."); return u.endsWith("/") ? ["/a", "/b"] : []; };
  const pages = await crawl("https://x.test", { limit: 5, openPage, onVisit: (u, n) => visits.push([u, n.kept]), onError: (u, m) => errors.push([u, m]) });
  assert.deepEqual(pages, ["https://x.test/", "https://x.test/a"]);
  assert.deepEqual(visits, [["https://x.test/", 0], ["https://x.test/a", 1], ["https://x.test/b", 2]]);
  assert.deepEqual(errors, [["https://x.test/b", "net::ERR_NAME_NOT_RESOLVED"]]);
});

test("parseRobots reads every Sitemap line whatever its case, line ending or trailing comment", () => {
  const txt = "\uFEFFUser-agent: *\r\nDisallow: /private\r\nSITEMAP: https://x.test/sitemap_index.xml # main\r\n  sitemap:https://x.test/news.xml\nAllow: /\n";
  assert.deepEqual(parseRobots(txt), ["https://x.test/sitemap_index.xml", "https://x.test/news.xml"]);
});

async function withFetch(routes, fn) {
  const fetched = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    fetched.push(url);
    const body = routes[url];
    if (body instanceof Error) throw body;
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, text: async () => body };
  };
  try { return [await fn(), fetched]; } finally { globalThis.fetch = real; }
}

test("fromSitemap reads the sitemaps robots.txt names and never /sitemap.xml when one exists", async () => {
  const [pages, fetched] = await withFetch({
    "https://x.test/robots.txt": "Sitemap: https://x.test/sitemaps/pages.xml\nSitemap: https://cdn.other.test/sitemap.xml\n",
    "https://x.test/sitemaps/pages.xml": "<urlset><url><loc>https://x.test/</loc></url><url><loc>https://x.test/p</loc></url></urlset>",
    "https://x.test/sitemap.xml": "<urlset><url><loc>https://x.test/wrong</loc></url></urlset>",
  }, () => fromSitemap("https://x.test/", { limit: 50 }));
  assert.deepEqual(pages, ["https://x.test/", "https://x.test/p"]);
  assert.ok(!fetched.includes("https://x.test/sitemap.xml"));
  assert.ok(!fetched.includes("https://cdn.other.test/sitemap.xml"));
});

test("fromSitemap falls back to /sitemap.xml when robots.txt is missing or names no sitemap", async () => {
  const [pages] = await withFetch({
    "https://x.test/sitemap.xml": "<urlset><url><loc>https://x.test/a</loc></url></urlset>",
  }, () => fromSitemap("https://x.test/", { limit: 50 }));
  assert.deepEqual(pages, ["https://x.test/a"]);
});

test("fromSitemap walks every index child in order and stops fetching at the limit", async () => {
  const children = Array.from({ length: 12 }, (_, i) => i + 1);
  const entries = children.map((i) => `<sitemap><loc>https://x.test/s${i}.xml</loc></sitemap>`).join("");
  const routes = { "https://x.test/sitemap.xml": `<sitemapindex>${entries}</sitemapindex>` };
  for (const i of children) routes[`https://x.test/s${i}.xml`] = `<urlset><url><loc>https://x.test/p${i}</loc></url></urlset>`;
  const [all] = await withFetch(routes, () => fromSitemap("https://x.test/", { limit: 50 }));
  assert.deepEqual(all, children.map((i) => `https://x.test/p${i}`));
  const [few, fetched] = await withFetch(routes, () => fromSitemap("https://x.test/", { limit: 3 }));
  assert.deepEqual(few, ["https://x.test/p1", "https://x.test/p2", "https://x.test/p3"]);
  assert.ok(!fetched.includes("https://x.test/s4.xml"));
});

test("fromSitemap skips a child that fails to load and drops off-origin and repeated locs", async () => {
  const [pages] = await withFetch({
    "https://x.test/sitemap.xml": "<sitemapindex><sitemap><loc>https://x.test/gone.xml</loc></sitemap><sitemap><loc>https://x.test/ok.xml</loc></sitemap></sitemapindex>",
    "https://x.test/ok.xml": "<urlset><url><loc>https://x.test/a</loc></url><url><loc>https://x.test/a/</loc></url><url><loc>https://cdn.other.test/b</loc></url></urlset>",
  }, () => fromSitemap("https://x.test/", { limit: 50 }));
  assert.deepEqual(pages, ["https://x.test/a"]);
});

test("fromSitemap names each sitemap that fails and why, but a guessed /sitemap.xml that is simply missing is not an error", async () => {
  const report = () => { const errors = []; return { errors, onError: (u, m) => errors.push([u, m]) }; };
  const children = ["s1", "s2", "s3", "s4"].map((s) => `<sitemap><loc>https://x.test/${s}.xml</loc></sitemap>`).join("");
  const broken = report();
  const [pages] = await withFetch({
    "https://x.test/sitemap.xml": `<sitemapindex>${children}</sitemapindex>`,
    "https://x.test/s1.xml": Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }),
    "https://x.test/s2.xml": Object.assign(new Error("fetch failed"), { cause: { code: "ENOTFOUND" } }),
    "https://x.test/s4.xml": "<urlset><url><loc>https://x.test/p4</loc></url></urlset>",
  }, () => fromSitemap("https://x.test/", { limit: 50, onError: broken.onError }));
  assert.deepEqual(pages, ["https://x.test/p4"]);
  assert.deepEqual(broken.errors, [["https://x.test/s1.xml", "timed out after 15 s"], ["https://x.test/s2.xml", "ENOTFOUND"], ["https://x.test/s3.xml", "HTTP 404"]]);
  const none = report();
  await withFetch({}, () => fromSitemap("https://x.test/", { limit: 50, onError: none.onError }));
  assert.deepEqual(none.errors, []);
  const down = report();
  await withFetch({ "https://x.test/sitemap.xml": Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } }) }, () => fromSitemap("https://x.test/", { limit: 50, onError: down.onError }));
  assert.deepEqual(down.errors, [["https://x.test/sitemap.xml", "ECONNRESET"]]);
  const stale = report();
  await withFetch({ "https://x.test/robots.txt": "Sitemap: https://x.test/old.xml\n" }, () => fromSitemap("https://x.test/", { limit: 50, onError: stale.onError }));
  assert.deepEqual(stale.errors, [["https://x.test/old.xml", "HTTP 404"]]);
});

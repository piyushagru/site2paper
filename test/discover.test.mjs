import assert from "node:assert/strict";
import { test } from "node:test";
import { crawl, normalize, orderPages, parseSitemap, sameOrigin } from "../src/discover.mjs";

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

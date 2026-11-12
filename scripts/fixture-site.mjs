#!/usr/bin/env node
// Local test site with every capture case, so end-to-end runs never hit a real site.
// Loopback only, random port. `node scripts/fixture-site.mjs` prints the URL and serves until killed.
// FIXTURE_SITEMAP=0 serves no sitemap.xml, to exercise the crawl path.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const dir = new URL("../test/fixtures/site/", import.meta.url);
const sitemap = process.env.FIXTURE_SITEMAP !== "0";
const svg = (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><rect width="600" height="200" fill="${color}"/></svg>`;

export function startFixture() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://fixture");
    const send = (status, type, body) => setTimeout(() => { res.writeHead(status, { "content-type": type }); res.end(body); }, Number(url.searchParams.get("delay") ?? 0));
    const base = `http://${req.headers.host}`;
    if (url.pathname === "/sitemap.xml" && sitemap) {
      return send(200, "application/xml", `<urlset>${["/", "/story.html", "/long.html", "/slow"].map((p) => `<url><loc>${base}${p}</loc></url>`).join("")}</urlset>`);
    }
    if (url.pathname === "/slow") { url.searchParams.set("delay", "3000"); return send(200, "text/html", "<!doctype html><title>Slow</title><h1>Slow page, 3 s to first byte</h1>"); }
    if (url.pathname === "/img/native.svg") return send(200, "image/svg+xml", svg("#2471a3"));
    if (url.pathname === "/img/observer.svg") return send(200, "image/svg+xml", svg("#1e8449"));
    if (url.pathname === "/font.woff2") return send(404, "text/plain", "no font, fallback is the test");
    const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (/^[a-z]+\.html$/.test(file)) {
      try { return send(200, "text/html", readFileSync(new URL(file, dir))); } catch { /* fall through to 404 */ }
    }
    send(404, "text/html", "<!doctype html><title>404</title><h1>404 Not Found</h1>");
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() })));
}

if (import.meta.url === `file://${process.argv[1]}`) startFixture().then(({ url }) => console.log(url));

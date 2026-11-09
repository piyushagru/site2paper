# Roadmap

Priorities:

- **P0**: breaks a promise the README makes, blocks public use, or is a licence or attribution requirement.
- **P1**: a clear need with a cited source, a gap found in the code, or an item the owner asked for.
- **P2**: competitor parity or a nice-to-have.

Tiers: **T1** under 50 changed lines, **T2** 50 to 200 lines, **T3** needs an owner decision before code (new format, new config surface, new dependency, release or publish step).

Vision: one command that turns any website into the print, text and screenshot outputs people need, with the same zero-config start.

## Done

- Star link in the README points to the repo page. Checked 2026-11-09.
- Release guide in `docs/RELEASING.md` covers manual and trusted publishing.
- Package size: 11 files, 14.1 kB packed, 37.4 kB unpacked. Checked with `npm pack --dry-run` on 2026-11-09.
- Competitor links in the README comparison table return 200. Checked 2026-11-09.
- **P0-1 Prior art credits.** README "Prior art" section lists site2pdf (MIT), website2pdf (MIT), shot-scraper (Apache-2.0) and web-printer (MIT). Commit `c779001`.
- **P1-1 Node floor matches `sharp`.** `engines.node` is `>=20.9.0`; README badge and Quick start say 20.9. Commit `e900e04`, 2026-11-09.
- **P1-2 Packed size budget.** `scripts/check-standards.sh` fails when `npm pack --dry-run --json` reports more than 20 000 B packed; `PACK_BUDGET` env overrides. Test covers both paths. Commits `f8fb16e`, `a6841a8`; peer reviewed by Itachi (handoff `site2paper-p1-2`), 2026-11-09.
- **P1-4 Height cap recorded, and reachable.** Cap is `heightCap(scale) = floor(32767 / scale)`: Playwright refuses screenshots over 32 767 device px off macOS (`validateScreenshotDimension` in `playwright-core/lib/coreBundle.js`), so the old 40 000 px clip always failed on Linux and Windows. `capture()` returns `truncated` and `maxHeight`; the CLI logs `cut at Npx`, appends `(cut at Npx)` to the sheet label and writes `report.truncated: [{ url, maxHeight }]`. `report.pages` stays a string array. Test `test/capture.test.mjs`. Commit `a3b8732`; peer reviewed by Itachi (handoff `site2paper-p1-4`), 2026-11-09.
- **P1-7 Scroll walk stops at the cap, not at the first measured height.** The walk is `scrollWalk(maxH)` in `capture.mjs`; the loop bound `Math.min(docHeight(), maxH)` is re-read every step, so lazy feeds that grow while scrolling keep loading up to `heightCap(scale)`. The 8 s image wait runs only when an image is pending. Test with stubbed globals in `test/capture.test.mjs`. Commit `2e7c028`; peer reviewed by Itachi (handoff `site2paper-p1-7`), 2026-11-10.

## P0

No open P0 items.

## P1

Code items first. A cycle without a code commit is not finished (owner, 2026-11-09).

- **P1-5 Tests for `rules.mjs`.** `hideCss`, `carouselCss` and `pagePrepScript` have no tests; `test/` covers only `discover` and `layout`. Add `test/rules.test.mjs`: cookie selectors present, `hide` extras joined, `FOOTER_ONCE_CSS` only when `keepFooter` is false, `pagePrepScript` returns a string that parses (`new Function`). Tier T1. Source: gap found in code, 2026-11-09.
- **P1-6 Wait for fonts before the screenshot.** Web fonts that land after `networkidle` render as fallback glyphs or tofu in the capture. Add `await document.fonts.ready` to the scroll walk in `capture.mjs`, bounded by the same 8 s race. Tier T1. Source: same dev.to post (emoji and font tofu), plus ShotPro listing "waits for lazy-loaded images and fonts", https://apify.com/ashutoshdadu/shotpro-screenshot-pdf/api/cli, seen 2026-11-09.
- **P1-9 Smooth scrolling defeats the walk.** Sites with `html { scroll-behavior: smooth }` animate every `scrollTo`, so a 100 ms step lands short of `y` and lazy observers near the step edge never fire. Add `scroll-behavior: auto !important` to the `html, body` rule in `hideCss()` and a `test/rules.test.mjs` assertion (folds into P1-5). Tier T1. Source: gap found in `rules.mjs` on 2026-11-10; the walk pattern it fixes is described at https://dev.to/knallhartdev/the-scrollheight-lie-how-i-finally-got-full-page-screenshots-right-with-playwright-4emn, seen 2026-11-10.
- **P1-8 Stitch pages taller than the cap.** With the cap now at 32 767 device px, very long pages lose their tail. Capture in viewport-sized clips and stitch with `sharp` so no row is lost; the hosted-tool guidance is "clip into sub-32767 pieces and stitch". Tier T2. Source: https://errors.standardbeagle.com/microsoft/playwright/cannot-take-screenshot-larger-than-32767-pixels-on-62dff6/, seen 2026-11-09.
- **P1-3 Add a CI guard for the Node engine floor.** Run the smoke test on Node 20.9 as well as Node 24 so the floor stays true. Tier T2.

## P2

- **P2-1 One PDF per page.** Competitor parity with `website2pdf`, which writes one PDF per page with an optional merge. Add `--split` for one file per page. Tier T2. Source: https://github.com/jgazeau/website2pdf
- **P2-2 Make `report.json` self-describing.** Add a `schemaVersion` field so tools that read the report can detect changes. Tier T1.
- **P2-3 Document Chrome reuse.** Explain in the README when the tool uses an installed Chrome or Edge and when it downloads Chromium. Tier T1.
- **P2-5 WebP sheets as an option.** shot-scraper 1.12 added WebP output with a quality setting (2026-09). A `--image webp` flag for the per-page PNGs would cut output size; the PDF path is unchanged. Tier T2. Source: https://cybercorsairs.com/webp-screenshots-land-in-shot-scraper-1-12/, seen 2026-11-09.
- **P2-6 Mobile viewport preset.** Hosted tools ship desktop, tablet and mobile presets; site2paper has `--width` only. A `--device mobile` alias for width 390 with a mobile user agent covers the ask. Tier T2. Source: https://apify.com/webify-lab/website-screenshot-pdf/api/cli, seen 2026-11-09.
- **P2-4 Bulk list input.** Hosted tools take a pasted URL list and return one file per URL (Apify "Website Screenshot & PDF", seen 2026-11-09, https://apify.com/magenta_waterwheel/website-screenshot-pdf). A `--urls file.txt` flag that skips discovery covers the same ask. Tier T2.

## Needs decision

- **Publish workflow.** Context seen 2026-11-09: trusted publishing now allows several trusted-publisher configs per package and holds staged versions until npm's malware scan completes (GitHub Changelog 2026-09-03, via https://www.refontelearning.com/blog/npm-multi-trusted-publishing-release-governance); the keyv@6.0.0 (2026-08-04) and @tanstack (2026-05-11) incidents show provenance attests the build, not the source, https://ecorpit.hashnode.dev/npm-provenance-signed-the-malware-on-4-august-2026-what-attestations-prove-and-what-a-cooldown-stops. Official docs: https://docs.npmjs.com/trusted-publishers. Added 2026-11-10: the GHAPPIER loader attack (2026-09-09) turned push access into publish access by editing a trusted-publishing release workflow, so the workflow file itself needs branch protection, https://orca.security/resources/research/ghappier-loader-npm-supply-chain-attack/. `docs/RELEASING.md` describes `.github/workflows/publish.yml` for trusted publishing, but the file does not exist. Adding it is a release-path change. Owner decision.
- **Text output for LLM and RAG use.** Competitor parity with `site2pdf`, which extracts page text. This is a new output format and a new output contract. Source: https://github.com/laiso/site2pdf. Owner decision.
- **Header and footer templates.** Competitor parity with `website2pdf`. This adds a new config surface, which conflicts with the zero-config rule in `AGENTS.md`. Source: https://github.com/jgazeau/website2pdf. Owner decision.
- **Scripted capture from a YAML list.** Competitor parity with `shot-scraper`. This adds a config file. Source: https://shot-scraper.datasette.io/. Owner decision.

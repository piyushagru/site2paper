# AGENTS.md  site2paper

Conventions for AI coding agents and people working in this repo. Terse by design.

## What this is

`npx site2paper <url>` prints a website the way visitors see it: full-page screenshots of every
page, flowed through columns on A4 sheets, carousels expanded, repeated chrome hidden, footer once,
scroll-driven stories (pinned frames animated by scroll) printed as a filmstrip of scroll stops.
The one rule that outranks every other: **a user types one command with one URL and gets a PDF.**
Any change that adds a required step, flag or config file for the common case is wrong.

## Layout

| Path | Job |
|---|---|
| `bin/site2paper.mjs` | Entry point. Calls `run()`, maps errors to exit codes |
| `src/cli.mjs` | Flags, discovery, capture loop with retries, output, `compare` table |
| `src/discover.mjs` | `sitemap.xml`, same-origin crawl, URL normalising and ordering. Pure, no browser |
| `src/browser.mjs` | Launches installed Chrome or Edge, downloads Chromium only as a last resort |
| `src/capture.mjs` | One page in, screenshot plus blank-row map out. Also Chrome's native Print-to-PDF |
| `src/rules.mjs` | CSS and page script: cookie banners, carousels, fixed widgets, footer-once |
| `src/story.mjs` | Scroll-story detection script, filmstrip layout and ruler SVG. Pure, unit tested |
| `src/layout.mjs` | Column flow maths. Pure, fully unit tested |
| `src/book.mjs` | pdf-lib composition for `book`, `sheet`, and merged `native` |
| `test/` | `node --test`. Pure modules get tests; browser code is covered by the CI smoke run |
| `scripts/` | Registry guard, lockfile lint, standards check, new-user smoke (`npm run smoke`). Not shipped: nothing in `preinstall`/`postinstall` may reference it |

Keep pure logic (discover, layout) free of Playwright and sharp so it stays unit testable.

## Comments

- No comments that restate what the code does.
- Only comment genuine non-obvious gotchas or business rules, one line max. Examples already in
  the tree: why `networkidle` is bounded, why the header is made static rather than hidden.

## Git commits

- One line, [Conventional Commits](https://www.conventionalcommits.org/) prefix, imperative mood,
  about 50 chars, hard cap 72 (commitlint). Types: `feat` `fix` `docs` `style` `refactor` `perf`
  `test` `chore` `ci`.
- No body unless the change needs real explanation.
- Do not commit unless asked. One concern per commit, and a commit stays readable in one sitting:
  about 2 to 3 screens of diff, under 100 changed lines. A larger change is split by concern (code,
  then its test, then docs) before it is committed (owner, 2026-11-11).
- No customer or third-party site name or URL in any doc, example, test or commit message. Example
  images show the output, never a brand mark or the URL label.

## Code

- ESM `.mjs`, no build step, no TypeScript. The package must run from a fresh `npx` with nothing
  compiled.
- Three runtime dependencies: `playwright-core`, `pdf-lib`, `sharp`. Adding a fourth needs a
  sentence in the PR saying why the standard library or an existing dep cannot do it.
- No em-dashes in code, comments, docs or commit messages. Use a comma, colon or new sentence.
  `npm run check` fails on one.
- No duplication across modules; extract once real duplication exists, not before.
- New rules in `rules.mjs` must name the library they target and hide, never click, consent UI.

## Behaviour invariants

- Discovery stays on the start URL's origin and never follows more than `--limit` pages.
- A failed page is retried after the full pass, then left out and reported. A run never aborts
  because one page failed.
- A page that fits one column is never split. A taller page is cut only on a blank row when one
  exists within 600px.
- The `native` format is Chrome's own `page.pdf()` with no help from us. It is the honest baseline
  for `compare`; do not "improve" it.
- A pinned scroll story (a `sticky` or `fixed` frame at least 60 percent of the viewport inside a
  section at least 1.5 viewports tall, parent not `body`) is never printed as its blank runway. It
  is printed as a filmstrip of 4 viewport stops with a scroll ruler, in place of the section, with
  no flag. Stories are captured without reduced motion (sites that honour it remove the story);
  the static shot is taken with it. `body` keeps `overflow: visible` so sticky frames stay pinned.
- Output goes under `./site2paper/` unless `--out` says otherwise, with `report.json` beside it.

## Verification

- `npm run lint`, `npm run check`, `npm test` before considering work done.
- Before every commit and every push: `npm run smoke` passes (new user and old user, against the
  local fixture site), and a second reviewer has read the change.
- Any change to capture, rules or layout: run against the fixture (`node scripts/fixture-site.mjs`)
  and look at the PDF. Paste a sheet in the PR. Never test against popular third-party sites.

## Collaborator workflow (enforced)

- No direct pushes to `main`. Branch `<type>/<short-kebab-summary>`, open a PR.
- Husky runs lint-staged on commit and commitlint on the message. CI re-checks everything, then
  does a smoke run against a public site.
- Registry guard: `npm install` in this repo refuses a non-public registry (the `prepare` hook) so
  the lockfile never gets poisoned. If your shell overrides it, run
  `npm install --registry=https://registry.npmjs.org`. It runs for contributors only; a consumer's
  `npx site2paper` must never run anything from `scripts/`.
- After every publish: `npm run smoke -- <version>`. See `docs/RELEASING.md`.

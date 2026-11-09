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

## P0

No open P0 items.

## P1

- **P1-1 Stop `sharp` installs failing on Node 20.0 to 20.8.** `sharp` 0.35.3 requires `>=20.9.0`, but `package.json` says `>=20`. Set `engines.node` to `>=20.9.0`. Tier T1. Source: `node_modules/sharp/package.json`, checked 2026-11-09.
- **P1-2 Keep the packed size under a budget.** Add a check to `scripts/check-standards.sh` that fails when `npm pack --dry-run --json` reports more than 20 kB packed. Tier T1. Source: owner request, 2026-11-09.
- **P1-3 Add a CI guard for the Node engine floor.** Run the smoke test on Node 20.9 as well as Node 24 so the floor stays true. Tier T2.

## P2

- **P2-1 One PDF per page.** Competitor parity with `website2pdf`, which writes one PDF per page with an optional merge. Add `--split` for one file per page. Tier T2. Source: https://github.com/jgazeau/website2pdf
- **P2-2 Make `report.json` self-describing.** Add a `schemaVersion` field so tools that read the report can detect changes. Tier T1.
- **P2-3 Document Chrome reuse.** Explain in the README when the tool uses an installed Chrome or Edge and when it downloads Chromium. Tier T1.

## Needs decision

- **Publish workflow.** `docs/RELEASING.md` describes `.github/workflows/publish.yml` for trusted publishing, but the file does not exist. Adding it is a release-path change. Owner decision.
- **Text output for LLM and RAG use.** Competitor parity with `site2pdf`, which extracts page text. This is a new output format and a new output contract. Source: https://github.com/laiso/site2pdf. Owner decision.
- **Header and footer templates.** Competitor parity with `website2pdf`. This adds a new config surface, which conflicts with the zero-config rule in `AGENTS.md`. Source: https://github.com/jgazeau/website2pdf. Owner decision.
- **Scripted capture from a YAML list.** Competitor parity with `shot-scraper`. This adds a config file. Source: https://shot-scraper.datasette.io/. Owner decision.

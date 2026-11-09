---
inclusion: always
---

# site2paper invariants

Full guidance is `AGENTS.md` at the repo root. These lines are the parts that must never drift.

- One command, one URL, one PDF. No required flag or config for the common case.
- ESM `.mjs`, no build step. Three runtime deps: `playwright-core`, `pdf-lib`, `sharp`.
- `src/discover.mjs` and `src/layout.mjs` import no browser or image library.
- Failed pages are retried after the pass, then reported, never fatal.
- A page that fits one column is never split.
- `native` format is untouched Chrome `page.pdf()`.
- No em-dash anywhere. Conventional Commits, about 50 chars, no body unless needed.
- Commit only when asked. Never push to `main` directly except by the owner.

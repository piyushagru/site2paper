# Contributing

[AGENTS.md](AGENTS.md) is the single source of truth for all conventions in this repo.
Read it before doing anything, especially the "Collaborator workflow (enforced)" section.

Short version: branch off `main` (`<type>/<short-kebab-summary>`), Conventional Commits
(enforced by commitlint + husky), `npm run lint`, `npm run check` and `npm test` green before
requesting review, open a PR using the template. No direct pushes to `main`.

Releases to npm: see [docs/RELEASING.md](docs/RELEASING.md).

## Summary

<!-- One or two sentences: what does this PR do and why? -->

## What changed

<!-- Bullet the concrete changes. Call out anything reviewers should look at first. -->

-

## Verification

<!-- Paste evidence, not claims. -->

- [ ] `npm run lint` and `npm run check` pass
- [ ] `npm test` passes (paste the `tests` / `pass` / `fail` lines)
- [ ] Ran `npm run smoke`, and for capture, rules or layout changes captured the fixture site (`node scripts/fixture-site.mjs`) and looked at the PDF

```
(output here)
```

## Sheets

<!-- Required for any change to capture, rules or layout: a sheet from before and after. Delete for other changes. -->

## Checklist

- [ ] Follows [AGENTS.md](https://github.com/piyushagru/site2paper/blob/main/AGENTS.md) (comments, commits, zero-setup rule)
- [ ] Commit messages are Conventional Commits, imperative, about 50 chars
- [ ] No new runtime dependency without a line in the PR saying why
- [ ] No em-dash anywhere (`npm run check`)

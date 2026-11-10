# Releasing to npm

This page covers how a new `site2paper` version reaches the npm registry. Two paths exist:

| Path | Who runs it | When to use |
|---|---|---|
| [Manual publish](#manual-publish) | You, from your laptop, with your npm login and a 2FA code | First release, or any time CI is not set up |
| [Automated publish](#automated-publish-trusted-publishing) | GitHub Actions, on a version tag, with no npm token | Every release after trusted publishing is set up |

Both paths publish the same tarball. The `files` list in `package.json` decides what ships: `bin`, `src`, `README.md` and `LICENSE`, 14 files and about 18 kB.

## Before any release

Run the gates locally. CI runs the same ones.

```
npm run lint
npm run check
npm test
npm run smoke
npm publish --dry-run --registry=https://registry.npmjs.org
```

`npm run smoke` packs the working tree and runs it the way a new user does: `npx` from an empty
directory with an empty HOME and npm cache, nothing from this repo on the path. It must print
`PASS`. Unit tests cannot catch what it catches: 0.1.1 passed every unit test and failed for every
new user, because `preinstall` referenced `scripts/`, which `files` does not ship.

The dry run must list the `bin`, `src`, `README.md` and `LICENSE` files only. If it lists more,
check the `files` list before you publish.

## Manual publish

Use a clean shell for the npm commands. Keep npm settings out of `~/.npmrc` and `~/.npm` by pointing them at a throwaway folder:

```
SB=$(mktemp -d "${TMPDIR:-/tmp}/site2paper-npm.XXXXXX")
mkdir -p "$SB/cache" && touch "$SB/npmrc" "$SB/global-npmrc"
export NPM_CONFIG_USERCONFIG="$SB/npmrc"
export NPM_CONFIG_GLOBALCONFIG="$SB/global-npmrc"
export NPM_CONFIG_CACHE="$SB/cache"
```

1. Log in. npm opens an approval step in the browser. npm refused the publish without 2FA on this account, so turn on 2FA first.

   ```
   npm login --registry=https://registry.npmjs.org
   npm whoami --registry=https://registry.npmjs.org
   ```

2. Bump the version. `-m` keeps the commit message valid under commitlint.

   ```
   npm version patch -m "chore(release): %s"
   ```

   Use `minor` or `major` for bigger changes. This commits the version change and creates a `vX.Y.Z` tag.

3. Publish with your current one-time code.

   ```
   npm publish --registry=https://registry.npmjs.org --otp=123456
   ```

4. Confirm the registry has the new version and that a stranger can run it. npm can take a few
   minutes to show it.

   ```
   npm view site2paper version --registry=https://registry.npmjs.org
   npm run smoke -- 0.1.2
   ```

5. Push the commit and tag. The package and the repo must match.

   ```
   git push --follow-tags origin main
   ```

6. Test the published package.

   ```
   npx site2paper@latest https://example.com --limit 2
   ```

7. Delete the sandbox, since it holds your token.

   ```
   rm -rf "$SB"
   ```

### First publish notes

- On 2026-11-09, `npm view` showed a placeholder version `0.0.0-stage` after the first publish. The real `0.1.0` appeared a few minutes later, after the browser approval step. Run step 4 again if you see the placeholder.
- Publishing is public right away. You can unpublish only within 72 hours, and a version number can never be reused.

## Automated publish (trusted publishing)

Trusted publishing lets a GitHub Actions run publish without a stored npm token. npm checks the run through OIDC. Docs: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers).

Requirements from the npm docs:

- npm CLI 11.5.1 or newer, and Node 22.14.0 or newer.
- A GitHub-hosted runner.
- `id-token: write` in the workflow permissions.
- The `repository.url` in `package.json` must match the GitHub repo exactly. This repo uses `git+https://github.com/piyushagru/site2paper.git`.
- Provenance is generated only when the repo is public. The repo is private today, so the first automated publish has no provenance attestation.

### One-time setup

This needs a package that already exists on npm, so do the manual first publish first. The order below matters.

1. Add the workflow below as `.github/workflows/publish.yml` and push it to `main`. npm checks that this file exists when you save the trusted publisher.

   ```yaml
   name: Publish

   on:
     push:
       tags: ["v*"]

   permissions:
     contents: read
     id-token: write   # OIDC for npm trusted publishing

   jobs:
     publish:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 24
             registry-url: https://registry.npmjs.org
         - name: Upgrade npm (trusted publishing needs 11.5.1 or newer)
           run: npm install -g npm@latest
         - run: npm --version
         - run: npm ci
         - run: npm run lint
         - run: npm run check
         - run: npm test
         - run: npm publish --access public
   ```

2. On [npmjs.com](https://www.npmjs.com), open the `site2paper` package, then Settings, then Trusted publishing, then GitHub Actions. Enter these values exactly:

   | Field | Value |
   |---|---|
   | Organization or user | `piyushagru` |
   | Repository | `site2paper` |
   | Workflow filename | `publish.yml` |

   Under "Allowed actions", tick **npm publish**. The npm docs say configurations created after 2026-09-03 allow only staged publishing by default. Staged publishing waits for a maintainer approval with 2FA before the version goes public. Leave it unticked only if you want that approval step.

3. Still in Settings, set Publishing access to "Require two-factor authentication and disallow tokens", then save.

4. Do step 2 on the day you push the first tag that uses it. A new trusted publisher must complete one successful publish within 2 days, or it expires and must be recreated.

### Each release after setup

```
cd <>/site2paper
npm version patch -m "chore(release): %s"
git push --follow-tags origin main
```

The tag push starts the Publish workflow. Watch it under the repo's Actions tab. A failed gate stops the publish before npm sees anything.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `E403` with a 2FA message | Trusted publishing is not set up, or the workflow filename does not match `publish.yml` |
| `ENEEDAUTH` ("Unable to authenticate") | Check the workflow filename, including `.yml`, and the `id-token: write` permission. npm checks these fields only when you publish, so a typo shows up here |
| Publish is refused in CI | "npm publish" is not ticked under Allowed actions, or the npm CLI in the job is older than 11.5.1 |
| Publish works but the version is wrong | The tag and `package.json` version differ. Fix `package.json`, then tag again with a new version. Versions cannot be reused |
| Trusted publisher expired | Delete it, create a new one, and publish within 2 days |

## Rules

- Never publish from a dirty working tree.
- Never store an npm token in this repo, in CI secrets or in `.npmrc`.
- Never reuse a version number, even after an unpublish.
- Keep `package.json` and the git tag on the same version.

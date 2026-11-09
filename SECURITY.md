# Security policy

## Supported versions

Only the latest release on npm gets fixes.

## Reporting a vulnerability

Do not open a public issue. Use GitHub's private reporting:
[Report a vulnerability](https://github.com/piyushagru/site2paper/security/advisories/new).

Include the site2paper version, the command you ran, and what happened. You will get a reply
within 7 days.

## Scope

site2paper runs a headless browser against URLs you give it and writes files to your disk.
In scope: code execution on the host, writes outside `--out`, crawling beyond the start origin.
Out of scope: content of the sites you choose to print.

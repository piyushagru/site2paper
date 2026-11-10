# Examples

Real runs, same machine, same day, Chrome's own Print-to-PDF beside site2paper. Each folder has the
side-by-side `compare.jpg` the README shows, plus the individual sheets.

| Example | Site type | Ctrl+P | site2paper | Folder |
|---|---|---|---|---|
| Catalogue site, 48 pages, 1440 px | Swiper hero carousel, language pop-up, floating call and chat widgets | 171 sheets, 75.6 MB | 25 sheets, 6.4 MB | [`catalogue-site/`](catalogue-site/) |
| Scroll-story landing page, home page, 1440 px | Scroll-driven story: three pinned sections, three.js sky and product, scroll-reveal text | 11 sheets, 1.1 MB, 10 of them the preloader cube | 1 sheet, 0.2 MB, three filmstrips | [`scroll-story-site/`](scroll-story-site/) |

## Reproduce

```sh
npx site2paper https://your.site --limit 1 --format compare
```

`compare` writes both PDFs beside each other and prints the table. The images here were made by
rendering each PDF page to PNG and tiling them. The site owner asked that the site name stay out of the docs, so the scroll-story example shows one column and masks the URL label; nothing else was retouched.

## Adding an example

- One folder per site, named after the host.
- Keep `compare.jpg` under 150 KB (JPEG quality 85, about 2300 px wide) so the README loads fast.
- Only sites you own or have permission to show. No customer screenshots.
- `examples/` is not in the npm package (`files` in `package.json`), so size here does not count
  against the packed-size budget.

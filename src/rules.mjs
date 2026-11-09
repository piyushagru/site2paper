// CSS injected before capture. Hides one-time overlays and fixed widgets; lays every carousel slide out as a grid.

const COOKIE_BANNERS = [
  "#onetrust-banner-sdk", "#onetrust-consent-sdk", "#CybotCookiebotDialog", ".cc-window", ".cookie-banner",
  "#cookie-banner", "#cookie-notice", ".fc-consent-root", "#truste-consent-track", ".qc-cmp2-container",
  '[id^="sp_message_container"]', "#didomi-host", "#usercentrics-root",
  '[id*="cookie" i][class*="banner" i]', '[class*="cookie-consent" i]', '[aria-label*="cookie" i][role="dialog"]',
];

// Common carousel libraries: the track becomes a wrapping grid and every slide becomes a normal block.
const CAROUSELS = [
  { track: '[aria-roledescription="carousel"]', slide: '[aria-roledescription="slide"]', chrome: ":scope > button, :scope > div:not([role])" },
  { track: ".swiper-wrapper", slide: ".swiper-slide", chrome: ".swiper-button-prev, .swiper-button-next, .swiper-pagination" },
  { track: ".slick-track", slide: ".slick-slide", chrome: ".slick-arrow, .slick-dots" },
  { track: ".embla__container", slide: ".embla__slide", chrome: ".embla__button, .embla__dots" },
  { track: ".keen-slider", slide: ".keen-slider__slide", chrome: ".arrow, .dots" },
  { track: ".splide__list", slide: ".splide__slide", chrome: ".splide__arrows, .splide__pagination" },
  { track: ".flickity-slider", slide: ".carousel-cell", chrome: ".flickity-button, .flickity-page-dots" },
  { track: ".owl-stage", slide: ".owl-item", chrome: ".owl-nav, .owl-dots" },
  { track: ".carousel-inner", slide: ".carousel-item", chrome: ".carousel-control-prev, .carousel-control-next, .carousel-indicators" },
];

export function carouselCss() {
  return CAROUSELS.map(({ track, slide, chrome }) => `
    ${track} { display: grid !important; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; transform: none !important; width: auto !important; height: auto !important; aspect-ratio: auto !important; overflow: visible !important; }
    ${track} > ${slide}, ${track} ${slide} { position: relative !important; inset: auto !important; left: auto !important; top: auto !important; transform: none !important; opacity: 1 !important; visibility: visible !important; display: block !important; width: auto !important; min-height: 120px; overflow: hidden; }
    ${chrome.split(",").map((c) => c.trim().startsWith(":scope") ? `${track} ${c.trim().replace(":scope", "")}` : c.trim()).join(", ")} { display: none !important; }
  `).join("\n");
}

export function hideCss(extra = []) {
  const fixed = "[data-print-hide], nextjs-portal, .locale-tooltip-pop, .nudge-card";
  return `
    ${[...COOKIE_BANNERS, fixed, ...extra].join(", ")} { display: none !important; }
    html, body { overflow: auto !important; position: static !important; }
    *, *::before, *::after { animation-play-state: paused !important; transition: none !important; }
  `;
}

export const FOOTER_ONCE_CSS = "body > footer, main ~ footer, footer[role='contentinfo'] { display: none !important; }";

/** Runs in the page: unhides scroll-reveal elements and removes fixed/sticky chrome that would repeat on every slice. */
export function pagePrepScript() {
  return `(() => {
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" || cs.position === "sticky") {
        const r = el.getBoundingClientRect();
        const header = r.top <= 1 && r.width >= innerWidth * 0.8 && r.height < 200;
        if (header) { el.style.setProperty("position", "static", "important"); continue; }
        el.style.setProperty("display", "none", "important");
      }
      if (cs.opacity === "0" && el.children.length > 0) el.style.setProperty("opacity", "1", "important");
    }
  })()`;
}

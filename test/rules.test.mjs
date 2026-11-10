import assert from "node:assert/strict";
import { test } from "node:test";
import { FOOTER_ONCE_CSS, carouselCss, hideCss, pageCss, pagePrepScript } from "../src/rules.mjs";

const rules = (css) => css.split("}").map((r) => r.trim().replace(/\s+/g, " ")).filter(Boolean);
const ruleWith = (css, decl) => rules(css).find((r) => r.includes(decl));

test("hideCss hides the common consent banners", () => {
  const hidden = ruleWith(hideCss(), "display: none !important");
  assert.ok(hidden.includes("#onetrust-banner-sdk"));
  assert.ok(hidden.includes("#CybotCookiebotDialog"));
});

test("hideCss joins extra selectors into the hidden list", () => {
  const hidden = ruleWith(hideCss(["#promo", ".chat-widget"]), "display: none !important");
  assert.ok(hidden.includes("#promo, .chat-widget"));
  assert.ok(hidden.includes("#onetrust-banner-sdk"));
});

test("hideCss turns smooth scrolling off so each walk step lands", () => {
  const html = ruleWith(hideCss(), "html {");
  assert.ok(html.includes("scroll-behavior: auto !important"));
});

test("hideCss unlocks scrolling on html but keeps body overflow visible so sticky frames stay pinned", () => {
  assert.ok(ruleWith(hideCss(), "html {").includes("overflow: auto !important"));
  assert.ok(ruleWith(hideCss(), "body {").includes("overflow: visible !important"));
});

test("pageCss hides the footer only when keepFooter is false", () => {
  assert.ok(FOOTER_ONCE_CSS.includes("footer"));
  assert.ok(FOOTER_ONCE_CSS.includes("display: none !important"));
  assert.ok(pageCss({ keepFooter: false }).includes(FOOTER_ONCE_CSS));
  assert.ok(!pageCss({ keepFooter: true }).includes(FOOTER_ONCE_CSS));
  assert.ok(pageCss({ hide: ["#promo"] }).includes("#promo"));
  assert.ok(pageCss().includes(".swiper-wrapper"));
});

test("carouselCss lays every library's track out as a grid and hides its chrome", () => {
  const css = carouselCss();
  for (const track of [".swiper-wrapper", ".slick-track", ".owl-stage", ".carousel-inner"]) {
    assert.ok(ruleWith(css, `${track} { display: grid !important`), track);
  }
  assert.ok(ruleWith(css, "display: none !important").includes('[aria-roledescription="carousel"] > button'));
  assert.ok(ruleWith(css, ".swiper-button-prev, .swiper-button-next").includes("display: none !important"));
});

test("pagePrepScript is valid JavaScript", () => {
  assert.doesNotThrow(() => new Function(pagePrepScript()));
});

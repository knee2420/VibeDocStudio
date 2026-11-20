import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GOV_RFP_PACK,
  NAVER_TRAVEL_BLOG_PACK,
  YESFORM_OFFICIAL_PACK,
  YONHAP_NEWS_PACK,
  adaptLegacyBlockOverrides,
  buildStyleCssVars,
  resolveFrameStyle,
  resolveMediaGridStyle,
  resolvePageGridStyle,
  resolveStylePack,
  resolveTableGridStyle,
  resolveTextRoleStyle,
} from "../src/index";

describe("@vibe/style-core — All 5 Grid Style Kits & Adapters", () => {
  it("resolves all 5 Grid Kits cleanly for Naver Travel Blog vs Yonhap News", () => {
    const blog = resolveStylePack(NAVER_TRAVEL_BLOG_PACK);
    const news = resolveStylePack(YONHAP_NEWS_PACK);

    // 1. Page Grid Kit
    assert.equal(resolvePageGridStyle(blog, "blog").width, 720);
    assert.equal(resolvePageGridStyle(news, "web").width, 740);

    // 2. Typography Kit
    assert.equal(resolveTextRoleStyle(blog, "body").align, "center");
    assert.equal(resolveTextRoleStyle(blog, "body").fontSize, "14px");
    assert.equal(resolveTextRoleStyle(news, "body").align, "left");
    assert.equal(resolveTextRoleStyle(news, "body").fontSize, "16px");

    // 3. Frame Kit
    assert.equal(resolveFrameStyle(blog, "info-frame").ornament, "quote-left-underline");
    assert.equal(resolveFrameStyle(blog, "info-frame").titleColor, "#047857");
    assert.equal(resolveFrameStyle(news, "info-frame").ornament, "left-bar");
    assert.equal(resolveFrameStyle(news, "info-frame").titleColor, "#2563eb");
    assert.equal(resolveFrameStyle(blog, "cta").chevron, true);
    assert.equal(resolveFrameStyle(news, "cta").chevron, false);

    // 4. Media Grid Kit
    assert.equal(resolveMediaGridStyle(blog).stripGap, 4);
    assert.equal(resolveMediaGridStyle(blog).captionAlign, "center");
    assert.equal(resolveMediaGridStyle(news).stripGap, 10);
    assert.equal(resolveMediaGridStyle(news).captionAlign, "left");

    // 5. CSS Custom Properties adapter
    const blogVars = buildStyleCssVars(blog);
    assert.equal(blogVars["--vstyle-page-width"], "720px");
    assert.equal(blogVars["--vstyle-body-align"], "center");
    assert.equal(blogVars["--vstyle-media-gap"], "4px");
  });

  it("resolves Korean official form vs Gov RFP Table Grid Kits and absorbs legacy inline overrides", () => {
    const yesform = resolveStylePack(YESFORM_OFFICIAL_PACK);
    const rfp = resolveStylePack(GOV_RFP_PACK);

    const yesTable = resolveTableGridStyle(yesform);
    assert.equal(yesTable.borders.outer, "2px solid #000000");
    assert.equal(yesTable.borders.vertical, "1px solid #000000");
    assert.equal(yesTable.headerFill, "#ffffff");
    assert.equal(yesTable.headerLetterSpacing, "0.35em");

    const rfpTable = resolveTableGridStyle(rfp);
    assert.equal(rfpTable.borders.headerTop, "2px solid #1e3a8a");
    assert.equal(rfpTable.headerFill, "#e6ecf5");
    assert.equal(rfpTable.headerTextColor, "#1e3a8a");

    // Legacy bridge converts inline borderRules into InstanceOverride cleanly
    const legacyDelta = adaptLegacyBlockOverrides({
      kind: "structured-table",
      borderRules: { outer: "3px solid #dc2626" },
      cellPadding: "12px",
    });
    const merged = resolveTableGridStyle(rfp, "default", undefined, legacyDelta);
    assert.equal(merged.borders.outer, "3px solid #dc2626");
    assert.equal(merged.cellPadding, "12px");
  });
});

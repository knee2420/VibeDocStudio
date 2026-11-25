import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GOV_RFP_PACK,
  NAVER_TRAVEL_BLOG_PACK,
  STANDARD_BASE_STYLE_PACK,
  YESFORM_OFFICIAL_PACK,
  YONHAP_NEWS_PACK,
  adaptLegacyBlockOverrides,
  buildStyleCssVars,
  formatPageFooterTemplate,
  resolveFrameStyle,
  resolveMediaGridStyle,
  resolvePageGridStyle,
  resolveStylePack,
  resolveTableCellStyle,
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

  it("resolves orthogonal 4-edge borders, dotted open cell roles, text prefix, hanging indent, footer template, and open extensions", () => {
    const rfp = resolveStylePack(GOV_RFP_PACK);

    // 1. Open-sided table variant (image 3/4 style): top/bottom thick black, left/right NONE
    const openList = resolveTableGridStyle(rfp, "open-list");
    assert.equal(openList.borders.outerTop, "2px solid #000000");
    assert.equal(openList.borders.outerBottom, "1.5px solid #000000");
    assert.equal(openList.borders.outerLeft, "none");
    assert.equal(openList.borders.outerRight, "none");
    assert.equal(openList.borders.headerBottom, "1.5px solid #000000");
    assert.equal(openList.borders.rowBottom, "0.75px solid #000000");
    assert.deepEqual(openList.columnWidths, ["8%", "17%", "15%", "60%"]);

    // Dotted open cell role inheritance: value.seq inherits value's fill/fontSize and overrides align/tabular-nums
    const seqCell = resolveTableCellStyle(openList, "value.seq");
    assert.equal(seqCell.fill, "#ffffff");
    assert.equal(seqCell.fontSize, "12.5px");
    assert.equal(seqCell.align, "center");
    assert.equal(seqCell.vAlign, "middle");
    assert.equal(seqCell.fontVariantNumeric, "tabular-nums");
    assert.equal(seqCell.whiteSpace, "nowrap");

    const hdrCell = resolveTableCellStyle(openList, "column-header");
    assert.equal(hdrCell.fill, "#dce6f1");
    assert.equal(hdrCell.align, "center");
    assert.equal(hdrCell.fontWeight, "700");

    // 2. Closed spec table variant (ECR-05 style): closed black box + hanging-indent body cell
    const closedSpec = resolveTableGridStyle(rfp, "closed-spec");
    assert.equal(closedSpec.borders.outerLeft, "1.5px solid #000000");
    assert.equal(closedSpec.borders.outerRight, "1.5px solid #000000");
    const bodyCell = resolveTableCellStyle(closedSpec, "body");
    assert.equal(bodyCell.vAlign, "top");
    assert.equal(bodyCell.listIndent, "1.1em");
    assert.equal(bodyCell.hangingIndent, "-0.7em");

    // 3. Heading prefix & page footer template (data-driven, zero hardcoded enums)
    const listHeading = resolveTextRoleStyle(rfp, "list-heading");
    assert.equal(listHeading.prefix, "□ ");
    assert.equal(listHeading.align, "left");
    const pageGrid = resolvePageGridStyle(rfp, "a4");
    assert.equal(pageGrid.footerTemplate, "- {page} -");
    assert.equal(formatPageFooterTemplate(pageGrid.footerTemplate, 10, 42), "- 10 -");

    // 4. Open target & extensions namespace resolves aliases cleanly for arbitrary future mediums
    const snsPack = resolveStylePack({
      ...STANDARD_BASE_STYLE_PACK,
      id: "sns-card-demo",
      target: "sns",
      extensions: {
        sns: { aspectRatio: "4:5", accent: "{text.accent}" },
      },
    });
    assert.equal(snsPack.target, "sns");
    assert.equal(snsPack.extensions?.sns?.aspectRatio, "4:5");
    assert.equal(snsPack.extensions?.sns?.accent, "#2563eb");
  });
});

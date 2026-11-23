import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryVaultAdapter } from "@vibe/vault-core";
import {
  NAVER_TRAVEL_BLOG_PACK,
  YESFORM_OFFICIAL_PACK,
  resolveStylePack,
  resolveTextRoleStyle,
} from "@vibe/style-core";
import type {
  CalloutBoxBlockDef,
  ColumnsGridBlockDef,
  LinkCardBlockDef,
  StructuredTableBlockDef,
  TextBlockDef,
  VDocDocument,
} from "@vibe/vdoc-schema";

import {
  applyGridRatioPreset,
  applyTableColumnRatio,
  applyTableNestedListMarker,
  applyTableVisualPreset,
  buildStyleRefForEntry,
  collectVaultStyleEntries,
  convertCalloutToText,
  convertTextToCallout,
  detectTableNestedListMarker,
  reorderPageByOffset,
  resolveAccentPaletteChips,
  resolveActiveStyleEntry,
  resolveBlockStyleBinding,
  swapTwoGridColumns,
  toggleTableTopRowHeader,
} from "../model/vdocInspectorModel";
import { createDefaultVDoc } from "../model/vdocCodec";

describe("v2-ide — Figma-style WYSIWYM VDoc Inspector Model", () => {
  it("discovers Vault .vstyle packs alongside built-in packs and builds clean VDocStyleRef pointers", () => {
    const customPack = {
      ...NAVER_TRAVEL_BLOG_PACK,
      id: "custom-blog-skin",
      name: "커스텀 블로그 스킨",
    };
    const vault = new MemoryVaultAdapter({
      id: "test-vault",
      name: "Test",
      initialEntries: [
        {
          path: "styles/custom-blog-skin.vstyle",
          kind: "file",
          content: JSON.stringify(customPack),
        },
      ],
    });

    const catalog = collectVaultStyleEntries(vault);
    const customEntry = catalog.find((e) => e.id === "custom-blog-skin");
    assert.ok(customEntry, "should discover custom .vstyle in vault");
    assert.equal(customEntry.source, "vault");
    assert.equal(customEntry.vaultPath, "styles/custom-blog-skin.vstyle");

    const ref = buildStyleRefForEntry(customEntry);
    assert.equal(ref.packId, "custom-blog-skin");
    assert.equal(ref.packPath, "vault://styles/custom-blog-skin.vstyle");
    assert.equal(ref.mode, "default");

    const doc: VDocDocument = {
      ...createDefaultVDoc("Blog Test", "blog"),
      styleRef: ref,
    };
    const active = resolveActiveStyleEntry(doc, vault, catalog);
    assert.equal(active?.id, "custom-blog-skin");
  });

  it("resolves semantic accent palette tokens from StylePack without raw HEX authoring", () => {
    const chips = resolveAccentPaletteChips(NAVER_TRAVEL_BLOG_PACK, "default");
    assert.equal(chips.length, 5);
    const pink = chips.find((c) => c.key === "pink");
    assert.ok(pink);
    assert.equal(pink.fill, "#fde2e4");
    const emerald = chips.find((c) => c.key === "emerald");
    assert.ok(emerald);
    assert.equal(emerald.color, "#059669");
  });

  it("matches exact StylePack binding selectors for callout variants, CTA link-cards, and photo strips", () => {
    const infoFrame: CalloutBoxBlockDef = {
      blockId: "b1",
      kind: "callout-box",
      title: "스피어",
      slotId: "s1",
      variant: "info-frame",
    };
    const cta: LinkCardBlockDef = {
      blockId: "b2",
      kind: "link-card",
      title: "할인받기",
      slotId: "s2",
      url: "https://example.com",
      variant: "cta",
    };
    const strip: ColumnsGridBlockDef = {
      blockId: "b3",
      kind: "columns-grid",
      title: "사진 2장",
      widths: ["2fr", "1fr"],
      cardStyle: "plain",
    };

    const m1 = resolveBlockStyleBinding(infoFrame, NAVER_TRAVEL_BLOG_PACK);
    assert.equal(m1?.selector, "callout-box[variant=info-frame]");
    assert.equal(m1?.binding.frameStyle, "info-frame");

    const m2 = resolveBlockStyleBinding(cta, NAVER_TRAVEL_BLOG_PACK);
    assert.equal(m2?.selector, "link-card[variant=cta]");
    assert.equal(m2?.binding.frameStyle, "cta");

    const m3 = resolveBlockStyleBinding(strip, NAVER_TRAVEL_BLOG_PACK);
    assert.equal(m3?.selector, "columns-grid[cardStyle=plain]");
    assert.equal(m3?.binding.mediaStyle, "strip");
  });

  it("reorders sections cleanly and renumbers pageNumber 1..N", () => {
    const base = createDefaultVDoc("Blog", "blog");
    const doc: VDocDocument = {
      ...base,
      pages: [
        { ...base.pages[0], pageId: "sec_1", pageNumber: 1, pageLabel: "도입부" },
        { ...base.pages[0], pageId: "sec_2", pageNumber: 2, pageLabel: "팁" },
        { ...base.pages[0], pageId: "sec_3", pageNumber: 3, pageLabel: "스팟" },
      ],
    };

    const movedDown = reorderPageByOffset(doc, "sec_1", 1);
    assert.deepEqual(
      movedDown.pages.map((p) => [p.pageId, p.pageNumber]),
      [
        ["sec_2", 1],
        ["sec_1", 2],
        ["sec_3", 3],
      ]
    );
    // Boundary no-op
    assert.equal(reorderPageByOffset(movedDown, "sec_2", -1), movedDown);
  });

  it("promotes text <-> callout-box while preserving slotId, and swaps 2-column grid presets", () => {
    const text: TextBlockDef = {
      blockId: "blk_1",
      kind: "text",
      title: "핵심 요약",
      slotId: "slot_1",
      align: "center",
    };
    const promoted = convertTextToCallout(text, "accent-bar");
    assert.equal(promoted.kind, "callout-box");
    assert.equal(promoted.slotId, "slot_1");
    assert.equal(promoted.variant, "accent-bar");
    assert.equal(promoted.accentColor, "pink");

    const demoted = convertCalloutToText(promoted);
    assert.equal(demoted.kind, "text");
    assert.equal(demoted.slotId, "slot_1");

    const grid: ColumnsGridBlockDef = {
      blockId: "blk_g",
      kind: "columns-grid",
      title: "사진 스트립",
      widths: ["1fr", "1fr"],
      cardStyle: "plain",
      columns: [
        { image: { src: "a.jpg", alt: "A" } },
        { image: { src: "b.jpg", alt: "B" } },
      ],
    };
    const ratioed = applyGridRatioPreset(grid, ["2fr", "1fr"]);
    assert.deepEqual(ratioed.widths, ["2fr", "1fr"]);

    const swapped = swapTwoGridColumns(ratioed);
    assert.deepEqual(swapped.widths, ["1fr", "2fr"]);
    assert.equal(swapped.columns?.[0]?.image?.src, "b.jpg");
    assert.equal(swapped.columns?.[1]?.image?.src, "a.jpg");
  });

  it("manages table visual presets, column ratios, header toggle, and nested list markers in Inspector + .vstyle", () => {
    const resolvedForm = resolveStylePack(YESFORM_OFFICIAL_PACK, "default");
    assert.equal(resolveTextRoleStyle(resolvedForm, "body").listMarker, "circle");

    const resolvedBlog = resolveStylePack(NAVER_TRAVEL_BLOG_PACK, "default");
    assert.equal(resolveTextRoleStyle(resolvedBlog, "body").listMarker, "disc");

    const table: StructuredTableBlockDef = {
      blockId: "tbl_1",
      kind: "structured-table",
      title: "법률 표",
      columnWidths: ["50%", "50%"],
      rows: [
        {
          rowId: "r1",
          cells: [
            { cellId: "c1", slotId: "s1", isHeader: true },
            { cellId: "c2", slotId: "s2", isHeader: true },
          ],
        },
        {
          rowId: "r2",
          cells: [
            { cellId: "c3", slotId: "s3", isHeader: false },
            {
              cellId: "c4",
              slotId: "s4",
              isHeader: false,
              blocks: [{ blockId: "nl_1", kind: "text", title: "법률 목록", slotId: "s_nl1" }],
            },
          ],
        },
      ],
    };

    const ratioed = applyTableColumnRatio(table, [18, 82]);
    assert.deepEqual(ratioed.columnWidths, ["18%", "82%"]);

    const official = applyTableVisualPreset(ratioed, "official-form");
    assert.equal(official.borderRules?.outer, "none");
    assert.equal(official.rows[0].cells[0].borderTop, "1.5px solid #0f172a");
    assert.equal(official.rows[1].cells[0].borderBottom, "1.5px solid #0f172a");

    const circled = applyTableNestedListMarker(official, "circle");
    assert.deepEqual(detectTableNestedListMarker(circled), {
      hasNestedText: true,
      marker: "circle",
    });

    const toggled = toggleTableTopRowHeader(circled);
    assert.equal(toggled.rows[0].cells[0].isHeader, false);
    assert.equal(toggled.rows[0].cells[1].isHeader, false);
  });
});

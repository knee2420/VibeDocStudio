import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BUILTIN_STYLE_PACKS,
  NAVER_TRAVEL_BLOG_PACK,
  VSTYLE_PROTOCOL,
  createStylePackRegistry,
  pushOverrideToPack,
  resetStyleOverrides,
  resolveAliasValue,
  resolveCascadedStyle,
  resolveStylePack,
  type StyleOverrideDelta,
} from "../src/index";

describe("@vibe/style-core — Registry CRUD, Alias Resolver & 4-Tier Cascade", () => {
  it("resolves recursive {alias} references safely and defends against circular references", () => {
    const primitives = { "color.brand": "#047857", "space.sm": "8px" };
    const semantic = {
      "text.accent": "{color.brand}",
      "border.accent": "2px solid {text.accent}",
      "loop.a": "{loop.b}",
      "loop.b": "{loop.a}",
    };

    assert.equal(resolveAliasValue("{text.accent}", semantic, primitives), "#047857");
    assert.equal(resolveAliasValue("{border.accent}", semantic, primitives), "2px solid #047857");
    assert.equal(resolveAliasValue("{missing.token}", semantic, primitives), "{missing.token}");
    // Circular reference terminates safely without stack overflow
    assert.equal(resolveAliasValue("{loop.a}", semantic, primitives), "{loop.a}");
  });

  it("supports full CRUD lifecycle, JSON import/export, Reset Overrides, and Push Override to Pack", () => {
    const reg = createStylePackRegistry(BUILTIN_STYLE_PACKS);
    assert.equal(reg.list().length, 4);
    assert.ok(reg.get("naver-travel-blog"));
    assert.ok(reg.get("yonhap-news"));
    assert.ok(reg.get("yesform-official"));
    assert.ok(reg.get("gov-rfp"));

    // Create custom pack
    const custom = reg.create({
      ...NAVER_TRAVEL_BLOG_PACK,
      protocol: VSTYLE_PROTOCOL,
      id: "custom-minimal-blog",
      name: "미니멀 블로그",
    });
    assert.equal(custom.id, "custom-minimal-blog");

    // Update pack
    const updated = reg.update("custom-minimal-blog", { version: "1.1.0", name: "미니멀 블로그 v2" });
    assert.equal(updated.version, "1.1.0");
    assert.equal(updated.name, "미니멀 블로그 v2");

    // Export / Import round-trip
    const json = reg.exportPackJson("custom-minimal-blog");
    const reg2 = createStylePackRegistry();
    const imported = reg2.importPackJson(json);
    assert.equal(imported.name, "미니멀 블로그 v2");

    // Delete pack
    assert.equal(reg.delete("custom-minimal-blog"), true);
    assert.equal(reg.get("custom-minimal-blog"), undefined);

    // Reset & Push Override (Figma Instance Override workflow)
    const blockWithOverride: { id: string; styleOverrides?: StyleOverrideDelta } = {
      id: "blk_1",
      styleOverrides: { frame: { titleColor: "#be123c" }, text: { fontSize: "17px" } },
    };
    const pushed = pushOverrideToPack(
      NAVER_TRAVEL_BLOG_PACK,
      "callout-box[variant=info-frame]",
      blockWithOverride.styleOverrides!
    );
    assert.equal(pushed.styles.frame["info-frame"].titleColor, "#be123c");
    assert.equal(pushed.styles.text.spotTitle.fontSize, "17px");

    const reset = resetStyleOverrides(blockWithOverride);
    assert.equal(reset.styleOverrides, undefined);
  });

  it("merges styles in strict 4-tier cascade order: Pack Mode -> Binding -> Section Override -> Instance Override", () => {
    const resolved = resolveStylePack(NAVER_TRAVEL_BLOG_PACK, "default");

    const cascaded = resolveCascadedStyle(
      resolved,
      "callout-box[variant=info-frame]",
      { frame: { borderBottom: "2px solid #0f172a", kvMarker: "•" } },
      { frame: { titleColor: "#7c3aed" } }
    );

    // Tier 1+2 (Pack + Binding)
    assert.equal(cascaded.frame.ornament, "quote-left-underline");
    // Tier 3 (Section Override)
    assert.equal(cascaded.frame.borderBottom, "2px solid #0f172a");
    assert.equal(cascaded.frame.kvMarker, "•");
    // Tier 4 (Instance Override wins)
    assert.equal(cascaded.frame.titleColor, "#7c3aed");
  });
});

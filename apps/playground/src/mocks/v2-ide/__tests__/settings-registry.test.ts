import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createFileExplorerStore } from "@vibe/file-explorer/core";
import { MemoryVaultAdapter } from "@vibe/vault-core";
import { createDefaultRegistrySnapshot } from "@vibe/vdoc-schema";
import { createIdeEditorRegistry } from "../model/editorAdapters";
import { SETTINGS_GROUPS, createSettingsSectionRegistry } from "../model/settingsSectionRegistry";
import {
  STANDARD_STYLE_PATH,
  STANDARD_SYNTAX_PATH,
  createDefaultStylePackJson,
  createDefaultSyntaxJson,
  createStandardBaseStyleJson,
  detectSyntaxRuleConflicts,
  getDefaultRuleSymbol,
  isStylePath,
  isSyntaxPath,
  isSyntaxRuleModified,
  isSystemSettingsPath,
  parseStylePackJson,
  parseSyntaxSnapshot,
  serializeStylePack,
  serializeSyntaxSnapshot,
} from "@vibe/vault-formats";

describe("v2-ide — Obsidian Settings Platform & Code-as-Doc (.vsyntax / .vstyle)", () => {
  it("matches .vsyntax, .vstyle, and legacy .vstyle.json paths and resolves first-class EditorAdapters", () => {
    assert.equal(isSyntaxPath("schema/element-registry.vsyntax"), true);
    assert.equal(isSyntaxPath("schema/element-registry.json"), false);

    assert.equal(isStylePath("schema/styles/naver-travel-blog.vstyle"), true);
    assert.equal(isStylePath("schema/styles/legacy.vstyle.json"), true);
    assert.equal(isStylePath("schema/styles/plain.json"), false);

    const registry = createIdeEditorRegistry();
    const syntaxAdapter = registry.resolveDefault("schema/element-registry.vsyntax");
    assert.equal(syntaxAdapter?.id, "vibe-syntax");
    assert.equal(syntaxAdapter?.capabilities?.supportsSourceToggle, true);
    assert.ok(syntaxAdapter?.OutlineComponent);

    const styleAdapter = registry.resolveDefault("schema/styles/naver-travel-blog.vstyle");
    assert.equal(styleAdapter?.id, "vibe-style");
    assert.equal(styleAdapter?.capabilities?.supportsSourceToggle, true);
    assert.ok(styleAdapter?.OutlineComponent);

    // Legacy .vstyle.json compatibility
    assert.equal(registry.resolveDefault("schema/styles/old.vstyle.json")?.id, "vibe-style");
  });

  it("detects symbol conflicts strictly within each Element scope (cross-element '|' does NOT conflict)", () => {
    const snap = createDefaultRegistrySnapshot();
    // Default registry has '|' in both `table` and `section` — must report 0 conflicts!
    const cleanReport = detectSyntaxRuleConflicts(snap);
    assert.equal(cleanReport.totalConflicts, 0);
    assert.equal(cleanReport.conflictedRuleKeys.size, 0);

    // Mutate table's empty-slot to '|' -> collides with table's col-split '|'
    const mutated = {
      ...snap,
      elements: snap.elements.map((el) =>
        el.id === "table"
          ? {
              ...el,
              rules: el.rules.map((r) => (r.id === "empty-slot" ? { ...r, symbol: "|" } : r)),
            }
          : el
      ),
    };
    const conflictReport = detectSyntaxRuleConflicts(mutated);
    assert.equal(conflictReport.totalConflicts, 2);
    assert.equal(conflictReport.conflictedRuleKeys.has("table:col-split"), true);
    assert.equal(conflictReport.conflictedRuleKeys.has("table:empty-slot"), true);
    assert.equal(conflictReport.conflictedRuleKeys.has("section:horizontal-split"), false);

    // Scoped check for section still reports 0 conflicts
    assert.equal(detectSyntaxRuleConflicts(mutated, "section").totalConflicts, 0);
    assert.equal(detectSyntaxRuleConflicts(mutated, "table").totalConflicts, 2);
  });

  it("tracks default symbols and modified/custom rules accurately", () => {
    const snap = createDefaultRegistrySnapshot();
    const tableEl = snap.elements.find((e) => e.id === "table");
    assert.ok(tableEl);
    const colSplit = tableEl.rules.find((r) => r.id === "col-split");
    assert.ok(colSplit);

    assert.equal(getDefaultRuleSymbol("table", "col-split"), "|");
    assert.equal(isSyntaxRuleModified("table", colSplit), false);
    assert.equal(isSyntaxRuleModified("table", { ...colSplit, symbol: "::" }), true);
    assert.equal(
      isSyntaxRuleModified("table", {
        ...colSplit,
        id: "custom-rule-1",
        symbol: "=>",
      }),
      true
    );
  });

  it("round-trips .vsyntax and .vstyle JSON codecs cleanly without data loss", () => {
    const rawSyntax = createDefaultSyntaxJson("테스트 규격");
    const parsedSyntax = parseSyntaxSnapshot(rawSyntax);
    assert.equal(parsedSyntax.description, "테스트 규격 — 문서 요소 · 표현 기호 규격");
    assert.ok(parsedSyntax.elements.length >= 2);
    assert.ok(parsedSyntax.profiles.length >= 3);
    const reserializedSyntax = serializeSyntaxSnapshot(parsedSyntax);
    assert.equal(parseSyntaxSnapshot(reserializedSyntax).elements.length, parsedSyntax.elements.length);

    const rawStyle = createDefaultStylePackJson("사내 기획서");
    const parsedStyle = parseStylePackJson(rawStyle);
    assert.ok(parsedStyle);
    assert.equal(parsedStyle.name, "사내 기획서");
    assert.equal(parsedStyle.id, "사내-기획서");
    const reserializedStyle = serializeStylePack(parsedStyle);
    assert.equal(parseStylePackJson(reserializedStyle)?.name, "사내 기획서");
  });

  it("supports extensible SettingsSectionRegistry registration and keyword search", () => {
    assert.deepEqual(
      SETTINGS_GROUPS.map((g) => g.id),
      ["options", "elements", "styles", "ai-harness"]
    );

    const reg = createSettingsSectionRegistry([
      {
        id: "options:syntax",
        group: "options",
        label: "표현 기호",
        icon: null,
        keywords: ["단축키", "hotkeys", "vsyntax"],
        render: () => null,
      },
      {
        id: "ai:models",
        group: "ai-harness",
        label: "모델 · 공급자",
        subtitle: "LLM 라우팅",
        icon: null,
        keywords: ["ai", "gemini", "gemma"],
        render: () => null,
      },
    ]);

    reg.register({
      id: "ai:custom-plugin",
      group: "ai-harness",
      label: "커스텀 크롤러 플러그인",
      icon: null,
      keywords: ["crawler", "예스폼"],
      render: () => null,
    });

    assert.equal(reg.listAll().length, 3);
    assert.equal(reg.search("gemini").map((s) => s.id).join(","), "ai:models");
    assert.equal(reg.search("예스폼").map((s) => s.id).join(","), "ai:custom-plugin");
    assert.equal(reg.search("").length, 3);
  });

  it("hides .vibedoc global standard specs from FileExplorer while keeping them accessible via VaultPort", () => {
    assert.equal(isSystemSettingsPath(STANDARD_SYNTAX_PATH), true);
    assert.equal(isSystemSettingsPath(STANDARD_STYLE_PATH), true);
    assert.equal(isSystemSettingsPath("문서 스키마 표준 정비 프로젝트/naver-travel-blog.vstyle"), false);

    const stdPack = parseStylePackJson(createStandardBaseStyleJson());
    assert.ok(stdPack);
    assert.equal(stdPack.id, "standard-base");
    assert.equal(stdPack.genre, "standard");
    assert.equal(stdPack.styles.text.body?.align, "left");

    const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
    vault.createFile(STANDARD_SYNTAX_PATH, createDefaultSyntaxJson("표준"));
    vault.createFile(STANDARD_STYLE_PATH, createStandardBaseStyleJson());
    vault.createFile("blog/naver-travel-blog.vstyle", createDefaultStylePackJson("블로그"));
    const explorer = createFileExplorerStore(vault, { initialExpandedPaths: ["blog"] });
    const visiblePaths = explorer.getState().rows.map((r) => r.path);
    assert.equal(visiblePaths.some((p) => p.startsWith(".vibedoc")), false);
    assert.equal(visiblePaths.includes("blog/naver-travel-blog.vstyle"), true);
    assert.equal(vault.exists(STANDARD_SYNTAX_PATH), true);
    assert.equal(vault.exists(STANDARD_STYLE_PATH), true);
  });
});

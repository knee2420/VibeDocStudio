import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getAllGroups } from "@vibe/workspace-layout/core";
import { createIdeWorkbenchRuntime } from "../model/useIdeWorkbench";
import { parseVDocJson, projectVDocToStructure } from "../model/vdocCodec";

describe("v2-ide — 2D-First Workbench Integration (Vault + Explorer + Layout + Markdown + 2D VDoc)", () => {
  it("boots 2D-First (.vdoc + CM6 .md), projects Figma Pages & Elements, rewrites .vdoc/.md pointers, and runs 2D AI directing", () => {
    const rt = createIdeWorkbenchRuntime({ persist: false });

    // 1. Seeded 2D-First workspace with Chrome Tab Group ("Architecture Pair": .vdoc + .md) + sibling tab
    assert.equal(rt.layout.getState().getGroupCount(), 1);
    assert.equal(rt.layout.getState().getActiveTab()?.resourceId, "01. Architecture/00. System-Proposal.vdoc");
    assert.equal(rt.layout.getState().getActiveTab()?.viewType, "vibe-vdoc");
    const initialGroupId = rt.layout.getState().getActiveTab()?.tabGroupId;
    assert.ok(initialGroupId);
    assert.equal(rt.layout.getState().tabGroups[initialGroupId]?.title, "Architecture Pair");

    // 1b. "크게 보기" focuses & maximizes the Chrome Tab Group as 1 full-width pane (hiding sibling tabs),
    //     and "되돌리기" restores all sibling tabs cleanly!
    assert.equal(rt.layout.getState().getActiveGroup()?.tabs.length, 3);
    rt.layout.getState().expandTabGroup(initialGroupId);
    assert.equal(rt.layout.getState().getGroupCount(), 1);
    assert.equal(rt.layout.getState().getActiveGroup()?.tabs.length, 2);
    assert.equal(rt.layout.getState().expandedTabGroup?.tabGroupId, initialGroupId);
    rt.layout.getState().restoreExpandedTabGroup();
    assert.equal(rt.layout.getState().getGroupCount(), 1);
    assert.equal(rt.layout.getState().getActiveGroup()?.tabs.length, 3);
    assert.equal(rt.layout.getState().expandedTabGroup, null);

    // 2. EditorRegistry resolves .vdoc & .vdoc.json to vibe-vdoc with acceptsCanvasDrop=true + OutlineComponent,
    //    and resolves binary media files (.png/.jpg/.svg/.webp/.pdf) to read-only streaming viewers.
    const vdocAdapter = rt.editorRegistry.resolveDefault("01. Architecture/00. System-Proposal.vdoc");
    assert.equal(vdocAdapter?.id, "vibe-vdoc");
    assert.equal(vdocAdapter?.capabilities?.acceptsCanvasDrop, true);
    assert.ok(vdocAdapter?.OutlineComponent);
    assert.equal(rt.editorRegistry.resolveDefault("legacy/document.vdoc.json")?.id, "vibe-vdoc");
    assert.equal(rt.editorRegistry.resolveDefault("assets/hero.png")?.id, "media-image");
    assert.equal(rt.editorRegistry.resolveDefault("assets/photo.jpg")?.id, "media-image");
    assert.equal(rt.editorRegistry.resolveDefault("assets/diagram.svg")?.id, "media-image");
    assert.equal(rt.editorRegistry.resolveDefault("assets/preview.webp")?.id, "media-image");
    assert.equal(rt.editorRegistry.resolveDefault("docs/manual.pdf")?.id, "media-pdf");

    // 3. Figma Document Structure projection produces Pages + Elements from .vdoc
    const sampleDoc = parseVDocJson(
      rt.vault.read("01. Architecture/00. System-Proposal.vdoc"),
      "System-Proposal"
    );
    const structure = projectVDocToStructure(sampleDoc, "page-1", "blk-p1-table", null, new Set());
    assert.equal(structure.pages.length, 2);
    assert.equal(structure.elements.length, 4);
    assert.equal(structure.elements[2].active, true);

    // 4. Rename a referenced .md file -> updates BOTH .md [[wikilinks]] AND .vdoc vault:// link-card pointers!
    rt.vault.rename("01. Architecture/01. Vault-Contract.md", "01. Vault-Contract-V2.md");
    const updatedVDocRaw = rt.vault.read("01. Architecture/00. System-Proposal.vdoc");
    assert.ok(updatedVDocRaw.includes("vault://01. Architecture/01. Vault-Contract-V2.md"));
    const checklistRaw = rt.vault.read("01. Architecture/02. Layout-Parity-Checklist.md");
    assert.ok(checklistRaw.includes("[[01. Vault-Contract-V2|Vault 계약 문서]]"));

    // 5. 2D-First AI Directing: creates real .md file in Vault, sets AI badge in FileExplorer, appends LinkCard to .vdoc!
    rt.explorer.getState().collapseAll();
    const res = rt.executeAiDirective({
      resourceId: "01. Architecture/00. System-Proposal.vdoc",
      prompt: "API 상세 스펙 추출",
      action: "extract-md",
      selection: {
        resourceId: "01. Architecture/00. System-Proposal.vdoc",
        kind: "canvas-nodes",
        summary: "Page 1 › 핵심 2단 요약",
        text: "2D-First 디렉팅 요약",
        pageId: "page-1",
        blockIds: ["blk-p1-grid"],
      },
    });
    assert.ok(res.createdPath && rt.vault.exists(res.createdPath));
    assert.equal(rt.explorer.getState().recentBadges.get(res.createdPath), "AI");
    assert.equal(rt.explorer.getState().expandedPaths.has("01. Architecture"), true);
    const docAfterDirect = parseVDocJson(
      rt.vault.read("01. Architecture/00. System-Proposal.vdoc"),
      "System-Proposal"
    );
    assert.equal(docAfterDirect.pages[0].blocks.length, 5);
    assert.ok(rt.vault.read("01. Architecture/00. System-Proposal.vdoc").includes(`vault://${res.createdPath}`));

    // 6. Open With (setTabViewType) switches .vdoc tab to Raw Source / Code seamlessly
    const vdocTab = getAllGroups(rt.layout.getState().root)[0].tabs[0];
    rt.layout.getState().setTabViewType(vdocTab.id, "raw-code");
    assert.equal(getAllGroups(rt.layout.getState().root)[0].tabs[0].viewType, "raw-code");

    rt.dispose();
  });
});

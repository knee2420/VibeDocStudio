import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getAllGroups } from "@vibe/workspace-layout/core";
import { findOwningProjectPath } from "@vibe/vault-core";
import { applyDocumentView, resolveDocumentView } from "@vibe/vdoc-schema";
import { createEmptyRefDocument, parseRefJson, serializeRefJson } from "@vibe/ref-canvas/core";
import { createIdeWorkbenchRuntime } from "../model/useIdeWorkbench";
import { projectVDocToStructure } from "../model/vdocStructure";
import { detectVDocViewId, parseVDocJson, serializeVDocJson } from "@vibe/vault-formats";

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
    const refAdapter = rt.editorRegistry.resolveDefault("00. References/benchmark.ref");
    assert.equal(refAdapter?.id, "vibe-ref");
    assert.ok(refAdapter?.OutlineComponent);

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

  it("promotes a Vault file to .ref via promoteFileToRef and auto-rewrites vault:// source pointers on rename", async () => {
    const rt = createIdeWorkbenchRuntime({ persist: false });
    const refPath = await rt.promoteFileToRef("01. Architecture/01. Vault-Contract.md", "split-right");
    assert.ok(refPath && refPath.endsWith(".ref"));
    assert.equal(rt.vault.exists(refPath), true);
    assert.ok(rt.vault.read(refPath).includes("vault://01. Architecture/01. Vault-Contract.md"));

    // Rename the underlying Vault file -> `.ref` pointer updates automatically!
    rt.vault.rename("01. Architecture/01. Vault-Contract.md", "01. Vault-Contract-Moved.md");
    assert.ok(rt.vault.read(refPath).includes("vault://01. Architecture/01. Vault-Contract-Moved.md"));

    rt.dispose();
  });

  it("seeds a .vproj Project Folder with A4 & Blog .vdoc views and syncs open tabs on folder promotion/demotion", () => {
    const rt = createIdeWorkbenchRuntime({ persist: false });

    const a4Path = "04. Launch-Campaign.vproj/01. Launch-Proposal.vdoc";
    const blogPath = "04. Launch-Campaign.vproj/02. Launch-Blog-Post.vdoc";
    assert.equal(rt.vault.exists(a4Path), true);
    assert.equal(rt.vault.exists(blogPath), true);
    assert.equal(detectVDocViewId(rt.vault.read(a4Path)), "a4");
    assert.equal(detectVDocViewId(rt.vault.read(blogPath)), "blog");
    // 저장 후에도(본문이 길어도) 블로그 양식이 A4 로 뒤바뀌지 않는다.
    const resavedBlog = serializeVDocJson(parseVDocJson(rt.vault.read(blogPath), "Launch-Blog-Post"));
    assert.equal(detectVDocViewId(resavedBlog), "blog");
    assert.ok(resavedBlog.indexOf('"viewId"') < resavedBlog.indexOf('"pages"'));
    const bulkyBlog = JSON.stringify({ pages: [{ pageId: "p", note: "x".repeat(5000) }], slots: {}, viewId: "blog" });
    assert.equal(detectVDocViewId(bulkyBlog), "blog");
    assert.equal(findOwningProjectPath(blogPath), "04. Launch-Campaign.vproj");

    // Switch A4 -> Blog view via applyDocumentView without losing content
    const parsedA4 = parseVDocJson(rt.vault.read(a4Path), "Launch-Proposal");
    assert.equal(resolveDocumentView(parsedA4).showPagesSection, true);
    const switchedToBlog = applyDocumentView(parsedA4, "blog");
    assert.equal(resolveDocumentView(switchedToBlog).id, "blog");
    assert.equal(switchedToBlog.surface?.kind, "scroll");
    assert.equal(switchedToBlog.surface?.width, 720);
    assert.equal(resolveDocumentView(switchedToBlog).showPagesSection, false);

    // Open the blog doc, then demote its owning Project Folder -> tab path stays synced!
    rt.openVaultFile(blogPath, "new-tab");
    const demoted = rt.explorer.getState().toggleProjectFolder("04. Launch-Campaign.vproj");
    assert.equal(demoted.ok, true);
    assert.equal(demoted.newPath, "04. Launch-Campaign");
    assert.equal(
      rt.layout.getState().getActiveTab()?.resourceId,
      "04. Launch-Campaign/02. Launch-Blog-Post.vdoc"
    );

    rt.dispose();
  });
  it("names a .ref after the source title while its name is app-chosen, and keeps names a person chose", () => {
    const rt = createIdeWorkbenchRuntime({ persist: false });
    const folder = "01. Architecture";
    const blank = `${folder}/Reference 1.ref`;
    rt.vault.createFile(blank, serializeRefJson({ ...createEmptyRefDocument("Reference 1"), nameSource: "auto" }));

    const imported = (title: string) => ({
      ...createEmptyRefDocument(title),
      status: "framed" as const,
      frames: [{ frameId: "frame-1", index: 1, surfaceKind: "web-tile" as const, width: 1280, height: 2000, scrollY: 0 }],
    });

    // 1) Blank app-named file filled for the first time -> renamed to the original title.
    const titled = rt.importRefDocument(folder, imported("미국 여행: 라스베가스 정리"), { replacePath: blank });
    assert.equal(titled, `${folder}/미국 여행 라스베가스 정리.ref`);
    assert.equal(rt.vault.exists(blank), false);
    assert.equal(parseRefJson(rt.vault.read(titled!), "").nameSource, "auto");

    // 2) A person renames it -> marked as theirs, and a later re-import keeps their name.
    rt.vault.rename(titled!, "내 레퍼런스.ref");
    const mine = `${folder}/내 레퍼런스.ref`;
    assert.equal(parseRefJson(rt.vault.read(mine), "").nameSource, "user");
    const kept = rt.importRefDocument(folder, imported("다른 제목"), { replacePath: mine });
    assert.equal(kept, mine);

    // 3) A typed name on the import card wins over the source title.
    const blank2 = `${folder}/Reference 2.ref`;
    rt.vault.createFile(blank2, serializeRefJson({ ...createEmptyRefDocument("Reference 2"), nameSource: "auto" }));
    const typed = rt.importRefDocument(folder, imported("원본 제목"), { replacePath: blank2, fileName: "출장 메모" });
    assert.equal(typed, `${folder}/출장 메모.ref`);
    assert.equal(parseRefJson(rt.vault.read(typed!), "").nameSource, "user");

    rt.dispose();
  });
});

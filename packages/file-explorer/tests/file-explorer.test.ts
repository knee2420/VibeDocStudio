import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { MemoryVaultAdapter } from "@vibe/vault-core";
import { createFileExplorerStore } from "../src/core";

function createTestFixture() {
  const vault = new MemoryVaultAdapter({
    initialEntries: [
      { path: "01. Docs/Spec.outline", content: '{"rootNodes":[]}', ctime: 100, mtime: 300 },
      { path: "01. Docs/Notes/Deep.md", content: "# Deep", ctime: 150, mtime: 500 },
      { path: "02. Archive/Old.md", content: "# Old", ctime: 50, mtime: 100 },
      { path: "README.md", content: "# Root", ctime: 200, mtime: 400 },
    ],
  });
  const explorer = createFileExplorerStore(vault, {
    initialExpandedPaths: ["01. Docs"],
    initialAutoReveal: true,
  });
  return { vault, explorer };
}

describe("@vibe/file-explorer — Headless Obsidian Parity", () => {
  it("flattens visible rows respecting folders-first, expand state, and depth", () => {
    const { explorer } = createTestFixture();
    const rows = explorer.getState().rows;
    assert.deepEqual(
      rows.map((r) => `${r.depth}:${r.path}`),
      [
        "0:01. Docs",
        "1:01. Docs/Notes",
        "1:01. Docs/Spec.outline",
        "0:02. Archive",
        "0:README.md",
      ]
    );
    explorer.getState().dispose();
  });

  it("auto-reveals deep active file by expanding all ancestor folders", () => {
    const { explorer } = createTestFixture();
    assert.equal(explorer.getState().expandedPaths.has("01. Docs/Notes"), false);

    explorer.getState().setActiveFilePath("01. Docs/Notes/Deep.md");
    assert.equal(explorer.getState().expandedPaths.has("01. Docs/Notes"), true);
    assert.equal(
      explorer.getState().rows.some((r) => r.path === "01. Docs/Notes/Deep.md" && r.isActiveFile),
      true
    );
    explorer.getState().dispose();
  });

  it("toggles smart Collapse All / Expand All", () => {
    const { explorer } = createTestFixture();
    assert.equal(explorer.getState().hasAnyExpandedFolder, true);

    explorer.getState().toggleExpandCollapseAll();
    assert.equal(explorer.getState().hasAnyExpandedFolder, false);
    assert.equal(explorer.getState().rows.length, 3);

    explorer.getState().toggleExpandCollapseAll();
    assert.equal(explorer.getState().hasAnyExpandedFolder, true);
    assert.equal(explorer.getState().rows.length, 7);
    explorer.getState().dispose();
  });

  it("supports Shift range selection, toggle multi-selection, and keyboard arrow navigation", () => {
    const { explorer } = createTestFixture();
    explorer.getState().selectSingle("01. Docs");
    explorer.getState().selectRange("02. Archive");

    assert.deepEqual(Array.from(explorer.getState().selectedPaths).sort(), [
      "01. Docs",
      "01. Docs/Notes",
      "01. Docs/Spec.outline",
      "02. Archive",
    ]);

    explorer.getState().selectToggle("01. Docs/Notes");
    assert.equal(explorer.getState().selectedPaths.has("01. Docs/Notes"), false);

    // Keyboard navigation: Right on collapsed folder expands, Left collapses or jumps to parent
    explorer.getState().selectSingle("02. Archive");
    explorer.getState().handleArrowRight();
    assert.equal(explorer.getState().expandedPaths.has("02. Archive"), true);

    explorer.getState().handleArrowRight();
    assert.equal(explorer.getState().focusedPath, "02. Archive/Old.md");

    explorer.getState().handleArrowLeft();
    assert.equal(explorer.getState().focusedPath, "02. Archive");

    explorer.getState().handleArrowLeft();
    assert.equal(explorer.getState().expandedPaths.has("02. Archive"), false);
    explorer.getState().dispose();
  });

  it("handles inline rename with duplicate validation and vault synchronization", () => {
    const { vault, explorer } = createTestFixture();
    explorer.getState().startRename("01. Docs/Spec.outline");
    explorer.getState().updateRenameDraft("bad:name.outline");
    assert.ok(explorer.getState().renameState?.error);

    explorer.getState().updateRenameDraft("Architecture.outline");
    assert.equal(explorer.getState().renameState?.error, null);

    const res = explorer.getState().commitRename();
    assert.equal(res.ok, true);
    assert.equal(res.newPath, "01. Docs/Architecture.outline");
    assert.equal(vault.exists("01. Docs/Architecture.outline"), true);
    assert.equal(explorer.getState().focusedPath, "01. Docs/Architecture.outline");
    explorer.getState().dispose();
  });

  it("enforces DnD guardrails (rejects self, descendant, same-parent) and executes valid moves", () => {
    const { vault, explorer } = createTestFixture();
    const state = explorer.getState();

    assert.equal(state.canDrop(["01. Docs"], "01. Docs"), false);
    assert.equal(state.canDrop(["01. Docs"], "01. Docs/Notes"), false);
    assert.equal(state.canDrop(["01. Docs/Spec.outline"], "01. Docs"), false);
    assert.equal(state.canDrop(["01. Docs/Spec.outline"], "02. Archive"), true);

    const moved = state.dropPaths(["01. Docs/Spec.outline"], "02. Archive");
    assert.deepEqual(moved, ["02. Archive/Spec.outline"]);
    assert.equal(vault.exists("02. Archive/Spec.outline"), true);
    assert.equal(explorer.getState().expandedPaths.has("02. Archive"), true);
    explorer.getState().dispose();
  });

  it("deduplicates parent+child multi-delete and stays synced on external vault renames", () => {
    const { vault, explorer } = createTestFixture();
    explorer.getState().setActiveFilePath("01. Docs/Notes/Deep.md");

    // External vault rename updates activeFilePath and expandedPaths automatically!
    vault.rename("01. Docs", "01. Specs");
    assert.equal(explorer.getState().activeFilePath, "01. Specs/Notes/Deep.md");
    assert.equal(explorer.getState().expandedPaths.has("01. Specs/Notes"), true);

    // Multi-delete parent + child should not throw
    const deleted = explorer.getState().deletePaths([
      "01. Specs/Notes",
      "01. Specs/Notes/Deep.md",
    ]);
    assert.equal(deleted.length, 2);
    assert.equal(explorer.getState().activeFilePath, null);
    explorer.getState().dispose();
  });

  it("auto-expands parent folders and marks NEW/AI badges on external vault creation + creates .vdoc", () => {
    const { vault, explorer } = createTestFixture();
    explorer.getState().collapseAll();
    assert.equal(explorer.getState().expandedPaths.has("02. Archive"), false);

    // External creation (e.g. from 2D canvas / AI directing)
    vault.createFile("02. Archive/Generated.md", "# AI Draft");
    assert.equal(explorer.getState().expandedPaths.has("02. Archive"), true);
    const createdRow = explorer.getState().rows.find((r) => r.path === "02. Archive/Generated.md");
    assert.equal(createdRow?.recentBadge, "NEW");

    explorer.getState().markExternalChange("02. Archive/Generated.md", "AI");
    assert.equal(explorer.getState().recentBadges.get("02. Archive/Generated.md"), "AI");
    explorer.getState().clearRecentBadge("02. Archive/Generated.md");
    assert.equal(explorer.getState().recentBadges.has("02. Archive/Generated.md"), false);

    // Creating a .vdoc file from Explorer produces valid JSON
    const vdocRes = explorer.getState().createNewFile("", "vdoc");
    assert.ok(vdocRes.path.endsWith(".vdoc"));
    const parsed = JSON.parse(vault.read(vdocRes.path)) as { version?: string; pages?: unknown[] };
    assert.equal(parsed.version, "1.0.0");
    assert.ok(Array.isArray(parsed.pages) && parsed.pages.length === 1);
    explorer.getState().dispose();
  });

  it("supports schema-driven file and folder creation with custom baseName, contentFactory, and onCreated scaffold", () => {
    const { vault, explorer } = createTestFixture();

    const customFile = explorer.getState().createNewFile("01. Docs", "json", {
      baseName: "asset",
      contentFactory: (title) => JSON.stringify({ kind: "asset", title }),
    });
    assert.equal(customFile.path, "01. Docs/asset.json");
    assert.equal(vault.read(customFile.path), '{"kind":"asset","title":"asset"}');

    const customFolder = explorer.getState().createNewFolder("", {
      baseName: "Research",
      onCreated: (folderPath, v) => {
        v.createFolder(`${folderPath}/Collection`);
        v.createFile(`${folderPath}/README.md`, "# Research");
      },
    });
    assert.equal(customFolder.path, "Research");
    assert.equal(vault.exists("Research/Collection"), true);
    assert.equal(vault.exists("Research/README.md"), true);
    assert.equal(explorer.getState().expandedPaths.has("Research"), true);
    explorer.getState().dispose();
  });

  it("creates .vproj Project Folders, preserves .vproj suffix on F2 rename, and toggles folder promotion/demotion", () => {
    const { vault, explorer } = createTestFixture();

    // 1. Create a Project Folder via extension option -> starts inline rename with clean draft & preservedSuffix
    const proj = explorer.getState().createNewFolder("", {
      baseName: "Campaign",
      extension: "vproj",
    });
    assert.equal(proj.path, "Campaign.vproj");
    assert.equal(explorer.getState().renameState?.draft, "Campaign");
    assert.equal(explorer.getState().renameState?.preservedSuffix, ".vproj");

    // 2. User types a new clean name without ".vproj" -> commitRename automatically preserves ".vproj"!
    explorer.getState().updateRenameDraft("Launch 2026");
    const renamed = explorer.getState().commitRename();
    assert.equal(renamed.ok, true);
    assert.equal(renamed.newPath, "Launch 2026.vproj");
    assert.equal(vault.exists("Launch 2026.vproj"), true);
    const projRow = explorer.getState().rows.find((r) => r.path === "Launch 2026.vproj");
    assert.equal(projRow?.isProjectFolder, true);

    // 3. Promote an existing normal folder to Project Folder & demote it back cleanly
    const promoted = explorer.getState().toggleProjectFolder("01. Docs");
    assert.equal(promoted.ok, true);
    assert.equal(promoted.isProject, true);
    assert.equal(promoted.newPath, "01. Docs.vproj");
    assert.equal(vault.exists("01. Docs.vproj/Spec.outline"), true);

    const demoted = explorer.getState().toggleProjectFolder("01. Docs.vproj");
    assert.equal(demoted.ok, true);
    assert.equal(demoted.isProject, false);
    assert.equal(demoted.newPath, "01. Docs");
    assert.equal(vault.exists("01. Docs/Spec.outline"), true);

    explorer.getState().dispose();
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  computeDockDropZone,
  createEditorRegistry,
  createWorkspaceLayoutStore,
  getAllGroups,
} from "../src/core";

describe("@vibe/workspace-layout — Headless Obsidian Tab & Split Parity", () => {
  it("opens resources in current tab with per-tab back/forward history and respects pinned tabs", () => {
    const layout = createWorkspaceLayoutStore();
    const s = layout.getState();

    const first = s.openResource({
      resourceId: "docs/a.md",
      title: "a",
      viewType: "markdown",
    });
    const second = layout.getState().openResource({
      resourceId: "docs/b.outline",
      title: "b",
      viewType: "outline",
    });

    // Replaced in-place on the same unpinned tab
    assert.equal(first.tabId, second.tabId);
    assert.equal(layout.getState().getActiveTab()?.resourceId, "docs/b.outline");

    // Back / Forward per-tab history
    assert.equal(layout.getState().navigateBack(second.tabId), true);
    assert.equal(layout.getState().getActiveTab()?.resourceId, "docs/a.md");
    assert.equal(layout.getState().navigateForward(second.tabId), true);
    assert.equal(layout.getState().getActiveTab()?.resourceId, "docs/b.outline");

    // Pin the tab -> opening another file in "current" mode must NOT overwrite pinned tab
    layout.getState().togglePinTab(second.tabId);
    const third = layout.getState().openResource({
      resourceId: "docs/c.md",
      title: "c",
      viewType: "markdown",
    });
    assert.notEqual(third.tabId, second.tabId);
    assert.equal(layout.getState().getActiveGroup()?.tabs.length, 2);
    assert.equal(layout.getState().getActiveGroup()?.tabs[0].pinned, true);
  });

  it("preserves pinned tabs on closeTab, closeOtherTabs, and closeTabsToRight; supports reopenClosedTab", () => {
    const layout = createWorkspaceLayoutStore();
    const t1 = layout.getState().openResource({ resourceId: "1.md", title: "1", viewType: "markdown" });
    const t2 = layout.getState().openResource({ resourceId: "2.md", title: "2", viewType: "markdown", mode: "new-tab" });
    const t3 = layout.getState().openResource({ resourceId: "3.md", title: "3", viewType: "markdown", mode: "new-tab" });

    layout.getState().togglePinTab(t1.tabId);

    // Pinned tab resists normal closeTab
    layout.getState().closeTab(t1.tabId);
    assert.equal(layout.getState().getActiveGroup()?.tabs.length, 3);

    // Close tabs to right of t2 closes t3 only
    layout.getState().closeTabsToRight(t2.tabId);
    assert.deepEqual(
      layout.getState().getActiveGroup()?.tabs.map((t) => t.resourceId),
      ["1.md", "2.md"]
    );

    // Reopen closed tab restores 3.md
    const reopened = layout.getState().reopenClosedTab();
    assert.ok(reopened);
    assert.equal(layout.getState().getActiveTab()?.resourceId, "3.md");

    // Close others around t3 preserves pinned t1
    layout.getState().closeOtherTabs(reopened.tabId);
    assert.deepEqual(
      layout.getState().getActiveGroup()?.tabs.map((t) => t.resourceId),
      ["1.md", "3.md"]
    );
    assert.ok(t3);
  });

  it("supports infinite nested splits, 4-way edge docking, auto-pruning empty panes, and divider resizing", () => {
    const layout = createWorkspaceLayoutStore();
    const t1 = layout.getState().openResource({ resourceId: "a.outline", title: "a", viewType: "outline" });
    const t2 = layout.getState().openResource({
      resourceId: "b.md",
      title: "b",
      viewType: "markdown",
      mode: "split-right",
    });

    assert.equal(layout.getState().getGroupCount(), 2);
    assert.equal(layout.getState().root.kind, "split");

    // Dock a file from explorer onto bottom edge of right pane -> nested vertical split!
    const docked = layout.getState().dockResource(
      { resourceId: "c.json", title: "c.json", viewType: "code" },
      t2.groupId,
      "bottom"
    );
    assert.equal(layout.getState().getGroupCount(), 3);

    // Resize root horizontal split and verify sum === 100 and clamping
    const rootSplit = layout.getState().root;
    assert.equal(rootSplit.kind, "split");
    layout.getState().resizeSplit(rootSplit.id, 0, 20, 12);
    const resizedRoot = layout.getState().root;
    assert.equal(resizedRoot.kind, "split");
    assert.equal(Math.round(resizedRoot.sizes[0] + resizedRoot.sizes[1]), 100);
    assert.ok(resizedRoot.sizes[0] >= 69 && resizedRoot.sizes[0] <= 71);

    // Closing sole tab in docked pane auto-prunes the pane back to 2 groups
    layout.getState().closeTab(docked.tabId);
    assert.equal(layout.getState().getGroupCount(), 2);

    // Closing sole tab in second pane unwraps split back to single group
    layout.getState().closeTab(t2.tabId);
    assert.equal(layout.getState().getGroupCount(), 1);
    assert.equal(layout.getState().root.kind, "group");

    // Closing sole tab in the last remaining group leaves a fresh empty New Tab
    layout.getState().closeTab(t1.tabId);
    assert.equal(layout.getState().getGroupCount(), 1);
    assert.equal(layout.getState().getActiveTab()?.resourceId, null);
  });

  it("docks tabs across panes, toggles group-scoped Stacked Tabs, syncs Vault rename/delete, and roundtrips snapshot", () => {
    const layout = createWorkspaceLayoutStore();
    const t1 = layout.getState().openResource({ resourceId: "docs/spec.outline", title: "spec", viewType: "outline" });
    const t2 = layout.getState().openResource({ resourceId: "docs/notes.md", title: "notes", viewType: "markdown", mode: "new-tab" });

    // Dock t2 to right edge of its own group -> creates 2nd group
    layout.getState().dockTab(t2.tabId, t1.groupId, "right");
    assert.equal(layout.getState().getGroupCount(), 2);

    // Group t1 and toggle group-scoped stacked tabs (only that Chrome Tab Group becomes stacked)
    const gid = layout.getState().createTabGroupCollection([t1.tabId], { title: "Spec Group", color: "purple" })!;
    layout.getState().toggleTabGroupStacked(gid);
    assert.equal(layout.getState().tabGroups[gid]?.stacked, true);

    // Sync Vault rename -> updates tab resourceId & title
    layout.getState().syncResourceRenamed("docs/spec.outline", "archive/spec-v2.outline", "spec-v2", "outline");
    assert.equal(getAllGroups(layout.getState().root)[0].tabs[0].resourceId, "archive/spec-v2.outline");
    assert.equal(getAllGroups(layout.getState().root)[0].tabs[0].title, "spec-v2");

    // Serialize & restore snapshot (preserves group stacked state)
    const snapshot = layout.getState().serializeLayout();
    const restored = createWorkspaceLayoutStore({ initialSnapshot: snapshot });
    assert.equal(restored.getState().getGroupCount(), 2);
    assert.equal(restored.getState().tabGroups[gid]?.stacked, true);
    assert.equal(getAllGroups(restored.getState().root)[0].tabs[0].resourceId, "archive/spec-v2.outline");

    // Sync Vault delete -> removes deleted tab and auto-prunes its empty pane
    restored.getState().syncResourceDeleted(["docs/notes.md"]);
    assert.equal(restored.getState().getGroupCount(), 1);
  });

  it("resolves multi-engine EditorRegistry adapters by extension/priority and switches tab viewType (Open With)", () => {
    const Dummy = () => null;
    const registry = createEditorRegistry([
      { id: "raw-code", label: "Raw Code", extensions: ["*"], priority: 10, Component: Dummy },
      { id: "obsidian-markdown", label: "Markdown", extensions: ["md"], priority: 100, Component: Dummy },
      { id: "vibe-outliner", label: "Outliner", extensions: ["outline"], priority: 100, Component: Dummy },
    ]);

    assert.equal(registry.resolveDefault("docs/a.md")?.id, "obsidian-markdown");
    assert.equal(registry.resolveDefault("docs/b.outline")?.id, "vibe-outliner");
    assert.equal(registry.resolveDefault("docs/c.json")?.id, "raw-code");
    assert.deepEqual(
      registry.listForPath("docs/b.outline").map((a) => a.id),
      ["vibe-outliner", "raw-code"]
    );
    assert.equal(registry.resolveForTab("docs/b.outline", "raw-code")?.id, "raw-code");

    const layout = createWorkspaceLayoutStore();
    const opened = layout.getState().openResource({
      resourceId: "docs/b.outline",
      title: "b.outline",
      viewType: "vibe-outliner",
    });
    layout.getState().setTabViewType(opened.tabId, "raw-code");
    assert.equal(layout.getState().getActiveTab()?.viewType, "raw-code");
  });

  it("matches compound extensions (.vdoc.json), conditional schema matchers, and 2D canvas center drop pass-through", () => {
    const Dummy = () => null;
    const registry = createEditorRegistry([
      { id: "raw-code", label: "Raw Code", extensions: ["*"], priority: 10, Component: Dummy },
      { id: "json-view", label: "JSON", extensions: ["json"], priority: 50, Component: Dummy },
      {
        id: "vibe-vdoc",
        label: "2D Canvas",
        extensions: ["vdoc", "vdoc.json"],
        priority: 100,
        match: (_p, preview) => !preview || !preview.includes('"version":"2.0"'),
        capabilities: { acceptsCanvasDrop: true },
        Component: Dummy,
      },
      {
        id: "vibe-vdoc-v2",
        label: "2D Canvas v2",
        extensions: ["vdoc"],
        priority: 110,
        match: (_p, preview) => Boolean(preview && preview.includes('"version":"2.0"')),
        Component: Dummy,
      },
    ]);

    // Compound .vdoc.json beats .json!
    assert.equal(registry.resolveDefault("docs/proposal.vdoc.json")?.id, "vibe-vdoc");
    // Conditional schema version coexistence (v1 vs v2)
    assert.equal(registry.resolveDefault("docs/a.vdoc", '{"version":"1.0.0"}')?.id, "vibe-vdoc");
    assert.equal(registry.resolveDefault("docs/a.vdoc", '{"version":"2.0"}')?.id, "vibe-vdoc-v2");

    // 2D Canvas pass-through: center returns null, outer 15% edge still triggers split dock!
    const box = { left: 0, top: 0, width: 1000, height: 800 };
    assert.equal(computeDockDropZone(box, 500, 400, { edgeRatio: 0.15, allowCenter: false }), null);
    assert.equal(computeDockDropZone(box, 950, 400, { edgeRatio: 0.15, allowCenter: false }), "right");
    assert.equal(computeDockDropZone(box, 500, 400, { edgeRatio: 0.25, allowCenter: true }), "center");
  });

  it("supports Chrome Tab Groups (create, collapse, rename, color) and '크게 보기' <-> '되돌리기' toggle", () => {
    const layout = createWorkspaceLayoutStore();
    const t1 = layout.getState().openResource({
      resourceId: "docs/proposal.vdoc",
      title: "proposal.vdoc",
      viewType: "vibe-vdoc",
      mode: "current",
    });
    const t2 = layout.getState().openResource({
      resourceId: "docs/spec.md",
      title: "spec.md",
      viewType: "obsidian-markdown",
      mode: "new-tab",
    });
    const t3 = layout.getState().openResource({
      resourceId: "docs/notes.md",
      title: "notes.md",
      viewType: "obsidian-markdown",
      mode: "new-tab",
    });

    const gid = layout.getState().createTabGroupCollection([t1.tabId, t2.tabId], {
      title: "Pair A",
      color: "blue",
    });
    assert.ok(gid);
    assert.equal(layout.getState().tabGroups[gid].title, "Pair A");
    assert.equal(layout.getState().tabGroups[gid].color, "blue");
    assert.equal(layout.getState().tabGroups[gid].collapsed, false);

    // Collapse & auto-uncollapse on activateTab
    layout.getState().toggleTabGroupCollapsed(gid);
    assert.equal(layout.getState().tabGroups[gid].collapsed, true);
    layout.getState().activateTab(t1.groupId, t1.tabId);
    assert.equal(layout.getState().tabGroups[gid].collapsed, false);

    // Group-scoped Stacked Tabs: enable on gid, verify sibling ungrouped tab t3 is NOT in gid
    layout.getState().toggleTabGroupStacked(gid);
    assert.equal(layout.getState().tabGroups[gid].stacked, true);
    const stackedMembers = layout
      .getState()
      .getActiveGroup()!
      .tabs.filter((t) => t.tabGroupId === gid);
    assert.equal(stackedMembers.length, 2);
    assert.equal(stackedMembers.some((t) => t.id === t3.tabId), false);

    // Split off a sibling pane so we have 2 panes (50/50) before clicking "크게 보기"
    layout.getState().dockTab(t3.tabId, t1.groupId, "right");
    assert.equal(layout.getState().getGroupCount(), 2);

    // "크게 보기" (expandTabGroup): maximizes the Chrome Tab Group to 1 full-width pane (100% width), hiding sibling split panes!
    layout.getState().expandTabGroup(gid);
    assert.equal(layout.getState().expandedTabGroup?.tabGroupId, gid);
    assert.equal(layout.getState().getGroupCount(), 1);
    assert.equal(layout.getState().root.kind, "group");
    assert.equal(layout.getState().getActiveGroup()?.tabs.length, 2);
    assert.equal(layout.getState().tabGroups[gid].stacked, true);

    // Cold reload from a snapshot captured while expanded must NEVER stay trapped in "되돌리기" mode!
    const snapshotDuringExpand = layout.getState().serializeLayout();
    const coldBooted = createWorkspaceLayoutStore({ initialSnapshot: snapshotDuringExpand });
    assert.equal(coldBooted.getState().expandedTabGroup, null);
    assert.equal(coldBooted.getState().getGroupCount(), 2);

    // Rename a file while expanded -> stays synced after "되돌리기"
    layout.getState().syncResourceRenamed("docs/spec.md", "docs/spec-v2.md", "spec-v2.md");

    // "되돌리기" (restoreExpandedTabGroup): restores back to 2-pane layout with Chrome Tab Group + sibling pane t3 AND preserves stacked=true!
    layout.getState().restoreExpandedTabGroup();
    assert.equal(layout.getState().expandedTabGroup, null);
    assert.equal(layout.getState().getGroupCount(), 2);
    assert.equal(layout.getState().tabGroups[gid].stacked, true);
    const restoredPane = layout.getState().getActiveGroup();
    assert.ok(restoredPane);
    assert.equal(restoredPane.tabs.length, 2);
    assert.equal(restoredPane.tabs[0].tabGroupId, gid);
    assert.equal(restoredPane.tabs[1].tabGroupId, gid);
    assert.equal(restoredPane.tabs[1].resourceId, "docs/spec-v2.md");
    const siblingPane = getAllGroups(layout.getState().root).find((g) => g.id !== restoredPane.id);
    assert.equal(siblingPane?.tabs[0]?.id, t3.tabId);
    assert.equal(siblingPane?.tabs[0]?.tabGroupId, undefined);

    // Ungroup clears metadata cleanly
    layout.getState().ungroupTabGroup(gid);
    assert.equal(layout.getState().tabGroups[gid], undefined);
    assert.equal(layout.getState().getActiveGroup()?.tabs[0].tabGroupId, undefined);
  });

  it("supports Chrome-style drag-and-drop tab group merge, detach, cross-pane move, and group-to-group merge", () => {
    const layout = createWorkspaceLayoutStore();
    const t1 = layout.getState().openResource({
      resourceId: "docs/a.md",
      title: "a.md",
      viewType: "obsidian-markdown",
      mode: "current",
    });
    const t2 = layout.getState().openResource({
      resourceId: "docs/b.md",
      title: "b.md",
      viewType: "obsidian-markdown",
      mode: "new-tab",
    });
    const t3 = layout.getState().openResource({
      resourceId: "docs/c.md",
      title: "c.md",
      viewType: "obsidian-markdown",
      mode: "split-right",
    });

    // 1. Merge two standalone tabs across panes by dropping t3 onto t1 -> creates Group 1 with [t1, t3]
    const g1 = layout.getState().mergeTabsIntoGroup(t3.tabId, t1.tabId);
    assert.ok(g1);
    assert.equal(layout.getState().getGroupCount(), 1);
    const paneAfterMerge = layout.getState().getActiveGroup();
    assert.ok(paneAfterMerge);
    assert.equal(paneAfterMerge.tabs.length, 3);
    assert.equal(paneAfterMerge.tabs.find((t) => t.id === t1.tabId)?.tabGroupId, g1);
    assert.equal(paneAfterMerge.tabs.find((t) => t.id === t3.tabId)?.tabGroupId, g1);
    assert.equal(paneAfterMerge.tabs.find((t) => t.id === t2.tabId)?.tabGroupId, undefined);

    // 2. Dragging ungrouped t2 into g1 via moveTabToGroup(targetTabGroupId) adds it to Group 1
    layout.getState().moveTabToGroup(t2.tabId, paneAfterMerge.id, 1, { targetTabGroupId: g1 });
    assert.equal(
      layout.getState().getActiveGroup()?.tabs.filter((t) => t.tabGroupId === g1).length,
      3
    );

    // 3. Dragging t3 out of Group 1 to the empty tab bar end detaches it cleanly
    const curPane = layout.getState().getActiveGroup()!;
    layout.getState().moveTabToGroup(t3.tabId, curPane.id, curPane.tabs.length, {
      targetTabGroupId: null,
    });
    assert.equal(
      layout.getState().getActiveGroup()?.tabs.find((t) => t.id === t3.tabId)?.tabGroupId,
      undefined
    );
    assert.equal(
      layout.getState().getActiveGroup()?.tabs.filter((t) => t.tabGroupId === g1).length,
      2
    );

    // 4. Create a second group for t3 and dock Group 2 to the right edge as a split pane
    const g2 = layout.getState().createTabGroupCollection([t3.tabId], { title: "Group 2", color: "cyan" });
    assert.ok(g2);
    layout.getState().dockTabGroupCollection(g2, curPane.id, "right");
    assert.equal(layout.getState().getGroupCount(), 2);

    // 5. Merge Group 2 into Group 1 by dragging Group 2 chip onto Group 1 chip -> auto-prunes Group 2 & empty pane
    layout.getState().mergeTabGroups(g2, g1);
    assert.equal(layout.getState().getGroupCount(), 1);
    assert.equal(layout.getState().tabGroups[g2], undefined);
    assert.equal(
      layout.getState().getActiveGroup()?.tabs.filter((t) => t.tabGroupId === g1).length,
      3
    );

    // 6. Dragging a grouped tab out onto the right edge via dockTab splits it out & detaches from Group 1
    const paneNow = layout.getState().getActiveGroup()!;
    layout.getState().dockTab(t3.tabId, paneNow.id, "right");
    assert.equal(layout.getState().getGroupCount(), 2);
    const allPanes = getAllGroups(layout.getState().root);
    assert.equal(allPanes[1].tabs[0].id, t3.tabId);
    assert.equal(allPanes[1].tabs[0].tabGroupId, undefined);

    // 7. Detaching remaining tabs from g1 auto-prunes g1 metadata
    layout.getState().moveTabToGroup(t1.tabId, allPanes[0].id, 2, { targetTabGroupId: null });
    layout.getState().moveTabToGroup(t2.tabId, allPanes[0].id, 2, { targetTabGroupId: null });
    assert.equal(layout.getState().tabGroups[g1], undefined);
  });
});

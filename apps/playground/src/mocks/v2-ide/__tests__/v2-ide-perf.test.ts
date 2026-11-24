import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { arePageSheetPropsEqual, type VDocPageSheetProps } from "@vibe/slot-canvas";
import { setSlotContent } from "@vibe/vdoc-schema";
import { MemoryVaultAdapter } from "@vibe/vault-core";
import { createWorkspaceLayoutStore } from "@vibe/workspace-layout/core";

import { V2_SAMPLE_VAULT_SEEDS } from "../model/sampleVault";
import { createIdeWorkbenchRuntime } from "../model/useIdeWorkbench";
import { parseVDocJson } from "@vibe/vault-formats";
import { createVDocUiBridgeStore } from "@vibe/canvas-state";

function installMockLocalStorage() {
  let writes = 0;
  let bytes = 0;
  const map = new Map<string, string>();
  const prev = (globalThis as unknown as { localStorage?: Storage }).localStorage;

  const mock: Storage = {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(k: string) {
      return map.get(k) ?? null;
    },
    key(i: number) {
      return Array.from(map.keys())[i] ?? null;
    },
    removeItem(k: string) {
      map.delete(k);
    },
    setItem(k: string, v: string) {
      writes += 1;
      bytes += v.length;
      map.set(k, v);
    },
  };

  (globalThis as unknown as { localStorage: Storage }).localStorage = mock;

  return {
    get writes() {
      return writes;
    },
    get bytes() {
      return bytes;
    },
    resetCounters() {
      writes = 0;
      bytes = 0;
    },
    restore() {
      if (prev === undefined) {
        delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
      } else {
        (globalThis as unknown as { localStorage: Storage }).localStorage = prev;
      }
    },
  };
}

describe("v2-ide — Performance SLA & Regression Gates (M1~M6)", () => {
  it("M1: selection pub/sub deduplicates identical snapshots and never triggers layout mutations", () => {
    const rt = createIdeWorkbenchRuntime({ persist: false });
    const initialRoot = rt.layout.getState().root;
    let notifications = 0;

    const unsub = rt.subscribeSelection(() => {
      notifications += 1;
    });
    // Initial subscription fires once with null
    assert.equal(notifications, 1);

    // 100 identical selection reports (previously caused infinite parent-child render loop)
    for (let i = 0; i < 100; i++) {
      rt.setActiveSelection({
        resourceId: "01. Architecture/00. System-Proposal.vdoc",
        kind: "canvas-nodes",
        summary: "Page 1 › 핵심 2단 요약",
        text: "2D-First 디렉팅",
        pageId: "page-1",
        blockIds: ["blk-p1-grid"],
        slotIds: ["slot-p1-col1"],
      });
    }

    assert.equal(notifications, 2, "Identical selection snapshots must notify exactly once");
    assert.equal(rt.layout.getState().root, initialRoot, "Selection changes must not mutate layout");

    unsub();
    rt.dispose();
  });

  it("M2: MemoVDocPageSheet achieves 100% prop-equality hit rate with stable callbacks", () => {
    const vault = new MemoryVaultAdapter({ initialEntries: V2_SAMPLE_VAULT_SEEDS });
    const doc = parseVDocJson(
      vault.read("01. Architecture/00. System-Proposal.vdoc"),
      "System-Proposal"
    );

    const noop = () => undefined;
    const stableHandlers = {
      onSelectPage: noop,
      onSelectBlock: noop,
      onSelectSlot: noop,
      onToggleComposerForSlot: noop,
      onOpenBackdataDrawer: noop,
      onUpdateSlotContent: noop,
      onMoveBlock: noop,
      onDeleteBlock: noop,
      onMoveBlockTo: noop,
      onInsertBlock: noop,
      onDuplicateBlock: noop,
      onToggleBlockLock: noop,
      onMoveBlockFrame: noop,
      onResizeBlockFrame: noop,
      onUpdateBlock: noop,
      onTableCommand: noop,
    };

    const makeProps = (
      pageIdx: number,
      targetDoc = doc,
      selectedBlockId: string | null = null,
      selectedSlotId: string | null = null
    ): VDocPageSheetProps => ({
      docTitle: targetDoc.title,
      totalPages: targetDoc.pages.length,
      seamless: false,
      page: targetDoc.pages[pageIdx],
      slots: targetDoc.slots,
      backdata: targetDoc.backdata,
      mode: "Editing",
      selectedBlockId,
      selectedSlotId,
      composerOpenSlotId: null,
      ...stableHandlers,
    });

    // Case 1: Identical re-render on Page 1 -> 100% memo hit
    assert.equal(arePageSheetPropsEqual(makeProps(0), makeProps(0)), true);

    // Case 2: Selecting a block on Page 1 -> Page 2 stays 100% memo hit!
    assert.equal(
      arePageSheetPropsEqual(makeProps(1, doc, null, null), makeProps(1, doc, "blk-p1-table", null)),
      true
    );

    // Case 3: Editing a slot on Page 1 -> Page 2 stays 100% memo hit!
    const editedDoc = setSlotContent(doc, "slot-p1-col1", "<p>수정됨</p>");
    assert.equal(arePageSheetPropsEqual(makeProps(1, doc), makeProps(1, editedDoc)), true);

    // Contrast: Inline unstable callback breaks memoization (0% hit) -> proves why useCallback is mandatory
    const brokenNext: VDocPageSheetProps = { ...makeProps(0), onSelectPage: () => undefined };
    assert.equal(arePageSheetPropsEqual(makeProps(0), brokenNext), false);
  });

  it("M3 & M6: layoutStore coalesces 60-frame resizeSplit + 20-char group rename with 0 burst storage writes & 0 tabGroups ref churn", () => {
    const storage = installMockLocalStorage();
    try {
      const layout = createWorkspaceLayoutStore({
        storageKey: "perf.layout",
        persistDebounceMs: 250,
      });
      const t1 = layout.getState().openResource({
        resourceId: "01. Architecture/00. System-Proposal.vdoc",
        title: "00. System-Proposal.vdoc",
        viewType: "vibe-vdoc",
        mode: "current",
      });
      const t2 = layout.getState().openResource({
        resourceId: "01. Architecture/01. Vault-Contract.md",
        title: "01. Vault-Contract.md",
        viewType: "obsidian-markdown",
        mode: "new-tab",
      });
      const t3 = layout.getState().openResource({
        resourceId: "01. Architecture/02. Layout-Parity-Checklist.md",
        title: "02. Layout-Parity-Checklist.md",
        viewType: "obsidian-markdown",
        mode: "split-right",
      });
      assert.ok(t3.tabId);
      const gid = layout.getState().createTabGroupCollection([t1.tabId, t2.tabId], {
        title: "Architecture Pair",
        color: "purple",
      })!;
      layout.getState().flushPersistence();

      storage.resetCounters();
      let tabGroupsRefChanges = 0;
      let prevTabGroups = layout.getState().tabGroups;
      const unsub = layout.subscribe((s) => {
        if (s.tabGroups !== prevTabGroups) {
          tabGroupsRefChanges += 1;
          prevTabGroups = s.tabGroups;
        }
      });

      const splitId = layout.getState().root.kind === "split" ? layout.getState().root.id : "";
      const t0 = performance.now();
      for (let i = 0; i < 60; i++) {
        layout.getState().resizeSplit(splitId, 0, i % 2 === 0 ? 0.5 : -0.5);
      }
      assert.equal(tabGroupsRefChanges, 0, "resizeSplit must not churn tabGroups object reference");

      for (let i = 0; i < 20; i++) {
        layout.getState().updateTabGroupMeta(gid, { title: `Architecture Pair ${i}` });
      }
      for (let i = 0; i < 50; i++) {
        layout.getState().expandTabGroup(gid);
        layout.getState().restoreExpandedTabGroup();
      }
      const burstMs = performance.now() - t0;

      // SLA-3: 0 synchronous storage writes during active burst
      assert.equal(storage.writes, 0);
      // SLA-6: 180 heavy layout ops complete well under 50ms
      assert.ok(burstMs < 50, `Expected layout burst < 50ms, got ${burstMs.toFixed(2)}ms`);

      layout.getState().flushPersistence();
      assert.equal(storage.writes, 1, "All burst mutations must coalesce into 1 persisted snapshot");

      unsub();
      layout.getState().dispose();
    } finally {
      storage.restore();
    }
  });

  it("M4: MemoryVaultAdapter coalesces 50 rapid vault.write calls into 0 burst writes + 1 flush write", () => {
    const storage = installMockLocalStorage();
    try {
      const vault = new MemoryVaultAdapter({
        initialEntries: V2_SAMPLE_VAULT_SEEDS,
        storageKey: "perf.vault",
        persistDebounceMs: 250,
      });
      const sampleRaw = vault.read("01. Architecture/00. System-Proposal.vdoc");
      storage.resetCounters();

      const t0 = performance.now();
      for (let i = 0; i < 50; i++) {
        vault.write("01. Architecture/00. System-Proposal.vdoc", sampleRaw + " ".repeat(i % 3));
      }
      const elapsedMs = performance.now() - t0;

      assert.equal(storage.writes, 0, "Rapid vault.write must not synchronously block on localStorage");
      assert.ok(elapsedMs < 15, `Expected 50 rapid vault writes < 15ms, got ${elapsedMs.toFixed(2)}ms`);

      vault.flushPersistence();
      assert.equal(storage.writes, 1, "Flushing must write exactly 1 coalesced vault snapshot");
      vault.dispose();
    } finally {
      storage.restore();
    }
  });

  it("M5: vdocUiBridge fine-grained primitive selectors isolate 100 hover sweeps with 0 editor/structure churn", () => {
    const bridge = createVDocUiBridgeStore();
    const path = "01. Architecture/00. System-Proposal.vdoc";
    bridge.getState().setActivePage(path, "page-1");

    let editorRelevantChanges = 0;
    let prevPage = bridge.getState().byPath[path]?.activePageId ?? null;
    let prevBlock = bridge.getState().byPath[path]?.selectedBlockId ?? null;
    let prevSlot = bridge.getState().byPath[path]?.selectedSlotId ?? null;
    let prevHidden = bridge.getState().byPath[path]?.hiddenBlockIds;
    let prevScrollSeq = bridge.getState().byPath[path]?.scrollSeq ?? 0;

    const unsub = bridge.subscribe((s) => {
      const st = s.byPath[path];
      if (
        (st?.activePageId ?? null) !== prevPage ||
        (st?.selectedBlockId ?? null) !== prevBlock ||
        (st?.selectedSlotId ?? null) !== prevSlot ||
        st?.hiddenBlockIds !== prevHidden ||
        (st?.scrollSeq ?? 0) !== prevScrollSeq
      ) {
        editorRelevantChanges += 1;
        prevPage = st?.activePageId ?? null;
        prevBlock = st?.selectedBlockId ?? null;
        prevSlot = st?.selectedSlotId ?? null;
        prevHidden = st?.hiddenBlockIds;
        prevScrollSeq = st?.scrollSeq ?? 0;
      }
    });

    for (let i = 0; i < 100; i++) {
      bridge.getState().setHoveredBlock(path, i % 2 === 0 ? "blk-p1-table" : null);
    }

    assert.equal(editorRelevantChanges, 0, "100 hover sweeps must cause 0 editor/structure selector updates");
    unsub();
  });
});

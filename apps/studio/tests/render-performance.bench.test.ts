import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { createOutlineEditorStore, OutlineEditorProvider, OutlineTree } from "@vibe/outliner/editor";
import type { WorkingOutlineDocument, WorkingOutlineNode } from "@vibe/vdoc-schema";
import { selectActiveProject, useProjectStore } from "../src/entities/vdoc-project";
import {
  buildKindByNodeId,
  projectWorkingOutlineToOutlinerNodes,
  useWorkingOutlineStore,
} from "../src/entities/working-outline";
import { useWorkspaceSessionStore } from "../src/entities/workspace-session";
import { getOutlineProjection } from "../src/features/zoom-hierarchy/model/useFractalZoomNavigation";
import { createOutlineHost } from "../src/features/workflowy-outliner/model/createOutlineHost";
import { createOutlinePort } from "../src/features/workflowy-outliner/model/createOutlinePort";
import { workingToOutlinerNodes } from "../src/features/workflowy-outliner/model/elementLabelRules";
import { ElementKindBadge } from "../src/features/workflowy-outliner/ui/ElementKindBadge";
import { collectSubtreeSlotIds } from "../src/features/layer-visibility/model/layerVisibility";
import type { OutlineRowActions } from "../src/widgets/outline-preview-sidebar/model/useOutlineRowActions";

function makeLargeProjectOutline(opts: { folded: boolean }): {
  outline: WorkingOutlineDocument;
  totalNodes: number;
  largeDocId: string;
  samplePageId: string;
  deepCellId: string;
} {
  let totalNodes = 0;
  let largeDocId = "";
  let samplePageId = "";
  let deepCellId = "";

  const docs: WorkingOutlineNode[] = [];
  for (let d = 0; d < 13; d += 1) {
    const docId = `wo-doc-${d}`;
    if (d === 6) largeDocId = docId;
    const pageCount = d === 6 ? 10 : d === 0 ? 4 : 3;
    const pages: WorkingOutlineNode[] = [];
    for (let p = 0; p < pageCount; p += 1) {
      const pageId = `wo-page-${d}-${p}`;
      if (d === 6 && p === 0) samplePageId = pageId;
      const blocks: WorkingOutlineNode[] = [];
      const rowCount = d === 6 ? 26 : 12;
      const rows: WorkingOutlineNode[] = [];
      for (let r = 0; r < rowCount; r += 1) {
        const cells: WorkingOutlineNode[] = [];
        for (let c = 0; c < 6; c += 1) {
          const cid = `wo-cell-${d}-${p}-${r}-${c}`;
          if (d === 6 && p === 0 && r === 0 && c === 0) deepCellId = cid;
          cells.push({
            nodeId: cid,
            text: `셀 값 ${d}-${p}-${r}-${c}`,
            elementKind: "table-cell",
            children: [],
          });
          totalNodes += 1;
        }
        rows.push({
          nodeId: `wo-row-${d}-${p}-${r}`,
          text: `${r + 1}행`,
          elementKind: "table-row",
          children: cells,
        });
        totalNodes += 1;
      }
      blocks.push({
        nodeId: `wo-tbl-${d}-${p}`,
        text: `데이터 표 ${p + 1}`,
        elementKind: "structured-table",
        ...(opts.folded ? { isFolded: true } : null),
        children: rows,
      });
      totalNodes += 1;
      pages.push({
        nodeId: pageId,
        text: `페이지 ${p + 1}`,
        elementKind: "page",
        ...(opts.folded && p > 0 ? { isFolded: true } : null),
        children: blocks,
      });
      totalNodes += 1;
    }
    docs.push({
      nodeId: docId,
      text: `문서 ${d + 1}`,
      elementKind: "document",
      ...(opts.folded && d > 0 ? { isFolded: true } : null),
      children: pages,
    });
    totalNodes += 1;
  }

  return {
    outline: {
      projectId: "proj-bench-5k",
      revision: 1,
      baseDocRevisions: {},
      dirty: false,
      updatedAt: "2026-11-16T00:00:00.000Z",
      nodes: docs,
    },
    totalNodes,
    largeDocId,
    samplePageId,
    deepCellId,
  };
}

function countRenderedRows(html: string): number {
  return (html.match(/title="요소 역할:/g) ?? []).length;
}

test("Performance benchmark: ~5,000-node tree renders and zooms in/out within tight latency & DOM budgets", async () => {
  // jsdom-free window/document shim for React SSR measurement of OutlineTree + ElementKindBadge
  if (typeof globalThis.DOMMatrix === "undefined") {
    (globalThis as Record<string, unknown>).DOMMatrix = class DOMMatrix {};
  }
  if (typeof globalThis.document === "undefined") {
    (globalThis as Record<string, unknown>).document = {
      activeElement: null,
      documentElement: { style: {} },
      body: { ownerDocument: { defaultView: globalThis } },
    };
  }
  if (typeof globalThis.window === "undefined") {
    (globalThis as Record<string, unknown>).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      location: { protocol: "http:", search: "", pathname: "/" },
      document: globalThis.document,
    };
  } else if (!(globalThis.window as { location?: unknown }).location) {
    (globalThis.window as { location: unknown }).location = { protocol: "http:", search: "", pathname: "/" };
  }
  const fakeBody = (globalThis.document as { body: { ownerDocument: { defaultView: unknown } } }).body;
  if (fakeBody && !fakeBody.ownerDocument) {
    fakeBody.ownerDocument = { defaultView: globalThis.window };
  }

  const worst = makeLargeProjectOutline({ folded: false });
  assert.ok(worst.totalNodes >= 4800, `Expected >=4800 nodes, got ${worst.totalNodes}`);

  const t0 = performance.now();
  const kindIndex = buildKindByNodeId(worst.outline.nodes);
  useWorkingOutlineStore.setState({
    outline: worst.outline,
    kindByNodeId: kindIndex,
    loadedProjectId: worst.outline.projectId,
    zoomRootNodeId: null,
  });
  const indexMs = performance.now() - t0;

  // Verify O(1) lookup across all nodes
  const tLookup0 = performance.now();
  for (let i = 0; i < 5000; i += 1) {
    void useWorkingOutlineStore.getState().kindByNodeId[worst.deepCellId];
  }
  const lookup5kMs = performance.now() - tLookup0;

  // Verify WeakMap projection cache + Zoom-In/Zoom-Out sidebar projection latency
  useProjectStore.setState({
    projects: [
      {
        projectId: worst.outline.projectId,
        title: "대규모 벤치마크",
        description: "",
        activePhase: "storylining",
        docIds: [],
        storylineNodes: [],
        provenanceLineage: [],
        updatedAt: "2026-11-16T00:00:00.000Z",
      },
    ],
    activeProjectId: worst.outline.projectId,
  });
  void selectActiveProject(useProjectStore.getState());
  useWorkspaceSessionStore.setState({ currentPhase: "storylining", zoomRootNodeId: "project-root" });

  const tProj1 = performance.now();
  const projA = projectWorkingOutlineToOutlinerNodes(worst.outline, "대규모 벤치마크");
  const projFirstMs = performance.now() - tProj1;
  const tProj2 = performance.now();
  const projB = projectWorkingOutlineToOutlinerNodes(worst.outline, "대규모 벤치마크");
  const projCachedMs = performance.now() - tProj2;
  assert.equal(projA, projB, "Repeated projection must hit WeakMap cache");

  const tSideZoomIn0 = performance.now();
  useWorkspaceSessionStore.setState({ zoomRootNodeId: worst.largeDocId });
  const sideZoomedDoc = getOutlineProjection();
  const sidebarZoomInMs = performance.now() - tSideZoomIn0;
  assert.equal(sideZoomedDoc.rootNodeId, worst.largeDocId);

  const tSideZoomOut0 = performance.now();
  useWorkspaceSessionStore.setState({ zoomRootNodeId: "project-root" });
  const sideZoomedRoot = getOutlineProjection();
  const sidebarZoomOutMs = performance.now() - tSideZoomOut0;
  assert.equal(sideZoomedRoot.rootNodeId, "project-root");

  // Verify collectSubtreeSlotIds WeakMap cache & zero repeat work across Zoom-In/Out
  const slotsMapA = collectSubtreeSlotIds(sideZoomedRoot.allNodes);
  const tSlotsCache0 = performance.now();
  const slotsMapB = collectSubtreeSlotIds(sideZoomedDoc.allNodes);
  const slotsCacheMs = performance.now() - tSlotsCache0;
  assert.equal(slotsMapA, slotsMapB, "collectSubtreeSlotIds must hit WeakMap cache for shared allNodes");

  // Verify Sidebar sections (Documents & Pages + Elements + All Mode on 5k nodes) windowing & latency
  const { DocumentsPagesSection } = await import(
    "../src/widgets/outline-preview-sidebar/ui/OutlineDocumentsPagesSection"
  );
  const { ElementsSection } = await import(
    "../src/widgets/outline-preview-sidebar/ui/OutlineElementsSection"
  );
  const dummyActions = new Proxy(
    { peek: () => ({}) },
    { get: (t, p) => (p in t ? (t as Record<string | symbol, unknown>)[p] : () => {}) }
  ) as unknown as OutlineRowActions;

  // Warm up Sidebar React SSR JIT once with minimal slice before measuring SLO
  renderToString(
    React.createElement(DocumentsPagesSection, {
      activeDocId: "doc-0",
      actions: dummyActions,
      phase: "storylining",
      renaming: null,
      allNodes: sideZoomedRoot.allNodes.slice(0, 2),
      zoomRootId: sideZoomedRoot.rootNodeId,
      reportOrder: () => {},
      onNewDocument: () => {},
    })
  );
  renderToString(
    React.createElement(ElementsSection, {
      activeDocId: "doc-0",
      actions: dummyActions,
      phase: "storylining",
      renaming: null,
      isAllMode: true,
      allNodes: sideZoomedRoot.allNodes.slice(0, 2),
      scopedNodes: sideZoomedRoot.visibleNodes.slice(0, 2),
      hasChildrenMap: {},
      rootNodeId: sideZoomedRoot.rootNodeId,
      reportOrder: () => {},
    })
  );

  const tSideUi0 = performance.now();
  const pagesSidebarHtml = renderToString(
    React.createElement(DocumentsPagesSection, {
      activeDocId: "doc-0",
      actions: dummyActions,
      phase: "storylining",
      renaming: null,
      allNodes: sideZoomedRoot.allNodes,
      zoomRootId: sideZoomedRoot.rootNodeId,
      reportOrder: () => {},
      onNewDocument: () => {},
    })
  );
  const allModeSidebarHtml = renderToString(
    React.createElement(ElementsSection, {
      activeDocId: "doc-0",
      actions: dummyActions,
      phase: "storylining",
      renaming: null,
      isAllMode: true,
      allNodes: sideZoomedRoot.allNodes,
      scopedNodes: sideZoomedRoot.visibleNodes,
      hasChildrenMap: sideZoomedRoot.hasChildrenMap,
      rootNodeId: sideZoomedRoot.rootNodeId,
      reportOrder: () => {},
    })
  );
  const sidebarUiRenderMs = performance.now() - tSideUi0;
  const pagesSidebarRows = (pagesSidebarHtml.match(/data-testid="outline-node-row-/g) ?? []).length;
  const allModeSidebarRows = (allModeSidebarHtml.match(/data-testid="outline-node-row-/g) ?? []).length;
  assert.ok(pagesSidebarRows <= 60, `Sidebar pages windowing cap violated: ${pagesSidebarRows}`);
  assert.ok(allModeSidebarRows <= 60, `Sidebar All-Mode windowing cap violated: ${allModeSidebarRows}`);

  const editorStore = createOutlineEditorStore(createOutlinePort());
  const host = createOutlineHost({
    renderNodeBadge: (node) =>
      React.createElement(ElementKindBadge, {
        nodeId: node.id,
        onTurnInto: () => {},
      }),
    onSlashTrigger: () => false,
  });
  const rootNodes = workingToOutlinerNodes(worst.outline.nodes);

  const renderTree = () =>
    renderToString(
      React.createElement(
        OutlineEditorProvider,
        { store: editorStore, host, rootNodes, defaultView: "bullets" },
        React.createElement(OutlineTree)
      )
    );

  // Warm up React SSR JIT once with minimal tree before measuring structural render budgets
  renderToString(
    React.createElement(
      OutlineEditorProvider,
      { store: editorStore, host, rootNodes: rootNodes.slice(0, 1), defaultView: "bullets" },
      React.createElement(OutlineTree)
    )
  );

  // 1. Worst-case (all ~5,000 nodes unfolded) Initial Project Root Render
  const tRoot0 = performance.now();
  const rootHtml = renderTree();
  const rootRenderMs = performance.now() - tRoot0;
  const rootDomRows = countRenderedRows(rootHtml);

  // 2. Zoom-In into large ~1,800-node Document (unfolded)
  const tZoomDoc0 = performance.now();
  editorStore.getState().setZoom(worst.largeDocId);
  const docHtml = renderTree();
  const zoomInDocMs = performance.now() - tZoomDoc0;
  const docDomRows = countRenderedRows(docHtml);

  // 3. Zoom-In into Page level
  const tZoomPage0 = performance.now();
  editorStore.getState().setZoom(worst.samplePageId);
  const pageHtml = renderTree();
  const zoomInPageMs = performance.now() - tZoomPage0;
  const pageDomRows = countRenderedRows(pageHtml);

  // 4. Zoom-Out back to ~5,000-node Project Root (unfolded worst-case)
  const tZoomOut0 = performance.now();
  editorStore.getState().setZoom(null);
  const zoomOutHtml = renderTree();
  const zoomOutRootMs = performance.now() - tZoomOut0;
  const zoomOutDomRows = countRenderedRows(zoomOutHtml);

  // 5. Default folded mode (production extract behavior)
  const folded = makeLargeProjectOutline({ folded: true });
  useWorkingOutlineStore.setState({
    outline: folded.outline,
    kindByNodeId: buildKindByNodeId(folded.outline.nodes),
    loadedProjectId: folded.outline.projectId,
    zoomRootNodeId: null,
  });
  const foldedRoots = workingToOutlinerNodes(folded.outline.nodes);
  const tFolded0 = performance.now();
  const foldedHtml = renderToString(
    React.createElement(
      OutlineEditorProvider,
      { store: editorStore, host, rootNodes: foldedRoots, defaultView: "bullets" },
      React.createElement(OutlineTree)
    )
  );
  const foldedRenderMs = performance.now() - tFolded0;
  const foldedDomRows = countRenderedRows(foldedHtml);

  console.info(
    JSON.stringify(
      {
        mode: process.env.NODE_ENV || "development",
        totalNodes: worst.totalNodes,
        indexMs: Number(indexMs.toFixed(2)),
        lookup5kMs: Number(lookup5kMs.toFixed(2)),
        projFirstMs: Number(projFirstMs.toFixed(2)),
        projCachedMs: Number(projCachedMs.toFixed(4)),
        sidebarZoomInMs: Number(sidebarZoomInMs.toFixed(2)),
        sidebarZoomOutMs: Number(sidebarZoomOutMs.toFixed(2)),
        slotsCacheMs: Number(slotsCacheMs.toFixed(4)),
        sidebarUiRenderMs: Number(sidebarUiRenderMs.toFixed(2)),
        pagesSidebarRows,
        allModeSidebarRows,
        rootRenderUnfoldedMs: Number(rootRenderMs.toFixed(2)),
        rootDomRows,
        zoomInDocMs: Number(zoomInDocMs.toFixed(2)),
        docDomRows,
        zoomInPageMs: Number(zoomInPageMs.toFixed(2)),
        pageDomRows,
        zoomOutRootMs: Number(zoomOutRootMs.toFixed(2)),
        zoomOutDomRows,
        foldedRenderMs: Number(foldedRenderMs.toFixed(2)),
        foldedDomRows,
      },
      null,
      2
    )
  );

  // Enforce strict windowing & latency SLO budgets
  const isProd = process.env.NODE_ENV === "production";
  const renderBudgetMs = isProd ? 150 : 500;
  const foldedBudgetMs = isProd ? 40 : 150;

  assert.ok(rootDomRows <= 60, `Windowing cap violated at root: ${rootDomRows}`);
  assert.ok(docDomRows <= 60, `Windowing cap violated on doc zoom-in: ${docDomRows}`);
  assert.ok(pageDomRows <= 60, `Windowing cap violated on page zoom-in: ${pageDomRows}`);
  assert.ok(zoomOutDomRows <= 60, `Windowing cap violated on zoom-out: ${zoomOutDomRows}`);
  assert.ok(foldedDomRows <= 30, `Expected compact default folded view <= 30 rows, got ${foldedDomRows}`);

  assert.ok(indexMs < 50, `kindIndex took too long: ${indexMs}ms`);
  assert.ok(lookup5kMs < 15, `5k O(1) lookups took too long: ${lookup5kMs}ms`);
  assert.ok(sidebarZoomInMs < 150, `Sidebar projection zoom-in took too long: ${sidebarZoomInMs}ms`);
  assert.ok(sidebarZoomOutMs < 150, `Sidebar projection zoom-out took too long: ${sidebarZoomOutMs}ms`);
  assert.ok(sidebarUiRenderMs < renderBudgetMs, `Sidebar UI render exceeded ${renderBudgetMs}ms: ${sidebarUiRenderMs}ms`);
  assert.ok(rootRenderMs < renderBudgetMs, `Initial unfolded render exceeded ${renderBudgetMs}ms: ${rootRenderMs}ms`);
  assert.ok(zoomInDocMs < renderBudgetMs, `Zoom-in doc render exceeded ${renderBudgetMs}ms: ${zoomInDocMs}ms`);
  assert.ok(zoomOutRootMs < renderBudgetMs, `Zoom-out root render exceeded ${renderBudgetMs}ms: ${zoomOutRootMs}ms`);
  assert.ok(foldedRenderMs < foldedBudgetMs, `Default folded render exceeded ${foldedBudgetMs}ms: ${foldedRenderMs}ms`);
});

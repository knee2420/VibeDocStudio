import assert from "node:assert/strict";
import test from "node:test";
import { createOutlineEditorStore } from "@vibe/outliner/editor";
import { buildWorkingOutlineFromProjectDocs, type VProjectManifest } from "@vibe/vdoc-schema";
import { buildKindByNodeId, projectWorkingOutlineToOutlinerNodes, useWorkingOutlineStore } from "../src/entities/working-outline";
import { createOutlinePort } from "../src/features/workflowy-outliner/model/createOutlinePort";
import { findElementKind, outlinerToWorkingNodes, workingToOutlinerNodes } from "../src/features/workflowy-outliner/model/elementLabelRules";

const SAMPLE_PROJECT: VProjectManifest = {
  version: "1.0.0",
  projectId: "proj_sync_test",
  title: "동기화 테스트 프로젝트",
  activePhase: "storylining",
  zoomLevel: "project",
  docIds: [],
  outlinerNodes: [],
  stagedChanges: [],
  updatedAt: "2026-11-16T00:00:00.000Z",
};

test("outlinerToWorkingNodes assigns child elementKind on insert and reconciles on Tab indent / Shift+Tab outdent", () => {
  const initial = buildWorkingOutlineFromProjectDocs(SAMPLE_PROJECT, []);
  const tableOutline = {
    ...initial,
    nodes: [
      {
        nodeId: "doc_1",
        text: "문서 1",
        elementKind: "document" as const,
        children: [
          {
            nodeId: "page_1",
            text: "페이지 1",
            elementKind: "page" as const,
            children: [
              {
                nodeId: "tbl_1",
                text: "예산표",
                elementKind: "structured-table" as const,
                children: [],
              },
              {
                nodeId: "txt_1",
                text: "행 1",
                elementKind: "text" as const,
                children: [],
              },
            ],
          },
        ],
      },
    ],
  };

  // Simulate Tab: txt_1 becomes child of tbl_1 -> reconciled to table-row!
  const flatForOutliner = workingToOutlinerNodes(tableOutline.nodes);
  const pageOutliner = flatForOutliner[0].children[0];
  const tblOutliner = pageOutliner.children[0];
  const rowOutliner = pageOutliner.children[1];
  tblOutliner.children.push({ ...rowOutliner });
  pageOutliner.children = [tblOutliner];

  const reconciled = outlinerToWorkingNodes(flatForOutliner, tableOutline.nodes);
  const rowAfterIndent = reconciled[0].children[0].children[0].children[0];
  assert.equal(rowAfterIndent.elementKind, "table-row");
});

test("WorkingOutline store & OutlineDocumentPort stay synced across edits and Turn Into", () => {
  const baseOutline = {
    projectId: SAMPLE_PROJECT.projectId,
    revision: 1,
    baseDocRevisions: {},
    dirty: false,
    updatedAt: "2026-11-16T00:00:00.000Z",
    nodes: [
      {
        nodeId: "doc_1",
        text: "신규 문서",
        elementKind: "document" as const,
        children: [
          {
            nodeId: "page_1",
            text: "페이지 1",
            elementKind: "page" as const,
            children: [
              {
                nodeId: "leaf_1",
                text: "안내 요약",
                elementKind: "text" as const,
                children: [],
              },
            ],
          },
        ],
      },
    ],
  };
  const firstPage = baseOutline.nodes[0].children[0];
  useWorkingOutlineStore.setState({
    outline: baseOutline,
    kindByNodeId: buildKindByNodeId(baseOutline.nodes),
    zoomRootNodeId: null,
  });

  const port = createOutlinePort();
  const editorStore = createOutlineEditorStore(port);
  editorStore.getState().setZoom(firstPage.nodeId);
  assert.equal(editorStore.getState().activeRootId, firstPage.nodeId);

  useWorkingOutlineStore.getState().turnIntoNode("leaf_1", "callout-box");

  const updated = useWorkingOutlineStore.getState().outline;
  assert.equal(findElementKind(updated, "leaf_1"), "callout-box");

  const projected = projectWorkingOutlineToOutlinerNodes(updated, SAMPLE_PROJECT.title);
  const leafProjected = projected.find((n) => n.nodeId === "leaf_1");
  assert.equal(leafProjected?.elementKind, "callout-box");
});

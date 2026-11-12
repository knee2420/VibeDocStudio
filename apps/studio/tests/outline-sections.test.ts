import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { OutlinerNode } from "@vibe/vdoc-schema";

import {
  computeRowSelection,
  filterLayerNodes,
  normalizeQuery,
  parentIdsWithin,
  selectAllModeNodes,
  selectPageLayerNodes,
  selectPageTreeNodes,
} from "../src/widgets/outline-preview-sidebar/model/outlineSections";

const node = (n: Partial<OutlinerNode> & Pick<OutlinerNode, "nodeId" | "zoomLevel">): OutlinerNode => ({
  parentId: null,
  depth: 0,
  title: n.nodeId,
  summary: "",
  ...n,
});

// 문서 d1 (페이지 p1: 블록 b1 > 슬롯 s1, s2 · 페이지 p2: 블록 b2 > 슬롯 s3)
const nodes: OutlinerNode[] = [
  node({ nodeId: "doc", zoomLevel: "document", depth: 1, targetDocId: "d1" }),
  node({ nodeId: "p1", zoomLevel: "page", depth: 2, parentId: "doc", targetDocId: "d1", targetPageId: "p1" }),
  node({ nodeId: "b1", zoomLevel: "page", depth: 3, parentId: "p1", targetDocId: "d1", targetPageId: "p1", targetBlockId: "b1", title: "개요 섹션" }),
  node({ nodeId: "s1", zoomLevel: "slot", depth: 4, parentId: "b1", targetDocId: "d1", targetPageId: "p1", targetBlockId: "b1", targetSlotId: "s1", title: "회의 일시" }),
  node({ nodeId: "s2", zoomLevel: "slot", depth: 4, parentId: "b1", targetDocId: "d1", targetPageId: "p1", targetBlockId: "b1", targetSlotId: "s2", title: "참석자" }),
  node({ nodeId: "p2", zoomLevel: "page", depth: 2, parentId: "doc", targetDocId: "d1", targetPageId: "p2" }),
  node({ nodeId: "b2", zoomLevel: "page", depth: 3, parentId: "p2", targetDocId: "d1", targetPageId: "p2", targetBlockId: "b2" }),
  node({ nodeId: "s3", zoomLevel: "slot", depth: 4, parentId: "b2", targetDocId: "d1", targetPageId: "p2", targetBlockId: "b2", targetSlotId: "s3" }),
];
const ids = (list: OutlinerNode[]) => list.map((n) => n.nodeId);
const hasChildrenMap = Object.fromEntries(nodes.filter((n) => n.parentId).map((n) => [n.parentId, true])) as Record<string, boolean>;
const scope = { docId: "d1", pageId: "p1", zoomRootId: "__root__" };

describe("페이지 구역", () => {
  it("문서 · 페이지 행만 보여준다", () => {
    assert.deepEqual(ids(selectPageTreeNodes(nodes, [])), ["doc", "p1", "p2"]);
  });

  it("문서를 접으면 그 페이지만 숨긴다", () => {
    assert.deepEqual(ids(selectPageTreeNodes(nodes, ["doc"])), ["doc"]);
  });

  it("레이어 접힘은 페이지 목록에 영향이 없다", () => {
    assert.deepEqual(ids(selectPageTreeNodes(nodes, ["b1", "b2"])), ["doc", "p1", "p2"]);
  });
});

describe("레이어 구역", () => {
  it("활성 페이지의 블록 · 슬롯만 보여준다", () => {
    assert.deepEqual(ids(selectPageLayerNodes(nodes, scope)), ["b1", "s1", "s2"]);
  });

  it("이 페이지의 레이어로 줌하면 그 하위로 좁힌다", () => {
    assert.deepEqual(ids(selectPageLayerNodes(nodes, { ...scope, zoomRootId: "s1" })), ["s1"]);
  });

  it("다른 페이지 노드로 줌해도 활성 페이지 레이어는 그대로다", () => {
    assert.deepEqual(ids(selectPageLayerNodes(nodes, { ...scope, zoomRootId: "b2" })), ["b1", "s1", "s2"]);
  });

  it("검색은 접힘을 무시하고 제목으로 거른다", () => {
    const base = selectPageLayerNodes(nodes, scope);
    assert.deepEqual(ids(filterLayerNodes(base, normalizeQuery("  참석 "), ["b1"])), ["s2"]);
  });

  it("검색어가 없으면 접힌 블록의 슬롯을 숨긴다", () => {
    const base = selectPageLayerNodes(nodes, scope);
    assert.deepEqual(ids(filterLayerNodes(base, "", ["b1"])), ["b1"]);
  });

  it("페이지 행이 접혀 있어도 그 페이지의 엘리먼트는 보인다", () => {
    const base = selectPageLayerNodes(nodes, scope);
    assert.deepEqual(ids(filterLayerNodes(base, "", ["p1", "doc"])), ["b1", "s1", "s2"]);
  });

  it("모두 접기 대상은 이 구역의 부모 노드뿐이다 (문서 · 페이지 제외)", () => {
    assert.deepEqual(parentIdsWithin(selectPageLayerNodes(nodes, scope), hasChildrenMap), ["b1"]);
  });
});

describe("All 모드", () => {
  it("접힘 · 검색을 전체 트리에 적용한다", () => {
    assert.deepEqual(ids(selectAllModeNodes(nodes, "", ["p1"])), ["doc", "p1", "p2", "b2", "s3"]);
    assert.deepEqual(ids(selectAllModeNodes(nodes, "섹션", [])), ["b1"]);
  });
});

describe("선택 표시 (캔버스 ↔ 사이드바)", () => {
  const none = new Set<string>();
  const src = (o: Partial<Parameters<typeof computeRowSelection>[1]>) => ({
    selectedNodeId: null,
    slotIds: none,
    blockIds: none,
    pickedIds: none,
    ...o,
  });
  const base = selectPageLayerNodes(nodes, scope);

  it("캔버스에서 고른 블록은 선택, 그 슬롯들은 옅은 자식 표시", () => {
    const sel = computeRowSelection(base, src({ blockIds: new Set(["b1"]) }));
    assert.deepEqual([...sel], [["b1", "on"], ["s1", "child"], ["s2", "child"]]);
  });

  it("캔버스 드래그 다중 선택(슬롯 여러 개)이 그대로 보인다", () => {
    const sel = computeRowSelection(base, src({ slotIds: new Set(["s1", "s2"]) }));
    assert.deepEqual([...sel], [["s1", "on"], ["s2", "on"]]);
  });

  it("슬롯을 고르면 부모 블록은 칠하지 않는다", () => {
    const sel = computeRowSelection(base, src({ slotIds: new Set(["s2"]) }));
    assert.deepEqual([...sel], [["s2", "on"]]);
  });

  it("Ctrl/Shift 다중 선택(첨부 묶음)도 선택으로 보인다", () => {
    const sel = computeRowSelection(base, src({ pickedIds: new Set(["s1"]) }));
    assert.deepEqual([...sel], [["s1", "on"]]);
  });
});

describe("자물쇠 대상 슬롯 (행 아래 전부)", () => {
  it("블록은 자기 슬롯 전부, 슬롯은 자기 하나, 페이지는 그 페이지 슬롯 전부", async () => {
    const { collectSubtreeSlotIds } = await import("../src/features/layer-visibility/model/layerVisibility");
    const map = collectSubtreeSlotIds(nodes);
    assert.deepEqual(map.get("b1"), ["s1", "s2"]);
    assert.deepEqual(map.get("s2"), ["s2"]);
    assert.deepEqual(map.get("p2"), ["s3"]);
    assert.deepEqual(map.get("doc"), ["s1", "s2", "s3"]);
  });
});

describe("캔버스 → 사이드바 따라가기", () => {
  it("따라갈 대상: 단일 슬롯 → 범위 첫 슬롯 → 블록 → 표 전체 선택", async () => {
    const { canvasSelectionTarget } = await import("../src/widgets/outline-preview-sidebar/model/useRevealCanvasSelection");
    const base = { selectedSlotId: null, slotRange: null, selectedBlockId: null, tableSelection: null };
    assert.deepEqual(canvasSelectionTarget({ ...base, selectedSlotId: "s1" }), { kind: "slot", id: "s1" });
    assert.deepEqual(canvasSelectionTarget({ ...base, slotRange: { unitIds: ["s2", "s3"], slotIds: ["s2", "s3"], source: "drag" } }), { kind: "slot", id: "s2" });
    assert.deepEqual(canvasSelectionTarget({ ...base, selectedBlockId: "b2" }), { kind: "block", id: "b2" });
    assert.equal(canvasSelectionTarget(base), null);
  });

  it("대상 노드와 펼쳐야 할 조상 (가까운 것부터)", async () => {
    const { ancestorIds, findTargetNode } = await import("../src/widgets/outline-preview-sidebar/model/useRevealCanvasSelection");
    const slot = findTargetNode(nodes, { kind: "slot", id: "s3" })!;
    assert.equal(slot.nodeId, "s3");
    assert.equal(findTargetNode(nodes, { kind: "block", id: "b1" })?.nodeId, "b1");
    assert.deepEqual(ancestorIds(nodes, slot), ["b2", "p2", "doc"]);
  });
});

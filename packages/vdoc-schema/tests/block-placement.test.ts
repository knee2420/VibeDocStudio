import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  A4_PAGE_HEIGHT_PX,
  A4_PAGE_WIDTH_PX,
  cloneBlockWithSlots,
  deleteUnitsFromDocument,
  duplicateBlock,
  findFullySelectedBlocks,
  findNearestFlowGap,
  getPageContentWidth,
  insertAtY,
  mergeMissingVariables,
  placePastedBlock,
  resolvePageDimensionsPx,
  snapFrame,
  type LayoutBlock,
  type PageSnapBox,
  type SnapRect,
  type VDocDocument,
  type VDocPage,
  type VDocSlot,
} from "../src";

const makeTextBlock = (id: string, slotId: string, frame?: LayoutBlock["frame"]): LayoutBlock => ({
  blockId: id,
  kind: "text",
  title: id,
  slotId,
  ...(frame ? { frame } : {}),
});

const makePage = (pageId: string, blocks: LayoutBlock[], hideHeaderFooter = true): VDocPage => ({
  pageId,
  pageNumber: 1,
  pageLabel: pageId,
  headerSlotId: `${pageId}_hdr`,
  footerSlotId: `${pageId}_ftr`,
  hideHeaderFooter,
  blocks,
});

describe("block-placement 순수 배치 연산", () => {
  it("규칙 1: 고정 좌표 → 고정 좌표(같은 페이지)는 +16px, +16px 씩 누적 어긋난다", () => {
    const orig = makeTextBlock("b1", "s1", { x: 100, y: 200, w: 300, h: 80 });
    const page = makePage("p1", [orig]);

    const p1 = placePastedBlock(page, orig, {
      sourcePageId: "p1",
      sourceFrame: orig.frame,
      pasteCount: 1,
    });
    assert.deepEqual(p1.block.frame, { x: 116, y: 216, w: 300, h: 80 });
    assert.equal(p1.atIndex, undefined);

    const p2 = placePastedBlock(page, orig, {
      sourcePageId: "p1",
      sourceFrame: orig.frame,
      pasteCount: 2,
    });
    assert.deepEqual(p2.block.frame, { x: 132, y: 232, w: 300, h: 80 });

    const p3 = placePastedBlock(page, orig, {
      sourcePageId: "p1",
      sourceFrame: orig.frame,
      pasteCount: 3,
    });
    assert.deepEqual(p3.block.frame, { x: 148, y: 248, w: 300, h: 80 });
  });

  it("규칙 2: 고정 좌표 → 고정 좌표(다른 페이지·다른 문서)는 원본 좌표를 그대로 유지한다", () => {
    const orig = makeTextBlock("b1", "s1", { x: 80, y: 377, w: 632, h: 120 });
    const targetPage = makePage("p2", [makeTextBlock("other", "s2", { x: 40, y: 40, w: 200, h: 40 })]);

    const res = placePastedBlock(targetPage, orig, {
      sourcePageId: "p1",
      sourceFrame: orig.frame,
      pasteCount: 1,
    });
    assert.deepEqual(res.block.frame, { x: 80, y: 377, w: 632, h: 120 });
    assert.equal(res.atIndex, undefined);
  });

  it("규칙 3: 일반 → 일반은 선택 블록 바로 뒤, 선택이 없으면 페이지 끝에 넣는다", () => {
    const b1 = makeTextBlock("b1", "s1");
    const b2 = makeTextBlock("b2", "s2");
    const page = makePage("p_flow", [b1, b2]);
    const copy = makeTextBlock("b_copy", "s_copy");

    const afterFirst = placePastedBlock(page, copy, { selectedBlockId: "b1" });
    assert.equal(afterFirst.atIndex, 1);
    assert.equal(afterFirst.block.frame, undefined);

    const atEnd = placePastedBlock(page, copy, { selectedBlockId: null });
    assert.equal(atEnd.atIndex, 2);
  });

  it("규칙 4: 고정 좌표 → 일반은 frame 좌표를 버리고 선택 블록 뒤에 넣는다", () => {
    const b1 = makeTextBlock("b1", "s1");
    const b2 = makeTextBlock("b2", "s2");
    const flowPage = makePage("p_flow", [b1, b2]);
    const fixedCopy = makeTextBlock("b_fixed", "s_fixed", { x: 120, y: 300, w: 240, h: 90 });

    const res = placePastedBlock(flowPage, fixedCopy, {
      sourcePageId: "p_fixed",
      sourceFrame: fixedCopy.frame,
      selectedBlockId: "b1",
    });
    assert.equal(res.block.frame, undefined);
    assert.equal(res.atIndex, 1);
  });

  it("규칙 5: 일반 → 고정 좌표는 x=왼쪽 여백, y=선택 블록 아래+16px(없으면 위쪽 여백), 너비=본문 너비", () => {
    const existing = makeTextBlock("b_fixed", "s_f", { x: 56, y: 100, w: 682, h: 120 });
    const fixedPage = makePage("p_fixed", [existing], true); // 기본 여백 left:56, right:56, top:48
    const flowBlock = makeTextBlock("b_flow", "s_fl");

    // 선택 없음 → 위쪽 여백(48)
    const noSel = placePastedBlock(fixedPage, flowBlock, { selectedBlockId: null });
    assert.deepEqual(noSel.block.frame, { x: 56, y: 48, w: A4_PAGE_WIDTH_PX - 112 });

    // 선택 있음 → 아래 + 16px (100 + 120 + 16 = 236)
    const withSel = placePastedBlock(fixedPage, flowBlock, { selectedBlockId: "b_fixed" });
    assert.deepEqual(withSel.block.frame, { x: 56, y: 236, w: A4_PAGE_WIDTH_PX - 112 });
  });

  it("공통 규칙: 좌표는 항상 A4 페이지(794×1123px) 안으로 제한한다", () => {
    const edgeBlock = makeTextBlock("b_edge", "s_edge", { x: 600, y: 1040, w: 250, h: 100 });
    const page = makePage("p_fixed", [edgeBlock]);

    const res = placePastedBlock(page, edgeBlock, {
      sourcePageId: "p_fixed",
      sourceFrame: edgeBlock.frame,
      pasteCount: 2,
    });
    assert.ok(res.block.frame);
    assert.equal(res.block.frame.x, A4_PAGE_WIDTH_PX - 250);
    assert.equal(res.block.frame.y, A4_PAGE_HEIGHT_PX - 100);
  });

  it("cloneBlockWithSlots(copySuffix: false)는 붙여넣기 시 슬롯 라벨에 '(복제)'를 붙이지 않는다", () => {
    const block = makeTextBlock("b1", "s1");
    const slots: Record<string, VDocSlot> = {
      s1: { slotId: "s1", label: "제목 슬롯", role: "editable-slot", content: "<p>안녕 {{org}}</p>", backDataRefs: ["bd1"] },
    };
    const pasted = cloneBlockWithSlots(block, slots, () => "k1", { copySuffix: false });
    const pastedSid = (pasted.block as Extract<LayoutBlock, { kind: "text" }>).slotId;
    assert.equal(pasted.slots[pastedSid].label, "제목 슬롯");

    const dup = cloneBlockWithSlots(block, slots, () => "k2");
    const dupSid = (dup.block as Extract<LayoutBlock, { kind: "text" }>).slotId;
    assert.equal(dup.slots[dupSid].label, "제목 슬롯 (복제)");
  });

  it("duplicateBlock 은 고정 좌표 페이지에서 원본 위에 겹치지 않고 +16px 어긋나게 복제한다", () => {
    const orig = makeTextBlock("b1", "s1", { x: 100, y: 120, w: 200, h: 60 });
    const doc: VDocDocument = {
      version: "1.0.0",
      docId: "d1",
      title: "doc",
      status: "Draft",
      updatedAt: "",
      variables: {},
      backdata: {},
      pages: [makePage("p1", [orig])],
      slots: { s1: { slotId: "s1", label: "L", role: "editable-slot", content: "<p>A</p>", backDataRefs: [] } },
    };
    let seq = 0;
    const next = duplicateBlock(doc, "p1", "b1", () => `x${++seq}`);
    assert.equal(next.pages[0].blocks.length, 2);
    assert.deepEqual(next.pages[0].blocks[1].frame, { x: 116, y: 136, w: 200, h: 60 });
  });

  it("교차 문서 붙여넣기 시 대상 문서에 없는 {{변수}}만 병합한다", () => {
    const targetVars = { company: "기존회사" };
    const sourceVars = { company: "원본회사", ceo: "홍길동", unused: "무시" };
    const merged = mergeMissingVariables(targetVars, sourceVars, [
      '<p><span data-variable="company"></span> 대표 {{ceo}}</p>',
    ]);
    assert.deepEqual(merged, { company: "기존회사", ceo: "홍길동" });
  });
});

describe("snapFrame 정렬 가이드 및 스냅", () => {
  const pageBox: PageSnapBox = {
    width: A4_PAGE_WIDTH_PX,
    height: A4_PAGE_HEIGHT_PX,
    margin: { top: 48, right: 56, bottom: 48, left: 56 },
  };
  const sibling: SnapRect = { x: 100, y: 200, w: 200, h: 100 }; // X: 100/200/300, Y: 200/250/300

  it("6개 기준선(좌·중앙·우 / 상·중앙·하)에 4px 이내면 스냅하고 맞은 축의 가이드선만 그린다", () => {
    // X 만 왼쪽선(100)에 3px 차이로 근접, Y 는 멀리(420)
    const movingXOnly: SnapRect = { x: 103, y: 420, w: 150, h: 60 };
    const resX = snapFrame(movingXOnly, [sibling], pageBox, 4);
    assert.equal(resX.x, 100);
    assert.equal(resX.y, 420);
    assert.ok(resX.guides.some((g) => g.axis === "vertical" && g.pos === 100));
    assert.equal(resX.guides.filter((g) => g.axis === "horizontal").length, 0);

    // X 우측선(moving.x + w = 300) 과 Y 세로중앙(sibling middle=250)에 동시 스냅
    const movingCenterAndRight: SnapRect = { x: 197, y: 222, w: 100, h: 60 }; // right=297(+3 -> 300), middle=252(-2 -> 250)
    const resBoth = snapFrame(movingCenterAndRight, [sibling], pageBox, 4);
    assert.equal(resBoth.x, 200);
    assert.equal(resBoth.y, 220);
    assert.ok(resBoth.guides.some((g) => g.axis === "vertical" && g.pos === 300));
    assert.ok(resBoth.guides.some((g) => g.axis === "horizontal" && g.pos === 250));
  });

  it("4px 임계값을 넘으면 스냅하지 않고, 페이지 여백·페이지 중앙에도 스냅한다", () => {
    const outOfThreshold: SnapRect = { x: 105, y: 205, w: 100, h: 60 };
    const noSnap = snapFrame(outOfThreshold, [sibling], pageBox, 4);
    assert.equal(noSnap.x, 105);
    assert.equal(noSnap.y, 205);
    assert.equal(noSnap.guides.length, 0);

    // 왼쪽 여백(56) & 페이지 가로 중앙(397)
    const nearMargin = snapFrame({ x: 59, y: 50, w: 120, h: 50 }, [], pageBox, 4);
    assert.equal(nearMargin.x, 56);
    assert.equal(nearMargin.y, 48); // 위쪽 여백(48)도 +2px 이라 함께 스냅

    const nearCenter = snapFrame({ x: 335, y: 600, w: 120, h: 50 }, [], pageBox, 4); // center = 395 vs 397
    assert.equal(nearCenter.x, 337);
    assert.ok(nearCenter.guides.some((g) => g.axis === "vertical" && g.pos === 397));
  });

  it("Alt(disableSnap=true)이면 스냅과 가이드선을 모두 끈다", () => {
    const moving: SnapRect = { x: 102, y: 201, w: 120, h: 60 };
    const res = snapFrame(moving, [sibling], pageBox, 4, true);
    assert.equal(res.x, 102);
    assert.equal(res.y, 201);
    assert.equal(res.guides.length, 0);
  });
});

describe("insertAtY 플로팅 '+' 위치 삽입", () => {
  it("일반 페이지에서는 가장 가까운 틈의 순번에 넣는다", () => {
    const flowPage = makePage("p_flow", [makeTextBlock("b1", "s1"), makeTextBlock("b2", "s2")]);
    const gaps = [
      { index: 0, y: 40 },
      { index: 1, y: 200 },
      { index: 2, y: 420 },
    ];
    assert.equal(findNearestFlowGap(gaps, 185)?.index, 1);

    const candidate = makeTextBlock("b_new", "s_new", { x: 0, y: 0, w: 100, h: 50 });
    const res = insertAtY(flowPage, 390, candidate, { flowGaps: gaps });
    assert.equal(res.atIndex, 2);
    assert.equal(res.block.frame, undefined);
  });

  it("고정 좌표 페이지에서는 y=높이, x=왼쪽 여백, w=본문 너비, h=블록 기본 높이로 프레임을 만든다", () => {
    const existing = makeTextBlock("b1", "s1", { x: 56, y: 100, w: 682, h: 80 });
    const fixedPage = makePage("p_fixed", [existing], true);
    const candidate = makeTextBlock("b_new", "s_new");
    const res = insertAtY(fixedPage, 340, candidate);
    assert.equal(res.atIndex, undefined);
    assert.deepEqual(res.block.frame, { x: 56, y: 340, w: A4_PAGE_WIDTH_PX - 112, h: 48 });
  });
});

describe("deleteUnitsFromDocument 범위 삭제(방식 A)", () => {
  it("전체 단위가 포함된 잠금 해제 블록은 제거하고, 일부 칸만 선택된 블록은 해당 칸 내용만 비운다", () => {
    const sec: LayoutBlock = {
      blockId: "blk_sec",
      kind: "section-block",
      title: "섹션",
      headingSlotId: "s_sec_h",
      bodySlotId: "s_sec_b",
    };
    const grid: LayoutBlock = {
      blockId: "blk_grid",
      kind: "columns-grid",
      title: "2단",
      widths: ["1fr", "1fr"],
      slotIds: ["s_g1", "s_g2"],
    };
    const img: LayoutBlock = { blockId: "blk_img", kind: "image", title: "img", src: "" };
    const lockedTxt: LayoutBlock = { blockId: "blk_locked", kind: "text", title: "잠금", slotId: "s_locked" };

    const doc: VDocDocument = {
      version: "1.0.0",
      docId: "d1",
      title: "doc",
      status: "Draft",
      updatedAt: "",
      variables: {},
      backdata: {},
      pages: [makePage("p1", [sec, grid, img, lockedTxt])],
      slots: {
        s_sec_h: { slotId: "s_sec_h", label: "H", role: "editable-slot", content: "<p>제목</p>", backDataRefs: [] },
        s_sec_b: { slotId: "s_sec_b", label: "B", role: "editable-slot", content: "<p>본문</p>", backDataRefs: [] },
        s_g1: { slotId: "s_g1", label: "G1", role: "editable-slot", content: "<p>왼</p>", backDataRefs: [] },
        s_g2: { slotId: "s_g2", label: "G2", role: "editable-slot", content: "<p>오</p>", backDataRefs: [] },
        s_locked: {
          slotId: "s_locked",
          label: "L",
          role: "editable-slot",
          content: "<p>잠금</p>",
          constraints: { locked: true },
          backDataRefs: [],
        },
      },
    };

    // 섹션 본문만 일부 포함 + 그리드 2칸 전부 포함 + 이미지 포함 + 잠긴 텍스트 포함
    const next = deleteUnitsFromDocument(doc, ["s_sec_b", "s_g1", "s_g2", "blk_img", "s_locked"]);
    assert.deepEqual(
      next.pages[0].blocks.map((b) => b.blockId),
      ["blk_sec", "blk_locked"]
    );
    // 일부만 걸친 섹션의 본문만 비워지고 제목은 유지됨
    assert.equal(next.slots.s_sec_h.content, "<p>제목</p>");
    assert.equal(next.slots.s_sec_b.content, "<p></p>");
    // 잠긴 블록은 보존됨
    assert.equal(next.slots.s_locked.content, "<p>잠금</p>");
  });

  it("findFullySelectedBlocks 는 모든 단위가 선택된 블록(잠금·이미지 포함)만 문서 순서대로 반환한다", () => {
    const sec: LayoutBlock = {
      blockId: "blk_sec",
      kind: "section-block",
      title: "섹션",
      headingSlotId: "s_h",
      bodySlotId: "s_b",
    };
    const tbl: LayoutBlock = {
      blockId: "blk_tbl",
      kind: "structured-table",
      title: "표",
      columnWidths: ["50%", "50%"],
      rows: [{ rowId: "r1", cells: [{ cellId: "c1", slotId: "s_t1" }, { cellId: "c2", slotId: "s_t2" }] }],
    };
    const img: LayoutBlock = { blockId: "blk_img", kind: "image", title: "img", src: "" };
    const doc: VDocDocument = {
      version: "1.0.0",
      docId: "d1",
      title: "doc",
      status: "Draft",
      updatedAt: "",
      variables: {},
      backdata: {},
      pages: [makePage("p1", [sec, tbl, img])],
      slots: {
        s_h: { slotId: "s_h", label: "H", role: "editable-slot", content: "<p>A</p>", backDataRefs: [] },
        s_b: { slotId: "s_b", label: "B", role: "editable-slot", content: "<p>B</p>", backDataRefs: [] },
        s_t1: { slotId: "s_t1", label: "T1", role: "editable-slot", content: "<p>1</p>", backDataRefs: [] },
        s_t2: { slotId: "s_t2", label: "T2", role: "editable-slot", content: "<p>2</p>", backDataRefs: [] },
      },
    };

    // 섹션 일부(s_b)만 선택 + 표 전체(s_t1, s_t2) + 이미지(blk_img) 선택
    const full = findFullySelectedBlocks(doc, ["s_b", "s_t1", "s_t2", "blk_img"]);
    assert.deepEqual(
      full.map((f) => f.block.blockId),
      ["blk_tbl", "blk_img"]
    );
  });

  it("resolvePageDimensionsPx 와 getPageContentWidth 는 가변 pageRect 규격을 반영한다", () => {
    assert.deepEqual(resolvePageDimensionsPx(undefined), { width: A4_PAGE_WIDTH_PX, height: A4_PAGE_HEIGHT_PX });
    const tallPage: VDocPage = {
      ...makePage("p_tall", [makeTextBlock("b1", "s1", { x: 40, y: 1400, w: 600, h: 120 })]),
      pageRect: { width: 900, height: 1800, unit: "px" },
    };
    assert.deepEqual(resolvePageDimensionsPx(tallPage), { width: 900, height: 1800 });
    assert.equal(getPageContentWidth(tallPage), 900 - 112);

    const ptPage: VDocPage = {
      ...makePage("p_pt", []),
      pageRect: { width: 600, height: 900, unit: "pt" },
    };
    assert.deepEqual(resolvePageDimensionsPx(ptPage), { width: 800, height: 1200 });

    const pasted = placePastedBlock(tallPage, makeTextBlock("b1", "s1", { x: 40, y: 1400, w: 600, h: 120 }), {
      sourcePageId: "p_tall",
      sourceFrame: { x: 40, y: 1400, w: 600, h: 120 },
      pasteCount: 1,
    });
    assert.equal(pasted.block.frame?.y, 1416);
  });
});



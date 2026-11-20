import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { StructuredTableBlockDef, VDocSlot, WebFormBlockDef } from "@vibe/vdoc-schema";

import {
  buildTableCompilePromptPayload,
  computeSourceHash,
  parseThreeRuleTextToNodes,
  serializeNodesToOutlineText,
} from "../model/aiTableCompiler";
import { extractPhase2Links, resolveNodesForLinkedDoc } from "../model/documentLinkParser";
import {
  BLOCK_ASSET_CATALOG,
  buildAssetTemplatePreviewTable,
  buildDynamicTableVariantBlock,
} from "../model/formAssets";
import {
  compilePlaygroundToVDoc,
  tableBlockToPlaygroundNodes,
} from "../model/playgroundCompiler";
import { clonePlaygroundPreset } from "../model/presets";
import type { BlockVariantId } from "../model/types";
import { usePlaygroundStore } from "../model/usePlaygroundStore";

function findTableBlock(
  doc: ReturnType<typeof compilePlaygroundToVDoc>["doc"],
  blockId: string
): StructuredTableBlockDef | undefined {
  for (const page of doc.pages) {
    const found = page.blocks.find(
      (b): b is StructuredTableBlockDef =>
        b.blockId === blockId && (b.kind === "structured-table" || b.kind === "table")
    );
    if (found) return found;
  }
  return undefined;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

describe("Playground 3규칙 표 문법 및 목업 컴파일", () => {
  it("이미지 1(기본 인적 사항)과 이미지 2(장비·의류 대여)가 3규칙만으로 정확히 컴파일된다", () => {
    const spec = clonePlaygroundPreset("workshop-request");
    const links = extractPhase2Links(spec);
    const rawDoc = links.documents.find((d) => d.nodeId === "ws-doc-survey-raw");
    assert.ok(rawDoc, "ws-doc-survey-raw 문서가 존재해야 한다");

    const compiled = compilePlaygroundToVDoc(spec, {}, {
      nodesOverride: resolveNodesForLinkedDoc(spec, rawDoc),
      titleOverride: rawDoc.title,
      linkedDoc: rawDoc,
    });

    const p1InfoTable = findTableBlock(compiled.doc, "pg_blk_ws-doc-raw-p1-sec2-table-wrap_raw");
    assert.ok(p1InfoTable, "1쪽 응답자 기본 정보 표가 존재해야 한다");
    assert.equal(p1InfoTable.columnWidths.length, 5);
    assert.equal(p1InfoTable.rows.length, 5);
    assert.equal(p1InfoTable.rows[0].cells[0].rowSpan, 3);
    assert.equal(stripTags(compiled.doc.slots[p1InfoTable.rows[0].cells[0].slotId].content), "기본 인적 사항");
    assert.equal(stripTags(compiled.doc.slots[p1InfoTable.rows[0].cells[2].slotId].content), "");
    assert.equal(p1InfoTable.rows[1].cells.length, 4);
    assert.equal(stripTags(compiled.doc.slots[p1InfoTable.rows[1].cells[1].slotId].content), "");
    assert.equal(stripTags(compiled.doc.slots[p1InfoTable.rows[1].cells[3].slotId].content), "");
    assert.equal(p1InfoTable.rows[3].cells[1].colSpan, 4);
    assert.equal(stripTags(compiled.doc.slots[p1InfoTable.rows[4].cells[1].slotId].content), "");

    const p2GearTable = findTableBlock(compiled.doc, "pg_blk_ws-doc-raw-p2-sec2-table-wrap_raw");
    assert.ok(p2GearTable, "2쪽 장비·의류 대여 표가 존재해야 한다");
    assert.equal(p2GearTable.columnWidths.length, 12);
    assert.equal(p2GearTable.rows.length, 10);
    assert.equal(p2GearTable.rows[0].cells[0].colSpan, 12);
    assert.deepEqual(
      p2GearTable.rows[1].cells.map((c) => c.colSpan),
      [4, 4, 4]
    );
    assert.deepEqual(
      p2GearTable.rows[3].cells.map((c) => c.colSpan),
      [3, 3, 3, 3]
    );
    assert.deepEqual(
      p2GearTable.rows[5].cells.map((c) => stripTags(compiled.doc.slots[c.slotId].content)),
      ["", "", ""]
    );
    assert.deepEqual(
      p2GearTable.rows[9].cells.map((c) => c.colSpan),
      [6, 6]
    );
  });

  it("ws-doc-survey-web(WebForm)에서도 3규칙 표가 설문 필드로 정상 변환된다", () => {
    const spec = clonePlaygroundPreset("workshop-request");
    const links = extractPhase2Links(spec);
    const webDoc = links.documents.find((d) => d.nodeId === "ws-doc-survey-web");
    assert.ok(webDoc, "ws-doc-survey-web 문서가 존재해야 한다");

    const compiled = compilePlaygroundToVDoc(spec, {}, {
      nodesOverride: resolveNodesForLinkedDoc(spec, webDoc),
      titleOverride: webDoc.title,
      linkedDoc: webDoc,
    });

    const gearWebBlock = compiled.doc.pages[0]?.blocks.find(
      (b): b is WebFormBlockDef =>
        b.blockId === "pg_blk_ws-doc-web-p2-sec2-table-wrap_raw" && b.kind === "web-form"
    );
    assert.ok(gearWebBlock, "장비·의류 대여 WebForm 블록이 존재해야 한다");
    assert.equal(gearWebBlock.fields.length, 5);
    assert.equal(gearWebBlock.fields[0].inputKind, "single-choice");
    assert.deepEqual(gearWebBlock.fields[0].options, [
      "전체 대여",
      "부분 대여(부츠·플레이트)",
      "개인 장비 지참",
    ]);
    assert.equal(gearWebBlock.fields[2].inputKind, "multi-input");
    assert.deepEqual(
      gearWebBlock.fields[2].subFields?.map((s) => s.label),
      ["신장(cm)", "신발(mm)", "의류(S~2XL)"]
    );
  });

  it("실험용 에셋 묶음 5종이 등록되어 있고 변형 전환·시각 스타일·캐시 시 순수 나이브 원문은 보존된다", () => {
    const expAssets = BLOCK_ASSET_CATALOG.table;
    assert.equal(expAssets.length, 5);
    assert.deepEqual(
      expAssets.map((a) => a.id),
      [
        "table-grouped-compare",
        "table-modern-flat",
        "table-roster-ledger",
        "table-header-below-matrix",
        "table-eval-checklist",
      ]
    );

    const p1BlockId = "pg_blk_ws-doc-raw-p1-sec2-table-wrap_raw";
    const p2BlockId = "pg_blk_ws-doc-raw-p2-sec2-table-wrap_raw";

    for (const asset of expAssets) {
      const thumbPreview = buildAssetTemplatePreviewTable(asset);
      assert.ok(thumbPreview && thumbPreview.block.rows.length >= 2, `${asset.id}: 템플릿 썸네일 직접 렌더링 가능해야 한다`);
      const hasBlankThumbSlot = Object.values(thumbPreview.slots).some(
        (s) => stripTags(s.content) === ""
      );
      assert.ok(hasBlankThumbSlot, `${asset.id}: 썸네일에도 실제 빈칸 기입 셀이 포함되어야 한다`);

      usePlaygroundStore.getState().selectPreset("workshop-request");
      const store = usePlaygroundStore.getState();
      const variant = asset.id as BlockVariantId;
      store.setBlockVariant(p1BlockId, variant);
      store.setBlockVariant(p2BlockId, variant);

      const nextState = usePlaygroundStore.getState();
      const b1 = findTableBlock(nextState.compiled.doc, p1BlockId);
      const b2 = findTableBlock(nextState.compiled.doc, p2BlockId);
      assert.ok(b1 && b1.rows.length > 0, `${variant}: p1 표 생성`);
      assert.ok(b2 && b2.rows.length > 0, `${variant}: p2 표 생성`);

      if (variant === "table-modern-flat") {
        assert.equal(b1.borderRules?.vertical, "none", "모던 수평 비교표는 세로선을 제거해야 한다");
        assert.equal(b1.rows[0].cells[0].backgroundColor, "#f1f5f9", "모던 수평 1행 헤더만 연한 음영이어야 한다");
        for (let rIdx = 1; rIdx < b1.rows.length; rIdx += 1) {
          for (const cell of b1.rows[rIdx].cells) {
            assert.equal(cell.backgroundColor, undefined, `모던 수평 본문 ${rIdx}행 셀은 배경 음영이 없어야 한다`);
          }
        }
        assert.ok(
          parseFloat(b1.columnWidths[2]) > parseFloat(b1.columnWidths[0]),
          "긴 선택지가 있는 내용 열이 분류 열보다 넓어야 한다"
        );
      }
      if (variant === "table-roster-ledger") {
        assert.equal(b1.borderRules?.outer, "2px solid #0f172a", "관리대장형은 외곽 2px 실선이어야 한다");
      }

      const rawDoc = nextState.linkExtraction.documents.find((d) => d.nodeId === "ws-doc-survey-raw")!;
      const p1TableNode = rawDoc.pages[0].node.children
        .flatMap((c) => c.children)
        .find((c) => c.id === "ws-doc-raw-p1-sec2-table-wrap")!;
      assert.equal(p1TableNode.children[0].children[0].text, "성명", `${variant}: 나이브 원문 '성명' 보존`);
      assert.equal(p1TableNode.children[0].children[1].text, "파트 | 직급", `${variant}: 나이브 원문 '파트 | 직급' 보존`);
      assert.equal(p1TableNode.children[1].text, "참석 구분: 참석 / 불참(사유) / 현장 설비 필수 대기·교대");
    }
  });

  it("aiTableCompiler: 3규칙 텍스트 파싱, 원문 해시, 부분 수정 프롬프트 컨텍스트 구성이 정확하다", () => {
    const parsed = parseThreeRuleTextToNodes(
      [
        "```text",
        "기본 인적 사항",
        "  성명 | [-]",
        "  파트 | [-] | 직급 | [-]",
        "| 참석 구분 | □ 참석   □ 불참 |",
        "| --- | --- |",
        "불참 사유 | [-]",
        "```",
      ].join("\n"),
      "ai_t"
    );
    assert.equal(parsed.length, 3);
    assert.equal(parsed[0].text, "기본 인적 사항");
    assert.equal(parsed[0].children.length, 2);
    assert.equal(parsed[0].children[0].text, "성명 | [-]");
    assert.equal(parsed[1].text, "참석 구분 | □ 참석   □ 불참");
    assert.equal(parsed[2].text, "불참 사유 | [-]");

    const spec = clonePlaygroundPreset("workshop-request");
    const links = extractPhase2Links(spec);
    const rawDoc = links.documents.find((d) => d.nodeId === "ws-doc-survey-raw")!;
    const resolvedNodes = resolveNodesForLinkedDoc(spec, rawDoc);
    const p1Wrap = resolvedNodes
      .flatMap((p) => p.children.flatMap((s) => s.children))
      .find((n) => n.id === "ws-doc-raw-p1-sec2-table-wrap")!;
    const sourceRows = p1Wrap.children.filter((c) => !c.text.includes("<<view:"));

    assert.ok(serializeNodesToOutlineText(sourceRows).includes("기본 인적 사항"));
    const h1 = computeSourceHash(sourceRows);
    const h2 = computeSourceHash(sourceRows);
    assert.equal(h1, h2);

    const payload = buildTableCompilePromptPayload({
      sourceRows,
      asset: BLOCK_ASSET_CATALOG.table[3],
      sectionTitle: "1. 응답자 기본 정보",
      currentViewRows: parsed,
      userFeedback: "참석 구분을 3칸으로 분할",
    });
    assert.equal(payload.contexts.length, 3);
    assert.ok(payload.contexts[1].content?.includes("<<template:table>>"));
    assert.ok(payload.instruction.includes("참석 구분을 3칸으로 분할"));
  });

  it("표 뷰 캐시: 느낌 보기 수정은 캐시를 덮어쓰지 않고, Apply 누를 때만 캐시에 확정되며 Revert로 복원된다", () => {
    usePlaygroundStore.getState().selectPreset("workshop-request");
    const blockId = "pg_blk_ws-doc-raw-p1-sec2-table-wrap_raw";
    let state = usePlaygroundStore.getState();
    const initialDefault = state.compiled.blockMetaMap[blockId].defaultVariant;

    // 1) 에셋 전환 전에 느낌 보기 수정만 하면 clean 초기 캐시는 보존되고 dirtyViewBlocks만 true가 된다
    const initTbl = findTableBlock(state.compiled.doc, blockId)!;
    state.updateSlotContent(initTbl.rows[0].cells[2].slotId, "<p>임시느낌</p>");
    state = usePlaygroundStore.getState();
    assert.equal(state.dirtyViewBlocks[blockId], true, "Apply 전까지는 미확정 상태여야 한다");
    assert.equal(
      state.viewCache[`${blockId}::${initialDefault}`]?.generatedBy,
      "preset",
      "깨끗한 초기 캐시는 오염되지 않아야 한다"
    );

    // 2) Revert 실행 시 임시 수정이 버려지고 깨끗한 초기 캐시로 돌아간다
    state.revertTableViewToCache(blockId);
    state = usePlaygroundStore.getState();
    assert.equal(Boolean(state.dirtyViewBlocks[blockId]), false);
    const revertedTbl = findTableBlock(state.compiled.doc, blockId)!;
    assert.equal(stripTags(state.compiled.doc.slots[revertedTbl.rows[0].cells[2].slotId].content), "");

    // 3) 모던 수평형으로 전환 후 느낌 보기 수정 -> clean 캐시('[-]')만 보존되고 '확정이름' 은 캐시에 들어가지 않는다
    state.setBlockVariant(blockId, "table-modern-flat");
    state = usePlaygroundStore.getState();
    const modernTbl = findTableBlock(state.compiled.doc, blockId)!;
    state.updateSlotContent(modernTbl.rows[1].cells[1].slotId, "<p>확정이름</p>");
    state = usePlaygroundStore.getState();
    assert.equal(state.dirtyViewBlocks[blockId], true);
    const cleanModernCache = state.viewCache[`${blockId}::table-modern-flat`];
    assert.equal(cleanModernCache?.generatedBy, "preset");
    assert.equal(
      JSON.stringify(cleanModernCache?.viewNodes ?? []).includes("확정이름"),
      false,
      "Apply 전엔 임시 수정('확정이름')이 캐시를 오염시키지 않아야 한다"
    );

    state.applyTableViewToCache(blockId);
    state = usePlaygroundStore.getState();
    assert.equal(Boolean(state.dirtyViewBlocks[blockId]), false);
    assert.equal(state.viewCache[`${blockId}::table-modern-flat`]?.generatedBy, "manual");

    // 4) 다른 에셋 갔다가 되돌아오면 Apply 로 확정한 버전이 그대로 복원된다
    state.setBlockVariant(blockId, initialDefault);
    state.setBlockVariant(blockId, "table-modern-flat");
    state = usePlaygroundStore.getState();
    const restoredTbl = findTableBlock(state.compiled.doc, blockId)!;
    assert.ok(
      JSON.stringify(restoredTbl).includes("확정이름") ||
        JSON.stringify(state.outlinerRoots).includes("확정이름"),
      "Apply 로 확정한 뷰 내용이 유지되어야 한다"
    );
  });

  it("방향 병합 기호 [^] (세로병합) 와 [<] (가로병합) 이 복합 HWP 표 컴파일 및 역변환을 왕복 보존한다", () => {
    const viewText = [
      "참석현황",
      "  참석대상 | [-] | 회사측 | [<] | [<] | 근로자측 | [<] | [<]",
      "  참석자 | [-] | 직위 | 성명 | 서명 | 직위 | 성명 | 서명",
      "  불참자 | [-] | [-] | [-] | [-] | [-] | [-] | [-]",
      "불참내역",
      "  [-] | [<] | [-] | [-] | [-] | [-] | [-] | [-]",
      "  [^] | [<] | [-] | [-] | [-] | [-] | [-] | [-]",
      "  [^] | [<] | [-] | [-] | [-] | [-] | [-] | [-]",
      "  [^] | [<] | [-] | [-] | [-] | [-] | [-] | [-]",
    ].join("\n");

    const rowNodes = parseThreeRuleTextToNodes(viewText, "labor");
    const slots: Record<string, VDocSlot> = {};
    const built = buildDynamicTableVariantBlock(
      "pg_blk_labor_test",
      rowNodes,
      "table-grouped-compare",
      (_nodeId, slotId, label, html) => {
        slots[slotId] = {
          slotId,
          label,
          role: "editable-slot",
          content: html,
          backDataRefs: [],
          isEdited: false,
        };
        return slotId;
      }
    );
    assert.equal(built.kind, "structured-table");
    const tbl = built as StructuredTableBlockDef;
    assert.equal(tbl.columnWidths.length, 9);
    assert.equal(tbl.rows.length, 7);

    // 참석현황 row 0: [참석현황(rowSpan=3)] [참석대상] [[-]] [회사측(colSpan=3)] [근로자측(colSpan=3)]
    assert.equal(tbl.rows[0].cells[0].rowSpan, 3);
    assert.equal(tbl.rows[0].cells[3].colSpan, 3);
    assert.equal(tbl.rows[0].cells[4].colSpan, 3);
    assert.equal(stripTags(slots[tbl.rows[0].cells[3].slotId].content), "회사측");
    assert.equal(stripTags(slots[tbl.rows[0].cells[4].slotId].content), "근로자측");

    // 불참내역 row 3: [불참내역(rowSpan=4)] [큰 빈칸(colSpan=2, rowSpan=4)] + 6 trailing blanks
    assert.equal(tbl.rows[3].cells[0].rowSpan, 4);
    assert.equal(tbl.rows[3].cells[1].colSpan, 2);
    assert.equal(tbl.rows[3].cells[1].rowSpan, 4);
    assert.equal(tbl.rows[3].cells.length, 8);
    // rows 4..6 only have the 6 trailing blank cells
    assert.equal(tbl.rows[4].cells.length, 6);
    assert.equal(tbl.rows[6].cells.length, 6);

    // 역변환 시 [^] 및 [<] 가 손실 없이 그대로 복원되어야 한다
    const roundTripped = tableBlockToPlaygroundNodes(tbl, slots, rowNodes, "rt");
    assert.equal(roundTripped.length, 2);
    assert.equal(roundTripped[0].children[0].text, "참석대상 | [-] | 회사측 | [<] | [<] | 근로자측 | [<] | [<]");
    assert.equal(roundTripped[1].children[0].text, "[-] | [<] | [-] | [-] | [-] | [-] | [-] | [-]");
    assert.equal(roundTripped[1].children[1].text, "[^] | [<] | [-] | [-] | [-] | [-] | [-] | [-]");
  });
});

describe("페이지 미리보기(WYSIWYG) 표 구조 변경 및 <<view:table>> 양방향 반영", () => {
  it("페이지 미리보기에서 행 추가·배경색·셀 편집 시 <<view:table>> 만 갱신되고 순수 나이브 원문은 보존된다", () => {
    usePlaygroundStore.getState().selectPreset("workshop-request");
    const initial = usePlaygroundStore.getState();
    const blockId = "pg_blk_ws-doc-raw-p1-sec2-table-wrap_raw";
    const pageId = initial.compiled.doc.pages[0].pageId;

    // 1) 행 추가 -> <<view:table>> 하위에 반영, 나이브 원문은 그대로 3행 유지
    initial.runTableCommand(pageId, blockId, null, { type: "addRowEnd" });
    let state = usePlaygroundStore.getState();
    let tbl = findTableBlock(state.compiled.doc, blockId)!;
    assert.equal(tbl.rows.length, 6, "미리보기 표에 6번째 행이 추가되어야 한다");

    const getP1TableNode = (curState: typeof state) =>
      curState.linkExtraction.documents
        .find((d) => d.nodeId === "ws-doc-survey-raw")!
        .pages[0].node.children.flatMap((c) => c.children)
        .find((c) => c.id === "ws-doc-raw-p1-sec2-table-wrap")!;

    const p1TableNode = getP1TableNode(state);
    assert.ok(p1TableNode, "아웃라이너의 <<table>> 노드를 찾을 수 있어야 한다");
    assert.equal(p1TableNode.children.length, 4, "나이브 원문 3개 + <<view:table>> 1개여야 한다");
    assert.equal(p1TableNode.children[0].children[0].text, "성명", "나이브 원문은 훼손되지 않아야 한다");
    const viewNode = p1TableNode.children[3];
    assert.equal(viewNode.text, "<<view:table>>");
    assert.equal(viewNode.children.length, 4, "<<view:table>> 하위에 새 행이 추가되어야 한다");
    assert.ok(viewNode.children[3].text.includes("[-]"), "새 빈 행은 <<view:table>> 내부에서 [-]로 동기화되어야 한다");

    // 2) 셀 배경색 변경
    state.runTableCommand(pageId, blockId, null, {
      type: "setCellBackground",
      range: { anchor: { row: 5, col: 0 }, head: { row: 5, col: 0 } },
      color: "#fef08a",
    });
    state = usePlaygroundStore.getState();
    tbl = findTableBlock(state.compiled.doc, blockId)!;
    assert.equal(tbl.rows[5].cells[0].backgroundColor, "#fef08a");

    // 3) 셀 내용 편집 -> <<view:table>> 내부 노드만 반영되고 나이브 원문('성명')은 보존
    const targetSlotId = tbl.rows[0].cells[2].slotId;
    state.updateSlotContent(targetSlotId, "<p>홍길동</p>");
    state = usePlaygroundStore.getState();
    assert.equal(stripTags(state.compiled.doc.slots[targetSlotId].content), "홍길동");
    const editedTable = getP1TableNode(state);
    assert.equal(editedTable.children[0].children[0].text, "성명", "나이브 원문 '성명' 은 그대로 유지");
    assert.equal(editedTable.children[3].children[0].children[0].text, "성명 | 홍길동");

    state.updateSlotContent(targetSlotId, "<p><br/></p>");
    state = usePlaygroundStore.getState();
    const clearedTable = getP1TableNode(state);
    assert.equal(clearedTable.children[0].children[0].text, "성명");
    assert.equal(clearedTable.children[3].children[0].children[0].text, "성명 | [-]");

    // 4) 아웃라이너에서 <<view:table>> 직접 수정 시 기존 WYSIWYG tableOverrides를 해제하고 재컴파일한다
    const nextRoots = structuredClone(state.outlinerRoots);
    const findAndEdit = (list: typeof nextRoots): boolean => {
      for (const item of list) {
        if (item.id === "ws-doc-raw-p1-sec2-table-view") {
          item.children.push({
            id: "manual_new_row",
            text: "비상 연락처 | [-]",
            children: [],
          });
          return true;
        }
        if (findAndEdit(item.children)) return true;
      }
      return false;
    };
    assert.ok(findAndEdit(nextRoots));
    state.commitOutlinerRoots(nextRoots);
    state = usePlaygroundStore.getState();
    tbl = findTableBlock(state.compiled.doc, blockId)!;
    assert.equal(tbl.rows.length, 7);
    assert.equal(stripTags(state.compiled.doc.slots[tbl.rows[6].cells[0].slotId].content), "비상 연락처");
  });
});

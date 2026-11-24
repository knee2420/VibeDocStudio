import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  AGUI_A2UI_CANDIDATE_GROUPS,
  buildInitialSuggestions,
} from "../model/aguiDemoModel";
import { extractPhase2Links } from "../model/documentLinkParser";
import { clonePlaygroundPreset } from "../model/presets";
import { usePlaygroundStore } from "../model/usePlaygroundStore";

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

describe("v1-form-hub AG-UI · A2UI 인터랙션 목업 문서 검증", () => {
  it("4종 포맷(HWP · Blog · WebForm · RFP)이 모두 정상 연계·컴파일되고 모든 후보/제안 타겟 블록과 슬롯이 실존한다", () => {
    const spec = clonePlaygroundPreset("agui-protocol-demo");
    const links = extractPhase2Links(spec);
    assert.equal(links.documents.length, 4, "4개의 연계 포맷 문서가 추출되어야 한다");
    assert.deepEqual(
      links.documents.map((d) => d.nodeId),
      ["agui-doc-hwp", "agui-doc-blog", "agui-doc-webform", "agui-doc-rfp"]
    );

    const suggestions = buildInitialSuggestions();
    usePlaygroundStore.getState().selectPreset("agui-protocol-demo");

    for (const doc of links.documents) {
      usePlaygroundStore.getState().selectLinkedDocument(doc.id);
      const state = usePlaygroundStore.getState();
      const allBlockIds = new Set(
        state.compiled.doc.pages.flatMap((p) => p.blocks.map((b) => b.blockId))
      );

      // 1) 이 문서의 모든 A2UI 후보 그룹 targetBlockId가 실제 컴파일된 블록에 존재해야 한다
      const groups = AGUI_A2UI_CANDIDATE_GROUPS.filter((g) => g.docNodeId === doc.nodeId);
      assert.ok(groups.length >= 1, `${doc.nodeId}: 최소 1개 이상의 A2UI 후보 그룹이 있어야 한다`);
      for (const group of groups) {
        assert.ok(
          allBlockIds.has(group.targetBlockId),
          `${doc.nodeId}: 후보 그룹 targetBlockId(${group.targetBlockId})가 시트에 존재해야 한다. 실제: ${[...allBlockIds].join(", ")}`
        );
      }

      // 2) 이 문서의 모든 AG-UI 위지윅 수정 제안 targetBlockId 및 slotId가 실존해야 한다
      const docSugs = suggestions.filter((s) => s.docNodeId === doc.nodeId);
      assert.ok(docSugs.length >= 1, `${doc.nodeId}: 최소 1개 이상의 AG-UI 수정 제안이 있어야 한다`);
      for (const sug of docSugs) {
        assert.ok(
          allBlockIds.has(sug.targetBlockId),
          `${doc.nodeId}: 제안 targetBlockId(${sug.targetBlockId})가 시트에 존재해야 한다. 실제: ${[...allBlockIds].join(", ")}`
        );
        const resolvedSlotId = state.compiled.doc.slots[sug.targetSlotId]
          ? sug.targetSlotId
          : state.compiled.nodeSlotIds[sug.targetNodeId]?.[0];
        assert.ok(
          resolvedSlotId && state.compiled.doc.slots[resolvedSlotId],
          `${doc.nodeId}: 제안(${sug.id})의 실존 슬롯을 찾을 수 있어야 한다`
        );
      }
    }
  });

  it("A2UI 에셋 후보 전환과 AG-UI 위지윅 수정 적용이 실제 시트 상태에 즉시 반영된다", () => {
    usePlaygroundStore.getState().selectPreset("agui-protocol-demo");
    const docs = usePlaygroundStore.getState().linkExtraction.documents;

    // 1) HWP 표 에셋 전환 + 제목 수정 반영
    const hwpDoc = docs.find((d) => d.nodeId === "agui-doc-hwp")!;
    usePlaygroundStore.getState().selectLinkedDocument(hwpDoc.id);
    usePlaygroundStore
      .getState()
      .setBlockVariant("pg_blk_agui-hwp-p1-sec2-tbl_raw", "table-modern-flat");
    let state = usePlaygroundStore.getState();
    assert.equal(
      state.blockVariants["pg_blk_agui-hwp-p1-sec2-tbl_raw"],
      "table-modern-flat"
    );

    const titleSlotId = state.compiled.nodeSlotIds["agui-hwp-p1-title"]?.[0];
    assert.ok(titleSlotId);
    usePlaygroundStore
      .getState()
      .updateSlotContent(titleSlotId, "<h1>2026년 차세대 사내 지식포털 구축 추진 품의서</h1>");
    state = usePlaygroundStore.getState();
    assert.equal(
      stripTags(state.compiled.doc.slots[titleSlotId].content),
      "2026년 차세대 사내 지식포털 구축 추진 품의서"
    );

    // 2) Blog 3단 카드 -> 구조화 비교표 전환
    const blogDoc = docs.find((d) => d.nodeId === "agui-doc-blog")!;
    usePlaygroundStore.getState().selectLinkedDocument(blogDoc.id);
    usePlaygroundStore.getState().changeNodeLayout("agui-blog-changes", "structured-table");
    state = usePlaygroundStore.getState();
    const changedBlogBlock = state.compiled.doc.pages[0].blocks.find(
      (b) => b.blockId === "pg_blk_agui-blog-changes"
    );
    assert.equal(changedBlogBlock?.kind, "structured-table");

    // 3) WebForm 테마 전환
    const wfDoc = docs.find((d) => d.nodeId === "agui-doc-webform")!;
    usePlaygroundStore.getState().selectLinkedDocument(wfDoc.id);
    usePlaygroundStore.getState().setWebFormTheme("webform-pill-chips");
    assert.equal(usePlaygroundStore.getState().webFormTheme, "webform-pill-chips");

    // 4) RFP 상세 명세표 -> 일람 요약표 전환
    const rfpDoc = docs.find((d) => d.nodeId === "agui-doc-rfp")!;
    usePlaygroundStore.getState().selectLinkedDocument(rfpDoc.id);
    usePlaygroundStore.getState().changeNodeLayout("agui-rfp-reqs", "rfp-summary-table");
    state = usePlaygroundStore.getState();
    const rfpTable = state.compiled.doc.pages[0].blocks.find(
      (b) => b.blockId === "pg_blk_agui-rfp-reqs"
    );
    assert.equal(rfpTable?.kind, "structured-table");
  });
});

import type { LayoutBlock, VDocSlot } from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";

export type InsertableBlockKind =
  | "columns-grid"
  | "structured-table"
  | "section-block"
  | "fillable-group";

export function useMutateCanvasBlocks() {
  const updateCurrentDoc = useStudioDocumentStore((s) => s.updateCurrentDoc);
  const setSelectedSlotId = useSlotSelectionStore((s) => s.setSelectedSlotId);

  const moveBlock = (
    pageId: string,
    blockIndex: number,
    direction: -1 | 1
  ) => {
    updateCurrentDoc((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => {
        if (p.pageId !== pageId) return p;
        const targetIndex = blockIndex + direction;
        if (targetIndex < 0 || targetIndex >= p.blocks.length) return p;
        const nextBlocks = [...p.blocks];
        const [moved] = nextBlocks.splice(blockIndex, 1);
        nextBlocks.splice(targetIndex, 0, moved);
        return { ...p, blocks: nextBlocks };
      }),
    }));
  };

  const deleteBlock = (pageId: string, blockId: string) => {
    updateCurrentDoc((prev) => ({
      ...prev,
      pages: prev.pages.map((p) =>
        p.pageId === pageId
          ? { ...p, blocks: p.blocks.filter((b) => b.blockId !== blockId) }
          : p
      ),
    }));
  };

  const addBlockToPage = (pageId: string, kind: InsertableBlockKind) => {
    const suffix = Date.now().toString(36);
    updateCurrentDoc((prev) => {
      const nextSlots: Record<string, VDocSlot> = { ...prev.slots };
      let newBlock: LayoutBlock;

      if (kind === "columns-grid") {
        const s1 = `slot_col1_${suffix}`;
        const s2 = `slot_col2_${suffix}`;
        nextSlots[s1] = {
          slotId: s1,
          label: "좌측 컬럼 슬롯",
          role: "editable-slot",
          content:
            "<p><strong>좌측 구획</strong><br/>내용을 입력하거나 ✨ AI로 채우세요.</p>",
          backDataRefs: Object.keys(prev.backdata).slice(0, 1),
        };
        nextSlots[s2] = {
          slotId: s2,
          label: "우측 컬럼 슬롯",
          role: "editable-slot",
          content:
            "<p><strong>우측 구획</strong><br/>레이아웃이 절대 무너지지 않는 독립 슬롯입니다.</p>",
          backDataRefs: Object.keys(prev.backdata).slice(0, 1),
        };
        newBlock = {
          blockId: `blk_cols_${suffix}`,
          kind: "columns-grid",
          title: "2단 비교 그리드 컨테이너",
          widths: ["1fr", "1fr"],
          slotIds: [s1, s2],
        };
        setSelectedSlotId(s1);
      } else if (kind === "structured-table") {
        const h1 = `slot_th1_${suffix}`;
        const h2 = `slot_th2_${suffix}`;
        const c1 = `slot_tc1_${suffix}`;
        const c2 = `slot_tc2_${suffix}`;
        nextSlots[h1] = {
          slotId: h1,
          label: "표 헤더 1",
          role: "boilerplate",
          content: "<p><strong>구분 항목</strong></p>",
          constraints: { locked: true },
          backDataRefs: [],
        };
        nextSlots[h2] = {
          slotId: h2,
          label: "표 헤더 2",
          role: "boilerplate",
          content: "<p><strong>세부 내역 슬롯</strong></p>",
          constraints: { locked: true },
          backDataRefs: [],
        };
        nextSlots[c1] = {
          slotId: c1,
          label: "표 1행 1열 슬롯",
          role: "editable-slot",
          content: "<p>안건 A</p>",
          backDataRefs: Object.keys(prev.backdata).slice(0, 1),
        };
        nextSlots[c2] = {
          slotId: c2,
          label: "표 1행 2열 슬롯",
          role: "editable-slot",
          content: "<p>각 셀마다 독립된 Tiptap 슬롯이 작동합니다.</p>",
          backDataRefs: Object.keys(prev.backdata).slice(0, 1),
        };
        newBlock = {
          blockId: `blk_tbl_${suffix}`,
          kind: "structured-table",
          title: "정밀 격자 표 (셀 단위 독립 슬롯)",
          columnWidths: ["32%", "68%"],
          rows: [
            {
              rowId: `r_h_${suffix}`,
              cells: [
                { cellId: `ch1_${suffix}`, slotId: h1, isHeader: true },
                { cellId: `ch2_${suffix}`, slotId: h2, isHeader: true },
              ],
            },
            {
              rowId: `r_1_${suffix}`,
              cells: [
                { cellId: `cc1_${suffix}`, slotId: c1 },
                { cellId: `cc2_${suffix}`, slotId: c2 },
              ],
            },
          ],
        };
        setSelectedSlotId(c2);
      } else if (kind === "fillable-group") {
        const sid = `slot_fill_${suffix}`;
        nextSlots[sid] = {
          slotId: sid,
          label: "할당형 입력 슬롯",
          role: "fillable-field",
          assignee: "서민규 서",
          content: "<p>담당자 및 백데이터가 바인딩된 전용 슬롯입니다.</p>",
          backDataRefs: Object.keys(prev.backdata).slice(0, 1),
        };
        newBlock = {
          blockId: `blk_fill_${suffix}`,
          kind: "fillable-group",
          title: "할당형 핵심 요약 필드",
          slotId: sid,
          assigneeName: "서민규 서",
          fieldType: "text-area",
        };
        setSelectedSlotId(sid);
      } else {
        const hId = `slot_sec_h_${suffix}`;
        const bId = `slot_sec_b_${suffix}`;
        nextSlots[hId] = {
          slotId: hId,
          label: "섹션 제목 슬롯",
          role: "boilerplate",
          content: "<h2>새로운 섹션 제목</h2>",
          backDataRefs: [],
        };
        nextSlots[bId] = {
          slotId: bId,
          label: "섹션 본문 슬롯",
          role: "editable-slot",
          content:
            "<p>클릭하여 본문을 편집하거나 <code>Ctrl+K</code>로 AI Composer를 호출하세요.</p>",
          backDataRefs: Object.keys(prev.backdata).slice(0, 1),
        };
        newBlock = {
          blockId: `blk_sec_${suffix}`,
          kind: "section-block",
          title: "표준 문서 섹션 블록",
          headingSlotId: hId,
          bodySlotId: bId,
        };
        setSelectedSlotId(bId);
      }

      return {
        ...prev,
        slots: nextSlots,
        pages: prev.pages.map((p) =>
          p.pageId === pageId ? { ...p, blocks: [...p.blocks, newBlock] } : p
        ),
      };
    });
  };

  return {
    moveBlock,
    deleteBlock,
    addBlockToPage,
  };
}


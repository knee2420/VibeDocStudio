/**
 * @vibe/vdoc-schema — 표준 섹션 페이지(머리말 · 바닥글 · 제목 · 본문) 생성기.
 * 슬롯 ID 규칙은 `sectionSlotId()` 하나만 쓴다. 백엔드 짝: `VDocAggregateRecord.with_section_page`.
 */
import { sectionSlotId } from "./layout-constants";
import type { VDocPage, VDocSlot } from "./types";

export interface SectionPageSpec {
  pageId: string;
  pageNumber: number;
  pageLabel: string;
  headerHtml: string;
  footerHtml: string;
  headingHtml: string;
  bodyHtml: string;
}

export function createSectionPage(spec: SectionPageSpec): {
  page: VDocPage;
  slots: Record<string, VDocSlot>;
} {
  const header = sectionSlotId(spec.pageId, "header");
  const footer = sectionSlotId(spec.pageId, "footer");
  const heading = sectionSlotId(spec.pageId, "heading");
  const body = sectionSlotId(spec.pageId, "body");
  const slot = (slotId: string, label: string, role: VDocSlot["role"], content: string): VDocSlot => ({
    slotId,
    label,
    role,
    content,
    backDataRefs: [],
  });
  return {
    page: {
      pageId: spec.pageId,
      pageNumber: spec.pageNumber,
      pageLabel: spec.pageLabel,
      headerSlotId: header,
      footerSlotId: footer,
      blocks: [
        {
          blockId: `blk_${spec.pageId}_1`,
          kind: "section-block",
          title: spec.pageLabel,
          headingSlotId: heading,
          bodySlotId: body,
        },
      ],
    },
    slots: {
      [header]: slot(header, "머리말", "boilerplate", spec.headerHtml),
      [footer]: slot(footer, "바닥글", "boilerplate", spec.footerHtml),
      [heading]: slot(heading, `${spec.pageLabel} 제목`, "editable-slot", spec.headingHtml),
      [body]: slot(body, `${spec.pageLabel} 본문`, "editable-slot", spec.bodyHtml),
    },
  };
}

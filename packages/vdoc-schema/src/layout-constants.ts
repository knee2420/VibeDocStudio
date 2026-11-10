/**
 * @vibe/vdoc-schema — 프론트 · 백엔드가 함께 지켜야 하는 레이아웃 · 식별자 상수.
 * 백엔드 짝: `apps/api/app/documents/models.py` (`A4_PAGE_STRIDE_PX`, `SECTION_SLOT_PARTS`),
 * `apps/api/app/projects/router.py` (`PROJECT_ROOT_CRUMB_ID`).
 */

/** A4 한 장 너비 (96dpi). */
export const A4_PAGE_WIDTH_PX = 794;
/** A4 한 장 높이 (96dpi). */
export const A4_PAGE_HEIGHT_PX = 1123;
/** 장과 장 사이 간격. */
export const A4_PAGE_GAP_PX = 24;
/** 가상화 스페이서 계산용 한 장의 세로 보폭. */
export const A4_PAGE_STRIDE_PX = A4_PAGE_HEIGHT_PX + A4_PAGE_GAP_PX;

/** 고정 좌표 페이지 붙여넣기·복제 시 어긋남 오프셋(px). */
export const PASTE_FRAME_OFFSET_PX = 16;
/** 정렬 가이드 스냅 임계값(px). */
export const DEFAULT_SNAP_THRESHOLD_PX = 4;

/** `page.layout.margin` 이 없을 때 시트가 쓰는 기본 여백(px). */
export const DEFAULT_PAGE_MARGIN_NO_HF = { top: 48, right: 56, bottom: 48, left: 56 } as const;
export const DEFAULT_PAGE_MARGIN_WITH_HF = { top: 24, right: 40, bottom: 24, left: 40 } as const;

/** 아웃라인 브레드크럼의 "프로젝트 전체" 가상 노드 ID (실제 노드가 아니다). */
export const PROJECT_ROOT_CRUMB_ID = "project-root";

/** 섹션 페이지 슬롯 ID 규칙: `{pageId}_{part}`. */
export const SECTION_SLOT_PARTS = ["header", "footer", "heading", "body"] as const;
export type SectionSlotPart = (typeof SECTION_SLOT_PARTS)[number];

export function sectionSlotId(pageId: string, part: SectionSlotPart): string {
  return `${pageId}_${part}`;
}

import type { BaseLayoutBlock } from "../base-block";

/**
 * 링크 카드 — 썸네일 + 제목 · 설명(슬롯) + 주소를 한 덩어리 카드로 (블로그의 "▼ 후기는 아래에" 카드).
 * 제목 · 설명은 슬롯 하나(`<p><strong>제목</strong></p><p>설명</p>`)라 AI 가 글처럼 채운다.
 */
export interface LinkCardBlockDef extends BaseLayoutBlock {
  kind: "link-card";
  slotId: string;
  url: string;
  /** 썸네일 주소 (`resource:<id>` · http · data:). 없으면 글만. */
  thumbnail?: string;
  /** 표시용 도메인 (생략하면 url 에서). */
  domain?: string;
  /** 썸네일 위치. */
  layout?: "thumb-top" | "thumb-left";
  /** 카드 폭 (예: 72%). */
  width?: string;
}

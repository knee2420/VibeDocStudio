import type { BaseLayoutBlock } from "../base-block";

export type ListMarkerStyle = "disc" | "circle" | "square" | "dash" | "decimal";

export interface TextBlockDef extends BaseLayoutBlock {
  kind: "text";
  slotId: string;
  align?: "left" | "center" | "right";
  /** 개별 목록 블록의 글머리 기호 오버라이드 (미지정 시 활성 .vstyle 스킨 기본값을 따름). */
  listMarker?: ListMarkerStyle;
}


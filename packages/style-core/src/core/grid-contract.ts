/**
 * @vibe/style-core — 불변 2D 그리드 기하학 계약 (Grid Core Contract).
 *
 * 블로그 · 뉴스 · 예스폼 공문서 · 공공 RFP 등 모든 문서의 스타일 표현을
 * 하나의 2D 그리드 기하학(지면 그리드 · 플로우 그리드 · 셀 그리드 · 미디어 그리드)으로 통합한다.
 */

export type GridAlign = "left" | "center" | "right";
export type GridVerticalAlign = "top" | "middle" | "bottom";
export type GridAspectPolicy = "weighted-fill" | "uniform-crop" | "natural";

export interface MarginBox {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * 한국형 표(예스폼 2px 외곽 + 1px 내부 격자, 공공 RFP 상단 굵은 선 + 세로선 없음 등)와
 * 모든 그리드 컨테이너의 5선 테두리 매트릭스.
 */
export interface GridBorderMatrix {
  outer?: string;
  headerTop?: string;
  headerBottom?: string;
  rowBottom?: string;
  vertical?: string;
  radius?: string;
}

export interface GridTrackSpec {
  columns?: number;
  widths?: string[];
  gap?: number;
}

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
 * 2D 그리드 컨테이너의 직교 테두리 매트릭스.
 * `outer` 는 4변 축약이며, `outerTop`/`outerRight`/`outerBottom`/`outerLeft` 로 각 외곽선을 독립 제어한다
 * (예: 좌우 외곽선 없음 `outerLeft: "none", outerRight: "none"`).
 */
export interface GridBorderMatrix {
  outer?: string;
  outerTop?: string;
  outerRight?: string;
  outerBottom?: string;
  outerLeft?: string;
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

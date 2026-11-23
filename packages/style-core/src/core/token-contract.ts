/**
 * @vibe/style-core — Figma 4계층(Primitives -> Semantic Modes -> Composite Styles -> Instance Overrides)
 * 기반 문서 스타일 프로토콜 (`vibe-style/1.0`, `.vstyle.json`) 계약.
 */
import type { GridAlign, GridAspectPolicy, GridBorderMatrix, MarginBox } from "./grid-contract";

export const VSTYLE_PROTOCOL = "vibe-style/1.0" as const;

export type StyleTokenValue = string | number | boolean;

/** Layer 1: 원시 토큰 팔레트 (카테고리 -> 키 -> 원시값). */
export interface StylePrimitives {
  color?: Record<string, string>;
  font?: Record<string, string>;
  space?: Record<string, string>;
  stroke?: Record<string, string>;
  radius?: Record<string, string>;
  [category: string]: Record<string, StyleTokenValue> | undefined;
}

/** Layer 2: 의미 토큰 맵 (`{color.emerald700}` 같은 alias 또는 원시값). */
export type SemanticTokenMap = Record<string, StyleTokenValue>;

/** 목록(`<<view:list>>`) 글머리 기호 시각 토큰 (스타일 엔진 전용 — 구조 `.outline` 과 분리). */
export type StyleListMarker = "disc" | "circle" | "square" | "dash" | "decimal";

/** Layer 3-1: 타이포그래피 합성 스타일. */
export interface TextStyleDef {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: "normal" | "italic";
  lineHeight?: string;
  letterSpacing?: string;
  color?: string;
  align?: GridAlign;
  listMarker?: StyleListMarker;
}

export type FrameOrnamentKind =
  | "none"
  | "quote-top-bottom"
  | "quote-left-underline"
  | "left-bar"
  | "pill"
  | "outer-sheet-box";

/** Layer 3-2: 프레임/콜아웃/인용구/배지/CTA 합성 스타일. */
export interface FrameStyleDef {
  fill?: string;
  color?: string;
  titleColor?: string;
  border?: string;
  borderTop?: string;
  borderBottom?: string;
  borderLeft?: string;
  radius?: string;
  padding?: string;
  marginY?: string;
  maxWidth?: string;
  align?: GridAlign;
  ornament?: FrameOrnamentKind;
  ornamentColor?: string;
  kvMarker?: string;
  kvTextColor?: string;
  chevron?: boolean;
  chevronColor?: string;
  underlineColor?: string;
  accentPalettes?: Record<string, { fill: string; color: string; border?: string }>;
}

/** Layer 3-3: 표 셀 그리드 합성 스타일. */
export interface TableStyleDef {
  borders?: GridBorderMatrix;
  headerFill?: string;
  headerTextColor?: string;
  headerFontWeight?: string;
  headerFontSize?: string;
  headerLetterSpacing?: string;
  zebraFill?: string;
  cellPadding?: string;
  radius?: string;
  autoFormHeader?: boolean;
}

/** Layer 3-4: 미디어/사진 콜라주 그리드 합성 스타일. */
export interface MediaStyleDef {
  stripGap?: number;
  stripRowHeight?: string;
  maxHeight?: string;
  aspectPolicy?: GridAspectPolicy;
  radius?: string;
  captionAlign?: GridAlign;
  captionColor?: string;
  captionFontSize?: string;
  imagePaddingY?: string;
}

/** Layer 3-5: 문서 지면(Page/Section Chrome) 그리드 합성 스타일. */
export interface PageChromeStyleDef {
  width?: number;
  surfaceKind?: "paged" | "scroll";
  background?: string;
  margins?: MarginBox;
  blockGap?: number;
  showHeaderFooter?: boolean;
  listMarkers?: string[];
  outerBoxBorder?: string;
}

export interface StyleCompositeCatalog {
  text: Record<string, TextStyleDef>;
  frame: Record<string, FrameStyleDef>;
  table: Record<string, TableStyleDef>;
  media: Record<string, MediaStyleDef>;
  pageChrome: Record<string, PageChromeStyleDef>;
}

/** Element / Variant -> Composite Style 바인딩 규칙. */
export interface StyleBindingDef {
  textStyle?: string;
  frameStyle?: string;
  tableStyle?: string;
  mediaStyle?: string;
  pageChromeStyle?: string;
}

/** Layer 4: Figma 식 Instance Override (특정 섹션·블록의 최소 델타 패치). */
export interface StyleOverrideDelta {
  text?: Partial<TextStyleDef>;
  frame?: Partial<FrameStyleDef>;
  table?: Partial<TableStyleDef>;
  media?: Partial<MediaStyleDef>;
  pageChrome?: Partial<PageChromeStyleDef>;
}

/** `.vdoc` 문서 최상단에 보관하는 스타일 팩 포인터 (사본 복제 금지). */
export interface VDocStyleRef {
  /** 스타일 팩 ID (예: `"naver-travel-blog"`, `"yonhap-news"`, `"yesform-official"`, `"gov-rfp"`). */
  packId: string;
  /** 볼트 내 `.vstyle.json` 포인터 (예: `"vault://문서 스키마 표준 정비 프로젝트/schema/styles/naver-travel-blog.vstyle.json"`). */
  packPath?: string;
  /** 활성 Mode (기본 `"default"`). */
  mode?: string;
  /** 스타일 팩 버전 (예: `"1.0.0"`). */
  version?: string;
}

/** `.vstyle.json` 파일의 전체 정본 계약. */
export interface StylePack {
  protocol: typeof VSTYLE_PROTOCOL;
  id: string;
  name: string;
  version: string;
  description?: string;
  genre?: string;
  sourceRef?: string;
  updatedAt?: string;
  primitives: StylePrimitives;
  modes: Record<string, SemanticTokenMap>;
  styles: StyleCompositeCatalog;
  bindings: Record<string, StyleBindingDef>;
}

/** Alias 치환과 활성 Mode 선택이 완료된 런타임 해석 스냅샷. */
export interface ResolvedStylePack {
  packId: string;
  packName: string;
  version: string;
  mode: string;
  tokens: Record<string, StyleTokenValue>;
  styles: StyleCompositeCatalog;
  bindings: Record<string, StyleBindingDef>;
}

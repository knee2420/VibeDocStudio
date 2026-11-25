/**
 * @vibe/style-core — Figma 4계층(Primitives -> Semantic Modes -> Composite Styles -> Instance Overrides)
 * 기반 문서 스타일 프로토콜 (`vibe-style/1.0`, `.vstyle.json`) 계약.
 */
import type {
  GridAlign,
  GridAspectPolicy,
  GridBorderMatrix,
  GridVerticalAlign,
  MarginBox,
} from "./grid-contract";

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
  /** 데이터 기반 앞장식 문자열 (예: `"□ "`, `"❏ "`, `"※ "` 등 — 고정 enum 없이 데이터로 주입). */
  prefix?: string;
  prefixColor?: string;
  /** 목록 항목 들여쓰기 (예: `"1.1em"`). */
  listIndent?: string;
  /** 내어쓰기 오프셋 (예: `"-0.75em"`). */
  hangingIndent?: string;
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

/** 표 셀 역할 단위 직교 스타일 속성 (키 이름은 `.vstyle` 데이터가 자유롭게 정의). */
export interface CellStyleDef {
  fill?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  align?: GridAlign;
  vAlign?: GridVerticalAlign;
  padding?: string;
  whiteSpace?: "normal" | "nowrap" | "pre-wrap";
  fontVariantNumeric?: "normal" | "tabular-nums";
  borderTop?: string;
  borderRight?: string;
  borderBottom?: string;
  borderLeft?: string;
  listIndent?: string;
  hangingIndent?: string;
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
  /** 선택적 기본 열 너비 비율 (예: `["8%", "17%", "15%", "60%"]`). */
  columnWidths?: string[];
  /** 열린 역할 키 → 셀 직교 스타일 맵 (`column-header`, `label`, `value` 및 사용자/에셋 커스텀 역할). */
  cells?: Record<string, CellStyleDef>;
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
  /** 범용 바닥글 템플릿 문자열 (예: `"- {page} -"`, `"{page} / {total}"`). */
  footerTemplate?: string;
  footerAlign?: GridAlign;
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
  /** 열린 매체/표면 힌트 (예: `"a4"`, `"blog"`, `"web"`, `"sns"` 등 — 고정 enum 아님). */
  target?: string;
  sourceRef?: string;
  updatedAt?: string;
  primitives: StylePrimitives;
  modes: Record<string, SemanticTokenMap>;
  styles: StyleCompositeCatalog;
  bindings: Record<string, StyleBindingDef>;
  /** 향후 매체·요소별 특화 규칙을 코어 스키마 변경 없이 수용하는 열린 확장 네임스페이스. */
  extensions?: Record<string, Record<string, unknown>>;
}

/** Alias 치환과 활성 Mode 선택이 완료된 런타임 해석 스냅샷. */
export interface ResolvedStylePack {
  packId: string;
  packName: string;
  version: string;
  mode: string;
  target?: string;
  tokens: Record<string, StyleTokenValue>;
  styles: StyleCompositeCatalog;
  bindings: Record<string, StyleBindingDef>;
  extensions?: Record<string, Record<string, unknown>>;
}

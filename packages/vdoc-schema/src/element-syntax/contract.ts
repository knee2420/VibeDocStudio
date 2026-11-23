/**
 * @vibe/vdoc-schema — CRUD 가능한 Element/Syntax 레지스트리 및 불변 IR 프리미티브 계약.
 *
 * 설계 원칙:
 * 1. 불변 코어(Fixed Kernel): 8개 직교 IR 프리미티브(`stack | split | span | frame | accent | kv | slot | embed`).
 * 2. 가변 레지스트리(Mutable Registry): Document Profile · Element Definition · Syntax Rule · Skin Preset 을
 *    JSON 데이터로 자유롭게 CRUD(등록·조회·수정·삭제)할 수 있다.
 * 3. 안전 폴백(Fallback): 정의가 삭제되거나 알 수 없는 `<<view:...>>` 를 만나도 크래시 없이 원문 텍스트로 복구한다.
 */

export const SCHEMA_IR_PRIMITIVES = [
  "stack",
  "split",
  "span",
  "frame",
  "accent",
  "kv",
  "slot",
  "embed",
] as const;

export type SchemaIrPrimitive = (typeof SCHEMA_IR_PRIMITIVES)[number];

export type SyntaxRulePosition = "prefix" | "infix" | "bracket" | "line" | "inline" | "tree";

export interface ElementSyntaxRule {
  /** 규칙 식별자 (예: `"col-split"`, `"kv-pair"`, `"cta-slot"`). */
  id: string;
  /** 사용자가 아웃라인에 입력하는 표면 기호 (예: `"|"`, `"::"`, `">"`, `"!"`, `"[img]"`, `"=="`). */
  symbol: string;
  /** 이 기호가 매핑되는 불변 IR 프리미티브. */
  primitive: SchemaIrPrimitive;
  /** 기호 적용 위치/구문 형태. */
  position: SyntaxRulePosition;
  /** 사람/AI가 레지스트리를 읽을 때 참조하는 설명. */
  description: string;
  /** 선택적 역할·세부 옵션 (예: `slotKind: "img" | "cta" | "empty"`, `mergeDir: "left" | "up"`). */
  options?: Record<string, string | number | boolean>;
}

export interface ElementSkinPreset {
  id: string;
  label: string;
  align?: "left" | "center" | "right";
  quoteStyle?: "center-marks" | "underline-frame" | "left-bar";
  accentColor?: "pink" | "yellow" | "emerald" | "sky" | "slate";
  imageGap?: number;
  maxWidthPx?: number;
  fontFamily?: string;
}

export type ElementFallbackPolicy = "plain-text" | "preserve-raw";

/**
 * CRUD 가능한 단일 Element 규격 정의 (예: `table`, `section`, 향후 `card`/`faq`/`timeline` 등).
 */
export interface ElementSyntaxDefinition {
  /** 고유 Element ID (예: `"table"`, `"section"`). */
  id: string;
  /** 아웃라인에서 선언하는 뷰 태그 (예: `"table"` -> `<<view:table>>`, `"section"` -> `<<view:section>>`). */
  viewTag: string;
  /** 정의 버전 (예: `"1.0.0"`). */
  version: string;
  label: string;
  description: string;
  /** 허용되는 Document Profile ID 목록 (예: `["blog", "web", "a4"]`). */
  allowedInViews: string[];
  /** 기호 -> 불변 IR 프리미티브 매핑 규칙 배열. */
  rules: ElementSyntaxRule[];
  /** 기본 시각 프리셋 ID. */
  defaultSkin: string;
  /** 선택적 시각 프리셋 맵. */
  skins?: Record<string, ElementSkinPreset>;
  /** 파싱 실패 또는 정의 삭제 시 안전 폴백 정책. */
  fallbackPolicy: ElementFallbackPolicy;
}

/**
 * CRUD 가능한 Document Profile 정의 (`a4`, `blog`, `web` 등).
 */
export interface DocumentProfileSchema {
  id: string;
  label: string;
  description: string;
  unitKind: "page" | "section";
  surface: {
    kind: "paged" | "scroll";
    width: number;
  };
  allowedElementIds: string[];
  defaultSkin: string;
}

/**
 * 볼트 파일(`schema/element-registry.json`)로 저장·불러오기·CRUD 하는 전체 레지스트리 스냅샷.
 */
export interface ElementRegistrySnapshot {
  version: string;
  updatedAt: string;
  description?: string;
  profiles: DocumentProfileSchema[];
  elements: ElementSyntaxDefinition[];
}

/**
 * 아웃라인 파일(`.outline`)의 경량 노드 구조 (Gaeddong Outliner / WorkingOutline 공통 부분집합).
 */
export interface OutlineSyntaxNode {
  id: string;
  text: string;
  children?: OutlineSyntaxNode[];
  isFolded?: boolean;
  nodeType?: string;
  note?: string;
  file?: { target: string };
}

export interface OutlineSyntaxDocument {
  version?: number;
  id?: string;
  title: string;
  defaultView?: string;
  rootNodes: OutlineSyntaxNode[];
}

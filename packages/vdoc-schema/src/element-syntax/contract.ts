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

/**
 * 구조 층위 — 불변 코어 (프리미티브처럼 고정). 사용자는 층을 늘리지 않고, 각 층에 올라가는 요소 · 기호를 늘린다.
 *   document(`<<doc:…>>`) → section(`<<view:section:역할>>`) → block(글 · 그림 · 표 …) → slot(표 칸 · 행) · inline(인용 · 강조)
 * 중간 컨테이너 층은 없다 — 섹션을 먼저 세우고 블록은 그 안에 놓는다. 나란히 놓는 다단도 섹션의 한 종류
 * (`<<view:section:column>>`, 자식 불릿 하나 = 한 단)라 섹션 층에 산다. 담기 규칙(`parents`)은 이 층 위에서 정의된다.
 */
export const STRUCTURE_LAYERS = ["document", "section", "block", "slot", "inline"] as const;

export type StructureLayer = (typeof STRUCTURE_LAYERS)[number];

/**
 * 담기 규칙의 부모 지정자.
 * - `"layer:<층>"` — 그 층의 어떤 요소 안이든 허용 (예: `"layer:section"`)
 * - `"<요소 id>"` 또는 `"<규칙 id>"` — 그 요소/규칙 바로 안만 허용 (예: `"row-container"`)
 * - `"$outside"` — 어떤 컴파일 구조 안도 아닌 곳(일반 아웃라인 불릿 아래)만 허용 (예: `<<doc>>`)
 */
export type StructureParentRef = string;

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
  /** 이 기호로 만들어지는 노드의 구조 층 (생략 시 기본 레지스트리 값으로 보충). */
  layer?: StructureLayer;
  /** 담기 규칙: 이 기호의 노드가 놓일 수 있는 부모 (생략 시 층 기본값). */
  parents?: StructureParentRef[];
  /** 담기 규칙: 이 기호의 노드가 바로 아래 담을 수 있는 자식 (생략 시 제한 없음 — 자식 쪽 `parents` 만 본다). */
  children?: StructureParentRef[];
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
  /** `<<view:viewTag>>` 노드 자체의 구조 층 (예: section → `"section"`, table → `"block"`). */
  layer?: StructureLayer;
  /** 담기 규칙: `<<view:viewTag>>` 노드가 놓일 수 있는 부모. */
  parents?: StructureParentRef[];
}

/**
 * CRUD 가능한 Document Profile 정의 (`a4`, `blog`, `web` 등).
 */
export interface DocumentProfileSchema {
  id: string;
  label: string;
  description: string;
  unitKind: "page" | "section";
  /** 구조 단위 — 모든 프로필에서 섹션 (D1: 섹션 = 구조). 생략 시 `"section"`. */
  structureUnit?: "section";
  /** 출력 단위 — 스크롤 한 줄기(`scroll`) 또는 인쇄 쪽(`page`, 섹션이 쪽을 넘어 흐른다). 생략 시 surface 로 추론. */
  outputUnit?: "scroll" | "page";
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

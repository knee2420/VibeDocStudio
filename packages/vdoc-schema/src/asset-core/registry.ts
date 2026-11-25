/**
 * 에셋 v3 — 컴포넌트 · 역할 등록부 (데이터).
 *
 * 구조 문법 · 렌더 블록 · 에셋 프리미티브 · 에이전트 빌더 · 스타일 합성이 같은 표를 읽는다.
 * 새 요소는 여기에 한 줄을 더하는 것으로 들어온다 — 코드 분기를 늘리지 않는다.
 * (docs/specs/v2-asset-centric-schema.md §3.1 · §4.1)
 */

/** 구조 프리미티브 8종 — 모든 구조 태그는 이것들의 조합이다. */
export const ASSET_PRIMITIVES = ["container", "grid", "repeat", "field", "label", "choice", "media", "reference"] as const;
export type AssetPrimitive = (typeof ASSET_PRIMITIVES)[number];

/**
 * 역할의 성격.
 * - `fixed`: 구조에 속한 고정 글 (머리칸 · 항목명) — 에셋이 소유, 채우기 대상 아님
 * - `fill`: 채울 자리 (값 · 본문 · 사진)
 */
export type RoleKind = "fixed" | "fill";

export interface RoleDef {
  readonly id: string;
  readonly kind: RoleKind;
  readonly label: string;
  /** 같은 무리 (채점 부분 점수 · 스타일 대체 기준) */
  readonly family: string;
}

export const ASSET_ROLES: readonly RoleDef[] = [
  { id: "title", kind: "fixed", label: "제목", family: "heading" },
  { id: "subtitle", kind: "fixed", label: "부제", family: "heading" },
  { id: "label", kind: "fixed", label: "항목명 (행 머리칸)", family: "label" },
  { id: "group-label", kind: "fixed", label: "묶음 머리칸 (여러 행을 묶는 항목명)", family: "label" },
  { id: "sub-label", kind: "fixed", label: "하위 항목명 (묶음 안의 항목명)", family: "label" },
  { id: "column-header", kind: "fixed", label: "열 머리칸 (맨 윗줄)", family: "label" },
  { id: "meta-key", kind: "fixed", label: "키-값의 키", family: "label" },
  { id: "caption", kind: "fixed", label: "캡션 · 표 제목", family: "note" },
  { id: "note", kind: "fixed", label: "안내 · 주석 글", family: "note" },
  { id: "marker", kind: "fixed", label: "기호 · 번호", family: "note" },
  { id: "value", kind: "fill", label: "값", family: "value" },
  { id: "meta-value", kind: "fill", label: "키-값의 값", family: "value" },
  { id: "total", kind: "fill", label: "합계 · 요약 값", family: "value" },
  { id: "heading", kind: "fill", label: "채우는 소제목", family: "heading" },
  { id: "body", kind: "fill", label: "본문 글", family: "body" },
  { id: "item", kind: "fill", label: "목록 항목", family: "body" },
  { id: "image", kind: "fill", label: "사진", family: "media" },
  { id: "image-caption", kind: "fill", label: "사진 설명", family: "media" },
  { id: "cta", kind: "fill", label: "행동 유도 (링크 · 버튼)", family: "link" },
  { id: "link", kind: "fill", label: "링크 카드", family: "link" },
  { id: "byline", kind: "fill", label: "작성자 · 날짜 줄", family: "note" },
];

const ROLE_BY_ID = new Map(ASSET_ROLES.map((r) => [r.id, r]));

export function getRole(id: string): RoleDef | undefined {
  const exact = ROLE_BY_ID.get(id);
  if (exact) return exact;
  // 열린 하위 역할(예: `value.code`, `value.seq`, `label.accent`)은 앞쪽 기본 역할의 성격(fixed/fill)을 상속한다.
  const dotIdx = id.indexOf(".");
  return dotIdx > 0 ? ROLE_BY_ID.get(id.slice(0, dotIdx)) : undefined;
}

export function isFixedRole(id: string): boolean {
  return getRole(id)?.kind === "fixed";
}

export function roleFamily(id: string): string {
  return getRole(id)?.family ?? id;
}

/** 채울 자리의 값 종류. */
export const FIELD_TYPES = ["text", "rich", "number", "date", "currency", "code", "image", "list", "choice", "url"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface ComponentDef {
  readonly id: string;
  readonly label: string;
  /** 옛 이름 · 블록 kind · 에이전트 빌더 kind */
  readonly aliases: readonly string[];
  readonly primitives: readonly AssetPrimitive[];
  /** 이 컴포넌트에 나올 수 있는 역할 */
  readonly roles: readonly string[];
  /** 렌더 블록 kind (지금 LayoutBlock) */
  readonly blockKinds: readonly string[];
  /** 블록 속성 중 스타일로 옮길 것 — 블록 안에 남기지 않는다 */
  readonly styleProps: readonly string[];
  /** 스타일 합성 (`.vstyle` styles 카테고리) */
  readonly styleComposite: string;
}

export const ASSET_COMPONENTS: readonly ComponentDef[] = [
  {
    id: "table",
    label: "표",
    aliases: ["structured-table", "table", "table-grid"],
    primitives: ["grid", "label", "field", "repeat"],
    roles: ["column-header", "label", "group-label", "sub-label", "value", "total", "caption", "note"],
    blockKinds: ["structured-table", "table"],
    styleProps: ["columnWidths", "tableWidthRatio", "borderRules", "headerStyle", "cellPadding", "tableVariant"],
    styleComposite: "table",
  },
  {
    id: "kv",
    label: "키-값 묶음",
    aliases: ["kv-block", "kvItems", "meta"],
    primitives: ["grid", "label", "field"],
    roles: ["meta-key", "meta-value"],
    blockKinds: ["structured-table", "callout-box"],
    styleProps: [],
    styleComposite: "table",
  },
  {
    id: "columns",
    label: "다단 · 묶음",
    aliases: ["columns-grid", "gallery", "columns"],
    primitives: ["grid", "container"],
    roles: [],
    blockKinds: ["columns-grid"],
    styleProps: ["widths", "gap", "cardStyle"],
    styleComposite: "card",
  },
  {
    id: "frame",
    label: "프레임 · 콜아웃",
    aliases: ["callout-box", "callout"],
    primitives: ["container"],
    roles: ["body", "note"],
    blockKinds: ["callout-box"],
    styleProps: ["tone", "variant", "accentColor", "align"],
    styleComposite: "frame",
  },
  {
    id: "cover",
    label: "표지 · 히어로",
    aliases: ["hero", "cover-banner", "header-band"],
    primitives: ["container", "media", "field"],
    roles: ["title", "subtitle", "heading", "image", "byline"],
    blockKinds: ["hero"],
    styleProps: ["height", "align", "overlay"],
    styleComposite: "frame",
  },
  {
    id: "card",
    label: "링크 카드",
    aliases: ["link-card", "cta"],
    primitives: ["container", "media", "field"],
    roles: ["link", "cta"],
    blockKinds: ["link-card"],
    styleProps: ["variant", "layout", "width", "ctaChevron"],
    styleComposite: "card",
  },
  {
    id: "section",
    label: "구역",
    aliases: ["section", "section-block", "page"],
    primitives: ["container"],
    roles: [],
    blockKinds: [],
    styleProps: [],
    styleComposite: "pageChrome",
  },
  {
    id: "heading",
    label: "제목",
    aliases: ["heading", "form-title", "title-block"],
    primitives: ["label", "field"],
    roles: ["title", "subtitle", "heading"],
    blockKinds: ["heading", "form-title"],
    styleProps: ["align", "decoration", "accent", "letterSpacing", "underline", "underlineWidth", "underlineThickness"],
    styleComposite: "text",
  },
  {
    id: "text",
    label: "글",
    aliases: ["text", "paragraph", "prose"],
    primitives: ["field", "label"],
    roles: ["body", "item", "note"],
    blockKinds: ["text"],
    styleProps: ["align", "listMarker"],
    styleComposite: "text",
  },
  {
    id: "media",
    label: "사진",
    aliases: ["image", "img", "media"],
    primitives: ["media", "field"],
    roles: ["image", "image-caption"],
    blockKinds: ["image"],
    styleProps: ["width", "height", "maxHeight", "align", "objectFit", "fit"],
    styleComposite: "media",
  },
  {
    id: "divider",
    label: "구분선",
    aliases: ["divider", "divider-band", "---"],
    primitives: [],
    roles: [],
    blockKinds: ["divider"],
    styleProps: ["variant", "spacing"],
    styleComposite: "divider",
  },
];

const COMPONENT_BY_ALIAS = new Map<string, ComponentDef>();
for (const c of ASSET_COMPONENTS) {
  COMPONENT_BY_ALIAS.set(c.id, c);
  for (const a of c.aliases) if (!COMPONENT_BY_ALIAS.has(a)) COMPONENT_BY_ALIAS.set(a, c);
}

export function getComponent(idOrAlias: string): ComponentDef | undefined {
  return COMPONENT_BY_ALIAS.get(idOrAlias);
}

/** 옛 이름 → 정식 컴포넌트 id (모르면 그대로). */
export function canonicalComponentId(idOrAlias: string): string {
  return COMPONENT_BY_ALIAS.get(idOrAlias)?.id ?? idOrAlias;
}

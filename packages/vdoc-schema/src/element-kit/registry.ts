/**
 * element-kit 통합 레지스트리.
 *
 * `block-kit` 의 모든 등록 블록(LAYOUT_BLOCK_KINDS)을 자동으로 편입하고,
 * 계층 컨테이너(project/document/page/section) 및 하위 단위(table-row/table-cell/grid-col/slot/media)를
 * 함께 등록해 Phase 1~3 및 에이전트가 단일 목록을 읽도록 한다.
 */
import { LAYOUT_BLOCK_KINDS, type LayoutBlockKind } from "../base-block";
import { listBlockKinds } from "../block-kit";
import type { BlockModelDefinition } from "../block-kit/contract";
import type {
  ContainerElementKind,
  ElementBadgeTone,
  ElementDefinition,
  ElementKind,
  ElementTier,
  SubUnitElementKind,
} from "./contract";

const CONTAINER_DEFS: readonly ElementDefinition[] = [
  {
    kind: "project",
    tier: "container",
    label: "프로젝트",
    shortLabel: "프로젝트",
    icon: "folder-tree",
    badgeTone: "indigo",
    defaultChildKind: "document",
    turnIntoVisible: false,
  },
  {
    kind: "document",
    tier: "container",
    label: "문서",
    shortLabel: "문서",
    icon: "file-text",
    badgeTone: "blue",
    defaultChildKind: "page",
    allowedParentKinds: ["project"],
    turnIntoVisible: true,
  },
  {
    kind: "page",
    tier: "container",
    label: "페이지",
    shortLabel: "페이지",
    icon: "file",
    badgeTone: "emerald",
    defaultChildKind: "text",
    allowedParentKinds: ["document", "project"],
    turnIntoVisible: true,
  },
  {
    kind: "section",
    tier: "container",
    label: "구역",
    shortLabel: "구역",
    icon: "layout-grid",
    badgeTone: "slate",
    defaultChildKind: "text",
    turnIntoVisible: true,
  },
];

const SUB_UNIT_DEFS: readonly ElementDefinition[] = [
  {
    kind: "table-row",
    tier: "sub-unit",
    label: "행",
    shortLabel: "행",
    icon: "rows-3",
    badgeTone: "amber",
    defaultChildKind: "table-cell",
    allowedParentKinds: ["structured-table", "table", "composite-form-frame", "section"],
    turnIntoVisible: true,
  },
  {
    kind: "table-cell",
    tier: "sub-unit",
    label: "열",
    shortLabel: "열",
    icon: "columns-3",
    badgeTone: "amber",
    defaultChildKind: "text",
    allowedParentKinds: ["table-row"],
    turnIntoVisible: true,
  },
  {
    kind: "grid-col",
    tier: "sub-unit",
    label: "칼럼",
    shortLabel: "칼럼",
    icon: "columns-2",
    badgeTone: "violet",
    defaultChildKind: "text",
    allowedParentKinds: ["columns-grid"],
    turnIntoVisible: true,
  },
  {
    kind: "slot",
    tier: "sub-unit",
    label: "슬롯",
    shortLabel: "슬롯",
    icon: "type",
    badgeTone: "slate",
    defaultChildKind: "text",
    turnIntoVisible: false,
  },
  {
    kind: "media",
    tier: "sub-unit",
    label: "미디어",
    shortLabel: "미디어",
    icon: "image",
    badgeTone: "rose",
    defaultChildKind: "text",
    turnIntoVisible: false,
  },
];

interface BlockRuleOverride {
  shortLabel?: string;
  badgeTone?: ElementBadgeTone;
  defaultChildKind?: ElementKind;
  turnIntoVisible?: boolean;
}

const BLOCK_OVERRIDES: Partial<Record<LayoutBlockKind, BlockRuleOverride>> = {
  heading: { shortLabel: "제목", badgeTone: "indigo", defaultChildKind: "text", turnIntoVisible: true },
  "form-title": { shortLabel: "서식제목", badgeTone: "indigo", defaultChildKind: "text", turnIntoVisible: false },
  text: { shortLabel: "본문", badgeTone: "slate", defaultChildKind: "text", turnIntoVisible: true },
  "section-block": { shortLabel: "섹션", badgeTone: "blue", defaultChildKind: "text", turnIntoVisible: true },
  image: { shortLabel: "이미지", badgeTone: "rose", defaultChildKind: "text", turnIntoVisible: true },
  "structured-table": { shortLabel: "표", badgeTone: "amber", defaultChildKind: "table-row", turnIntoVisible: true },
  table: { shortLabel: "표", badgeTone: "amber", defaultChildKind: "table-row", turnIntoVisible: false },
  "composite-form-frame": { shortLabel: "복합양식", badgeTone: "amber", defaultChildKind: "section", turnIntoVisible: true },
  "columns-grid": { shortLabel: "다단", badgeTone: "violet", defaultChildKind: "grid-col", turnIntoVisible: true },
  hero: { shortLabel: "표지배너", badgeTone: "violet", defaultChildKind: "slot", turnIntoVisible: true },
  "cover-banner": { shortLabel: "표지", badgeTone: "violet", defaultChildKind: "slot", turnIntoVisible: true },
  "callout-box": { shortLabel: "안내상자", badgeTone: "emerald", defaultChildKind: "text", turnIntoVisible: true },
  "link-card": { shortLabel: "링크", badgeTone: "blue", defaultChildKind: "text", turnIntoVisible: true },
  divider: { shortLabel: "구분선", badgeTone: "slate", defaultChildKind: "text", turnIntoVisible: true },
  "summary-list": { shortLabel: "요약", badgeTone: "emerald", defaultChildKind: "slot", turnIntoVisible: true },
  "fillable-group": { shortLabel: "입력그룹", badgeTone: "amber", defaultChildKind: "slot", turnIntoVisible: true },
};

const CATEGORY_TONE: Record<BlockModelDefinition["category"], ElementBadgeTone> = {
  text: "slate",
  table: "amber",
  layout: "violet",
  media: "rose",
  form: "emerald",
};

const registry = new Map<string, ElementDefinition>();
const orderedDefs: ElementDefinition[] = [];

function registerElement(def: ElementDefinition): void {
  if (!registry.has(def.kind)) orderedDefs.push(def);
  registry.set(def.kind, def);
}

for (const def of CONTAINER_DEFS) registerElement(def);

for (const blockDef of listBlockKinds()) {
  for (const rawKind of blockDef.kinds) {
    if (!(LAYOUT_BLOCK_KINDS as readonly string[]).includes(rawKind)) continue;
    const kind = rawKind as LayoutBlockKind;
    const ov = BLOCK_OVERRIDES[kind] ?? {};
    registerElement({
      kind,
      tier: "block",
      label: blockDef.label,
      shortLabel: ov.shortLabel ?? blockDef.label,
      icon: blockDef.icon,
      badgeTone: ov.badgeTone ?? CATEGORY_TONE[blockDef.category],
      defaultChildKind: ov.defaultChildKind ?? "text",
      turnIntoVisible: ov.turnIntoVisible ?? rawKind === blockDef.kinds[0],
      blockDef,
    });
  }
}

for (const def of SUB_UNIT_DEFS) registerElement(def);

const FALLBACK_DEF = registry.get("text")!;

export const ELEMENT_KINDS: readonly ElementKind[] = orderedDefs.map((d) => d.kind);

export function hasElementKind(kind: string | null | undefined): kind is ElementKind {
  return Boolean(kind && registry.has(kind));
}

export function getElementDef(kind: string | null | undefined): ElementDefinition {
  return (kind ? registry.get(kind) : undefined) ?? FALLBACK_DEF;
}

export function listElementKinds(filter?: {
  tier?: ElementTier;
  turnIntoOnly?: boolean;
}): ElementDefinition[] {
  return orderedDefs.filter((def) => {
    if (filter?.tier && def.tier !== filter.tier) return false;
    if (filter?.turnIntoOnly && !def.turnIntoVisible) return false;
    return true;
  });
}

/**
 * 부모 노드의 `elementKind` 를 보고 `Tab` (또는 자식 추가) 시 자동 부여할 기본 `ElementKind` 를 돌려준다.
 * - project → document → page → text
 * - structured-table / table → table-row → table-cell → text
 * - columns-grid → grid-col → text
 */
export function inferChildElementKind(parentKind?: ElementKind | null): ElementKind {
  if (!parentKind) return "page";
  return getElementDef(parentKind).defaultChildKind;
}

const CONTEXT_BOUND_KINDS = new Set<ElementKind>(["table-row", "table-cell", "grid-col", "page", "document"]);

/**
 * 노드를 다른 부모 밑으로 이동(Tab / Shift+Tab / D&D)했을 때 문맥에 맞춰 `elementKind` 를 보정한다.
 * - 표 안으로 들어가면 `table-row` / `table-cell` 로 승격/전환
 * - 표/다단 밖으로 빠져나오면 `table-row`·`table-cell`·`grid-col` 은 일반 `text` 로 환원
 * - `image` · `structured-table` · `callout-box` 등 명시적 블록 유형은 허용된 컨텍스트에서 그대로 보존
 */
export function reconcileElementKindOnReparent(
  currentKind: ElementKind,
  nextParentKind?: ElementKind | null
): ElementKind {
  const parentKind = nextParentKind ?? "project";

  if (parentKind === "project") {
    return currentKind === "document" || currentKind === "page" ? currentKind : "document";
  }
  if (parentKind === "document") {
    if (currentKind === "page" || currentKind === "document") return "page";
  }
  if (parentKind === "structured-table" || parentKind === "table") {
    return "table-row";
  }
  if (parentKind === "table-row") {
    return "table-cell";
  }
  if (parentKind === "columns-grid") {
    return currentKind === "grid-col" || currentKind === "image" ? currentKind : "grid-col";
  }
  if (parentKind === "composite-form-frame" && currentKind === "text") {
    return "section";
  }

  // 표/다단/문서 전용 역할이 일반 본문 문맥으로 빠져나왔을 때 안전하게 본문으로 환원
  if (CONTEXT_BOUND_KINDS.has(currentKind)) {
    const def = getElementDef(currentKind);
    if (def.allowedParentKinds && !def.allowedParentKinds.includes(parentKind)) {
      return "text";
    }
  }
  return currentKind;
}

export type { ContainerElementKind, SubUnitElementKind };


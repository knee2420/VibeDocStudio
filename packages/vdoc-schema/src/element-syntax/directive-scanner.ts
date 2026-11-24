/**
 * @vibe/vdoc-schema — 범용 `<<...>>` 지시어 스캐너 및 에셋 파서.
 *
 * 마스터 `.outline` 파일의 **어느 깊이(0..N), 어느 문자열 위치**에 있더라도
 * `<<doc:profile>>`, `<<view:type[:role] [@assetId]>>`, `<<asset:id>>`, `<<template:type>>`
 * 지시어를 인식하고, 지시어가 없는 일반 브레인스토밍/Todo/리서치 브랜치는 안전하게 격리한다.
 */
import type { TableBorderRules, TableHeaderStyle } from "../types";
import type { OutlineSyntaxNode } from "./contract";

export type OutlineDirectiveKind = "doc" | "view" | "asset" | "template" | "cite" | "resource";

export interface ParsedOutlineDirective {
  readonly kind: OutlineDirectiveKind;
  /** 예: `doc` -> `"blog" | "a4" | "web"`, `view` -> `"section" | "table" | "list" | "columns" | "title"`, `cite` -> `"footnote" | "rationale" | "sidenote" | "quote" | "matrix" | "bound"` */
  readonly target: string;
  /** 선택적 의미 역할 힌트 (예: `<<view:section:spot>>` -> `"spot"`, `<<view:table:header>>` -> `"header"`). */
  readonly role?: string;
  /** 선택적 에셋 프리셋 힌트 (예: `<<view:table @table-grouped-compare>>` -> `"table-grouped-compare"`). */
  readonly assetHint?: string;
  /** 원문에서 매치된 `<<...>>` 토큰 전체. */
  readonly rawToken: string;
  /** `<<...>>` 토큰을 제외한 나머지 텍스트 (표시 제목/라벨). */
  readonly label: string;
}

export interface ScannedOutlineDirective {
  readonly nodeId: string;
  readonly depth: number;
  readonly ancestorIds: readonly string[];
  /** 이 노드를 감싸는 가장 가까운 `<<doc:...>>` 조상 노드 ID (자신이 `doc` 이면 자기 ID). */
  readonly parentDocNodeId: string | null;
  readonly directive: ParsedOutlineDirective;
  readonly node: OutlineSyntaxNode;
}

export interface ActiveDirectiveContext {
  readonly focusedNodeId: string | null;
  readonly nearestDoc: ScannedOutlineDirective | null;
  readonly nearestView: ScannedOutlineDirective | null;
  readonly nearestAsset: ScannedOutlineDirective | null;
  /**
   * 현재 커서 위치에서 프리뷰해야 할 대상 지시어.
   * - `<<doc:...>>` 하위면 그 `doc` 전체 (단독 `<<view:...>>` 하위면 그 `view`)
   * - `<<asset:...>>` 하위면 그 `asset`
   * - 일반 메모/브레인스토밍 영역이면 `null`
   */
  readonly effectiveTarget: ScannedOutlineDirective | null;
  /** 커서가 없거나 일반 메모 영역일 때 안내/기본 선택지로 쓸 첫 렌더링 가능 지시어 (`doc` 우선, 없으면 `view`). */
  readonly firstRenderableTarget: ScannedOutlineDirective | null;
}

export interface ParsedOutlineAsset {
  readonly assetId: string;
  readonly nodeId: string;
  readonly label: string;
  readonly targetViewTag?: string;
  readonly conversionRules: readonly string[];
  readonly visualStyles: readonly string[];
  readonly templateNode?: OutlineSyntaxNode;
}

export interface TableAssetVisualPreset {
  readonly borderRules?: Partial<TableBorderRules>;
  readonly headerStyle?: Partial<TableHeaderStyle>;
  readonly cellPadding?: string;
  readonly zebraBg?: string;
}

const DIRECTIVE_RE =
  /<<\s*(doc|view|asset|template|cite|resource)\s*:\s*([^\s:>@\n]+)(?::([a-zA-Z0-9_-]+))?(?:\s+@([a-zA-Z0-9_-]+))?(?:\s+[^>\n]+)?\s*>>/i;

/**
 * 불릿 텍스트의 **어느 위치**에 있든 첫 번째 `<<doc|view|asset|template:...>>` 지시어를 파싱한다.
 */
export function parseOutlineDirective(text: string): ParsedOutlineDirective | null {
  if (!text || !text.includes("<<")) return null;
  const match = DIRECTIVE_RE.exec(text);
  if (!match) return null;

  const kind = match[1].toLowerCase() as OutlineDirectiveKind;
  const target = match[2].toLowerCase();
  const role = match[3]?.toLowerCase() || undefined;
  const assetHint = match[4]?.toLowerCase() || undefined;
  const rawToken = match[0];

  const before = text.slice(0, match.index).trim();
  const after = text.slice(match.index + rawToken.length).trim();
  const label = [before, after].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  return {
    kind,
    target,
    role,
    assetHint,
    rawToken,
    label,
  };
}

/**
 * 아웃라인 트리 전체(0..N 깊이)를 순회해 모든 `<<...>>` 지시어를 문서 순서대로 수집한다.
 */
export function scanOutlineDirectives(
  rootNodes: readonly OutlineSyntaxNode[]
): ScannedOutlineDirective[] {
  const results: ScannedOutlineDirective[] = [];

  const walk = (
    nodes: readonly OutlineSyntaxNode[],
    depth: number,
    ancestorIds: readonly string[],
    currentDocNodeId: string | null
  ) => {
    for (const node of nodes) {
      const parsed = parseOutlineDirective(node.text);
      let nextDocNodeId = currentDocNodeId;
      if (parsed) {
        if (parsed.kind === "doc") {
          nextDocNodeId = node.id;
        }
        results.push({
          nodeId: node.id,
          depth,
          ancestorIds,
          parentDocNodeId: parsed.kind === "doc" ? node.id : currentDocNodeId,
          directive: parsed,
          node,
        });
      }
      if (node.children && node.children.length > 0) {
        walk(node.children, depth + 1, [...ancestorIds, node.id], nextDocNodeId);
      }
    }
  };

  walk(rootNodes, 0, [], null);
  return results;
}

/**
 * 트리에서 특정 노드 ID의 조상 체인(루트 -> 자신)을 찾는다.
 */
export function findOutlineNodeChain(
  rootNodes: readonly OutlineSyntaxNode[],
  targetNodeId: string
): OutlineSyntaxNode[] | null {
  for (const node of rootNodes) {
    if (node.id === targetNodeId) return [node];
    if (node.children && node.children.length > 0) {
      const sub = findOutlineNodeChain(node.children, targetNodeId);
      if (sub) return [node, ...sub];
    }
  }
  return null;
}

/**
 * 현재 포커스된 불릿(`focusedNodeId`)에서 조상 방향으로 올라가며
 * 가장 가까운 `<<doc>>` / `<<view>>` / `<<asset>>` 지시어 컨텍스트를 해석한다.
 */
export function resolveActiveDirectiveContext(
  rootNodes: readonly OutlineSyntaxNode[],
  focusedNodeId: string | null
): ActiveDirectiveContext {
  const all = scanOutlineDirectives(rootNodes);
  const byId = new Map<string, ScannedOutlineDirective>();
  for (const item of all) {
    byId.set(item.nodeId, item);
  }

  const firstRenderableTarget =
    all.find((d) => d.directive.kind === "doc") ??
    all.find((d) => d.directive.kind === "view") ??
    all.find((d) => d.directive.kind === "asset") ??
    null;

  if (!focusedNodeId) {
    return {
      focusedNodeId: null,
      nearestDoc: null,
      nearestView: null,
      nearestAsset: null,
      effectiveTarget: null,
      firstRenderableTarget,
    };
  }

  const chain = findOutlineNodeChain(rootNodes, focusedNodeId);
  if (!chain) {
    return {
      focusedNodeId,
      nearestDoc: null,
      nearestView: null,
      nearestAsset: null,
      effectiveTarget: null,
      firstRenderableTarget,
    };
  }

  let nearestDoc: ScannedOutlineDirective | null = null;
  let nearestView: ScannedOutlineDirective | null = null;
  let nearestAsset: ScannedOutlineDirective | null = null;

  for (let i = chain.length - 1; i >= 0; i--) {
    const entry = byId.get(chain[i].id);
    if (!entry) continue;
    if (!nearestDoc && entry.directive.kind === "doc") nearestDoc = entry;
    if (!nearestView && entry.directive.kind === "view") nearestView = entry;
    if (!nearestAsset && entry.directive.kind === "asset") nearestAsset = entry;
  }

  const effectiveTarget = nearestDoc ?? nearestView ?? nearestAsset ?? null;

  return {
    focusedNodeId,
    nearestDoc,
    nearestView,
    nearestAsset,
    effectiveTarget,
    firstRenderableTarget,
  };
}

/**
 * 아웃라인 문서 내 모든 `<<asset:id>>` 정의 노드를 추출한다.
 * (`변환규칙::`, `시각스타일::`, 하위 `<<template:...>>` 자동 파싱)
 */
export function extractOutlineAssets(
  rootNodes: readonly OutlineSyntaxNode[]
): Record<string, ParsedOutlineAsset> {
  const directives = scanOutlineDirectives(rootNodes);
  const assets: Record<string, ParsedOutlineAsset> = {};

  for (const item of directives) {
    if (item.directive.kind !== "asset") continue;
    const conversionRules: string[] = [];
    const visualStyles: string[] = [];
    let templateNode: OutlineSyntaxNode | undefined;
    let targetViewTag: string | undefined;

    for (const child of item.node.children ?? []) {
      const raw = child.text.trim();
      if (!raw) continue;
      const childDir = parseOutlineDirective(raw);
      if (childDir?.kind === "template") {
        templateNode = child;
        targetViewTag = childDir.target;
        continue;
      }
      if (/^변환\s*규칙\s*::/i.test(raw)) {
        const inlineVal = raw.replace(/^변환\s*규칙\s*::/i, "").trim();
        if (inlineVal) conversionRules.push(inlineVal);
        for (const sub of child.children ?? []) {
          if (sub.text.trim()) conversionRules.push(sub.text.trim());
        }
        continue;
      }
      if (/^시각\s*스타일\s*::/i.test(raw)) {
        const inlineVal = raw.replace(/^시각\s*스타일\s*::/i, "").trim();
        if (inlineVal) visualStyles.push(inlineVal);
        for (const sub of child.children ?? []) {
          if (sub.text.trim()) visualStyles.push(sub.text.trim());
        }
        continue;
      }
    }

    if (!targetViewTag && item.directive.target.startsWith("table")) {
      targetViewTag = "table";
    }

    assets[item.directive.target] = {
      assetId: item.directive.target,
      nodeId: item.nodeId,
      label: item.directive.label || item.directive.target,
      targetViewTag,
      conversionRules,
      visualStyles,
      templateNode,
    };
  }

  return assets;
}

/**
 * `<<asset:...>>` 의 `시각스타일::` 서술에서 표 시각 프리셋을 결정적으로 해석한다.
 */
export function parseTableAssetVisualPreset(
  asset: ParsedOutlineAsset | undefined
): TableAssetVisualPreset | null {
  if (!asset) return null;
  const joined = [asset.label, ...asset.visualStyles, ...asset.conversionRules].join(" ");
  if (!joined.trim()) return null;

  const borderRules: Partial<TableBorderRules> = {};
  const headerStyle: Partial<TableHeaderStyle> = {};
  let cellPadding: string | undefined;

  if (/세로선\s*(제거|없|숨)|no[-_\s]?vertical/i.test(joined)) {
    borderRules.vertical = "none";
  }
  if (/외곽선\s*(없|제거)|borderless/i.test(joined)) {
    borderRules.outer = "none";
  }
  if (/굵은\s*(상단|헤더)|상단\s*2px|header[-_\s]?thick/i.test(joined)) {
    borderRules.headerTop = "2px solid #1e293b";
    borderRules.headerBottom = "1.5px solid #334155";
  }
  if (/둥근|round/i.test(joined)) {
    borderRules.radius = "8px";
  }
  if (/컴팩트|compact|조밀/i.test(joined)) {
    cellPadding = "5px 8px";
    headerStyle.padding = "6px 8px";
  } else if (/여유|넓|spacious/i.test(joined)) {
    cellPadding = "10px 14px";
    headerStyle.padding = "10px 14px";
  }

  // Color hex extraction for header background or accent
  const hexMatch = /#[0-9a-fA-F]{6}\b/.exec(asset.visualStyles.join(" "));
  if (hexMatch) {
    headerStyle.bg = hexMatch[0];
  } else if (/네이비|다크\s*헤더|navy|slate/i.test(joined)) {
    headerStyle.bg = "#1e293b";
    headerStyle.textColor = "#f8fafc";
  } else if (/그린|에메랄드|민트|emerald|green/i.test(joined)) {
    headerStyle.bg = "#ecfdf5";
    headerStyle.textColor = "#065f46";
    borderRules.headerTop = "2px solid #059669";
  } else if (/미니멀|화이트|투명|clean|minimal/i.test(joined)) {
    headerStyle.bg = "#f8fafc";
    headerStyle.textColor = "#0f172a";
    borderRules.vertical = borderRules.vertical ?? "none";
    borderRules.outer = borderRules.outer ?? "none";
    borderRules.headerTop = borderRules.headerTop ?? "2px solid #0f172a";
  }

  if (
    Object.keys(borderRules).length === 0 &&
    Object.keys(headerStyle).length === 0 &&
    !cellPadding
  ) {
    return null;
  }

  return {
    ...(Object.keys(borderRules).length > 0 ? { borderRules } : {}),
    ...(Object.keys(headerStyle).length > 0 ? { headerStyle } : {}),
    ...(cellPadding ? { cellPadding } : {}),
  };
}

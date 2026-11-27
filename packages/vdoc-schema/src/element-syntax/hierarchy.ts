/**
 * @vibe/vdoc-schema — 계층(담기) 문법 검사기.
 *
 * 레지스트리(`.vsyntax`)의 층 · 담기 규칙(`layer` · `parents` · `children`)만 읽어서 판정한다 — 장르 · 문서 종류 분기는 없다.
 *   - `validateOutlineHierarchy`: `.outline` 의 `<<doc:…>>` 컴파일 가지가 '섹션 → 블록' 순서로 담겼는지 (다단은 다단 섹션).
 *   - `validateVDocHierarchy`: `.vdoc` 이 섹션 단위로 지어졌는지 (heading 블록으로 섹션을 흉내 낸 납작한 문서 등).
 *   - `measureOutlineVDocIsomorphism`: 컴파일 가지의 섹션 · 단 노드와 `.vdoc` 의 `sourceNodeId` 가 1:1 인지.
 */
import type { VDocDocument } from "../types";
import type { LayoutBlock } from "../blocks";
import type { OutlineSyntaxNode, StructureLayer, StructureParentRef } from "./contract";
import { parseOutlineDirective } from "./directive-scanner";
import {
  BLOCK_DEFAULT_PARENTS,
  COLUMN_SECTION_RULE,
  DOCUMENT_ROOT_GRAMMAR,
  createElementSyntaxRegistry,
  type ElementSyntaxRegistry,
} from "./registry";

export type HierarchyIssueSeverity = "error" | "warning";

export interface HierarchyIssue {
  readonly code: string;
  readonly severity: HierarchyIssueSeverity;
  readonly nodeId?: string;
  readonly message: string;
}

/** 분류된 아웃라인 노드 — 레지스트리의 어느 요소/규칙인지와 그 층 · 담기 규칙. */
export interface ClassifiedStructureNode {
  /** 요소 id(`section` · `table`) · 규칙 id(`column-section` · `image-slot` …) · `document` · `text`. */
  readonly itemId: string;
  readonly layer: StructureLayer;
  readonly parents: readonly StructureParentRef[];
  readonly children?: readonly StructureParentRef[];
  /** 내부 문법이 따로 있는 노드(표 · 목록 · 메타) — 하위는 이 검사기가 내려가지 않는다. */
  readonly opaque?: boolean;
  /** 레지스트리에 없는 `<<view:…>>` (컴파일러가 글로 폴백한다). */
  readonly unknownView?: string;
}

const VIEW_ALIASES: Readonly<Record<string, string>> = { grid: "columns", heading: "title" };

function ruleByViewSymbol(registry: ElementSyntaxRegistry, viewTag: string) {
  const needle = `<<view:${viewTag}`;
  for (const el of registry.listElements()) {
    for (const rule of el.rules) {
      if (rule.symbol.toLowerCase().startsWith(needle)) return rule;
    }
  }
  return undefined;
}

function findRule(registry: ElementSyntaxRegistry, elementId: string, ruleId: string) {
  return registry.getElement(elementId)?.rules.find((r) => r.id === ruleId);
}

/** 다단 섹션의 역할 이름 (`<<view:section:column>>` → `column`) — 볼트 `.vsyntax` 에서 기호를 바꾸면 따라간다. */
export function columnSectionRole(registry: ElementSyntaxRegistry = createElementSyntaxRegistry()): string | null {
  const sym = registry.resolveSymbol("section", COLUMN_SECTION_RULE.id, COLUMN_SECTION_RULE.symbol);
  const dir = parseOutlineDirective(sym);
  return dir?.kind === "view" && dir.target === "section" && dir.role ? dir.role : null;
}

function startsWithSymbol(text: string, symbol: string): boolean {
  const t = text.trim().toLowerCase();
  const s = symbol.trim().toLowerCase();
  if (!s) return false;
  return t === s || (t.startsWith(s) && /\s/.test(t.slice(s.length, s.length + 1)));
}

const IMAGE_FILE_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
const OPEN_EVIDENCE_TAG_RE = /<<\s*(?:resource|cite)\b/gi;
const CLOSED_EVIDENCE_TAG_RE = /<<\s*(?:resource\s*:\s*[^>\n]*|cite(?:\s*:\s*[^>\n]+)?)\s*>>/gi;

/**
 * 아웃라인 노드 하나를 레지스트리 기준으로 분류한다. 빈 불릿은 `null`.
 * 이 함수는 '무엇인가'만 판정하고, '어디에 놓여도 되나'는 `parents` · `children` 으로 호출 측이 판정한다.
 */
export function classifyOutlineStructureNode(
  node: OutlineSyntaxNode,
  registry: ElementSyntaxRegistry = createElementSyntaxRegistry()
): ClassifiedStructureNode | null {
  const text = (node.text ?? "").trim();
  const fileTarget = String(node.file?.target ?? "");
  if (!text && !fileTarget && !(node.children?.length ?? 0)) return null;

  const dir = parseOutlineDirective(text);
  if (dir && text.startsWith("<<")) {
    if (dir.kind === "doc") {
      return { itemId: "document", layer: DOCUMENT_ROOT_GRAMMAR.layer, parents: DOCUMENT_ROOT_GRAMMAR.parents ?? [] };
    }
    if (dir.kind === "asset" || dir.kind === "template") {
      return { itemId: dir.kind, layer: "inline", parents: ["$any"], opaque: true };
    }
    if (dir.kind === "resource" || dir.kind === "cite") {
      const el = registry.getElement("resource");
      const ruleId = dir.kind === "resource" ? "resource-unified" : `cite-${dir.target}`;
      const rule = el?.rules.find((r) => r.id === ruleId) ?? el?.rules.find((r) => r.id === "resource-unified");
      return {
        itemId: rule?.id ?? "resource",
        layer: rule?.layer ?? el?.layer ?? "inline",
        parents: rule?.parents ?? el?.parents ?? ["layer:section", "layer:block"],
        opaque: true,
      };
    }
    if (dir.kind === "view") {
      const tag = VIEW_ALIASES[dir.target] ?? dir.target;
      const columnRole = columnSectionRole(registry);
      if (tag === "section" && columnRole && dir.role === columnRole) {
        const rule = findRule(registry, "section", COLUMN_SECTION_RULE.id);
        return {
          itemId: COLUMN_SECTION_RULE.id,
          layer: rule?.layer ?? "section",
          parents: rule?.parents ?? ["layer:document"],
        };
      }
      const el = registry.getElementByViewTag(tag);
      if (el) {
        return {
          itemId: el.id,
          layer: el.layer ?? "block",
          parents: el.parents ?? BLOCK_DEFAULT_PARENTS,
          opaque: el.layer === "block",
        };
      }
      const rule = ruleByViewSymbol(registry, tag);
      if (rule) {
        return {
          itemId: rule.id,
          layer: rule.layer ?? "block",
          parents: rule.parents ?? BLOCK_DEFAULT_PARENTS,
          children: rule.children,
          opaque: rule.layer === "block",
        };
      }
      return { itemId: "text", layer: "block", parents: BLOCK_DEFAULT_PARENTS, unknownView: dir.target };
    }
  }

  const colSym = registry.resolveSymbol("section", "col-container", "<<col>>");
  if (startsWithSymbol(text, colSym)) {
    const rule = findRule(registry, "section", "col-container");
    return {
      itemId: "col-container",
      layer: rule?.layer ?? "slot",
      parents: rule?.parents ?? ["columns-container"],
      children: rule?.children,
    };
  }

  const kvSym = registry.resolveSymbol("section", "kv-meta", "::");
  if (text.startsWith("문서 메타") && kvSym && text.includes(kvSym)) {
    return { itemId: "doc-meta", layer: "block", parents: ["layer:document"], opaque: true };
  }

  const imgSym = registry.resolveSymbol("section", "image-slot", "[img]").replace(/\]$/, "");
  if ((fileTarget && IMAGE_FILE_RE.test(fileTarget)) || (imgSym && text.toLowerCase().startsWith(imgSym.toLowerCase()))) {
    const rule = findRule(registry, "section", "image-slot");
    return { itemId: "image-slot", layer: rule?.layer ?? "block", parents: rule?.parents ?? BLOCK_DEFAULT_PARENTS };
  }

  return { itemId: "text", layer: "block", parents: BLOCK_DEFAULT_PARENTS };
}

function refMatches(ref: StructureParentRef, holder: ClassifiedStructureNode | null): boolean {
  if (ref === "$any") return true;
  if (ref === "$outside") return holder === null;
  if (!holder) return false;
  if (ref.startsWith("layer:")) return holder.layer === ref.slice("layer:".length);
  return holder.itemId === ref;
}

const LAYER_LABEL: Readonly<Record<StructureLayer, string>> = {
  document: "문서",
  section: "섹션",
  block: "블록",
  slot: "칸",
  inline: "인용 · 인라인",
};

function describeItem(c: ClassifiedStructureNode | null): string {
  if (!c) return "일반 불릿";
  return `${LAYER_LABEL[c.layer]}(${c.itemId})`;
}

export interface OutlineHierarchyReport {
  readonly docNodeId: string;
  readonly profileId: string | null;
  readonly ok: boolean;
  readonly issues: readonly HierarchyIssue[];
  /** 섹션 노드 id (문서 순서, 다단 섹션 포함). */
  readonly sectionNodeIds: readonly string[];
  /** 다단 섹션(`<<view:section:column>>`) 노드 id. */
  readonly columnSectionNodeIds: readonly string[];
  /** 다단 섹션의 단(자식 불릿) 노드 id — vdoc 의 단(`GridColumnDef.sourceNodeId`)과 1:1. */
  readonly columnNodeIds: readonly string[];
  readonly blockCount: number;
  readonly citationCount: number;
}

function findNodeById(nodes: readonly OutlineSyntaxNode[], id: string): OutlineSyntaxNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNodeById(n.children ?? [], id);
    if (hit) return hit;
  }
  return null;
}

/**
 * `<<doc:…>>` 컴파일 가지 하나의 담기 규칙을 검사한다.
 * - 섹션 밖(문서 바로 아래)에 놓인 블록 — 컴파일러가 말없이 '본문' 섹션 하나로 감싸던 경우
 * - 담기 규칙 위반 (섹션 안의 섹션, 표 밖의 행 · 칸 …), 폐기된 옛 다단(`<<view:columns>>` · `<<col>>`)
 * - 다단 섹션의 단이 둘 미만, 레지스트리에 없는 `<<view:…>>`, 빈 섹션, 문서 안의 문서
 */
export function validateOutlineHierarchy(
  rootNodes: readonly OutlineSyntaxNode[],
  docNodeId: string,
  registry: ElementSyntaxRegistry = createElementSyntaxRegistry()
): OutlineHierarchyReport {
  const issues: HierarchyIssue[] = [];
  const sectionNodeIds: string[] = [];
  const columnSectionNodeIds: string[] = [];
  const columnNodeIds: string[] = [];
  let blockCount = 0;
  let citationCount = 0;

  const docNode = findNodeById(rootNodes, docNodeId);
  const docDir = docNode ? parseOutlineDirective(docNode.text) : null;
  if (!docNode || docDir?.kind !== "doc") {
    return {
      docNodeId,
      profileId: null,
      ok: false,
      issues: [
        {
          code: "NOT_A_DOC_NODE",
          severity: "error",
          nodeId: docNodeId,
          message: `노드 ${docNodeId} 는 <<doc:…>> 컴파일 가지가 아닙니다.`,
        },
      ],
      sectionNodeIds,
      columnSectionNodeIds,
      columnNodeIds,
      blockCount,
      citationCount,
    };
  }
  if (docDir.target && !registry.getProfile(docDir.target)) {
    issues.push({
      code: "UNKNOWN_PROFILE",
      severity: "warning",
      nodeId: docNodeId,
      message: `<<doc:${docDir.target}>> 프로필이 레지스트리에 없습니다 (${registry
        .listProfiles()
        .map((p) => p.id)
        .join(" · ")}).`,
    });
  }

  const docClass = classifyOutlineStructureNode(docNode, registry);

  const visit = (node: OutlineSyntaxNode, holder: ClassifiedStructureNode, holderNodeId: string) => {
    const opened = (node.text.match(OPEN_EVIDENCE_TAG_RE) ?? []).length;
    const closed = (node.text.match(CLOSED_EVIDENCE_TAG_RE) ?? []).length;
    if (opened > closed) {
      issues.push({
        code: "UNTERMINATED_EVIDENCE_TAG",
        severity: "error",
        nodeId: node.id,
        message: `노드 ${node.id}: 근거 태그에 닫는 >> 가 없어 인용으로 인식되지 않습니다 — <<resource: 경로 #L시작-L끝 | 발췌>> 로 닫습니다.`,
      });
    }
    if (/\n|\\n/.test(node.text)) {
      issues.push({
        code: "MULTILINE_BULLET",
        severity: "error",
        nodeId: node.id,
        message: `노드 ${node.id}: 불릿 하나에 여러 줄(줄바꿈 · \\n)이 들어 있습니다 — 한 불릿은 한 줄, 표의 행 · 목록의 항목은 하위 불릿으로 나눕니다.`,
      });
    }
    const c = classifyOutlineStructureNode(node, registry);
    if (!c) return;

    if (c.itemId === "table") {
      const rows = (node.children ?? []).filter((ch) => !/^\s*<<\s*(?:resource|cite)\b/i.test(ch.text) && (ch.text.trim() || ch.children?.length));
      if (rows.length === 0) {
        issues.push({
          code: "TABLE_WITHOUT_ROWS",
          severity: "error",
          nodeId: node.id,
          message: `노드 ${node.id}: 표에 행이 없습니다 — 머리행과 각 행을 <<view:table>> 의 하위 불릿(칸은 | 로 구분)으로 씁니다.`,
        });
      }
    }

    if (c.itemId === "document") {
      issues.push({
        code: "NESTED_DOCUMENT",
        severity: "error",
        nodeId: node.id,
        message: `노드 ${node.id}: <<doc>> 안에 또 <<doc>> 가 있습니다. 컴파일 가지는 일반 불릿 아래에 따로 둡니다.`,
      });
      return;
    }
    if (c.unknownView) {
      issues.push({
        code: "UNKNOWN_VIEW",
        severity: "warning",
        nodeId: node.id,
        message: `노드 ${node.id}: <<view:${c.unknownView}>> 는 레지스트리에 없는 요소라 글로 컴파일됩니다.`,
      });
    }

    if (c.itemId === "columns-container" || c.itemId === "col-container") {
      issues.push({
        code: "LEGACY_COLUMNS",
        severity: "error",
        nodeId: node.id,
        message: `노드 ${node.id}: <<view:columns>> · <<col>> 는 폐기됐습니다. 다단이 꼭 필요하면(사용자 요청 · 레퍼런스) 그 자리를 <<view:section:column>> 섹션으로 세우고 자식 불릿 하나를 한 단으로 씁니다. 아니면 섹션 안 블록으로 위아래로 놓습니다.`,
      });
      return;
    }

    const allowedByChild = c.parents.some((ref) => refMatches(ref, holder));
    const allowedByHolder = !holder.children || holder.children.some((ref) => refMatches(ref, c));
    if (!allowedByChild || !allowedByHolder) {
      const outsideSection = holder.layer === "document" && (c.layer === "block" || c.layer === "inline");
      issues.push({
        code: outsideSection ? "CONTENT_OUTSIDE_SECTION" : "PARENT_NOT_ALLOWED",
        severity: "error",
        nodeId: node.id,
        message: outsideSection
          ? `노드 ${node.id}: ${describeItem(c)} 가 섹션 밖(문서 바로 아래)에 있습니다. <<view:section:역할>> 을 먼저 세우고 그 안에 넣습니다.`
          : `노드 ${node.id}: ${describeItem(c)} 는 ${describeItem(holder)}(${holderNodeId}) 안에 올 수 없습니다 — 허용 부모: ${c.parents.join(", ")}${
              holder.children ? ` · ${holder.itemId} 의 허용 자식: ${holder.children.join(", ")}` : ""
            }.`,
      });
    }

    if (c.layer === "section") {
      sectionNodeIds.push(node.id);
      const contentChildren = (node.children ?? []).filter((ch) => classifyOutlineStructureNode(ch, registry) !== null);
      if (contentChildren.length === 0) {
        issues.push({
          code: "EMPTY_SECTION",
          severity: "warning",
          nodeId: node.id,
          message: `노드 ${node.id}: 섹션에 내용이 없습니다.`,
        });
      }
      if (c.itemId === COLUMN_SECTION_RULE.id) {
        columnSectionNodeIds.push(node.id);
        // 인용 하위 불릿은 단이 아니라 섹션 근거로 붙는다.
        const cols = contentChildren.filter((ch) => classifyOutlineStructureNode(ch, registry)?.layer !== "inline");
        columnNodeIds.push(...cols.map((ch) => ch.id));
        if (cols.length < 2) {
          issues.push({
            code: "COLUMNS_NEED_TWO",
            severity: "error",
            nodeId: node.id,
            message: `노드 ${node.id}: 다단 섹션의 단(자식 불릿)이 ${cols.length}개입니다 — 자식 불릿 하나가 한 단이라 둘 이상이어야 합니다. 나란히 놓을 필요가 없으면 일반 섹션으로 씁니다.`,
          });
        }
      }
    } else if (c.layer === "block") {
      blockCount += 1;
    } else if (c.layer === "inline") {
      citationCount += 1;
    }

    if (c.opaque) return;
    for (const child of node.children ?? []) visit(child, c, node.id);
  };

  for (const child of docNode.children ?? []) visit(child, docClass!, docNode.id);

  if (sectionNodeIds.length === 0) {
    issues.push({
      code: "DOC_WITHOUT_SECTION",
      severity: "error",
      nodeId: docNodeId,
      message: `<<doc>> 컴파일 가지(${docNodeId})에 <<view:section>> 이 하나도 없습니다. 스토리라인의 단위마다 섹션을 먼저 세웁니다.`,
    });
  }

  return {
    docNodeId,
    profileId: docDir.target ?? null,
    ok: !issues.some((i) => i.severity === "error"),
    issues,
    sectionNodeIds,
    columnSectionNodeIds,
    columnNodeIds,
    blockCount,
    citationCount,
  };
}

// ---------------------------------------------------------------------------------------------
// .vdoc 검사
// ---------------------------------------------------------------------------------------------

export interface VDocHierarchyReport {
  readonly ok: boolean;
  readonly issues: readonly HierarchyIssue[];
  readonly unitCount: number;
  readonly sectionUnitCount: number;
  readonly boundUnitCount: number;
  /** 다단(columns-grid) 블록 수. */
  readonly columnsGridCount: number;
  readonly nestedColumnBlockCount: number;
}

function isImportedForm(doc: VDocDocument): boolean {
  const origin = (doc.origin ?? {}) as unknown as Record<string, unknown>;
  return Array.isArray(origin.imports) && origin.imports.length > 0;
}

function headingLevel(b: LayoutBlock): number | null {
  if (b.kind === "heading") return (b as { level?: number }).level ?? 2;
  return null;
}

/**
 * `.vdoc` 이 섹션 단위로 지어졌는지 본다 (서식 원문 가져오기 문서는 원문 쪽을 지키므로 쪽 단위를 허용).
 * - 단위가 섹션이 아님 · outline 에 묶였는데 단위에 `sourceNodeId` 가 없음
 * - 한 단위 안에 같은 최상위 제목(h1/h2)이 둘 이상 — 섹션을 제목 블록으로 흉내 낸 납작한 문서
 * - 글로 쓴 문서의 절대 좌표(frame) 블록
 */
export function validateVDocHierarchy(doc: VDocDocument): VDocHierarchyReport {
  const issues: HierarchyIssue[] = [];
  const imported = isImportedForm(doc);
  let sectionUnitCount = 0;
  let boundUnitCount = 0;
  let columnsGridCount = 0;
  let nestedColumnBlockCount = 0;

  for (const page of doc.pages) {
    if (page.unitKind === "section") sectionUnitCount += 1;
    if (page.sourceNodeId) boundUnitCount += 1;
    if (!imported && page.unitKind !== "section") {
      issues.push({
        code: "UNIT_NOT_SECTION",
        severity: "error",
        nodeId: page.pageId,
        message: `단위 ${page.pageId}(${page.pageLabel || page.pageNumber}) 가 섹션이 아닙니다 (unitKind=${page.unitKind ?? "없음"}). 섹션이 구조 단위이고 쪽은 출력 결과입니다.`,
      });
    }
    if (doc.outlineRef && !page.sourceNodeId) {
      issues.push({
        code: "UNBOUND_SECTION",
        severity: "error",
        nodeId: page.pageId,
        message: `단위 ${page.pageId} 는 outline 에 묶인 문서인데 원본 섹션 불릿(sourceNodeId)이 없습니다.`,
      });
    }
    const levels = page.blocks.map(headingLevel).filter((l): l is number => l !== null && l <= 2);
    if (levels.length > 0) {
      const top = Math.min(...levels);
      const sameTop = levels.filter((l) => l === top).length;
      if (sameTop >= 2) {
        issues.push({
          code: "SECTION_COLLAPSED",
          severity: "error",
          nodeId: page.pageId,
          message: `단위 ${page.pageId} 안에 최상위 제목(h${top})이 ${sameTop}개 — 섹션을 제목 블록으로 흉내 냈습니다. 제목마다 섹션으로 나눕니다.`,
        });
      }
    }
    for (const b of page.blocks) {
      if (!imported && b.frame) {
        issues.push({
          code: "ABSOLUTE_FRAME",
          severity: "warning",
          nodeId: b.blockId,
          message: `블록 ${b.blockId} 가 절대 좌표(frame)로 놓였습니다. 글로 쓰는 문서는 섹션 안 흐름 배치만 씁니다.`,
        });
      }
      if (b.kind === "columns-grid") {
        columnsGridCount += 1;
        const cols = (b as { columns?: { blocks?: LayoutBlock[] }[] }).columns ?? [];
        for (const col of cols) nestedColumnBlockCount += col.blocks?.length ?? 0;
      }
    }
  }

  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
    unitCount: doc.pages.length,
    sectionUnitCount,
    boundUnitCount,
    columnsGridCount,
    nestedColumnBlockCount,
  };
}

// ---------------------------------------------------------------------------------------------
// outline ↔ vdoc 동형
// ---------------------------------------------------------------------------------------------

export interface OutlineVDocIsomorphism {
  /** outline 컴파일 가지의 섹션 + 다단 섹션의 단 노드 수. */
  readonly expected: number;
  /** 그중 vdoc 단위 · 블록의 sourceNodeId 로 찾아지는 수. */
  readonly matched: number;
  readonly ratio: number;
  readonly missingNodeIds: readonly string[];
}

function collectSourceNodeIds(doc: VDocDocument): Set<string> {
  const ids = new Set<string>();
  const walkBlocks = (blocks: readonly LayoutBlock[]) => {
    for (const b of blocks) {
      if (b.sourceNodeId) ids.add(b.sourceNodeId);
      const cols = (b as { columns?: { blocks?: LayoutBlock[]; sourceNodeId?: string }[] }).columns;
      if (Array.isArray(cols)) {
        for (const c of cols) {
          if (c.sourceNodeId) ids.add(c.sourceNodeId);
          if (c.blocks) walkBlocks(c.blocks);
        }
      }
    }
  };
  for (const p of doc.pages) {
    if (p.sourceNodeId) ids.add(p.sourceNodeId);
    walkBlocks(p.blocks);
  }
  return ids;
}

export function measureOutlineVDocIsomorphism(report: OutlineHierarchyReport, doc: VDocDocument): OutlineVDocIsomorphism {
  const expectedIds = [...report.sectionNodeIds, ...report.columnNodeIds];
  const present = collectSourceNodeIds(doc);
  const missingNodeIds = expectedIds.filter((id) => !present.has(id));
  const matched = expectedIds.length - missingNodeIds.length;
  return {
    expected: expectedIds.length,
    matched,
    ratio: expectedIds.length === 0 ? 0 : matched / expectedIds.length,
    missingNodeIds,
  };
}

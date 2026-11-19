import type { OutlineNode } from "@vibe/outliner";
import {
  applyTableCommandToDocument,
  getBlockSlotIds,
  htmlToPlainText,
  plainTextToHtml,
  sectionSlotId,
  type LayoutBlock,
  type StructuredTableBlockDef,
  type TableCellSlotDef,
  type TableCommand,
  type VDocDocument,
  type VDocPage,
  type VDocPageLayout,
  type VDocSlot,
  type WebFormVariant,
} from "@vibe/vdoc-schema";
import {
  parseContainerDirective,
  resolveAssetIdFromHint,
  resolveSurfaceFromDocFormat,
  stripLinkTags,
} from "./documentLinkParser";
import {
  buildDynamicTableVariantBlock,
  buildListVariantBlock,
  buildTitleVariantBlock,
  buildWebFormVariantBlock,
  compileAssetPageBlocks,
  compileSourceNodesToViewRows,
  hasNestedChoiceOptions,
  inferBlockRoleFromKind,
  isBlankCellToken,
  isNaiveMultiInputRow,
  parseExplicitPipeCells,
  parseNaiveKeyValue,
} from "./formAssets";
import type {
  BlockVariantId,
  DensityPreset,
  DocumentTheme,
  FormAssetId,
  LayoutChoice,
  LinkedDocumentSpec,
  PlaygroundBlockMeta,
  PlaygroundDocSpec,
  PlaygroundNode,
  SemanticRole,
  SlotReverseTarget,
  SurfaceKind,
  TableBlockOverride,
} from "./types";

export const SEMANTIC_ROLE_META: Record<
  SemanticRole,
  { label: string; badgeClass: string; defaultLayout: LayoutChoice }
> = {
  cover: {
    label: "제목/표지",
    badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
    defaultLayout: "cover-banner",
  },
  summary: {
    label: "핵심요약",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    defaultLayout: "callout-box",
  },
  group: {
    label: "비교/묶음",
    badgeClass: "bg-violet-50 text-violet-700 border-violet-200",
    defaultLayout: "columns-grid",
  },
  section: {
    label: "구역/섹션",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    defaultLayout: "section-block",
  },
  body: {
    label: "본문",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
    defaultLayout: "text",
  },
  "form-ref": {
    label: "복합양식",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-300",
    defaultLayout: "form-ref",
  },
};

export interface LayoutOption {
  choice: LayoutChoice;
  label: string;
  hint: string;
}

export function getLayoutOptionsForNode(node: PlaygroundNode): LayoutOption[] {
  if (node.role === "form-ref") {
    return [];
  }
  if (node.role === "cover") {
    return [
      { choice: "cover-banner", label: "표지 배너", hint: "공문·보고서 상단 배너" },
      { choice: "hero", label: "블로그 히어로", hint: "아티클 상단 큰 타이틀" },
      { choice: "heading", label: "단순 대제목", hint: "밑줄 강조 제목" },
    ];
  }
  if (node.role === "group" || node.children.length >= 2) {
    return [
      { choice: "rfp-spec-table", label: "RFP 명세표", hint: "항목별 반복 명세 카드표" },
      { choice: "rfp-summary-table", label: "목록 요약표", hint: "순번·고유번호 일람표" },
      { choice: "columns-grid", label: "다단 카드", hint: "나란히 카드 비교" },
      { choice: "structured-table", label: "일반 비교 표", hint: "파이프(|) 격자 표" },
      { choice: "section-block", label: "리스트 섹션", hint: "세로 목록 조판" },
      { choice: "callout-box", label: "강조 상자", hint: "배경 박스 묶음" },
    ];
  }
  if (node.role === "summary") {
    return [
      { choice: "callout-box", label: "강조 콜아웃", hint: "핵심 요약 박스" },
      { choice: "section-block", label: "표준 섹션", hint: "제목 + 본문" },
      { choice: "text", label: "일반 본문", hint: "단순 단락" },
    ];
  }
  return [
    { choice: "section-block", label: "표준 섹션", hint: "소제목 + 본문" },
    { choice: "callout-box", label: "강조 상자", hint: "연한 배경 박스" },
    { choice: "heading", label: "소제목만", hint: "강조 바 제목" },
    { choice: "text", label: "일반 본문", hint: "줄글 단락" },
  ];
}

export function toOutlinerNodes(nodes: readonly PlaygroundNode[]): OutlineNode[] {
  return nodes.map((n) => ({
    id: n.id,
    text: n.text,
    ...(n.note ? { note: n.note } : null),
    ...(n.nodeType ? { nodeType: n.nodeType } : null),
    ...(n.isCompleted !== undefined ? { isCompleted: n.isCompleted } : null),
    ...(n.isFolded !== undefined ? { isFolded: n.isFolded } : null),
    children: n.role === "form-ref" ? [] : toOutlinerNodes(n.children),
  }));
}

function indexPlaygroundNodes(
  nodes: readonly PlaygroundNode[],
  acc = new Map<string, PlaygroundNode>()
): Map<string, PlaygroundNode> {
  for (const n of nodes) {
    acc.set(n.id, n);
    if (n.children.length > 0) indexPlaygroundNodes(n.children, acc);
  }
  return acc;
}

export function syncOutlinerToPlaygroundNodes(
  roots: readonly OutlineNode[],
  prevNodes: readonly PlaygroundNode[]
): PlaygroundNode[] {
  const prevMap = indexPlaygroundNodes(prevNodes);

  const convert = (items: readonly OutlineNode[], depth: number): PlaygroundNode[] =>
    items.map((item) => {
      const existing = prevMap.get(item.id);
      const structureFields = {
        ...(item.nodeType ? { nodeType: item.nodeType } : null),
        ...(item.isCompleted !== undefined ? { isCompleted: item.isCompleted } : null),
        ...(item.isFolded !== undefined ? { isFolded: item.isFolded } : null),
      };
      if (existing?.role === "form-ref") {
        return {
          ...existing,
          text: item.text,
          ...(item.note ? { note: item.note } : null),
          ...structureFields,
        };
      }
      const hasChildren = item.children.length > 0;
      const defaultRole: SemanticRole = depth === 0 ? (hasChildren ? "group" : "section") : "body";
      const role: SemanticRole = existing?.role ?? defaultRole;
      const layoutChoice: LayoutChoice =
        existing?.layoutChoice ??
        (role === "group" ? "columns-grid" : SEMANTIC_ROLE_META[role].defaultLayout);

      return {
        id: item.id,
        text: item.text,
        ...(item.note ? { note: item.note } : null),
        ...structureFields,
        role,
        layoutChoice,
        children: convert(item.children, depth + 1),
      };
    });

  return convert(roots, 0);
}

export function updatePlaygroundNode(
  nodes: readonly PlaygroundNode[],
  nodeId: string,
  updater: (node: PlaygroundNode) => PlaygroundNode
): PlaygroundNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) return updater(node);
    if (node.children.length > 0) {
      return { ...node, children: updatePlaygroundNode(node.children, nodeId, updater) };
    }
    return node;
  });
}

function inferTitleVariantByContext(
  node: PlaygroundNode,
  cleanText: string,
  pageIndex: number,
  seenTitleIndex: number,
  insideSection: boolean
): BlockVariantId {
  const hasChildren = node.children.length > 0;
  const hasSectionPrefix = /^(?:\d+[.)]\s*|[ⅠⅡⅢⅣⅤⅥ]+\.\s*|[가-하]\.\s*|\[\d+\])/.test(cleanText);
  const looksLikeDocumentTitle =
    /(?:조사표|계획서|품의서|보고서|안내서|신청서|요강|명부|공고)$/.test(cleanText);

  if (
    !insideSection &&
    pageIndex === 0 &&
    seenTitleIndex === 0 &&
    !hasSectionPrefix &&
    (looksLikeDocumentTitle || !hasChildren)
  ) {
    return "title-underline";
  }
  return "title-section-bar";
}

function inferTableVariantByContext(
  rows: readonly PlaygroundNode[],
  sectionTitle: string,
  pageHint: string | undefined
): BlockVariantId {
  const nonViewRows = rows.filter((r) => parseContainerDirective(r.text).kind !== "view");
  const hasMultiInputGroup = nonViewRows.some((r) =>
    isNaiveMultiInputRow(stripLinkTags(r.text), r.children)
  );
  const hasNestedGroup =
    !hasMultiInputGroup &&
    nonViewRows.some((r) =>
      r.children.some((c) => stripLinkTags(c.text).length > 0) &&
      hasNestedChoiceOptions([r]) === false
    );
  const allNodes = nonViewRows.flatMap((r) =>
    r.children.length > 0 ? r.children : [r]
  );
  const hasBlankToken = allNodes.some((r) =>
    parseExplicitPipeCells(r.text).some((cell) => isBlankCellToken(cell))
  );
  const allTwoCol =
    !hasNestedGroup &&
    !hasMultiInputGroup &&
    nonViewRows.length > 0 &&
    nonViewRows.every((r) => {
      if (r.children.length > 0) return false;
      return (
        parseExplicitPipeCells(r.text).length === 2 ||
        parseNaiveKeyValue(r.text) !== null
      );
    });
  const hasChoiceList =
    hasNestedChoiceOptions(nonViewRows) ||
    allNodes.some((r) => {
      const clean = stripLinkTags(r.text);
      return clean.includes("□") || clean.includes("/");
    });
  if (hasMultiInputGroup) {
    return "table-header-below-matrix";
  }
  if (/품평|평가|체크리스트/.test(sectionTitle)) {
    return "table-eval-checklist";
  }
  if (/현황|대장|명부/.test(sectionTitle)) {
    return "table-roster-ledger";
  }
  if (
    !hasNestedGroup &&
    !hasChoiceList &&
    !hasBlankToken &&
    allTwoCol &&
    (/개요|요약|메타|정보/.test(sectionTitle) || nonViewRows.length >= 2)
  ) {
    return "table-grouped-compare";
  }
  if (hasChoiceList || hasBlankToken || (pageHint && /체크/.test(pageHint))) {
    return "table-grouped-compare";
  }
  return "table-modern-flat";
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function splitPipeCells(text: string, expectedCols: number): string[] {
  const parts = text.split("|").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return Array.from({ length: expectedCols }, () => "");
  if (parts.length >= expectedCols) {
    return [
      ...parts.slice(0, expectedCols - 1),
      parts.slice(expectedCols - 1).join(" · "),
    ];
  }
  return [...parts, ...Array.from({ length: expectedCols - parts.length }, () => "")];
}

function splitCardTitleAndBody(text: string): { title: string; body: string } {
  const idx = text.indexOf("|");
  if (idx >= 0) {
    return {
      title: text.slice(0, idx).trim(),
      body: text.slice(idx + 1).trim(),
    };
  }
  const colonIdx = text.indexOf(":");
  if (colonIdx > 0 && colonIdx < 24) {
    return {
      title: text.slice(0, colonIdx).trim(),
      body: text.slice(colonIdx + 1).trim(),
    };
  }
  return { title: text, body: "" };
}

const ROMAN_NUMS = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ"] as const;

function renderOfficialListHtml(children: readonly PlaygroundNode[], depth = 0): string {
  if (children.length === 0) return "";
  return children
    .map((c) => {
      const bullet = depth === 0 ? "❏" : depth === 1 ? "◦" : "-";
      const indent = depth * 14;
      const sub = c.children.length > 0 ? renderOfficialListHtml(c.children, depth + 1) : "";
      return `<p style="margin-left:${indent}px">${bullet} ${escapeHtml(stripLinkTags(c.text))}</p>${sub}`;
    })
    .join("");
}

function renderModernListHtml(children: readonly PlaygroundNode[]): string {
  if (children.length === 0) return "";
  return `<ul>${children
    .map(
      (c) =>
        `<li>${escapeHtml(stripLinkTags(c.text))}${c.children.length > 0 ? renderModernListHtml(c.children) : ""
        }</li>`
    )
    .join("")}</ul>`;
}

function resolvePageLayout(
  surfaceKind: SurfaceKind,
  density: DensityPreset,
  theme: DocumentTheme
): VDocPageLayout {
  const padMap: Record<DensityPreset, { margin: number; gap: number; fontSize: string; lineHeight: string }> = {
    relaxed: { margin: surfaceKind === "scroll" ? 44 : 52, gap: 22, fontSize: "14.5px", lineHeight: "1.7" },
    standard: { margin: 44, gap: 16, fontSize: "13.5px", lineHeight: "1.55" },
    compact: { margin: 34, gap: 12, fontSize: "12.5px", lineHeight: "1.45" },
  };
  const d = padMap[density];
  return {
    margin: { top: d.margin, right: d.margin, bottom: d.margin, left: d.margin },
    blockGap: d.gap,
    fontSize: d.fontSize,
    lineHeight: d.lineHeight,
    ...(theme === "official" ? { fontFamily: '"Nanum Myeongjo", "Pretendard", serif' } : null),
  };
}

export interface CompiledPlaygroundResult {
  doc: VDocDocument;
  reverseMap: Record<string, SlotReverseTarget>;
  nodeSlotIds: Record<string, string[]>;
  customSlotOwnerMap: Record<string, string>;
  blockMetaMap: Record<string, PlaygroundBlockMeta>;
}

export interface CompilePlaygroundOptions {
  nodesOverride?: readonly PlaygroundNode[];
  titleOverride?: string;
  assetId?: FormAssetId;
  pageAssetOverrides?: Record<string, FormAssetId>;
  linkedDoc?: LinkedDocumentSpec;
  blockVariants?: Record<string, BlockVariantId>;
  tableOverrides?: Record<string, TableBlockOverride>;
  webFormTheme?: WebFormVariant;
}

const WEB_FORM_VARIANT_SET = new Set<string>([
  "webform-card-google",
  "webform-minimal-tally",
  "webform-pill-chips",
  "webform-step-accent",
]);

function isWebFormVariant(v: BlockVariantId | undefined): v is WebFormVariant {
  return v !== undefined && WEB_FORM_VARIANT_SET.has(v);
}

function hasStructuredContainerTags(node: PlaygroundNode): boolean {
  for (const child of node.children) {
    const dir = parseContainerDirective(child.text);
    if (dir.matched && dir.kind !== "document" && dir.kind !== "page") {
      return true;
    }
    if (hasStructuredContainerTags(child)) return true;
  }
  return false;
}

export function compilePlaygroundToVDoc(
  spec: PlaygroundDocSpec,
  slotOverrides: Record<string, string>,
  options?: CompilePlaygroundOptions
): CompiledPlaygroundResult {
  const effectiveNodes = options?.nodesOverride ?? spec.nodes;
  const effectiveTitle = options?.titleOverride ?? spec.title;
  const activeAssetId = options?.assetId ?? "asset-general-doc";
  const docFormatLower = (options?.linkedDoc?.docFormat ?? "").toLowerCase();
  const isExplicitTextFormat =
    docFormatLower === "text" || docFormatLower === "raw" || docFormatLower === "plain";
  const isWebFormFormat =
    docFormatLower.includes("webform") || docFormatLower === "web" || docFormatLower.includes("form");
  const hasContainerStructure =
    options?.linkedDoc !== undefined && hasStructuredContainerTags(options.linkedDoc.node);
  // <<section>>/<<title>>/<<list>>/<<table>> 컨테이너 태그를 쓰는 문서는 <<document:hwp|WebForm>> 로 바꿔도 동적 컴파일러를 유지한다.
  const usesContainerCompiler =
    options?.linkedDoc !== undefined && (isExplicitTextFormat || hasContainerStructure);
  const isKoreanOfficialFormat =
    !isWebFormFormat &&
    (docFormatLower.includes("hwp") ||
      docFormatLower.includes("공문") ||
      docFormatLower.includes("품의") ||
      docFormatLower.includes("rfp") ||
      docFormatLower.includes("a4"));
  const resolvedSurfaceKind = resolveSurfaceFromDocFormat(
    options?.linkedDoc?.docFormat,
    spec.surfaceKind
  );
  const isKoreanHwpAsset =
    !usesContainerCompiler &&
    activeAssetId !== "asset-general-doc" &&
    options?.linkedDoc !== undefined;
  const finalSurfaceKind: SurfaceKind = isKoreanHwpAsset ? "paged" : resolvedSurfaceKind;
  const webSurfaceWidth = isWebFormFormat ? 760 : 720;
  const scrollPageRect =
    finalSurfaceKind === "scroll" ? { width: webSurfaceWidth, height: 120, unit: "px" as const } : undefined;
  const effectiveTheme: DocumentTheme =
    isKoreanHwpAsset || (usesContainerCompiler && isKoreanOfficialFormat) ? "official" : spec.theme;

  const defaultPageId = `pg_page_${spec.id}`;
  const headerId = sectionSlotId(defaultPageId, "header");
  const footerId = sectionSlotId(defaultPageId, "footer");

  const slots: Record<string, VDocSlot> = {
    [headerId]: {
      slotId: headerId,
      label: "머리말",
      role: "editable-slot",
      content: `<p>${escapeHtml(effectiveTitle)}</p>`,
      backDataRefs: [],
    },
    [footerId]: {
      slotId: footerId,
      label: "바닥글",
      role: "editable-slot",
      content: `<p>${effectiveTheme === "official" ? "- 1 -" : finalSurfaceKind === "paged" ? "A4 Paged Layout" : "Blog Scroll Layout"}</p>`,
      backDataRefs: [],
    },
  };

  const reverseMap: Record<string, SlotReverseTarget> = {};
  const nodeSlotIds: Record<string, string[]> = {};
  const customSlotOwnerMap: Record<string, string> = {};

  const registerSlot = (
    nodeId: string,
    slotId: string,
    label: string,
    defaultHtml: string,
    target: SlotReverseTarget
  ): string => {
    const overridden = slotOverrides[slotId];
    slots[slotId] = {
      slotId,
      label,
      role: "editable-slot",
      content: overridden ?? defaultHtml,
      isEdited: Boolean(overridden),
      backDataRefs: [],
    };
    reverseMap[slotId] = target;
    (nodeSlotIds[nodeId] ??= []).push(slotId);
    return slotId;
  };

  const blocks: LayoutBlock[] = [];
  const blockMetaMap: Record<string, PlaygroundBlockMeta> = {};
  const compiledPages: VDocPage[] = [];
  let officialChapterSeq = 0;

  if (usesContainerCompiler && options?.linkedDoc) {
    const linkedDoc = options.linkedDoc;
    const rawDocPages =
      linkedDoc.pages.length > 0
        ? linkedDoc.pages
        : [
            {
              id: defaultPageId,
              nodeId: linkedDoc.nodeId,
              title: effectiveTitle,
              node: linkedDoc.node,
              isImplicit: true,
              assetHint: undefined,
            },
          ];

    // WebForm 등 연속 스크롤 웹 문서는 <<page>> 태그가 있어도 문서 크기에 맞춰 자르지 않고 하나의 연속 페이지로 컴파일한다.
    const docPages =
      isWebFormFormat && rawDocPages.length > 1
        ? [
            {
              id: rawDocPages[0].id,
              nodeId: linkedDoc.nodeId,
              title: effectiveTitle,
              node: {
                ...linkedDoc.node,
                children: rawDocPages.flatMap((dp) => {
                  const pt = stripLinkTags(dp.node.text);
                  return pt
                    ? [{ ...dp.node, text: pt }, ...dp.node.children]
                    : dp.node.children;
                }),
              },
              isImplicit: true,
              assetHint: undefined,
            },
          ]
        : rawDocPages;

    const pageLayout = resolvePageLayout(
      finalSurfaceKind,
      spec.density,
      isKoreanOfficialFormat ? "official" : "modern"
    );

    docPages.forEach((pageSpec, pageIndex) => {
      const pId = pageSpec.id || `${defaultPageId}_${pageIndex + 1}`;
      const pHeaderId = sectionSlotId(pId, "header");
      const pFooterId = sectionSlotId(pId, "footer");

      slots[pHeaderId] = {
        slotId: pHeaderId,
        label: `${pageIndex + 1}쪽 머리말`,
        role: "editable-slot",
        content: `<p>${escapeHtml(effectiveTitle)}</p>`,
        backDataRefs: [],
      };
      slots[pFooterId] = {
        slotId: pFooterId,
        label: `${pageIndex + 1}쪽 바닥글`,
        role: "editable-slot",
        content: `<p>- ${pageIndex + 1} -</p>`,
        backDataRefs: [],
      };

      const pageBlocks: LayoutBlock[] = [];

      const pushHeadingBlock = (nodeId: string, blockId: string, level: 1 | 2 | 3, text: string) => {
        const sid = registerSlot(
          nodeId,
          `pg_slot_${blockId}`,
          level === 1 ? "문서 제목" : "페이지 제목",
          level === 1 ? `<h1>${escapeHtml(text)}</h1>` : `<h2>${escapeHtml(text)}</h2>`,
          { nodeId, field: "text" }
        );
        pageBlocks.push({
          blockId,
          kind: "heading",
          level,
          align: "left",
          title: text,
          slotId: sid,
        });
        blockMetaMap[blockId] = {
          blockId,
          pageId: pId,
          role: "title",
          label: text,
          defaultVariant: "title-underline",
        };
      };

      const pushTextBlock = (
        nodeId: string,
        blockId: string,
        label: string,
        html: string,
        field: "text" | "note"
      ) => {
        const sid = registerSlot(nodeId, `pg_slot_${blockId}`, label, html, {
          nodeId,
          field,
        });
        pageBlocks.push({
          blockId,
          kind: "text",
          title: label,
          slotId: sid,
        });
      };

      if (pageSpec.isImplicit) {
        const docTitleText = stripLinkTags(linkedDoc.node.text);
        if (docTitleText.length > 0) {
          pushHeadingBlock(
            linkedDoc.nodeId,
            `pg_blk_${linkedDoc.nodeId}_raw_doc_title`,
            1,
            docTitleText
          );
        }
      } else {
        const pageTitleText = stripLinkTags(pageSpec.node.text);
        // <<page>> / <<page:유형>> 단독 컨테이너 노드(자체 텍스트 없음)일 때는 빈 제목 블록을 생성하지 않는다.
        if (pageTitleText.length > 0) {
          pushHeadingBlock(
            pageSpec.nodeId,
            `pg_blk_${pageSpec.nodeId}_raw_pg_title`,
            2,
            pageTitleText
          );
        }
      }

      let seenTitleCountOnPage = 0;
      let webFormSectionSeq = 0;

      const appendVerbatimNodes = (
        nodes: readonly PlaygroundNode[],
        depth: number,
        insideSection: boolean,
        currentSectionTitle: string
      ) => {
        let localSectionTitle = currentSectionTitle;

        for (const child of nodes) {
          const clean = stripLinkTags(child.text);
          if (!clean && child.children.length === 0) continue;

          const dir = parseContainerDirective(child.text);
          if (dir.matched && dir.kind === "section") {
            let nextSecTitle = localSectionTitle;
            if (clean) {
              const padPx = depth * 18;
              const html = padPx > 0
                ? `<p style="padding-left:${padPx}px">${escapeHtml(clean)}</p>`
                : `<p>${escapeHtml(clean)}</p>`;
              pushTextBlock(child.id, `pg_blk_${child.id}_raw`, clean, html, "text");
              nextSecTitle = clean;
            }
            if (child.children.length > 0) {
              appendVerbatimNodes(child.children, depth, true, nextSecTitle);
            }
            continue;
          }

          if (dir.matched && dir.kind === "title") {
            const targetNodes = clean
              ? [child]
              : child.children.filter((c) => stripLinkTags(c.text).length > 0);
            targetNodes.forEach((targetNode, tIdx) => {
              const titleText = stripLinkTags(targetNode.text);
              if (!titleText) return;
              const blockId =
                tIdx === 0 ? `pg_blk_${child.id}_raw` : `pg_blk_${targetNode.id}_raw`;
              const suggestedVariant: BlockVariantId = isWebFormFormat
                ? "title-web-hero"
                : inferTitleVariantByContext(
                    targetNode,
                    titleText,
                    pageIndex,
                    seenTitleCountOnPage,
                    insideSection
                  );
              seenTitleCountOnPage += 1;
              if (insideSection) {
                localSectionTitle = titleText;
              }
              const variant = options?.blockVariants?.[blockId] ?? suggestedVariant;
              pageBlocks.push(
                buildTitleVariantBlock(
                  blockId,
                  targetNode.id,
                  titleText,
                  variant,
                  registerSlot
                )
              );
              blockMetaMap[blockId] = {
                blockId,
                pageId: pId,
                role: "title",
                label: titleText,
                defaultVariant: suggestedVariant,
              };
            });
            if (clean && child.children.length > 0) {
              appendVerbatimNodes(child.children, depth + 1, insideSection, localSectionTitle);
            }
            continue;
          }

          if (dir.matched && (dir.kind === "list" || dir.kind === "callout")) {
            const items = clean ? [child] : child.children;
            const validItems = items.filter((c) => stripLinkTags(c.text).length > 0);
            if (validItems.length > 0) {
              const blockId = `pg_blk_${child.id}_raw`;
              const suggestedVariant: BlockVariantId =
                dir.kind === "callout" ? "list-filled-square" : "list-square-box";
              const chosenVariant = options?.blockVariants?.[blockId];
              if (isWebFormFormat && !chosenVariant) {
                const calloutHtml = validItems
                  .map((it) => {
                    const top = escapeHtml(stripLinkTags(it.text));
                    const sub = it.children
                      .map((c) => stripLinkTags(c.text))
                      .filter(Boolean)
                      .map((t) => `<li style="margin-left:14px">${escapeHtml(t)}</li>`)
                      .join("");
                    return sub
                      ? `<p><strong>${top}</strong></p><ul>${sub}</ul>`
                      : `<p>${top}</p>`;
                  })
                  .join("");
                const sid = registerSlot(
                  validItems[0].id,
                  `pg_slot_${blockId}_wf_notice`,
                  "웹 안내 상자",
                  calloutHtml,
                  { nodeId: validItems[0].id, field: "text" }
                );
                pageBlocks.push({
                  blockId,
                  kind: "callout-box",
                  title: stripLinkTags(validItems[0].text),
                  slotId: sid,
                  tone: "info",
                });
              } else {
                const variant = chosenVariant ?? suggestedVariant;
                pageBlocks.push(
                  buildListVariantBlock(blockId, validItems, variant, registerSlot)
                );
              }
              blockMetaMap[blockId] = {
                blockId,
                pageId: pId,
                role: "list",
                label: stripLinkTags(validItems[0].text),
                defaultVariant: suggestedVariant,
              };
            }
            continue;
          }

          if (dir.matched && dir.kind === "table") {
            const rawChildren = clean ? [child, ...child.children] : child.children;
            const viewNodes = clean
              ? []
              : rawChildren.filter((c) => parseContainerDirective(c.text).kind === "view");
            const sourceRows = rawChildren.filter(
              (c) =>
                parseContainerDirective(c.text).kind !== "view" &&
                (stripLinkTags(c.text).length > 0 || c.children.length > 0)
            );
            const fallbackViewRows = viewNodes.flatMap((v) =>
              v.children.filter((c) => stripLinkTags(c.text).length > 0 || c.children.length > 0)
            );
            if (sourceRows.length > 0 || fallbackViewRows.length > 0) {
              const blockId = `pg_blk_${child.id}_raw`;
              if (isWebFormFormat) {
                const webFormRows = sourceRows.length > 0 ? sourceRows : fallbackViewRows;
                webFormSectionSeq += 1;
                const defaultWfVariant: WebFormVariant =
                  options?.webFormTheme ?? "webform-card-google";
                const rawBlockVariant = options?.blockVariants?.[blockId];
                const wfVariant = isWebFormVariant(rawBlockVariant)
                  ? rawBlockVariant
                  : defaultWfVariant;
                const badge = /개요/.test(localSectionTitle)
                  ? "조사 개요"
                  : `STEP ${String(webFormSectionSeq).padStart(2, "0")}`;
                pageBlocks.push(
                  buildWebFormVariantBlock(
                    blockId,
                    webFormRows,
                    wfVariant,
                    registerSlot,
                    localSectionTitle,
                    badge,
                    Boolean(localSectionTitle)
                  )
                );
                blockMetaMap[blockId] = {
                  blockId,
                  pageId: pId,
                  role: "web-form",
                  label: localSectionTitle
                    ? `웹 설문 · ${localSectionTitle}`
                    : `웹 설문 섹션 (${webFormRows.length}문항)`,
                  defaultVariant: defaultWfVariant,
                };
              } else {
                const inferRows = sourceRows.length > 0 ? sourceRows : fallbackViewRows;
                const suggestedVariant = inferTableVariantByContext(
                  inferRows,
                  localSectionTitle,
                  pageSpec.assetHint
                );
                const variant = options?.blockVariants?.[blockId] ?? suggestedVariant;
                const compiledFromSource =
                  fallbackViewRows.length > 0
                    ? fallbackViewRows
                    : compileSourceNodesToViewRows(sourceRows, variant, `pg_view_${child.id}`);
                const effectiveViewRows =
                  compiledFromSource.length > 0 ? compiledFromSource : sourceRows;
                const tableOverride = options?.tableOverrides?.[blockId];
                if (tableOverride) {
                  const clonedBlock = JSON.parse(
                    JSON.stringify(tableOverride.block)
                  ) as StructuredTableBlockDef;
                  for (const [sid, s] of Object.entries(tableOverride.slots)) {
                    const overridden = slotOverrides[sid];
                    slots[sid] = {
                      ...s,
                      content: overridden ?? s.content,
                      isEdited: Boolean(overridden ?? s.isEdited),
                    };
                  }
                  const flatLeaves = effectiveViewRows.flatMap((r) =>
                    r.children.length > 0
                      ? r.children.filter((c) => stripLinkTags(c.text).length > 0)
                      : [r]
                  );
                  const hasLeftGrp = effectiveViewRows.some((vr) => vr.children.length > 0);
                  clonedBlock.rows.forEach((row, rIdx) => {
                    const leafNode = flatLeaves[rIdx];
                    let gridCol = 0;
                    let isLeftGrpRow = false;
                    row.cells.forEach((cell, cIdx) => {
                      const colSpan = cell.colSpan ?? 1;
                      if (
                        (cell.rowSpan ?? 1) > 1 &&
                        cIdx === 0 &&
                        hasLeftGrp
                      ) {
                        const grpNode = effectiveViewRows.find(
                          (vr) =>
                            vr.children.length > 0 && vr.children.some((c) => c.id === leafNode?.id)
                        );
                        if (grpNode) {
                          reverseMap[cell.slotId] = { nodeId: grpNode.id, field: "text" };
                          (nodeSlotIds[grpNode.id] ??= []).push(cell.slotId);
                          isLeftGrpRow = true;
                          gridCol += colSpan;
                          return;
                        }
                      }
                      if (leafNode) {
                        const hasPipe = stripLinkTags(leafNode.text).includes("|");
                        const targetIdx = isLeftGrpRow ? gridCol - 1 : gridCol;
                        reverseMap[cell.slotId] = hasPipe
                          ? { nodeId: leafNode.id, field: "cell", cellIndex: Math.max(0, targetIdx) }
                          : { nodeId: leafNode.id, field: "text" };
                        (nodeSlotIds[leafNode.id] ??= []).push(cell.slotId);
                      }
                      gridCol += colSpan;
                    });
                  });
                  pageBlocks.push(clonedBlock);
                } else {
                  pageBlocks.push(
                    buildDynamicTableVariantBlock(blockId, effectiveViewRows, variant, registerSlot)
                  );
                }
                blockMetaMap[blockId] = {
                  blockId,
                  pageId: pId,
                  role: "table",
                  label: localSectionTitle
                    ? `${localSectionTitle} 표 (${effectiveViewRows.length}행)`
                    : `데이터 표 (${effectiveViewRows.length}행)`,
                  defaultVariant: suggestedVariant,
                };
              }
            }
            continue;
          }

          if (clean) {
            const padPx = depth * 18;
            const html = padPx > 0
              ? `<p style="padding-left:${padPx}px">${escapeHtml(clean)}</p>`
              : `<p>${escapeHtml(clean)}</p>`;
            pushTextBlock(child.id, `pg_blk_${child.id}_raw`, clean, html, "text");
          }
          if (child.children.length > 0) {
            appendVerbatimNodes(child.children, depth + 1, insideSection, localSectionTitle);
          }
        }
      };

      appendVerbatimNodes(pageSpec.node.children, 0, false, "");

      compiledPages.push({
        pageId: pId,
        pageNumber: pageIndex + 1,
        pageLabel: `${pageIndex + 1}페이지 · ${pageSpec.title}`,
        headerSlotId: pHeaderId,
        footerSlotId: pFooterId,
        hideHeaderFooter: isWebFormFormat || finalSurfaceKind === "scroll",
        pageRect: scrollPageRect,
        layout: pageLayout,
        blocks: pageBlocks,
      });
    });
  } else if (isKoreanHwpAsset && options?.linkedDoc) {
    const docPages =
      options.linkedDoc.pages.length > 0
        ? options.linkedDoc.pages
        : [
            {
              id: defaultPageId,
              nodeId: options.linkedDoc.nodeId,
              title: effectiveTitle,
              node: options.linkedDoc.node,
              assetHint: undefined,
            },
          ];

    const pageLayout = resolvePageLayout(finalSurfaceKind, spec.density, effectiveTheme);

    docPages.forEach((pageSpec, pageIndex) => {
      const pId = pageSpec.id || `${defaultPageId}_${pageIndex + 1}`;
      const pHeaderId = sectionSlotId(pId, "header");
      const pFooterId = sectionSlotId(pId, "footer");

      slots[pHeaderId] = {
        slotId: pHeaderId,
        label: `${pageIndex + 1}쪽 머리말`,
        role: "editable-slot",
        content: `<p>${escapeHtml(effectiveTitle)}</p>`,
        backDataRefs: [],
      };
      slots[pFooterId] = {
        slotId: pFooterId,
        label: `${pageIndex + 1}쪽 바닥글`,
        role: "editable-slot",
        content: `<p>- ${pageIndex + 1} -</p>`,
        backDataRefs: [],
      };

      const pageAssetId =
        options.pageAssetOverrides?.[pId] ??
        (pageSpec.assetHint
          ? resolveAssetIdFromHint(
              pageSpec.assetHint,
              options.linkedDoc?.docFormat,
              effectiveTitle
            )
          : activeAssetId);

      const pageCompiled = compileAssetPageBlocks({
        assetId: pageAssetId,
        pageId: pId,
        pageIndex,
        totalPages: docPages.length,
        docTitle: effectiveTitle,
        linkedDoc: options.linkedDoc,
        pageSpec,
        linkedNodes: effectiveNodes,
        registerSlot,
        blockVariants: options.blockVariants ?? {},
      });

      if (pageCompiled) {
        Object.assign(blockMetaMap, pageCompiled.blockMetaMap);
        compiledPages.push({
          pageId: pId,
          pageNumber: pageIndex + 1,
          pageLabel: `${pageIndex + 1}페이지 · ${pageSpec.title}`,
          headerSlotId: pHeaderId,
          footerSlotId: pFooterId,
          hideHeaderFooter: false,
          layout: pageLayout,
          blocks: pageCompiled.blocks,
        });
      }
    });
  }

  for (const node of compiledPages.length > 0 ? [] : effectiveNodes) {
    // Type B: WYSIWYG 직접 소유 복합 양식·표 블록 (원형 보존)
    if (node.role === "form-ref") {
      const form = spec.customForms[node.id];
      if (form) {
        for (const [sid, s] of Object.entries(form.slots)) {
          slots[sid] = s;
          customSlotOwnerMap[sid] = node.id;
          (nodeSlotIds[node.id] ??= []).push(sid);
        }
        blocks.push(...form.blocks);
      }
      continue;
    }

    const choice = node.layoutChoice;

    if (choice === "cover-banner") {
      const headId = `pg_slot_${node.id}_head`;
      const byId = `pg_slot_${node.id}_by`;
      const forId = `pg_slot_${node.id}_for`;
      registerSlot(node.id, headId, "표지 제목", `<h1>${escapeHtml(node.text)}</h1>`, {
        nodeId: node.id,
        field: "text",
      });
      registerSlot(
        node.id,
        byId,
        "작성 정보",
        `<p>${escapeHtml(node.note || "작성: 문서 빌더")}</p>`,
        { nodeId: node.id, field: "note" }
      );
      registerSlot(node.id, forId, "대상", `<p>${spec.surfaceKind === "paged" ? "A4 보고서" : "블로그"}</p>`, {
        nodeId: node.id,
        field: "note",
      });
      blocks.push({
        blockId: `pg_blk_${node.id}`,
        kind: "cover-banner",
        title: node.text,
        backgroundTheme: spec.surfaceKind === "paged" ? "slate-minimal" : "emerald-gradient",
        headlineSlotId: headId,
        preparedBySlotId: byId,
        preparedForSlotId: forId,
      });
      continue;
    }

    if (choice === "hero") {
      const titleSlotId = `pg_slot_${node.id}_title`;
      const subSlotId = `pg_slot_${node.id}_sub`;
      registerSlot(node.id, titleSlotId, "히어로 제목", `<h1>${escapeHtml(node.text)}</h1>`, {
        nodeId: node.id,
        field: "text",
      });
      registerSlot(
        node.id,
        subSlotId,
        "부제",
        `<p>${escapeHtml(node.note || "WYSIWYM · Layout Binding · WYSIWYG")}</p>`,
        { nodeId: node.id, field: "note" }
      );
      blocks.push({
        blockId: `pg_blk_${node.id}`,
        kind: "hero",
        title: node.text,
        titleSlotId,
        subtitleSlotId: subSlotId,
        height: 170,
        align: "left",
        overlay: 0.45,
      });
      continue;
    }

    if (choice === "heading") {
      const slotId = `pg_slot_${node.id}_h`;
      const roman = spec.theme === "official" ? `${ROMAN_NUMS[officialChapterSeq++ % ROMAN_NUMS.length]}. ` : "";
      registerSlot(node.id, slotId, "제목", `<h2>${escapeHtml(`${roman}${node.text}`)}</h2>`, {
        nodeId: node.id,
        field: "text",
      });
      blocks.push({
        blockId: `pg_blk_${node.id}`,
        kind: "heading",
        title: node.text,
        slotId,
        level: node.role === "cover" ? 1 : 2,
        decoration: spec.theme === "official" ? "bar" : spec.surfaceKind === "scroll" ? "bar" : "none",
        accent: spec.theme === "official" ? "#1e3a8a" : "#4f46e5",
        underline:
          spec.theme === "official" || spec.surfaceKind === "paged"
            ? { width: "100%", thickness: "2px", color: spec.theme === "official" ? "#1e3a8a" : "#1e293b", marginTop: "6px" }
            : undefined,
      });
      continue;
    }

    if (choice === "callout-box") {
      const slotId = `pg_slot_${node.id}_callout`;
      const bodyLines =
        node.children.length > 0
          ? `<h3>${escapeHtml(node.text)}</h3><ul>${node.children
            .map((c) => `<li>${escapeHtml(c.text)}</li>`)
            .join("")}</ul>`
          : `<p><strong>${escapeHtml(node.text)}</strong></p>${node.note ? `<p>${escapeHtml(node.note)}</p>` : ""}`;
      registerSlot(node.id, slotId, "강조 상자", bodyLines, {
        nodeId: node.id,
        field: "text",
      });
      blocks.push({
        blockId: `pg_blk_${node.id}`,
        kind: "callout-box",
        title: node.text,
        slotId,
        tone: node.role === "summary" ? "info" : "neutral",
      });
      continue;
    }

    if (choice === "columns-grid" && node.children.length > 0) {
      const headSlotId = `pg_slot_${node.id}_gh`;
      registerSlot(node.id, headSlotId, "구획 소제목", `<h3>${escapeHtml(node.text)}</h3>`, {
        nodeId: node.id,
        field: "text",
      });
      blocks.push({
        blockId: `pg_blk_${node.id}_title`,
        kind: "heading",
        title: node.text,
        slotId: headSlotId,
        level: 3,
        decoration: spec.theme === "official" || spec.surfaceKind === "scroll" ? "bar" : "none",
        accent: spec.theme === "official" ? "#1e3a8a" : "#6366f1",
      });

      const cols = node.children.slice(0, 4);
      const pct = `${Math.floor(100 / cols.length)}%`;
      const slotIds = cols.map((child, idx) => {
        const sid = `pg_slot_${child.id}_col`;
        const { title, body } = splitCardTitleAndBody(child.text);
        const html = body
          ? `<p><strong>${escapeHtml(title)}</strong></p><p>${escapeHtml(body)}</p>${child.note ? `<p>${escapeHtml(child.note)}</p>` : ""}`
          : `<p><strong>${escapeHtml(title)}</strong></p>${child.note ? `<p>${escapeHtml(child.note)}</p>` : ""}`;
        registerSlot(child.id, sid, `${idx + 1}열 카드`, html, {
          nodeId: child.id,
          field: "text",
        });
        return sid;
      });
      blocks.push({
        blockId: `pg_blk_${node.id}`,
        kind: "columns-grid",
        title: node.text,
        widths: cols.map(() => pct),
        cardStyle: "card",
        gap: 12,
        slotIds,
      });
      continue;
    }

    // Page 14 스타일 반복 RFP 명세표 (Data-to-Template Binding)
    if (choice === "rfp-spec-table" && node.children.length > 0) {
      const headSlotId = `pg_slot_${node.id}_rh`;
      const roman = spec.theme === "official" ? `${ROMAN_NUMS[officialChapterSeq++ % ROMAN_NUMS.length]}. ` : "";
      registerSlot(node.id, headSlotId, "명세 섹션 제목", `<h3>${escapeHtml(`${roman}${node.text}`)}</h3>`, {
        nodeId: node.id,
        field: "text",
      });
      blocks.push({
        blockId: `pg_blk_${node.id}_title`,
        kind: "heading",
        title: node.text,
        slotId: headSlotId,
        level: 2,
        align: "left",
        decoration: "bar",
        accent: "#1e3a8a",
        underline: { width: "100%", thickness: "2px", color: "#1e3a8a", marginTop: "4px" },
      });

      node.children.forEach((child, idx) => {
        const [cat, code, reqName, deliverable] = splitPipeCells(child.text, 4);
        const defText = child.note || `${reqName || child.text}에 대한 개념 정의`;
        const detailHtml = child.children.length > 0
          ? child.children.map((sub) => `<p>• ${escapeHtml(sub.text)}</p>`).join("")
          : `<p>• ${escapeHtml(child.note || `${reqName || child.text} 세부 구현 요구사항`)}</p>`;

        const sCatK = `pg_slot_${child.id}_ck`;
        const sCatV = `pg_slot_${child.id}_cv`;
        const sCodeK = `pg_slot_${child.id}_dk`;
        const sCodeV = `pg_slot_${child.id}_dv`;
        const sNameK = `pg_slot_${child.id}_nk`;
        const sNameV = `pg_slot_${child.id}_nv`;
        const sSpecK = `pg_slot_${child.id}_sk`;
        const sDefK = `pg_slot_${child.id}_fk`;
        const sDefV = `pg_slot_${child.id}_fv`;
        const sDetK = `pg_slot_${child.id}_tk`;
        const sDetV = `pg_slot_${child.id}_tv`;
        const sOutK = `pg_slot_${child.id}_ok`;
        const sOutV = `pg_slot_${child.id}_ov`;

        registerSlot(child.id, sCatK, "분류라벨", "<p>요구사항 분류</p>", { nodeId: child.id, field: "text" });
        registerSlot(child.id, sCatV, "분류", `<p>${escapeHtml(cat || "시스템 구성")}</p>`, { nodeId: child.id, field: "cell", cellIndex: 0 });
        registerSlot(child.id, sCodeK, "번호라벨", "<p>요구사항 고유번호</p>", { nodeId: child.id, field: "text" });
        registerSlot(child.id, sCodeV, "고유번호", `<p><strong>${escapeHtml(code || `REQ-0${idx + 1}`)}</strong></p>`, { nodeId: child.id, field: "cell", cellIndex: 1 });
        registerSlot(child.id, sNameK, "명칭라벨", "<p>요구사항 명칭</p>", { nodeId: child.id, field: "text" });
        registerSlot(child.id, sNameV, "요구사항명", `<p><strong>${escapeHtml(reqName || child.text)}</strong></p>`, { nodeId: child.id, field: "cell", cellIndex: 2 });
        registerSlot(child.id, sSpecK, "세부내용라벨", "<p>요구사항<br/>세부내용</p>", { nodeId: child.id, field: "text" });
        registerSlot(child.id, sDefK, "정의라벨", "<p>정의</p>", { nodeId: child.id, field: "text" });
        registerSlot(child.id, sDefV, "정의", `<p>${escapeHtml(defText)}</p>`, { nodeId: child.id, field: "note" });
        registerSlot(child.id, sDetK, "세부라벨", "<p>세부내용</p>", { nodeId: child.id, field: "text" });
        registerSlot(child.id, sDetV, "세부내용", detailHtml, { nodeId: child.id, field: "note" });
        registerSlot(child.id, sOutK, "산출라벨", "<p>산출정보</p>", { nodeId: child.id, field: "text" });
        registerSlot(child.id, sOutV, "산출정보", `<p>${escapeHtml(deliverable || "사업수행계획서")}</p>`, { nodeId: child.id, field: "cell", cellIndex: 3 });

        blocks.push({
          blockId: idx === 0 ? `pg_blk_${node.id}` : `pg_blk_${child.id}_spec`,
          kind: "structured-table",
          title: code || child.text,
          columnWidths: ["18%", "13%", "69%"],
          borderRules: {
            outer: "1px solid #334155",
            headerTop: "2px solid #0f172a",
            rowBottom: "1px solid #64748b",
            vertical: "1px solid #64748b",
          },
          cellPadding: "5px 8px",
          rows: [
            {
              rowId: `spec_${child.id}_1`,
              cells: [
                { cellId: `sc_${child.id}_1k`, slotId: sCatK, hAlign: "center", vAlign: "middle", backgroundColor: "#e2e8f0", fontWeight: "700", fontSize: "11px" },
                { cellId: `sc_${child.id}_1v`, slotId: sCatV, colSpan: 2, vAlign: "middle", fontSize: "12px" },
              ],
            },
            {
              rowId: `spec_${child.id}_2`,
              cells: [
                { cellId: `sc_${child.id}_2k`, slotId: sCodeK, hAlign: "center", vAlign: "middle", backgroundColor: "#e2e8f0", fontWeight: "700", fontSize: "11px" },
                { cellId: `sc_${child.id}_2v`, slotId: sCodeV, colSpan: 2, vAlign: "middle", fontSize: "12px" },
              ],
            },
            {
              rowId: `spec_${child.id}_3`,
              cells: [
                { cellId: `sc_${child.id}_3k`, slotId: sNameK, hAlign: "center", vAlign: "middle", backgroundColor: "#e2e8f0", fontWeight: "700", fontSize: "11px" },
                { cellId: `sc_${child.id}_3v`, slotId: sNameV, colSpan: 2, vAlign: "middle", fontSize: "12px" },
              ],
            },
            {
              rowId: `spec_${child.id}_4`,
              cells: [
                { cellId: `sc_${child.id}_4sk`, slotId: sSpecK, rowSpan: 2, hAlign: "center", vAlign: "middle", backgroundColor: "#e2e8f0", fontWeight: "700", fontSize: "11px" },
                { cellId: `sc_${child.id}_4dk`, slotId: sDefK, hAlign: "center", vAlign: "middle", backgroundColor: "#f1f5f9", fontWeight: "600", fontSize: "11px" },
                { cellId: `sc_${child.id}_4dv`, slotId: sDefV, vAlign: "middle", fontSize: "12px" },
              ],
            },
            {
              rowId: `spec_${child.id}_5`,
              cells: [
                { cellId: `sc_${child.id}_5tk`, slotId: sDetK, hAlign: "center", vAlign: "middle", backgroundColor: "#f1f5f9", fontWeight: "600", fontSize: "11px" },
                { cellId: `sc_${child.id}_5tv`, slotId: sDetV, vAlign: "middle", fontSize: "12px" },
              ],
            },
            {
              rowId: `spec_${child.id}_6`,
              cells: [
                { cellId: `sc_${child.id}_6ok`, slotId: sOutK, hAlign: "center", vAlign: "middle", backgroundColor: "#e2e8f0", fontWeight: "700", fontSize: "11px" },
                { cellId: `sc_${child.id}_6ov`, slotId: sOutV, colSpan: 2, vAlign: "middle", fontSize: "12px" },
              ],
            },
          ],
        });
      });
      continue;
    }

    // Page 13 스타일 요구사항 목록 요약표
    if (choice === "rfp-summary-table" && node.children.length > 0) {
      const headSlotId = `pg_slot_${node.id}_smh`;
      registerSlot(node.id, headSlotId, "요약표 제목", `<h3>${escapeHtml(node.text)}</h3>`, {
        nodeId: node.id,
        field: "text",
      });
      blocks.push({
        blockId: `pg_blk_${node.id}_title`,
        kind: "heading",
        title: node.text,
        slotId: headSlotId,
        level: 3,
        decoration: "bar",
        accent: "#1e3a8a",
      });

      const cols = ["순번", "분류", "고유번호", "요구사항 명", "산출정보"];
      const headerRow = {
        rowId: `rsm_${node.id}_hdr`,
        cells: cols.map((lbl, cIdx): TableCellSlotDef => {
          const sid = `pg_slot_${node.id}_smhdr_${cIdx}`;
          registerSlot(node.id, sid, lbl, `<p><strong>${lbl}</strong></p>`, { nodeId: node.id, field: "text" });
          return { cellId: `csm_${node.id}_h${cIdx}`, slotId: sid, isHeader: true, hAlign: "center", vAlign: "middle" };
        }),
      };

      const dataRows = node.children.map((child, idx) => {
        const [cat, code, reqName, deliverable] = splitPipeCells(child.text, 4);
        const vals = [String(idx + 1), cat || "시스템", code || `REQ-0${idx + 1}`, reqName || child.text, deliverable || "-"];
        return {
          rowId: `rsm_${child.id}`,
          cells: vals.map((v, cIdx): TableCellSlotDef => {
            const sid = `pg_slot_${child.id}_sm${cIdx}`;
            registerSlot(
              child.id,
              sid,
              cols[cIdx],
              `<p>${escapeHtml(v)}</p>`,
              cIdx === 0
                ? { nodeId: child.id, field: "text" }
                : { nodeId: child.id, field: "cell", cellIndex: cIdx - 1 }
            );
            return {
              cellId: `csm_${child.id}_${cIdx}`,
              slotId: sid,
              hAlign: cIdx === 3 ? "left" : "center",
              vAlign: "middle",
              fontSize: "12px",
            };
          }),
        };
      });

      blocks.push({
        blockId: `pg_blk_${node.id}`,
        kind: "structured-table",
        title: node.text,
        columnWidths: ["8%", "16%", "15%", "39%", "22%"],
        borderRules: {
          outer: "1px solid #334155",
          headerTop: "2px solid #0f172a",
          headerBottom: "1px solid #334155",
          rowBottom: "1px solid #94a3b8",
          vertical: "1px solid #cbd5e1",
        },
        headerStyle: { bg: "#e2e8f0", fontWeight: "700", padding: "6px 8px", fontSize: "12px" },
        cellPadding: "6px 8px",
        rows: [headerRow, ...dataRows],
      });
      continue;
    }

    if (choice === "structured-table" && node.children.length > 0) {
      const headSlotId = `pg_slot_${node.id}_th`;
      registerSlot(node.id, headSlotId, "표 제목", `<h3>${escapeHtml(node.text)}</h3>`, {
        nodeId: node.id,
        field: "text",
      });
      blocks.push({
        blockId: `pg_blk_${node.id}_title`,
        kind: "heading",
        title: node.text,
        slotId: headSlotId,
        level: 3,
        decoration: "none",
      });

      const headerTitles = node.note
        ? splitPipeCells(node.note, Math.max(2, splitPipeCells(node.children[0].text, 2).length))
        : ["항목", "내용", "비고"].slice(
          0,
          Math.max(2, node.children[0].text.split("|").filter((s) => s.trim()).length)
        );
      const colCount = headerTitles.length;
      const columnWidths = headerTitles.map((_, i) =>
        i === 0 ? "26%" : `${Math.floor(74 / (colCount - 1))}%`
      );

      const headerRow = {
        rowId: `pg_row_${node.id}_hdr`,
        cells: headerTitles.map((hTitle, cIdx): TableCellSlotDef => {
          const sid = `pg_slot_${node.id}_hdr_${cIdx}`;
          registerSlot(node.id, sid, `표 헤더 ${cIdx + 1}`, `<p><strong>${escapeHtml(hTitle)}</strong></p>`, {
            nodeId: node.id,
            field: "note",
          });
          return {
            cellId: `pg_cell_${node.id}_hdr_${cIdx}`,
            slotId: sid,
            isHeader: true,
            vAlign: "middle",
          };
        }),
      };

      const dataRows = node.children.map((child, rIdx) => {
        const vals = splitPipeCells(child.text, colCount);
        return {
          rowId: `pg_row_${child.id}`,
          cells: vals.map((val, cIdx): TableCellSlotDef => {
            const sid = `pg_slot_${child.id}_c${cIdx}`;
            registerSlot(
              child.id,
              sid,
              `${rIdx + 1}행 ${cIdx + 1}열`,
              `<p>${escapeHtml(val || "-")}</p>`,
              { nodeId: child.id, field: "cell", cellIndex: cIdx }
            );
            return {
              cellId: `pg_cell_${child.id}_${cIdx}`,
              slotId: sid,
              vAlign: "middle",
            };
          }),
        };
      });

      blocks.push({
        blockId: `pg_blk_${node.id}`,
        kind: "structured-table",
        title: node.text,
        columnWidths,
        borderRules: {
          outer: "1px solid #cbd5e1",
          headerTop: "2px solid #334155",
          headerBottom: "1px solid #94a3b8",
          rowBottom: "1px solid #e2e8f0",
          vertical: "1px solid #e2e8f0",
        },
        headerStyle: {
          bg: "#f1f5f9",
          fontWeight: "600",
          padding: "8px 10px",
        },
        cellPadding: "8px 10px",
        rows: [headerRow, ...dataRows],
      });
      continue;
    }

    if (choice === "text") {
      const slotId = `pg_slot_${node.id}_txt`;
      const content =
        node.children.length > 0
          ? spec.theme === "official"
            ? `<p><strong>${escapeHtml(node.text)}</strong></p>${renderOfficialListHtml(node.children)}`
            : `<p><strong>${escapeHtml(node.text)}</strong></p><ul>${node.children
              .map((c) => `<li>${escapeHtml(c.text)}</li>`)
              .join("")}</ul>`
          : `<p>${escapeHtml(node.text)}</p>`;
      registerSlot(node.id, slotId, "본문", content, { nodeId: node.id, field: "text" });
      blocks.push({
        blockId: `pg_blk_${node.id}`,
        kind: "text",
        title: node.text,
        slotId,
      });
      continue;
    }

    // default: section-block
    const headingSlotId = `pg_slot_${node.id}_sh`;
    const bodySlotId = `pg_slot_${node.id}_sb`;
    const roman = spec.theme === "official" ? `${ROMAN_NUMS[officialChapterSeq++ % ROMAN_NUMS.length]}. ` : "";
    const subPrefix = spec.theme === "official" && node.note ? `<p><strong>가. ${escapeHtml(node.note)}</strong></p>` : "";
    registerSlot(node.id, headingSlotId, "섹션 제목", `<h2>${escapeHtml(`${roman}${node.text}`)}</h2>`, {
      nodeId: node.id,
      field: "text",
    });

    const bodyHtml =
      node.children.length > 0
        ? effectiveTheme === "official"
          ? `${subPrefix}${renderOfficialListHtml(node.children)}`
          : node.children.length > 1 || node.children[0].children.length > 0
            ? renderModernListHtml(node.children)
            : `<p>${escapeHtml(stripLinkTags(node.children[0].text))}</p>`
        : `<p>${escapeHtml(node.note || "")}</p>`;

    const bodyTargetNodeId =
      node.children.length === 1 && node.children[0].children.length === 0 && effectiveTheme !== "official"
        ? node.children[0].id
        : node.id;
    registerSlot(bodyTargetNodeId, bodySlotId, "섹션 본문", bodyHtml, {
      nodeId: bodyTargetNodeId,
      field: "text",
    });
    blocks.push({
      blockId: `pg_blk_${node.id}`,
      kind: "section-block",
      title: node.text,
      headingSlotId,
      bodySlotId,
    });
  }

  if (compiledPages.length === 0) {
    for (const blk of blocks) {
      const role = inferBlockRoleFromKind(blk);
      blockMetaMap[blk.blockId] = {
        blockId: blk.blockId,
        pageId: defaultPageId,
        role,
        label: blk.title || blk.kind,
        defaultVariant:
          role === "title"
            ? "title-underline"
            : role === "guide"
              ? "guide-inline"
              : role === "meta-table"
                ? "meta-2x4"
                : "main-grouped-grid",
      };
    }
    compiledPages.push({
      pageId: defaultPageId,
      pageNumber: 1,
      pageLabel:
        finalSurfaceKind === "paged"
          ? "1페이지 (A4 한글 서식)"
          : "블로그 본문",
      headerSlotId: headerId,
      footerSlotId: footerId,
      hideHeaderFooter: finalSurfaceKind === "scroll",
      layout: resolvePageLayout(
        finalSurfaceKind,
        spec.density,
        effectiveTheme
      ),
      blocks,
    });
  }

  const doc: VDocDocument = {
    version: "1.0.0",
    docId: `pg_doc_${spec.id}`,
    title: effectiveTitle,
    status: "Draft",
    updatedAt: new Date().toISOString(),
    variables: {},
    surface: {
      kind: finalSurfaceKind,
      width: finalSurfaceKind === "scroll" ? webSurfaceWidth : 794,
    },
    pages: compiledPages,
    slots,
    backdata: {},
  };

  return { doc, reverseMap, nodeSlotIds, customSlotOwnerMap, blockMetaMap };
}

export interface ApplyPlaygroundTableResult {
  spec: PlaygroundDocSpec;
  tableOverride?: { blockId: string; override: TableBlockOverride };
  nodesChanged: boolean;
}

const STRUCTURAL_TABLE_COMMANDS = new Set<TableCommand["type"]>([
  "addRowEnd",
  "addColumnEnd",
  "insertRow",
  "insertColumn",
  "deleteRow",
  "deleteColumn",
  "mergeCells",
]);

function slotContentToCellToken(slot: VDocSlot | undefined): string {
  const plain = htmlToPlainText(slot?.content ?? "").trim();
  return plain ? plain : "[-]";
}

function findPlaygroundNodeById(
  nodes: readonly PlaygroundNode[],
  nodeId: string
): PlaygroundNode | undefined {
  for (const n of nodes) {
    if (n.id === nodeId) return n;
    if (n.children.length > 0) {
      const hit = findPlaygroundNodeById(n.children, nodeId);
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * 컴파일된 `StructuredTableBlockDef`의 행·열·병합 구조를 3규칙 + 방향 병합 토큰(`[^]` 세로병합, `[<]` 가로병합)에 맞는
 * `<<view:table>>` 하위 `PlaygroundNode[]` 트리로 역변환한다.
 */
export function tableBlockToPlaygroundNodes(
  block: StructuredTableBlockDef,
  slots: Record<string, VDocSlot>,
  prevChildren: readonly PlaygroundNode[],
  idPrefix = `pg_tbl_row_${Date.now()}`
): PlaygroundNode[] {
  let seq = 0;
  const nextId = () => `${idPrefix}_${++seq}`;
  const prevLeaves: PlaygroundNode[] = [];
  for (const prev of prevChildren) {
    if (prev.children.length > 0) {
      prevLeaves.push(...prev.children);
    } else {
      prevLeaves.push(prev);
    }
  }

  interface GridSlotOcc {
    anchorRow: number;
    anchorCol: number;
    cell: TableCellSlotDef;
    colSpan: number;
    rowSpan: number;
  }

  const totalGridCols = Math.max(
    block.columnWidths.length,
    block.rows[0]?.cells.reduce((acc, c) => acc + (c.colSpan ?? 1), 0) ?? 1,
    1
  );
  const grid: Array<Array<GridSlotOcc | undefined>> = Array.from(
    { length: block.rows.length },
    () => Array(totalGridCols).fill(undefined)
  );

  for (let rIdx = 0; rIdx < block.rows.length; rIdx += 1) {
    let col = 0;
    for (const cell of block.rows[rIdx].cells) {
      while (col < totalGridCols && grid[rIdx][col]) {
        col += 1;
      }
      const rs = Math.max(1, cell.rowSpan ?? 1);
      const cs = Math.max(1, cell.colSpan ?? 1);
      const occ: GridSlotOcc = {
        anchorRow: rIdx,
        anchorCol: col,
        cell,
        colSpan: cs,
        rowSpan: rs,
      };
      for (let dr = 0; dr < rs; dr += 1) {
        if (rIdx + dr >= block.rows.length) break;
        for (let dc = 0; dc < cs; dc += 1) {
          if (col + dc < totalGridCols) {
            grid[rIdx + dr][col + dc] = occ;
          }
        }
      }
      col += cs;
    }
  }

  const serializeGridRow = (
    rowIdx: number,
    startCol: number,
    preserveInteriorRowSpan: boolean
  ): string => {
    const tokens: string[] = [];
    let c = startCol;
    let emittedLeftMergeInRow = false;

    while (c < totalGridCols) {
      const occ = grid[rowIdx]?.[c];
      if (!occ) {
        c += 1;
        continue;
      }
      if (occ.anchorRow < rowIdx) {
        tokens.push("[^]");
        if (occ.colSpan > 1) {
          for (let dc = 1; dc < occ.colSpan; dc += 1) {
            tokens.push("[<]");
          }
          emittedLeftMergeInRow = true;
        }
        c += occ.colSpan;
        continue;
      }

      tokens.push(slotContentToCellToken(slots[occ.cell.slotId]));
      const isTrailingCell = c + occ.colSpan >= totalGridCols;
      const shouldEmitHorizontalMerge =
        occ.colSpan > 1 &&
        (preserveInteriorRowSpan || !isTrailingCell || emittedLeftMergeInRow);
      if (shouldEmitHorizontalMerge) {
        for (let dc = 1; dc < occ.colSpan; dc += 1) {
          tokens.push("[<]");
        }
        emittedLeftMergeInRow = true;
      }
      c += occ.colSpan;
    }

    return tokens.join(" | ");
  };

  const sectionHasInteriorRowSpan = (rowStart: number, rowEnd: number, startCol: number): boolean => {
    for (let rIdx = rowStart; rIdx < rowEnd; rIdx += 1) {
      for (let c = startCol; c < totalGridCols; c += 1) {
        const occ = grid[rIdx]?.[c];
        if (occ && occ.anchorRow === rIdx && occ.rowSpan > 1) {
          return true;
        }
      }
    }
    return false;
  };

  const out: PlaygroundNode[] = [];
  let r = 0;
  let leafCursor = 0;

  while (r < block.rows.length) {
    const row = block.rows[r];
    const firstCell = row.cells[0];
    const rowSpan = firstCell ? Math.min(firstCell.rowSpan ?? 1, block.rows.length - r) : 1;
    const isLeftGroup =
      Boolean(firstCell) &&
      rowSpan > 1 &&
      (firstCell.colSpan ?? 1) === 1 &&
      row.cells.length >= 2;

    if (isLeftGroup && firstCell) {
      const groupLabel = slotContentToCellToken(slots[firstCell.slotId]);
      const matchingParent = prevChildren.find(
        (p) => p.children.length > 0 && stripLinkTags(p.text).replace(/\|\s*$/, "").trim() === groupLabel
      );
      const interiorMerge = sectionHasInteriorRowSpan(r, r + rowSpan, 1);
      const childNodes: PlaygroundNode[] = [];
      for (let k = 0; k < rowSpan; k += 1) {
        const text = serializeGridRow(r + k, 1, interiorMerge);
        const prevLeaf = matchingParent?.children[k] ?? prevLeaves[leafCursor];
        leafCursor += 1;
        childNodes.push({
          id: prevLeaf?.id ?? nextId(),
          role: "body",
          layoutChoice: "text",
          text,
          note: prevLeaf?.note ?? "",
          children: [],
        });
      }
      out.push({
        id: matchingParent?.id ?? nextId(),
        role: "body",
        layoutChoice: "text",
        text: groupLabel,
        note: matchingParent?.note ?? "",
        children: childNodes,
      });
      r += rowSpan;
      continue;
    }

    const rowHasInteriorMerge = sectionHasInteriorRowSpan(r, Math.min(block.rows.length, r + 1), 0) ||
      (() => {
        for (let c = 0; c < totalGridCols; c += 1) {
          const occ = grid[r]?.[c];
          if (occ && occ.anchorRow < r) return true;
        }
        return false;
      })();
    const text = serializeGridRow(r, 0, rowHasInteriorMerge);
    const prevFlat = prevLeaves[leafCursor];
    leafCursor += 1;
    out.push({
      id: prevFlat?.id ?? nextId(),
      role: "body",
      layoutChoice: "text",
      text,
      note: prevFlat?.note ?? "",
      children: [],
    });
    r += 1;
  }

  return out;
}

/**
 * WYSIWYG 모드에서 복합 양식(`customForms`) 또는 동적 `<<table>>` 블록에 가한 표 명령(행/열 추가, 셀 병합 등)을
 * 영속 반영한다.
 */
export function applyPlaygroundTableCommand(
  spec: PlaygroundDocSpec,
  compiledDoc: VDocDocument,
  pageId: string,
  blockId: string,
  sectionId: string | null,
  cmd: TableCommand,
  activeVariant?: BlockVariantId
): ApplyPlaygroundTableResult | null {
  let ownerKey: string | null = null;
  for (const [key, form] of Object.entries(spec.customForms)) {
    if (form.blocks.some((b) => b.blockId === blockId)) {
      ownerKey = key;
      break;
    }
  }

  let seq = 0;
  const nextDoc = applyTableCommandToDocument(
    compiledDoc,
    pageId,
    blockId,
    sectionId,
    cmd,
    () => `pg_tbl_${Date.now()}_${++seq}`
  );
  if (nextDoc === compiledDoc) return null;

  if (ownerKey) {
    const currentForm = spec.customForms[ownerKey];
    const blockIds = new Set(currentForm.blocks.map((b) => b.blockId));
    const nextPage = nextDoc.pages.find((p) => p.pageId === pageId) ?? nextDoc.pages[0];
    if (!nextPage) return null;

    const updatedBlocks = nextPage.blocks.filter((b) => blockIds.has(b.blockId));
    const updatedSlots: Record<string, VDocSlot> = { ...currentForm.slots };
    for (const [sid, s] of Object.entries(nextDoc.slots)) {
      if (sid in updatedSlots || sid.includes("pg_tbl_")) {
        updatedSlots[sid] = s;
      }
    }

    return {
      spec: {
        ...spec,
        customForms: {
          ...spec.customForms,
          [ownerKey]: {
            blocks: updatedBlocks,
            slots: updatedSlots,
          },
        },
      },
      nodesChanged: false,
    };
  }

  const nextPage = nextDoc.pages.find((p) => p.pageId === pageId) ?? nextDoc.pages[0];
  const nextBlock = nextPage?.blocks.find(
    (b): b is StructuredTableBlockDef =>
      b.blockId === blockId && (b.kind === "structured-table" || b.kind === "table")
  );
  if (!nextBlock) return null;

  const nextBlockSlots: Record<string, VDocSlot> = {};
  for (const sid of getBlockSlotIds(nextBlock)) {
    const slot = nextDoc.slots[sid];
    if (slot) nextBlockSlots[sid] = slot;
  }

  let nextSpec = spec;
  let nodesChanged = false;

  const rawMatch = /^pg_blk_(.+)_raw$/.exec(blockId);
  const canSyncBackToOutline =
    Boolean(rawMatch) &&
    STRUCTURAL_TABLE_COMMANDS.has(cmd.type) &&
    activeVariant !== "table-roster-pivot" &&
    activeVariant !== "table-stacked-box" &&
    activeVariant !== "table-grid-4col" &&
    activeVariant !== "table-3col-notes";

  if (canSyncBackToOutline && rawMatch) {
    const tableNodeId = rawMatch[1];
    const tableNode = findPlaygroundNodeById(spec.nodes, tableNodeId);
    if (tableNode && !stripLinkTags(tableNode.text)) {
      const existingViewNode = tableNode.children.find(
        (c) => parseContainerDirective(c.text).kind === "view"
      );
      const prevViewRows = existingViewNode ? existingViewNode.children : [];
      const nextViewRows = tableBlockToPlaygroundNodes(
        nextBlock,
        nextDoc.slots,
        prevViewRows
      );
      nextSpec = {
        ...spec,
        nodes: updatePlaygroundNode(spec.nodes, tableNodeId, (n) => {
          const sourceChildren = n.children.filter(
            (c) => parseContainerDirective(c.text).kind !== "view"
          );
          const viewIdx = n.children.findIndex(
            (c) => parseContainerDirective(c.text).kind === "view"
          );
          if (viewIdx >= 0) {
            const nextAll = [...n.children];
            nextAll[viewIdx] = {
              ...n.children[viewIdx],
              children: nextViewRows,
            };
            return { ...n, children: nextAll };
          }
          const createdView: PlaygroundNode = {
            id: `${tableNodeId}-view`,
            role: "body",
            layoutChoice: "text",
            text: "<<view:table>>",
            note: "",
            children: nextViewRows,
          };
          return { ...n, children: [...sourceChildren, createdView] };
        }),
      };
      nodesChanged = true;
    }
  }

  return {
    spec: nextSpec,
    tableOverride: {
      blockId,
      override: {
        block: nextBlock,
        slots: nextBlockSlots,
      },
    },
    nodesChanged,
  };
}

/**
 * Phase 3 에서 슬롯 본문을 수정했을 때, Phase 1 의미 노드 텍스트에도 동기화해 Round-trip 을 완성한다.
 */
export function applySlotEditToNodes(
  nodes: readonly PlaygroundNode[],
  target: SlotReverseTarget | undefined,
  html: string
): PlaygroundNode[] {
  if (!target) return [...nodes];
  const plain = htmlToPlainText(html).trim();

  return updatePlaygroundNode(nodes, target.nodeId, (node) => {
    if (target.field === "note") {
      return { ...node, note: plain };
    }
    const existingTags = node.text.match(
      /<<\s*(?:document|page|section|title|list|table|view|callout|quote|block)(?:\s*:\s*[^>\n]+?)?\s*>>/gi
    );
    const tagSuffix = existingTags && existingTags.length > 0 ? ` ${existingTags.join(" ")}` : "";

    if (target.field === "kv-key" || target.field === "kv-value") {
      if (!plain) return node;
      const cleanOrig = stripLinkTags(node.text);
      const colonIdx = cleanOrig.indexOf(":");
      if (colonIdx > 0) {
        const origKey = cleanOrig.slice(0, colonIdx).trim();
        const origVal = cleanOrig.slice(colonIdx + 1).trim();
        const cleanVal = stripLinkTags(plain).replace(/^□\s*/, "").trim();
        const updatedBody =
          target.field === "kv-key"
            ? `${cleanVal}: ${origVal}`
            : `${origKey}: ${cleanVal}`;
        return { ...node, text: `${updatedBody}${tagSuffix}`.trim() };
      }
    }

    if (target.field === "cell" && typeof target.cellIndex === "number") {
      const parts = parseExplicitPipeCells(node.text);
      while (parts.length <= target.cellIndex) parts.push("[-]");
      parts[target.cellIndex] = plain ? stripLinkTags(plain) : "[-]";
      return { ...node, text: `${parts.join(" | ")}${tagSuffix}`.trim() };
    }

    if (!plain) {
      return { ...node, text: `[-]${tagSuffix}`.trim() };
    }

    let cleanNext = stripLinkTags(plain);
    if (!/^[□❏▪■◦]/.test(stripLinkTags(node.text))) {
      cleanNext = cleanNext.replace(/^[□❏▪■◦]\s*/, "");
    }
    const nextText = `${cleanNext}${tagSuffix}`.trim();
    return { ...node, text: nextText };
  });
}

export function plainHtmlPreviewText(text: string): string {
  return plainTextToHtml(text);
}

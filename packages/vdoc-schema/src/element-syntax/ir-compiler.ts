/**
 * @vibe/vdoc-schema — Outline DSL <-> 불변 IR <-> VDocDocument 양방향 컴파일러.
 *
 * `ElementSyntaxRegistry` 의 현재 CRUD 규칙을 런타임에 참조하여
 * `<<doc:...>>`, `<<view:section>>`, `<<view:table>>`, `<<view:list>>`, `<<asset:...>>`
 * 아웃라인 트리를 `.vdoc` 으로 비파괴 증분 컴파일(baseDoc Overlay + `sourceNodeId` 보존)하고,
 * 반대로 `.vdoc` 에서 바인딩된 아웃라인 트리를 무손실 역추출한다.
 */
import type { VDocStyleRef } from "@vibe/style-core";
import type { CalloutAccentColor, CalloutBoxBlockDef, CalloutKvItem } from "../blocks/callout-block";
import type { DividerBlockDef } from "../blocks/divider-block";
import type { ColumnsGridBlockDef } from "../blocks/grid-block";
import type { FormTitleBlockDef, HeadingBlockDef } from "../blocks/heading-block";
import type { HeroBlockDef } from "../blocks/hero-block";
import type { ImageBlockDef } from "../blocks/image-block";
import type { LinkCardBlockDef } from "../blocks/link-card-block";
import type { StructuredTableBlockDef } from "../blocks/table-block";
import type { TextBlockDef } from "../blocks/text-block";
import type { LayoutBlock } from "../blocks";
import { getBlockSlotIds } from "../block-ops";
import { evidenceKey, type EvidenceLink, type EvidenceLocator } from "../evidence";
import { htmlToPlainText } from "../html-text";
import type {
  GridColumnDef,
  TableCellSlotDef,
  VDocDocument,
  VDocOutlineRef,
  VDocPage,
  VDocSchemaRef,
  VDocSlot,
} from "../types";
import { BLOG_DOCUMENT_VIEW, getDocumentView, resolveDocumentView } from "../view-registry";
import type { OutlineSyntaxDocument, OutlineSyntaxNode } from "./contract";
import {
  extractOutlineAssets,
  findOutlineNodeChain,
  parseOutlineDirective,
  parseTableAssetVisualPreset,
  type ParsedOutlineAsset,
  type TableAssetVisualPreset,
} from "./directive-scanner";
import { ElementSyntaxRegistry, createElementSyntaxRegistry } from "./registry";

export interface OutlineAssetResolveRequest {
  readonly label: string;
  readonly rawSrc?: string;
  readonly nodeId?: string;
  readonly fileTarget?: string;
}

export type OutlineAssetResolver = (req: OutlineAssetResolveRequest) => string | undefined;

export interface CompileOutlineToVDocOptions {
  /** 사용할 CRUD 레지스트리 (미지정 시 기본 시드 레지스트리 사용). */
  registry?: ElementSyntaxRegistry;
  /** 문서 프로파일 ID (기본 `"blog"`). */
  profileId?: string;
  /** 문서 ID (미지정 시 결정적/고유 ID 생성). */
  docId?: string;
  /** 볼트 내 레지스트리 파일 포인터 (`schemaRef.registryPath`). */
  registryPath?: string;
  /** 분리된 스타일 엔진(`.vstyle.json`) 포인터 참조 (`styleRef`). 지정 시 본문 HTML 에 정렬·스타일을 하드코딩하지 않고 스타일 엔진에 위임한다. */
  styleRef?: VDocStyleRef;
  /** 원천 `.ref` 파일 포인터 (`sourceRef`). */
  sourceRef?: string;
  /** 양방향 동기화 원천 `.outline` 포인터 (`outlineRef`). */
  outlineRef?: VDocOutlineRef;
  /** 비파괴 증분 컴파일용 기존 `.vdoc` 문서. 일치하는 `sourceNodeId` 블록의 디자인 속성(styleRef·accentColor·widths·src·frame 등)을 보존한다. */
  baseDoc?: VDocDocument;
  /** `[img:라벨]` 에서 라벨 -> 실제 이미지 URL/경로로 해석할 선택적 미디어 맵. */
  mediaMap?: Record<string, string>;
  /** Vault 파일·첨부·위키링크 등을 URL 로 해석하는 확장 리졸버. */
  assetResolver?: OutlineAssetResolver;
  /** 마스터 아웃라인에서 미리 추출한 `<<asset:...>>` 맵. */
  outlineAssets?: Record<string, ParsedOutlineAsset>;
  /** 표 등에 강제로 적용할 에셋 ID (예: UI 드롭다운 선택). */
  assetHint?: string;
  /** `.outline` 사이드카 근거(`nodeId -> EvidenceLocator[]`) — 컴파일된 블록 슬롯의 `evidenceLinks` 로 자동 승계한다. */
  nodeEvidence?: Record<string, EvidenceLocator[]>;
  /** 고정 타임스탬프 (테스트/결정적 빌드용). */
  now?: string;
}

export interface CompileTableOptions {
  readonly assetPreset?: TableAssetVisualPreset | null;
  readonly sourceNodeId?: string;
  /** `"form"` = 한국형 폼 표(1열·`[-]` 앞 셀 헤더), `"top-row"` = 상단 1행 헤더 표(`<<view:table:header>>`). */
  readonly headerMode?: "form" | "top-row";
  /** `<<cell>>` 컨테이너 내부의 하위 트리를 재귀 컴파일하는 콜백. */
  readonly compileNestedChildren?: (nodes: readonly OutlineSyntaxNode[]) => LayoutBlock[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderInlineMarkup(text: string, highlightSymbol: string): string {
  const escaped = escapeHtml(text);
  if (!highlightSymbol) return escaped;
  const sym = escapeRegExp(escapeHtml(highlightSymbol));
  const re = new RegExp(`${sym}(.+?)${sym}`, "g");
  return escaped.replace(
    re,
    '<mark data-color="#fef08a" style="background-color: #fef08a">$1</mark>'
  );
}

function makeParagraphHtml(
  text: string,
  highlightSymbol: string,
  align: "left" | "center" | "right" = "center"
): string {
  const inner = renderInlineMarkup(text, highlightSymbol);
  const style = align === "left" ? "" : ` style="text-align: ${align}"`;
  return `<p${style}>${inner}</p>`;
}

/** `[...]` 괄호 밖에서만 구분자(`|`)로 분할한다 (내부 `[embed:a | b]` 보호). */
function splitOutsideBrackets(text: string, delimiter: string): string[] {
  if (!delimiter) return [text];
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "[") depth += 1;
    else if (ch === "]" && depth > 0) depth -= 1;

    if (depth === 0 && text.startsWith(delimiter, i)) {
      parts.push(buf.trim());
      buf = "";
      i += delimiter.length - 1;
      continue;
    }
    buf += ch;
  }
  parts.push(buf.trim());
  return parts;
}

interface ParsedImageToken {
  label: string;
  src: string;
  weight?: number;
  hasExplicitWeight: boolean;
}

function resolveMediaUrl(
  label: string,
  rawSrc: string | undefined,
  nodeId: string | undefined,
  fileTarget: string | undefined,
  mediaMap?: Record<string, string>,
  assetResolver?: OutlineAssetResolver
): string {
  if (rawSrc && rawSrc.trim()) {
    const resolved = assetResolver?.({ label, rawSrc: rawSrc.trim(), nodeId, fileTarget });
    return resolved || rawSrc.trim();
  }
  if (fileTarget) {
    const resolved = assetResolver?.({ label, fileTarget, nodeId });
    if (resolved) return resolved;
    if (/^https?:\/\//i.test(fileTarget)) return fileTarget;
  }
  if (mediaMap?.[label]) return mediaMap[label];
  const resolved = assetResolver?.({ label, nodeId, fileTarget });
  return resolved ?? "";
}

function parseImageBracket(
  token: string,
  imgPrefix: string,
  mediaMap?: Record<string, string>,
  assetResolver?: OutlineAssetResolver,
  nodeId?: string
): ParsedImageToken | null {
  const trimmed = token.trim();
  // Standard Markdown image syntax: `![라벨](url)`
  const mdImgMatch = /^!\[([^\]\n]*)\]\(([^)\s]+)\)$/.exec(trimmed);
  if (mdImgMatch) {
    const label = mdImgMatch[1].trim() || "이미지";
    const explicitUrl = mdImgMatch[2].trim();
    return {
      label,
      src: resolveMediaUrl(label, explicitUrl, nodeId, undefined, mediaMap, assetResolver),
      hasExplicitWeight: false,
    };
  }
  const baseTag = imgPrefix.replace(/^\[|\]$/g, "");
  if (!trimmed.startsWith(`[${baseTag}`) || !trimmed.endsWith("]")) return null;
  const inner = trimmed.slice(1 + baseTag.length, -1).trim();
  if (!inner) {
    return {
      label: "이미지",
      src: resolveMediaUrl("이미지", undefined, nodeId, undefined, mediaMap, assetResolver),
      hasExplicitWeight: false,
    };
  }
  const body = inner.startsWith(":") ? inner.slice(1).trim() : inner;
  let weight: number | undefined;
  let hasExplicitWeight = false;
  let rest = body;
  const weightMatch = /^(\d+):(.*)$/.exec(body);
  if (weightMatch) {
    weight = Number(weightMatch[1]);
    hasExplicitWeight = true;
    rest = weightMatch[2].trim();
  }
  const arrowIdx = rest.indexOf("->");
  if (arrowIdx >= 0) {
    const label = rest.slice(0, arrowIdx).trim() || "이미지";
    const explicitUrl = rest.slice(arrowIdx + 2).trim();
    return {
      label,
      src: resolveMediaUrl(label, explicitUrl, nodeId, undefined, mediaMap, assetResolver),
      weight,
      hasExplicitWeight,
    };
  }
  const label = rest || "이미지";
  return {
    label,
    src: resolveMediaUrl(label, undefined, nodeId, undefined, mediaMap, assetResolver),
    weight,
    hasExplicitWeight,
  };
}

interface ParsedCtaToken {
  label: string;
  url: string;
}

function parseCtaBracket(token: string, ctaPrefix: string): ParsedCtaToken | null {
  const trimmed = token.trim();
  // Standard Markdown link syntax: `[라벨](url)`
  const mdLinkMatch = /^\[([^\]\n]+)\]\(([^)\s]+)\)$/.exec(trimmed);
  if (mdLinkMatch) {
    return {
      label: mdLinkMatch[1].trim(),
      url: mdLinkMatch[2].trim(),
    };
  }
  const baseTag = ctaPrefix.replace(/^\[|\]$/g, "");
  if (!trimmed.startsWith(`[${baseTag}:`) || !trimmed.endsWith("]")) return null;
  const body = trimmed.slice(2 + baseTag.length, -1).trim();
  const arrowIdx = body.indexOf("->");
  if (arrowIdx >= 0) {
    return {
      label: body.slice(0, arrowIdx).trim(),
      url: body.slice(arrowIdx + 2).trim(),
    };
  }
  return { label: body, url: "" };
}

interface ParsedEmbedToken {
  embedKind: string;
  content: string;
}

function parseEmbedBracket(token: string, embedPrefix: string): ParsedEmbedToken | null {
  const trimmed = token.trim();
  const baseTag = embedPrefix.replace(/^\[|\]$/g, "");
  if (!trimmed.startsWith(`[${baseTag}:`) || !trimmed.endsWith("]")) return null;
  const body = trimmed.slice(2 + baseTag.length, -1).trim();
  const pipeIdx = body.indexOf("|");
  if (pipeIdx >= 0) {
    return {
      embedKind: body.slice(0, pipeIdx).trim().toLowerCase(),
      content: body.slice(pipeIdx + 1).trim(),
    };
  }
  return { embedKind: "embed", content: body };
}

function isImageFileTarget(target: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif)(?:[?#].*)?$/i.test(target);
}

function matchesContainerSymbol(token: string, configuredSym: string): boolean {
  const normToken = token.trim().replace(/\s+/g, "").toLowerCase();
  const normSym = configuredSym.trim().replace(/\s+/g, "").toLowerCase();
  return Boolean(normSym) && normToken === normSym;
}

function parseColContainerLine(
  text: string,
  configuredSym: string
): { matched: true; title: string } | { matched: false } {
  const trimmed = text.trim();
  const sym = configuredSym.trim();
  if (!sym) return { matched: false };
  if (trimmed.toLowerCase() === sym.toLowerCase()) {
    return { matched: true, title: "" };
  }
  if (
    trimmed.toLowerCase().startsWith(sym.toLowerCase()) &&
    /\s/.test(trimmed.slice(sym.length, sym.length + 1))
  ) {
    return { matched: true, title: trimmed.slice(sym.length).trim() };
  }
  return { matched: false };
}

/**
 * `<<view:table>>` 노드를 한국형 복합 표(`StructuredTableBlockDef`)로 컴파일한다.
 * - 트리 들여쓰기 -> 자동 `rowspan` 헤더 셀
 * - `|` -> 열 구분 (짧은 셀 단축 문법)
 * - `<<cell>>` (레지스트리 `cell-container`) 또는 자식이 달린 `[-]` -> 하위 트리 전체를 재귀 컴파일한 `cell.blocks` 컨테이너 셀
 * - `<<row>>` (레지스트리 `row-container`) -> 하위의 각 `<<cell>>` 불릿을 1개 컨테이너 셀로 묶는 다중 리치 셀 행
 * - `<<view:table:header>>` -> 1행 전체를 의미 헤더(`<th>`)로 지정 (시각 테두리·비율·음영은 `.vstyle` 및 인스펙터에서 관리)
 * - `[<]` -> 왼쪽 셀과 `colSpan` 병합 / `[^]` -> 위쪽 셀과 `rowSpan` 병합
 */
export function compileTableOutlineNode(
  tableNode: OutlineSyntaxNode,
  slots: Record<string, VDocSlot>,
  registry: ElementSyntaxRegistry,
  idPrefix: string,
  options: CompileTableOptions = {}
): StructuredTableBlockDef {
  const colSplit = registry.resolveSymbol("table", "col-split", "|");
  const emptySym = registry.resolveSymbol("table", "empty-slot", "[-]");
  const mergeLeftSym = registry.resolveSymbol("table", "merge-left", "[<]");
  const mergeUpSym = registry.resolveSymbol("table", "merge-up", "[^]");
  const cellContainerSym = registry.resolveSymbol("table", "cell-container", "<<cell>>");
  const rowContainerSym = registry.resolveSymbol("table", "row-container", "<<row>>");

  const parsedDir = parseOutlineDirective(tableNode.text.trim());
  const role = parsedDir?.role?.toLowerCase();
  const effectiveHeaderMode: "form" | "top-row" =
    options.headerMode ?? (role === "header" || role === "top-row" ? "top-row" : "form");

  interface RawGridRow {
    prefixes: Array<{ text: string; rowSpan: number; isFirstRow: boolean }>;
    leafTokens: string[];
    /** Per-token child nodes when a leaf token is `<<cell>>` or `[-]` with nested container children. */
    cellChildrenByTokenIdx?: Record<number, readonly OutlineSyntaxNode[]>;
  }

  const rawRows: RawGridRow[] = [];

  const isContainerLeafRow = (node: OutlineSyntaxNode, kids: OutlineSyntaxNode[]): boolean => {
    if (kids.length === 0) return true;
    const trimmed = node.text.trim();
    if (matchesContainerSymbol(trimmed, rowContainerSym)) return true;
    const tokens = splitOutsideBrackets(trimmed, colSplit);
    return tokens.some(
      (t) => matchesContainerSymbol(t, cellContainerSym) || t.trim() === emptySym
    );
  };

  const countLeaves = (n: OutlineSyntaxNode): number => {
    const ch = (n.children ?? []).filter(
      (c) => c.text.trim().length > 0 || (c.children?.length ?? 0) > 0
    );
    if (isContainerLeafRow(n, ch)) return 1;
    return ch.reduce((acc, c) => acc + countLeaves(c), 0);
  };

  const unfold = (
    node: OutlineSyntaxNode,
    ancestors: Array<{ text: string; totalLeaves: number; consumed: number }>
  ) => {
    const kids = (node.children ?? []).filter(
      (c) => c.text.trim().length > 0 || (c.children?.length ?? 0) > 0
    );
    const trimmed = node.text.trim();

    // Explicit `<<row>>` container with child `<<cell>>` nodes (zero `|` needed for multi-column rich cells!)
    if (matchesContainerSymbol(trimmed, rowContainerSym) && kids.length > 0) {
      const prefixes = ancestors.map((anc) => {
        const isFirst = anc.consumed === 0;
        anc.consumed += 1;
        return { text: anc.text, rowSpan: anc.totalLeaves, isFirstRow: isFirst };
      });
      const leafTokens: string[] = [];
      const cellChildrenByTokenIdx: Record<number, readonly OutlineSyntaxNode[]> = {};
      kids.forEach((cellNode, idx) => {
        const cText = cellNode.text.trim();
        if (matchesContainerSymbol(cText, cellContainerSym)) {
          leafTokens.push(cText);
          cellChildrenByTokenIdx[idx] = cellNode.children ?? [];
        } else if ((cellNode.children?.length ?? 0) > 0) {
          leafTokens.push(cellContainerSym);
          cellChildrenByTokenIdx[idx] = [
            { ...cellNode, children: [] },
            ...(cellNode.children ?? []),
          ];
        } else {
          leafTokens.push(cText);
        }
      });
      rawRows.push({ prefixes, leafTokens, cellChildrenByTokenIdx });
      return;
    }

    if (isContainerLeafRow(node, kids)) {
      const tokens = splitOutsideBrackets(trimmed, colSplit);
      const prefixes = ancestors.map((anc) => {
        const isFirst = anc.consumed === 0;
        anc.consumed += 1;
        return { text: anc.text, rowSpan: anc.totalLeaves, isFirstRow: isFirst };
      });
      let cellChildrenByTokenIdx: Record<number, readonly OutlineSyntaxNode[]> | undefined;
      if (kids.length > 0) {
        // Attach children to the `<<cell>>` (or `[-]`) slot token in this row
        const containerIdx = tokens.findIndex(
          (t) => matchesContainerSymbol(t, cellContainerSym) || t.trim() === emptySym
        );
        if (containerIdx >= 0) {
          cellChildrenByTokenIdx = { [containerIdx]: kids };
        }
      }
      rawRows.push({ prefixes, leafTokens: tokens, cellChildrenByTokenIdx });
      return;
    }

    const ancEntry = { text: trimmed, totalLeaves: countLeaves(node), consumed: 0 };
    for (const child of kids) {
      unfold(child, [...ancestors, ancEntry]);
    }
  };

  for (const child of tableNode.children ?? []) {
    if (!child.text.trim() && !(child.children?.length)) continue;
    unfold(child, []);
  }

  const maxCols = rawRows.reduce(
    (max, r) => Math.max(max, r.prefixes.length + r.leafTokens.length),
    1
  );

  const preset = options.assetPreset ?? null;
  const headerBg = preset?.headerStyle?.bg ?? "#e6ecf5";
  const headerTextColor = preset?.headerStyle?.textColor ?? "#0f172a";

  const compiledRows: StructuredTableBlockDef["rows"] = [];
  const cellGrid: Array<Array<TableCellSlotDef | null>> = [];

  rawRows.forEach((raw, rIdx) => {
    const rowId = `${idPrefix}_r${rIdx + 1}`;
    const cells: TableCellSlotDef[] = [];
    const gridRow: Array<TableCellSlotDef | null> = Array(maxCols).fill(null);
    let colCursor = 0;

    // 1. Tree-derived rowspan header cells
    raw.prefixes.forEach((pref) => {
      if (pref.isFirstRow) {
        const cellId = `${rowId}_c${colCursor + 1}`;
        const slotId = `slot_${cellId}`;
        slots[slotId] = {
          slotId,
          label: pref.text || `헤더 ${rIdx + 1}`,
          role: "editable-slot",
          content: `<p style="text-align: center"><strong>${escapeHtml(pref.text)}</strong></p>`,
          backDataRefs: [],
        };
        const cell: TableCellSlotDef = {
          cellId,
          slotId,
          isHeader: true,
          rowSpan: pref.rowSpan > 1 ? pref.rowSpan : undefined,
          hAlign: "center",
          vAlign: "middle",
          backgroundColor: headerBg,
          ...(headerTextColor ? { color: headerTextColor } : {}),
        };
        cells.push(cell);
        gridRow[colCursor] = cell;
      } else {
        gridRow[colCursor] = cellGrid[rIdx - 1]?.[colCursor] ?? null;
      }
      colCursor += 1;
    });

    // 2. Leaf cells separated by `|` (or explicit `<<row>>` children)
    raw.leafTokens.forEach((tok, tIdx) => {
      const trimmed = tok.trim();
      if (trimmed === mergeLeftSym) {
        const prev = cells[cells.length - 1];
        if (prev) {
          prev.colSpan = (prev.colSpan ?? 1) + 1;
          gridRow[colCursor] = prev;
        }
        colCursor += 1;
        return;
      }
      if (trimmed === mergeUpSym) {
        const above = cellGrid[rIdx - 1]?.[colCursor];
        if (above) {
          above.rowSpan = (above.rowSpan ?? 1) + 1;
          gridRow[colCursor] = above;
        }
        colCursor += 1;
        return;
      }

      const cellId = `${rowId}_c${colCursor + 1}`;
      const slotId = `slot_${cellId}`;
      const nestedNodes = raw.cellChildrenByTokenIdx?.[tIdx];
      const isRichContainer = Boolean(nestedNodes && nestedNodes.length > 0);

      if (isRichContainer && nestedNodes && options.compileNestedChildren) {
        const nestedBlocks = options.compileNestedChildren(nestedNodes);
        slots[slotId] = {
          slotId,
          label: `컨테이너 셀 (${rIdx + 1},${colCursor + 1})`,
          role: "editable-slot",
          content: "<p></p>",
          backDataRefs: [],
        };
        const cell: TableCellSlotDef = {
          cellId,
          slotId,
          isHeader: false,
          hAlign: "left",
          vAlign: "top",
          padding: "8px 12px",
          blocks: nestedBlocks,
        };
        cells.push(cell);
        gridRow[colCursor] = cell;
        colCursor += 1;
        return;
      }

      const isEmpty = trimmed === emptySym || matchesContainerSymbol(trimmed, cellContainerSym);
      const nextTok = raw.leafTokens[tIdx + 1]?.trim();
      const isFormHeader =
        effectiveHeaderMode === "top-row"
          ? rIdx === 0 && !isEmpty
          : !isEmpty && (tIdx === 0 || nextTok === emptySym);

      slots[slotId] = {
        slotId,
        label: isEmpty ? "입력 칸" : trimmed,
        role: isEmpty ? "fillable-field" : "editable-slot",
        content: isEmpty
          ? "<p></p>"
          : isFormHeader
            ? `<p style="text-align: center"><strong>${escapeHtml(trimmed)}</strong></p>`
            : `<p>${escapeHtml(trimmed)}</p>`,
        backDataRefs: [],
      };
      const cell: TableCellSlotDef = {
        cellId,
        slotId,
        isHeader: isFormHeader,
        hAlign: isFormHeader ? "center" : "left",
        vAlign: "middle",
        backgroundColor: isFormHeader ? headerBg : undefined,
        ...(isFormHeader && headerTextColor ? { color: headerTextColor } : {}),
      };
      cells.push(cell);
      gridRow[colCursor] = cell;
      colCursor += 1;
    });

    // 3. Auto-stretch last cell to maxCols when row has fewer columns
    if (colCursor < maxCols && cells.length > 0) {
      const last = cells[cells.length - 1];
      const extra = maxCols - colCursor;
      last.colSpan = (last.colSpan ?? 1) + extra;
      for (let k = colCursor; k < maxCols; k++) {
        gridRow[k] = last;
      }
    }

    cellGrid.push(gridRow);
    compiledRows.push({ rowId, cells });
  });

  // Equal initial column widths (visual ratio overrides live in .vdoc / Inspector and survive recompile)
  const colWidthPct = `${Math.floor((100 / Math.max(1, maxCols)) * 10) / 10}%`;
  const columnWidths = Array.from({ length: maxCols }, () => colWidthPct);

  const tableTitle = parsedDir?.label || "표";

  return {
    blockId: `${idPrefix}_table`,
    kind: "structured-table",
    title: tableTitle,
    ...(options.sourceNodeId ? { sourceNodeId: options.sourceNodeId } : { sourceNodeId: tableNode.id }),
    columnWidths,
    borderRules: {
      outer: preset?.borderRules?.outer ?? "1px solid #94a3b8",
      ...(preset?.borderRules?.headerTop ? { headerTop: preset.borderRules.headerTop } : {}),
      headerBottom: preset?.borderRules?.headerBottom ?? "1px solid #94a3b8",
      rowBottom: preset?.borderRules?.rowBottom ?? "1px solid #cbd5e1",
      vertical: preset?.borderRules?.vertical ?? "1px solid #cbd5e1",
      radius: preset?.borderRules?.radius ?? "0px",
    },
    headerStyle: {
      bg: headerBg,
      textColor: headerTextColor,
      fontWeight: preset?.headerStyle?.fontWeight ?? "600",
      padding: preset?.headerStyle?.padding ?? "8px 10px",
    },
    cellPadding: preset?.cellPadding ?? "8px 10px",
    rows: compiledRows,
  };
}

function renderListChildrenHtml(
  nodes: readonly OutlineSyntaxNode[],
  highlightSymbol: string
): string {
  const valid = nodes.filter((n) => n.text.trim().length > 0 || (n.children?.length ?? 0) > 0);
  if (valid.length === 0) return "";

  const items = valid.map((n) => {
    const textHtml = renderInlineMarkup(n.text.trim(), highlightSymbol);
    const nestedHtml =
      n.children && n.children.length > 0
        ? renderListChildrenHtml(n.children, highlightSymbol)
        : "";
    return `<li><p>${textHtml}</p>${nestedHtml}</li>`;
  });
  return `<ul>${items.join("")}</ul>`;
}

export function compileListOutlineNode(
  listNode: OutlineSyntaxNode,
  slots: Record<string, VDocSlot>,
  idPrefix: string,
  highlightSymbol = "=="
): TextBlockDef {
  const parsedDir = parseOutlineDirective(listNode.text.trim());
  const title = parsedDir?.label || "목록";
  const blockId = `${idPrefix}_list`;
  const slotId = `slot_${blockId}`;
  const headingHtml = parsedDir?.label ? `<p><strong>${escapeHtml(parsedDir.label)}</strong></p>` : "";
  const listHtml = renderListChildrenHtml(listNode.children ?? [], highlightSymbol);

  slots[slotId] = {
    slotId,
    label: title,
    role: "editable-slot",
    content: `${headingHtml}${listHtml || "<p></p>"}`,
    backDataRefs: [],
  };

  return {
    blockId,
    kind: "text",
    title,
    slotId,
    sourceNodeId: listNode.id,
  };
}

function pickAccentColor(text: string): CalloutAccentColor {
  if (/👍|팁|TIP|알아둘/i.test(text)) return "emerald";
  if (/✔|포토|포인트|주의|꿀팁/i.test(text)) return "pink";
  return "yellow";
}

function flattenNodeTextLines(node: OutlineSyntaxNode, depth = 0): string[] {
  const indent = "  ".repeat(depth);
  const lines = node.text.trim() ? [`${indent}${node.text.trim()}`] : [];
  for (const child of node.children ?? []) {
    lines.push(...flattenNodeTextLines(child, depth + 1));
  }
  return lines;
}

interface BaseDocOverlayIndex {
  readonly pagesBySourceNodeId: Map<string, VDocPage>;
  readonly pagesById: Map<string, VDocPage>;
  readonly blocksBySourceNodeId: Map<string, LayoutBlock>;
  readonly blocksById: Map<string, LayoutBlock>;
  readonly slots: Record<string, VDocSlot>;
}

function indexBlocksRecursively(
  blocks: readonly LayoutBlock[],
  blocksBySourceNodeId: Map<string, LayoutBlock>,
  blocksById: Map<string, LayoutBlock>
): void {
  for (const b of blocks) {
    blocksById.set(b.blockId, b);
    if (b.sourceNodeId) blocksBySourceNodeId.set(b.sourceNodeId, b);
    if (b.kind === "structured-table") {
      for (const row of b.rows) {
        for (const cell of row.cells) {
          if (cell.blocks && cell.blocks.length > 0) {
            indexBlocksRecursively(cell.blocks, blocksBySourceNodeId, blocksById);
          }
        }
      }
    } else if (b.kind === "columns-grid" && b.columns) {
      for (const col of b.columns) {
        if (col.blocks && col.blocks.length > 0) {
          indexBlocksRecursively(col.blocks, blocksBySourceNodeId, blocksById);
        }
      }
    }
  }
}

function buildBaseDocOverlayIndex(baseDoc?: VDocDocument): BaseDocOverlayIndex | null {
  if (!baseDoc) return null;
  const pagesBySourceNodeId = new Map<string, VDocPage>();
  const pagesById = new Map<string, VDocPage>();
  const blocksBySourceNodeId = new Map<string, LayoutBlock>();
  const blocksById = new Map<string, LayoutBlock>();

  for (const p of baseDoc.pages) {
    pagesById.set(p.pageId, p);
    if (p.sourceNodeId) pagesBySourceNodeId.set(p.sourceNodeId, p);
    indexBlocksRecursively(p.blocks, blocksBySourceNodeId, blocksById);
  }

  return {
    pagesBySourceNodeId,
    pagesById,
    blocksBySourceNodeId,
    blocksById,
    slots: baseDoc.slots ?? {},
  };
}

function preserveSlotMeta(
  slots: Record<string, VDocSlot>,
  slotId: string,
  prevSlot: VDocSlot | undefined
): void {
  if (!prevSlot || !slots[slotId]) return;
  const cur = slots[slotId];
  slots[slotId] = {
    ...cur,
    ...(prevSlot.constraints ? { constraints: prevSlot.constraints } : {}),
    ...(prevSlot.backDataRefs?.length ? { backDataRefs: prevSlot.backDataRefs } : {}),
    ...(prevSlot.fill ? { fill: prevSlot.fill } : {}),
    ...(prevSlot.rect ? { rect: prevSlot.rect } : {}),
    ...(prevSlot.assignee ? { assignee: prevSlot.assignee } : {}),
  };
}

function reusePrevSingleSlot(
  slots: Record<string, VDocSlot>,
  compiledSlotId: string,
  prevSlotId: string,
  prevSlots: Record<string, VDocSlot>
): string {
  preserveSlotMeta(slots, compiledSlotId, prevSlots[prevSlotId]);
  if (prevSlotId !== compiledSlotId && slots[compiledSlotId] && !slots[prevSlotId]) {
    slots[prevSlotId] = { ...slots[compiledSlotId], slotId: prevSlotId };
    delete slots[compiledSlotId];
    return prevSlotId;
  }
  return compiledSlotId;
}

interface ExtractedBlockNodeSpec {
  readonly text: string;
  readonly children: readonly { readonly text: string }[];
}

function extractSingleBlockOutlineSpec(
  blk: LayoutBlock,
  slots: Record<string, VDocSlot>,
  registry: ElementSyntaxRegistry
): ExtractedBlockNodeSpec | null {
  const splitSym = registry.resolveSymbol("section", "horizontal-split", "|");
  const frameSym = registry.resolveSymbol("section", "frame-box", ">");
  const accentSym = registry.resolveSymbol("section", "accent-bar", "!");
  const kvSym = registry.resolveSymbol("section", "kv-meta", "::");
  const dividerSym = registry.resolveSymbol("section", "divider-line", "---");
  const imgTag = registry.resolveSymbol("section", "image-slot", "[img]").replace(/^\[|\]$/g, "");
  const ctaTag = registry.resolveSymbol("section", "cta-slot", "[cta]").replace(/^\[|\]$/g, "");
  const embedTag = registry.resolveSymbol("section", "embed-slot", "[embed]").replace(/^\[|\]$/g, "");

  if (blk.kind === "image") {
    const label = blk.alt || blk.title || "이미지";
    return {
      text: `[${imgTag}:${label}]`,
      children: blk.caption ? [{ text: blk.caption }] : [],
    };
  }
  if (blk.kind === "columns-grid") {
    const cols = blk.columns ?? [];
    const parts = cols.map((col) => {
      if (col.image) {
        return `[${imgTag}:${col.image.alt || "이미지"}]`;
      }
      if (col.slotId && slots[col.slotId]) {
        return htmlToPlainText(slots[col.slotId].content).trim();
      }
      return "";
    });
    return {
      text: parts.join(` ${splitSym} `),
      children: [],
    };
  }
  if (blk.kind === "callout-box") {
    const text = htmlToPlainText(slots[blk.slotId]?.content ?? "").trim();
    if (blk.variant === "disclosure") {
      return { text: `[${embedTag}:disclosure | ${text}]`, children: [] };
    }
    if (blk.variant === "accent-bar") {
      return { text: `${accentSym} ${text}`, children: [] };
    }
    if (blk.variant === "info-frame") {
      return {
        text: `${frameSym} ${text}`,
        children: (blk.kvItems ?? []).map((kv) => ({ text: `${kv.key} ${kvSym} ${kv.value}` })),
      };
    }
    return { text: `${frameSym} ${text}`, children: [] };
  }
  if (blk.kind === "link-card") {
    const label = htmlToPlainText(slots[blk.slotId]?.content ?? "").trim() || blk.title || "링크";
    return { text: `[${ctaTag}:${label} -> ${blk.url}]`, children: [] };
  }
  if (blk.kind === "divider") {
    return { text: dividerSym, children: [] };
  }
  if (blk.kind === "structured-table") {
    return {
      text: `<<view:table>> ${blk.title || ""}`.trim(),
      children: blk.rows.map((r) => ({
        text: r.cells
          .map((c) => {
            const t = htmlToPlainText(slots[c.slotId]?.content ?? "").trim();
            return t || "[-]";
          })
          .join(" | "),
      })),
    };
  }
  if (blk.kind === "section-block") {
    const h = htmlToPlainText(slots[blk.headingSlotId]?.content ?? "").trim();
    const b = htmlToPlainText(slots[blk.bodySlotId]?.content ?? "").trim();
    const combined = [h, b].filter(Boolean).join(" — ");
    return combined ? { text: combined, children: [] } : null;
  }
  if (blk.kind === "hero") {
    const h = htmlToPlainText(slots[blk.titleSlotId]?.content ?? "").trim();
    const sub = blk.subtitleSlotId
      ? htmlToPlainText(slots[blk.subtitleSlotId]?.content ?? "").trim()
      : "";
    if (!h) return null;
    return {
      text: `${frameSym} ${h}`,
      children: sub ? [{ text: sub }] : [],
    };
  }
  if ("slotId" in blk && typeof blk.slotId === "string" && slots[blk.slotId]) {
    const text = htmlToPlainText(slots[blk.slotId].content).trim();
    return text ? { text, children: [] } : null;
  }
  return null;
}

function isOutlineNodeUnchangedFromBlock(
  node: OutlineSyntaxNode,
  prev: LayoutBlock,
  prevSlots: Record<string, VDocSlot>,
  registry: ElementSyntaxRegistry
): boolean {
  const expected = extractSingleBlockOutlineSpec(prev, prevSlots, registry);
  if (!expected) return false;
  if (node.text.trim() !== expected.text.trim()) return false;
  const actualChildren = (node.children ?? []).filter(
    (c) => c.text.trim().length > 0 || (c.children?.length ?? 0) > 0
  );
  if (actualChildren.length !== expected.children.length) return false;
  for (let i = 0; i < actualChildren.length; i++) {
    if (actualChildren[i].text.trim() !== expected.children[i].text.trim()) return false;
    if ((actualChildren[i].children?.length ?? 0) > 0) return false;
  }
  return true;
}

function isTopRowHeaderTable(tbl: StructuredTableBlockDef): boolean {
  if (tbl.rows.length < 2) return false;
  const firstRow = tbl.rows[0]?.cells ?? [];
  const secondRowFirstCell = tbl.rows[1]?.cells?.[0];
  return (
    firstRow.length > 0 &&
    firstRow.every((c) => Boolean(c.isHeader)) &&
    Boolean(secondRowFirstCell && !secondRowFirstCell.isHeader)
  );
}

function copyBlockSlotsFromPrev(
  blk: LayoutBlock,
  prevSlots: Record<string, VDocSlot>,
  targetSlots: Record<string, VDocSlot>
): void {
  for (const sid of getBlockSlotIds(blk)) {
    if (prevSlots[sid]) {
      targetSlots[sid] = prevSlots[sid];
    }
  }
}

function applyBlockOverlay(
  compiled: LayoutBlock,
  prev: LayoutBlock | undefined,
  slots: Record<string, VDocSlot>,
  prevSlots: Record<string, VDocSlot>,
  flags?: {
    hasExplicitGridWeights?: boolean;
    hasExplicitTableAsset?: boolean;
    hasExplicitHeaderRole?: boolean;
    sourceNode?: OutlineSyntaxNode;
    frameSym?: string;
  }
): LayoutBlock {
  if (!prev) return compiled;

  const basePreserved = {
    blockId: prev.blockId,
    ...(prev.frame ? { frame: prev.frame } : {}),
    ...(prev.spaceBefore !== undefined ? { spaceBefore: prev.spaceBefore } : {}),
    ...(prev.locked !== undefined ? { locked: prev.locked } : {}),
    ...(prev.styleKey ? { styleKey: prev.styleKey } : {}),
    ...(prev.styleOverrides ? { styleOverrides: prev.styleOverrides } : {}),
  };

  // Preserve `hero` block kind when user edits its headline/subtitle bullet
  if (prev.kind === "hero") {
    const rawText = flags?.sourceNode?.text.trim() ?? compiled.title;
    const frameSym = flags?.frameSym ?? ">";
    const headline =
      frameSym && rawText.startsWith(frameSym) ? rawText.slice(frameSym.length).trim() : rawText;
    const subText = (flags?.sourceNode?.children ?? [])
      .map((c) => c.text.trim())
      .filter(Boolean)
      .join(" ");

    // Drop temporary compiled slot if different from prev slots
    if ("slotId" in compiled && typeof compiled.slotId === "string" && compiled.slotId !== prev.titleSlotId) {
      delete slots[compiled.slotId];
    }
    slots[prev.titleSlotId] = {
      ...(prevSlots[prev.titleSlotId] ?? {
        slotId: prev.titleSlotId,
        label: "표지 타이틀",
        role: "editable-slot",
        content: "",
        backDataRefs: [],
      }),
      slotId: prev.titleSlotId,
      content: `<h1>${escapeHtml(headline)}</h1>`,
    };
    if (prev.subtitleSlotId) {
      slots[prev.subtitleSlotId] = {
        ...(prevSlots[prev.subtitleSlotId] ?? {
          slotId: prev.subtitleSlotId,
          label: "표지 부제",
          role: "editable-slot",
          content: "",
          backDataRefs: [],
        }),
        slotId: prev.subtitleSlotId,
        content: `<p>${escapeHtml(subText)}</p>`,
      };
    }
    const mergedHero: HeroBlockDef = {
      ...prev,
      ...basePreserved,
      sourceNodeId: compiled.sourceNodeId ?? prev.sourceNodeId,
    };
    return mergedHero;
  }

  // Preserve `heading` block kind when an extracted heading bullet was recompiled as plain text
  if (prev.kind === "heading" && compiled.kind === "text") {
    const newSlot = slots[compiled.slotId];
    const plain = newSlot ? htmlToPlainText(newSlot.content).trim() : compiled.title;
    const level = prev.level ?? 2;
    const headingSlotId = prev.slotId;
    slots[headingSlotId] = {
      ...(prevSlots[headingSlotId] ?? newSlot),
      slotId: headingSlotId,
      label: prevSlots[headingSlotId]?.label ?? compiled.title,
      role: prevSlots[headingSlotId]?.role ?? "editable-slot",
      content: `<h${level}>${escapeHtml(plain)}</h${level}>`,
      backDataRefs: prevSlots[headingSlotId]?.backDataRefs ?? [],
    };
    if (headingSlotId !== compiled.slotId) {
      delete slots[compiled.slotId];
    }
    const mergedHeading: HeadingBlockDef = {
      ...prev,
      ...basePreserved,
      title: plain.slice(0, 32) || prev.title,
      slotId: headingSlotId,
      sourceNodeId: compiled.sourceNodeId ?? prev.sourceNodeId,
    };
    return mergedHeading;
  }

  if (prev.kind !== compiled.kind) {
    return {
      ...compiled,
      ...basePreserved,
    } as LayoutBlock;
  }

  if (compiled.kind === "image" && prev.kind === "image") {
    return {
      ...compiled,
      ...basePreserved,
      src: compiled.src || prev.src,
      width: prev.width ?? compiled.width,
      height: prev.height ?? compiled.height,
      maxHeight: prev.maxHeight ?? compiled.maxHeight,
      align: prev.align ?? compiled.align,
      objectFit: prev.objectFit ?? compiled.objectFit,
    };
  }

  if (compiled.kind === "columns-grid" && prev.kind === "columns-grid") {
    const compiledCols = compiled.columns ?? [];
    const prevCols = prev.columns ?? [];
    const mergedCols = compiledCols.map((col, idx) => {
      const prevCol = prevCols[idx];
      if (col.image && prevCol?.image) {
        return {
          ...col,
          image: {
            ...prevCol.image,
            ...col.image,
            src: col.image.src || prevCol.image.src,
            width: prevCol.image.width ?? col.image.width,
            height: prevCol.image.height ?? col.image.height,
            maxHeight: prevCol.image.maxHeight ?? col.image.maxHeight,
            align: prevCol.image.align ?? col.image.align,
            objectFit: prevCol.image.objectFit ?? col.image.objectFit,
          },
        };
      }
      if (col.slotId && prevCol?.slotId && prevSlots[prevCol.slotId]) {
        const prevPlain = htmlToPlainText(prevSlots[prevCol.slotId].content).trim();
        const nextPlain = htmlToPlainText(slots[col.slotId]?.content ?? "").trim();
        if (prevPlain === nextPlain) {
          // Preserve rich HTML (e.g. `<h3>...</h3><p>...</p>`) for unchanged column
          slots[prevCol.slotId] = prevSlots[prevCol.slotId];
          if (col.slotId !== prevCol.slotId) delete slots[col.slotId];
          return { ...col, slotId: prevCol.slotId };
        }
        preserveSlotMeta(slots, col.slotId, prevSlots[prevCol.slotId]);
      }
      return col;
    });
    const keepPrevWidths =
      !flags?.hasExplicitGridWeights &&
      Array.isArray(prev.widths) &&
      prev.widths.length === compiledCols.length;
    return {
      ...compiled,
      ...basePreserved,
      title: prev.title || compiled.title,
      widths: keepPrevWidths ? prev.widths : compiled.widths,
      ...(prev.gap !== undefined ? { gap: prev.gap } : {}),
      cardStyle: prev.cardStyle,
      columns: mergedCols,
    };
  }

  if (compiled.kind === "callout-box" && prev.kind === "callout-box") {
    const slotId = reusePrevSingleSlot(slots, compiled.slotId, prev.slotId, prevSlots);
    return {
      ...compiled,
      ...basePreserved,
      slotId,
      variant: prev.variant ?? compiled.variant,
      ...(prev.accentColor ? { accentColor: prev.accentColor } : {}),
      ...(prev.align ? { align: prev.align } : {}),
      ...(prev.tone ? { tone: prev.tone } : {}),
    };
  }

  if (compiled.kind === "link-card" && prev.kind === "link-card") {
    const slotId = reusePrevSingleSlot(slots, compiled.slotId, prev.slotId, prevSlots);
    return {
      ...compiled,
      ...basePreserved,
      slotId,
      title: prev.title || compiled.title,
      url: compiled.url || prev.url,
      variant: prev.variant,
      ...(prev.domain ? { domain: prev.domain } : {}),
      ...(prev.ctaChevron !== undefined ? { ctaChevron: prev.ctaChevron } : {}),
      ...(prev.width ? { width: prev.width } : { width: undefined }),
    };
  }

  if (compiled.kind === "structured-table" && prev.kind === "structured-table") {
    const keepWidths =
      prev.columnWidths.length === compiled.columnWidths.length
        ? prev.columnWidths
        : compiled.columnWidths;
    const preserveVisual = !flags?.hasExplicitTableAsset;
    const mergedHeaderBg = preserveVisual
      ? (prev.headerStyle?.bg ?? compiled.headerStyle?.bg)
      : compiled.headerStyle?.bg;
    const mergedHeaderColor = preserveVisual
      ? (prev.headerStyle?.textColor ?? compiled.headerStyle?.textColor)
      : compiled.headerStyle?.textColor;

    const mergedRows =
      preserveVisual && prev.rows.length === compiled.rows.length
        ? compiled.rows.map((row, rIdx) => {
          const prevRow = prev.rows[rIdx];
          if (!prevRow || prevRow.cells.length !== row.cells.length) return row;
          return {
            ...row,
            cells: row.cells.map((cell, cIdx) => {
              const prevCell = prevRow.cells[cIdx];
              if (!prevCell) return cell;
              const effectiveIsHeader = flags?.hasExplicitHeaderRole
                ? cell.isHeader
                : (prevCell.isHeader ?? cell.isHeader);
              // If user removed header shading in Inspector (e.g. clean form table), strip auto-bold on plain label slot
              if (
                !effectiveIsHeader &&
                cell.isHeader &&
                slots[cell.slotId] &&
                prevSlots[prevCell.slotId] &&
                !prevSlots[prevCell.slotId].content.includes("<strong>")
              ) {
                const plain = htmlToPlainText(slots[cell.slotId].content).trim();
                const alignStyle =
                  prevCell.hAlign === "center"
                    ? ' style="text-align: center"'
                    : prevCell.hAlign === "right"
                      ? ' style="text-align: right"'
                      : "";
                slots[cell.slotId] = {
                  ...slots[cell.slotId],
                  content: `<p${alignStyle}>${escapeHtml(plain)}</p>`,
                };
              }
              return {
                ...cell,
                isHeader: effectiveIsHeader,
                hAlign: prevCell.hAlign ?? cell.hAlign,
                vAlign: prevCell.vAlign ?? cell.vAlign,
                ...(prevCell.padding ? { padding: prevCell.padding } : {}),
                ...(prevCell.borderTop ? { borderTop: prevCell.borderTop } : {}),
                ...(prevCell.borderBottom ? { borderBottom: prevCell.borderBottom } : {}),
                backgroundColor: effectiveIsHeader
                  ? (prevCell.backgroundColor ?? mergedHeaderBg)
                  : prevCell.isHeader
                    ? undefined
                    : prevCell.backgroundColor,
                ...(effectiveIsHeader && (prevCell.color ?? mergedHeaderColor)
                  ? { color: prevCell.color ?? mergedHeaderColor }
                  : prevCell.color && !prevCell.isHeader
                    ? { color: prevCell.color }
                    : {}),
              };
            }),
          };
        })
        : compiled.rows;

    return {
      ...compiled,
      ...basePreserved,
      columnWidths: keepWidths,
      ...(preserveVisual && prev.borderRules ? { borderRules: prev.borderRules } : {}),
      ...(preserveVisual && prev.headerStyle ? { headerStyle: prev.headerStyle } : {}),
      ...(preserveVisual && prev.cellPadding ? { cellPadding: prev.cellPadding } : {}),
      rows: mergedRows,
    };
  }

  if (compiled.kind === "divider" && prev.kind === "divider") {
    return {
      ...compiled,
      ...basePreserved,
      variant: prev.variant ?? compiled.variant,
      spacing: prev.spacing ?? compiled.spacing,
    };
  }

  if (compiled.kind === "text" && prev.kind === "text") {
    const slotId = reusePrevSingleSlot(slots, compiled.slotId, prev.slotId, prevSlots);
    return {
      ...compiled,
      ...basePreserved,
      slotId,
      ...(prev.align ? { align: prev.align } : {}),
      ...(prev.listMarker ? { listMarker: prev.listMarker } : {}),
    };
  }

  return {
    ...compiled,
    ...basePreserved,
  } as LayoutBlock;
}

function applyPageOverlay(
  compiled: VDocPage,
  prev: VDocPage | undefined,
  slots: Record<string, VDocSlot>,
  prevSlots: Record<string, VDocSlot>
): VDocPage {
  if (!prev) return compiled;
  // Preserve original page header/footer slot IDs and omit injected blog defaults if prev didn't have them
  if (prev.headerSlotId && prevSlots[prev.headerSlotId]) {
    slots[prev.headerSlotId] = prevSlots[prev.headerSlotId];
    if (compiled.headerSlotId !== prev.headerSlotId) delete slots[compiled.headerSlotId];
  }
  if (prev.footerSlotId && prevSlots[prev.footerSlotId]) {
    slots[prev.footerSlotId] = prevSlots[prev.footerSlotId];
    if (compiled.footerSlotId !== prev.footerSlotId) delete slots[compiled.footerSlotId];
  }
  const { layout: _dropLayout, pageRect: _dropRect, ...restCompiled } = compiled;
  void _dropLayout;
  void _dropRect;
  return {
    ...restCompiled,
    pageId: prev.pageId,
    headerSlotId: prev.headerSlotId || compiled.headerSlotId,
    footerSlotId: prev.footerSlotId || compiled.footerSlotId,
    ...(prev.styleOverrides ? { styleOverrides: prev.styleOverrides } : {}),
    ...(prev.layout ? { layout: prev.layout } : {}),
    ...(prev.pageRect ? { pageRect: prev.pageRect } : {}),
    ...(prev.hideHeaderFooter !== undefined ? { hideHeaderFooter: prev.hideHeaderFooter } : {}),
    ...(prev.engine ? { engine: prev.engine } : {}),
    ...(prev.typstSvg ? { typstSvg: prev.typstSvg } : {}),
    ...(prev.typstTemplate ? { typstTemplate: prev.typstTemplate } : {}),
  };
}

/**
 * 아웃라인 문서(`.outline`)의 `<<view:section>>` 노드들을 CRUD 레지스트리 규칙에 따라
 * `blog`(또는 지정 프로파일) 포맷 `VDocDocument` 로 컴파일한다.
 * `baseDoc` 이 주어지면 `sourceNodeId` 가 일치하는 기존 블록/페이지의 시각 디자인을 비파괴 보존한다.
 */
export function compileOutlineToVDoc(
  outline: OutlineSyntaxDocument,
  options: CompileOutlineToVDocOptions = {}
): VDocDocument {
  const registry = options.registry ?? createElementSyntaxRegistry();
  const baseDoc = options.baseDoc;
  const overlay = buildBaseDocOverlayIndex(baseDoc);
  const effectiveStyleRef = options.styleRef ?? baseDoc?.styleRef;
  const effectiveOutlineRef = options.outlineRef ?? baseDoc?.outlineRef;
  const effectiveSourceRef = options.sourceRef ?? baseDoc?.sourceRef;
  const outlineAssets = options.outlineAssets ?? extractOutlineAssets(outline.rootNodes);

  const profileId = options.profileId ?? baseDoc?.schemaRef?.profileId ?? baseDoc?.viewId ?? "blog";
  const profile = registry.getProfile(profileId);
  const viewProfile = getDocumentView(profileId) ?? BLOG_DOCUMENT_VIEW;
  const now = options.now ?? new Date().toISOString();
  const docId = options.docId ?? baseDoc?.docId ?? `vdoc-${profileId}-${Date.now().toString(36)}`;

  const surface = profile ? { ...profile.surface } : { ...viewProfile.surface };
  const sectionPageRect = { width: surface.width, height: 1123, unit: "px" as const };

  const sectionDef = registry.getElementByViewTag("section") ?? registry.getElement("section");
  const tableDef = registry.getElementByViewTag("table") ?? registry.getElement("table");

  const splitSym = registry.resolveSymbol("section", "horizontal-split", "|");
  const frameSym = registry.resolveSymbol("section", "frame-box", ">");
  const accentSym = registry.resolveSymbol("section", "accent-bar", "!");
  const kvSym = registry.resolveSymbol("section", "kv-meta", "::");
  const dividerSym = registry.resolveSymbol("section", "divider-line", "---");
  const imgSym = registry.resolveSymbol("section", "image-slot", "[img]");
  const ctaSym = registry.resolveSymbol("section", "cta-slot", "[cta]");
  const embedSym = registry.resolveSymbol("section", "embed-slot", "[embed]");
  const highlightSym = registry.resolveSymbol("section", "inline-highlight", "==");
  const colContainerSym = registry.resolveSymbol("section", "col-container", "<<col>>");

  const defaultSkin = sectionDef?.skins?.[sectionDef.defaultSkin];
  const usesExternalStyleEngine = Boolean(effectiveStyleRef);
  const defaultAlign = profileId === "a4" ? "left" : (defaultSkin?.align ?? "center");
  const defaultImageGap = defaultSkin?.imageGap ?? 4;

  const variables: Record<string, string> = {};
  let docTitle = outline.title || baseDoc?.title || "Untitled Document";
  const slots: Record<string, VDocSlot> = {};
  const pages: VDocPage[] = [];

  let blockSeq = 0;
  let uniqueCollisionSeq = 0;
  const reservedPrevBlockIds = new Set<string>(overlay?.blocksById.keys() ?? []);
  const reservedPrevSlotIds = new Set<string>(Object.keys(overlay?.slots ?? {}));
  const usedBlockIds = new Set<string>();
  const nextId = (prefix: string) => {
    let candidate = `${prefix}_${++blockSeq}`;
    while (
      usedBlockIds.has(candidate) ||
      reservedPrevBlockIds.has(candidate) ||
      reservedPrevSlotIds.has(`slot_${candidate}`) ||
      slots[`slot_${candidate}`] !== undefined
    ) {
      candidate = `${prefix}_${++blockSeq}`;
    }
    return candidate;
  };

  const ensureUniqueBlockId = (blk: LayoutBlock, hasMatchedPrev: boolean): LayoutBlock => {
    const collidesWithUsed = usedBlockIds.has(blk.blockId);
    const collidesWithOtherPrev = !hasMatchedPrev && reservedPrevBlockIds.has(blk.blockId);
    if (!collidesWithUsed && !collidesWithOtherPrev) {
      usedBlockIds.add(blk.blockId);
      return blk;
    }
    let uniqueId = `${blk.blockId}_n${++uniqueCollisionSeq}`;
    while (usedBlockIds.has(uniqueId) || reservedPrevBlockIds.has(uniqueId)) {
      uniqueId = `${blk.blockId}_n${++uniqueCollisionSeq}`;
    }
    usedBlockIds.add(uniqueId);
    return { ...blk, blockId: uniqueId };
  };

  const finishBlock = (
    blk: LayoutBlock,
    flags?: {
      hasExplicitGridWeights?: boolean;
      hasExplicitTableAsset?: boolean;
      hasExplicitHeaderRole?: boolean;
      sourceNode?: OutlineSyntaxNode;
    }
  ): LayoutBlock => {
    if (!overlay) return ensureUniqueBlockId(blk, false);
    const prev = blk.sourceNodeId
      ? overlay.blocksBySourceNodeId.get(blk.sourceNodeId)
      : overlay.blocksById.get(blk.blockId);
    return ensureUniqueBlockId(
      applyBlockOverlay(blk, prev, slots, overlay.slots, { ...flags, frameSym }),
      Boolean(prev)
    );
  };

  const pushPlainTextBlock = (
    blocks: LayoutBlock[],
    text: string,
    title: string,
    align: "left" | "center" | "right" = defaultAlign,
    sourceNodeId?: string
  ) => {
    const blockId = nextId("blk_txt");
    const slotId = `slot_${blockId}`;
    slots[slotId] = {
      slotId,
      label: title,
      role: "editable-slot",
      content: usesExternalStyleEngine
        ? `<p>${renderInlineMarkup(text, highlightSym)}</p>`
        : makeParagraphHtml(text, highlightSym, align),
      backDataRefs: [],
    };
    const blk: TextBlockDef = {
      blockId,
      kind: "text",
      title,
      slotId,
      ...(sourceNodeId ? { sourceNodeId } : {}),
    };
    blocks.push(finishBlock(blk));
  };

  const resolveTablePreset = (directiveAssetHint?: string): TableAssetVisualPreset | null => {
    const chosenId = directiveAssetHint ?? options.assetHint;
    if (!chosenId) return null;
    return parseTableAssetVisualPreset(outlineAssets[chosenId.toLowerCase()]);
  };

  const compileSectionChild = (node: OutlineSyntaxNode, blocks: LayoutBlock[]) => {
    const raw = node.text.trim();
    const hasFile = Boolean(node.file?.target);
    if (!raw && !hasFile && !(node.children?.length)) return;

    // Fast path: untouched bound node -> preserve original rich block & slots 100% verbatim!
    // Guard against legacy corrupted baseDoc where two blocks shared the same slotId.
    const prevBoundBlock = overlay?.blocksBySourceNodeId.get(node.id);
    if (prevBoundBlock && overlay) {
      const explicitAssetOverride =
        prevBoundBlock.kind === "structured-table" &&
        Boolean(options.assetHint || parseOutlineDirective(raw)?.assetHint);
      const prevSlotCollides = getBlockSlotIds(prevBoundBlock).some((sid) => slots[sid] !== undefined);
      if (
        !explicitAssetOverride &&
        !prevSlotCollides &&
        isOutlineNodeUnchangedFromBlock(node, prevBoundBlock, overlay.slots, registry)
      ) {
        copyBlockSlotsFromPrev(prevBoundBlock, overlay.slots, slots);
        usedBlockIds.add(prevBoundBlock.blockId);
        blocks.push(prevBoundBlock);
        return;
      }
    }

    // 0. Attached image bullet from `@vibe/outliner` (`node.file`)
    if (hasFile && node.file?.target && isImageFileTarget(node.file.target)) {
      const label = raw || node.file.target.split("/").pop() || "첨부 이미지";
      const src = resolveMediaUrl(
        label,
        undefined,
        node.id,
        node.file.target,
        options.mediaMap,
        options.assetResolver
      );
      const caption = (node.children ?? [])
        .map((c) => c.text.trim())
        .filter(Boolean)
        .join(" · ");
      const imgBlk: ImageBlockDef = {
        blockId: nextId("blk_img"),
        kind: "image",
        title: label,
        src,
        alt: label,
        width: "100%",
        align: "center",
        objectFit: "cover",
        caption: caption || undefined,
        sourceNodeId: node.id,
      };
      blocks.push(finishBlock(imgBlk));
      return;
    }

    // 1. Nested <<view:...>> inside a section (e.g. <<view:table>>, <<view:list>>, or unknown fallback)
    const nestedDir = parseOutlineDirective(raw);
    if (nestedDir && nestedDir.kind === "view") {
      const nestedTag = nestedDir.target;
      if (nestedTag === "table" && tableDef) {
        const assetPreset = resolveTablePreset(nestedDir.assetHint);
        const prevTable =
          prevBoundBlock?.kind === "structured-table" ? prevBoundBlock : undefined;
        const explicitHeaderRole =
          nestedDir.role === "header" || nestedDir.role === "top-row"
            ? ("top-row" as const)
            : undefined;
        const tbl = compileTableOutlineNode(node, slots, registry, nextId("tbl"), {
          assetPreset,
          sourceNodeId: node.id,
          headerMode:
            explicitHeaderRole ?? (prevTable && isTopRowHeaderTable(prevTable) ? "top-row" : "form"),
          compileNestedChildren: (childNodes) => {
            const nested: LayoutBlock[] = [];
            for (const c of childNodes) {
              compileSectionChild(c, nested);
            }
            return nested;
          },
        });
        blocks.push(
          finishBlock(tbl, {
            hasExplicitTableAsset: Boolean(nestedDir.assetHint || options.assetHint),
            hasExplicitHeaderRole: Boolean(explicitHeaderRole),
            sourceNode: node,
          })
        );
        return;
      }
      if (nestedTag === "list") {
        const listBlk = compileListOutlineNode(node, slots, nextId("lst"), highlightSym);
        blocks.push(finishBlock(listBlk));
        return;
      }
      if (nestedTag === "title") {
        const blockId = nextId("blk_title");
        const slotId = `slot_${blockId}`;
        const titleLabel = nestedDir.label || "문서 제목";
        slots[slotId] = {
          slotId,
          label: titleLabel,
          role: "editable-slot",
          content: `<p style="text-align: center"><strong>${escapeHtml(titleLabel)}</strong></p>`,
          backDataRefs: [],
        };
        const titleBlk: FormTitleBlockDef = {
          blockId,
          kind: "form-title",
          title: titleLabel,
          slotId,
          align: "center",
          sourceNodeId: node.id,
        };
        blocks.push(finishBlock(titleBlk, { sourceNode: node }));
        return;
      }
      if (nestedTag === "columns" || nestedTag === "grid") {
        const blockId = nextId("blk_cols");
        const colNodes = (node.children ?? []).filter(
          (c) => c.text.trim().length > 0 || (c.children?.length ?? 0) > 0
        );
        const columns: GridColumnDef[] = [];
        const widths: string[] = [];

        colNodes.forEach((colNode) => {
          const parsedCol = parseColContainerLine(colNode.text, colContainerSym);
          widths.push("1fr");
          const nestedBlocks: LayoutBlock[] = [];
          if (parsedCol.matched && parsedCol.title) {
            pushPlainTextBlock(
              nestedBlocks,
              parsedCol.title,
              parsedCol.title.slice(0, 24),
              "left",
              colNode.id
            );
          }
          const innerNodes = parsedCol.matched ? (colNode.children ?? []) : [colNode];
          for (const inner of innerNodes) {
            compileSectionChild(inner, nestedBlocks);
          }
          columns.push({ blocks: nestedBlocks });
        });

        const gridBlk: ColumnsGridBlockDef = {
          blockId,
          kind: "columns-grid",
          title: nestedDir.label || `다단 컨테이너 (${columns.length}단)`,
          widths: widths.length > 0 ? widths : ["1fr", "1fr"],
          gap: 16,
          columns,
          sourceNodeId: node.id,
        };
        blocks.push(finishBlock(gridBlk, { sourceNode: node }));
        return;
      }
      const fallbackLines = flattenNodeTextLines(node);
      for (const line of fallbackLines) {
        pushPlainTextBlock(blocks, line, `폴백(${nestedTag})`, "left", node.id);
      }
      return;
    }

    // Ignore inline <<asset:...>> definitions if placed inside a section
    if (nestedDir && (nestedDir.kind === "asset" || nestedDir.kind === "template")) {
      return;
    }

    // 2. Divider line (`---`)
    if (raw === dividerSym) {
      const divBlk: DividerBlockDef = {
        blockId: nextId("blk_div"),
        kind: "divider",
        title: "구분선",
        variant: "short",
        spacing: 20,
        sourceNodeId: node.id,
      };
      blocks.push(finishBlock(divBlk));
      return;
    }

    // 3. Embed slot (`[embed:kind | content]`)
    const embed = parseEmbedBracket(raw, embedSym);
    if (embed) {
      const blockId = nextId("blk_embed");
      const slotId = `slot_${blockId}`;
      if (embed.embedKind === "disclosure" || embed.embedKind === "badge") {
        slots[slotId] = {
          slotId,
          label: "고지 배지",
          role: "editable-slot",
          content: usesExternalStyleEngine
            ? `<p>${escapeHtml(embed.content)}</p>`
            : `<p style="text-align: center">${escapeHtml(embed.content)}</p>`,
          backDataRefs: [],
        };
        const callout: CalloutBoxBlockDef = {
          blockId,
          kind: "callout-box",
          title: "고지 배지",
          slotId,
          variant: "disclosure",
          sourceNodeId: node.id,
          ...(usesExternalStyleEngine ? {} : { align: "center" as const }),
        };
        blocks.push(finishBlock(callout));
      } else {
        slots[slotId] = {
          slotId,
          label: `임베드 (${embed.embedKind})`,
          role: "editable-slot",
          content: `<p><strong>[${escapeHtml(embed.embedKind.toUpperCase())}]</strong> ${escapeHtml(embed.content)}</p>`,
          backDataRefs: [],
        };
        const callout: CalloutBoxBlockDef = {
          blockId,
          kind: "callout-box",
          title: `임베드 (${embed.embedKind})`,
          slotId,
          variant: "default",
          tone: "info",
          sourceNodeId: node.id,
        };
        blocks.push(finishBlock(callout));
      }
      return;
    }

    // 4. CTA slot (`[cta:label -> url]`)
    const cta = parseCtaBracket(raw, ctaSym);
    if (cta) {
      const blockId = nextId("blk_cta");
      const slotId = `slot_${blockId}`;
      slots[slotId] = {
        slotId,
        label: cta.label || "할인 링크 CTA",
        role: "editable-slot",
        content: usesExternalStyleEngine
          ? `<p><strong>${escapeHtml(cta.label)}</strong></p>`
          : `<p style="text-align: center"><strong>${escapeHtml(cta.label)}</strong></p>`,
        backDataRefs: [],
      };
      const linkBlk: LinkCardBlockDef = {
        blockId,
        kind: "link-card",
        title: cta.label || "CTA 링크",
        slotId,
        url: cta.url,
        variant: "cta",
        ...(usesExternalStyleEngine ? {} : { ctaChevron: true }),
        width: "100%",
        sourceNodeId: node.id,
      };
      blocks.push(finishBlock(linkBlk));
      return;
    }

    // 5. Frame / Quote (`>`)
    if (frameSym && raw.startsWith(frameSym)) {
      const titleText = raw.slice(frameSym.length).trim();
      const children = (node.children ?? []).filter((c) => c.text.trim().length > 0);
      const blockId = nextId("blk_frame");
      const slotId = `slot_${blockId}`;

      if (children.length === 0) {
        slots[slotId] = {
          slotId,
          label: "인용구",
          role: "editable-slot",
          content: usesExternalStyleEngine
            ? `<p>${renderInlineMarkup(titleText, highlightSym)}</p>`
            : `<p style="text-align: center"><em>${renderInlineMarkup(titleText, highlightSym)}</em></p>`,
          backDataRefs: [],
        };
        const quoteBlk: CalloutBoxBlockDef = {
          blockId,
          kind: "callout-box",
          title: titleText.slice(0, 28) || "인용구",
          slotId,
          variant: "quote",
          sourceNodeId: node.id,
          ...(usesExternalStyleEngine ? {} : { align: "center" as const }),
        };
        blocks.push(finishBlock(quoteBlk, { sourceNode: node }));
      } else {
        const kvItems: CalloutKvItem[] = [];
        const extraNotes: string[] = [];
        for (const child of children) {
          const line = child.text.trim();
          const kvIdx = kvSym ? line.indexOf(kvSym) : -1;
          if (kvIdx > 0) {
            kvItems.push({
              key: line.slice(0, kvIdx).trim(),
              value: line.slice(kvIdx + kvSym.length).trim(),
            });
          } else {
            extraNotes.push(line);
          }
        }
        const extraHtml = extraNotes
          .map((n) => `<p>${renderInlineMarkup(n, highlightSym)}</p>`)
          .join("");
        slots[slotId] = {
          slotId,
          label: titleText || "정보 프레임",
          role: "editable-slot",
          content: `<p><strong>${renderInlineMarkup(titleText, highlightSym)}</strong></p>${extraHtml}`,
          backDataRefs: [],
        };
        const infoBlk: CalloutBoxBlockDef = {
          blockId,
          kind: "callout-box",
          title: titleText || "정보 프레임",
          slotId,
          variant: "info-frame",
          kvItems,
          align: "left",
          sourceNodeId: node.id,
        };
        blocks.push(finishBlock(infoBlk, { sourceNode: node }));
      }
      return;
    }

    // 6. Accent / Tip / Highlight Bar (`!`)
    if (accentSym && raw.startsWith(accentSym)) {
      const bodyText = raw.slice(accentSym.length).trim();
      const blockId = nextId("blk_accent");
      const slotId = `slot_${blockId}`;
      const accentColor = pickAccentColor(bodyText);
      slots[slotId] = {
        slotId,
        label: bodyText.slice(0, 28) || "포인트 강조",
        role: "editable-slot",
        content: usesExternalStyleEngine
          ? `<p><strong>${renderInlineMarkup(bodyText, highlightSym)}</strong></p>`
          : `<p style="text-align: center"><strong>${renderInlineMarkup(bodyText, highlightSym)}</strong></p>`,
        backDataRefs: [],
      };
      const accentBlk: CalloutBoxBlockDef = {
        blockId,
        kind: "callout-box",
        title: bodyText.slice(0, 28) || "포인트 강조",
        slotId,
        variant: "accent-bar",
        ...(usesExternalStyleEngine ? {} : { align: "center" as const }),
        accentColor,
        sourceNodeId: node.id,
      };
      blocks.push(finishBlock(accentBlk));
      return;
    }

    // 7. Horizontal Split (`|`) — e.g. `[img:A] | [img:B]` or `[img:A] | 텍스트`
    const splitParts = splitOutsideBrackets(raw, splitSym);
    if (splitParts.length > 1) {
      const blockId = nextId("blk_grid");
      const columns: GridColumnDef[] = [];
      const widths: string[] = [];
      let hasExplicitGridWeights = false;

      splitParts.forEach((part, idx) => {
        const parsedImg = parseImageBracket(
          part,
          imgSym,
          options.mediaMap,
          options.assetResolver,
          node.id
        );
        if (parsedImg) {
          if (parsedImg.hasExplicitWeight) hasExplicitGridWeights = true;
          widths.push(`${parsedImg.weight ?? 1}fr`);
          columns.push({
            image: {
              src: parsedImg.src,
              alt: parsedImg.label,
              width: "100%",
              height: "300px",
              maxHeight: "340px",
              align: "center",
              objectFit: "cover",
            },
          });
        } else {
          widths.push("1fr");
          const slotId = `slot_${blockId}_c${idx + 1}`;
          slots[slotId] = {
            slotId,
            label: `칼럼 ${idx + 1}`,
            role: "editable-slot",
            content: makeParagraphHtml(part, highlightSym, "left"),
            backDataRefs: [],
          };
          columns.push({ slotId });
        }
      });

      const allImages = columns.every((c) => Boolean(c.image));
      const gridBlk: ColumnsGridBlockDef = {
        blockId,
        kind: "columns-grid",
        title: allImages ? `사진 스트립 (${columns.length}장)` : `가로 분할 (${columns.length}단)`,
        widths,
        cardStyle: "plain",
        gap: allImages ? defaultImageGap : 16,
        columns,
        sourceNodeId: node.id,
      };
      blocks.push(finishBlock(gridBlk, { hasExplicitGridWeights }));
      return;
    }

    // 8. Standalone Image Slot (`[img:설명]` or `[img:설명 -> url]`)
    const singleImg = parseImageBracket(
      raw,
      imgSym,
      options.mediaMap,
      options.assetResolver,
      node.id
    );
    if (singleImg) {
      const caption = (node.children ?? [])
        .map((c) => c.text.trim())
        .filter(Boolean)
        .join(" · ");
      const imgBlk: ImageBlockDef = {
        blockId: nextId("blk_img"),
        kind: "image",
        title: singleImg.label,
        src: singleImg.src,
        alt: singleImg.label,
        width: "100%",
        align: "center",
        objectFit: "cover",
        caption: caption || undefined,
        sourceNodeId: node.id,
      };
      blocks.push(finishBlock(imgBlk));
      return;
    }

    // 9. Standalone Key :: Value line outside frame
    const kvIdx = kvSym ? raw.indexOf(kvSym) : -1;
    if (kvIdx > 0) {
      const k = raw.slice(0, kvIdx).trim();
      const v = raw.slice(kvIdx + kvSym.length).trim();
      pushPlainTextBlock(blocks, `${k} : ${v}`, k, "left", node.id);
      return;
    }

    // 10. Regular paragraph text (with optional inline `==강조==` & nested hierarchical children!)
    const nonEmptyChildren = (node.children ?? []).filter(
      (c) => c.text.trim().length > 0 || Boolean(c.file?.target) || (c.children?.length ?? 0) > 0
    );
    if (nonEmptyChildren.length === 0) {
      pushPlainTextBlock(blocks, raw, raw.slice(0, 26), defaultAlign, node.id);
      return;
    }

    // Check whether all descendants are plain text items (no directives / media / quotes / split syntax)
    const isSpecialBullet = (n: OutlineSyntaxNode): boolean => {
      const t = n.text.trim();
      if (n.file?.target) return true;
      if (parseOutlineDirective(t)) return true;
      if (t === dividerSym) return true;
      if (parseEmbedBracket(t, embedSym)) return true;
      if (parseCtaBracket(t, ctaSym)) return true;
      if (frameSym && t.startsWith(frameSym)) return true;
      if (accentSym && t.startsWith(accentSym)) return true;
      if (splitSym && t.includes(splitSym)) return true;
      if (parseImageBracket(t, imgSym)) return true;
      return (n.children ?? []).some(isSpecialBullet);
    };

    const hasSpecialChild = nonEmptyChildren.some(isSpecialBullet);
    if (!hasSpecialChild) {
      // Natural Outliner hierarchy: parent lead line + nested `<ul><li>...</li></ul>`
      const blockId = nextId("blk_txt");
      const slotId = `slot_${blockId}`;
      const leadHtml = usesExternalStyleEngine
        ? `<p>${renderInlineMarkup(raw, highlightSym)}</p>`
        : makeParagraphHtml(raw, highlightSym, defaultAlign);
      const listHtml = renderListChildrenHtml(nonEmptyChildren, highlightSym);
      slots[slotId] = {
        slotId,
        label: raw.slice(0, 26),
        role: "editable-slot",
        content: `${leadHtml}${listHtml}`,
        backDataRefs: [],
      };
      const blk: TextBlockDef = {
        blockId,
        kind: "text",
        title: raw.slice(0, 26),
        slotId,
        sourceNodeId: node.id,
      };
      blocks.push(finishBlock(blk));
      return;
    }

    // Mixed hierarchy (contains images/tables/callouts): emit lead paragraph + compile every child recursively
    pushPlainTextBlock(blocks, raw, raw.slice(0, 26), defaultAlign, node.id);
    for (const child of nonEmptyChildren) {
      compileSectionChild(child, blocks);
    }
  };

  let sectionIndex = 0;

  const pushPage = (page: VDocPage) => {
    const prev = overlay
      ? overlay.pagesBySourceNodeId.get(page.sourceNodeId ?? "") ?? overlay.pagesById.get(page.pageId)
      : undefined;
    pages.push(applyPageOverlay(page, prev, slots, overlay?.slots ?? {}));
  };

  for (const rootNode of outline.rootNodes) {
    const raw = rootNode.text.trim();
    if (!raw && !(rootNode.children?.length)) continue;

    // Document meta root (`문서 메타 :: 제목`)
    if (kvSym && raw.startsWith("문서 메타") && raw.includes(kvSym)) {
      const titlePart = raw.slice(raw.indexOf(kvSym) + kvSym.length).trim();
      if (titlePart) docTitle = titlePart;
      for (const child of rootNode.children ?? []) {
        const line = child.text.trim();
        const idx = line.indexOf(kvSym);
        if (idx > 0) {
          variables[line.slice(0, idx).trim()] = line.slice(idx + kvSym.length).trim();
        }
      }
      continue;
    }

    const parsedDir = parseOutlineDirective(raw);
    if (parsedDir && parsedDir.kind === "view") {
      const tag = parsedDir.target;
      const role = parsedDir.role;
      const label = parsedDir.label || (role ? `섹션 (${role})` : `섹션 ${sectionIndex + 1}`);

      if (tag === "section") {
        sectionIndex += 1;
        const pageId = `sec_${sectionIndex}_${role || "body"}`;
        const headerSlotId = `slot_${pageId}_hdr`;
        const footerSlotId = `slot_${pageId}_ftr`;
        slots[headerSlotId] = {
          slotId: headerSlotId,
          label: "Header",
          role: "editable-slot",
          content: "",
          backDataRefs: [],
        };
        slots[footerSlotId] = {
          slotId: footerSlotId,
          label: "Footer",
          role: "editable-slot",
          content: "",
          backDataRefs: [],
        };

        const blocks: LayoutBlock[] = [];
        if (sectionDef) {
          for (const child of rootNode.children ?? []) {
            compileSectionChild(child, blocks);
          }
        } else {
          for (const line of flattenNodeTextLines(rootNode)) {
            pushPlainTextBlock(blocks, line, "섹션 폴백", "left", rootNode.id);
          }
        }

        pushPage({
          pageId,
          pageNumber: sectionIndex,
          pageLabel: label,
          unitKind: profile?.unitKind ?? "section",
          sectionRole: role || "body",
          outlineDsl: flattenNodeTextLines(rootNode),
          sourceNodeId: rootNode.id,
          headerSlotId,
          footerSlotId,
          hideHeaderFooter: true,
          ...(usesExternalStyleEngine
            ? {}
            : {
              pageRect: sectionPageRect,
              layout: {
                margin: { top: 20, right: 32, bottom: 20, left: 32 },
                blockGap: 10,
                fontSize: "14px",
                lineHeight: "1.8",
                color: "#334155",
              },
            }),
          blocks,
        });
        continue;
      }

      // Top-level <<view:table>>, <<view:list>>, or unknown view tag wrapped in a section
      sectionIndex += 1;
      const pageId = `sec_${sectionIndex}_${tag}`;
      const headerSlotId = `slot_${pageId}_hdr`;
      const footerSlotId = `slot_${pageId}_ftr`;
      slots[headerSlotId] = {
        slotId: headerSlotId,
        label: "Header",
        role: "editable-slot",
        content: "",
        backDataRefs: [],
      };
      slots[footerSlotId] = {
        slotId: footerSlotId,
        label: "Footer",
        role: "editable-slot",
        content: "",
        backDataRefs: [],
      };
      const blocks: LayoutBlock[] = [];
      compileSectionChild(rootNode, blocks);
      pushPage({
        pageId,
        pageNumber: sectionIndex,
        pageLabel: label,
        unitKind: profile?.unitKind ?? viewProfile.unitKind,
        sectionRole: tag,
        outlineDsl: flattenNodeTextLines(rootNode),
        sourceNodeId: rootNode.id,
        headerSlotId,
        footerSlotId,
        hideHeaderFooter: true,
        ...(usesExternalStyleEngine ? {} : { pageRect: sectionPageRect }),
        blocks,
      });
      continue;
    }

    // Ignore inline <<asset:...>> or <<template:...>> definitions at top level
    if (parsedDir && (parsedDir.kind === "asset" || parsedDir.kind === "template")) {
      continue;
    }

    // Fallback: standalone top-level outline node without <<view:...>>
    sectionIndex += 1;
    const pageId = `sec_${sectionIndex}_raw`;
    const headerSlotId = `slot_${pageId}_hdr`;
    const footerSlotId = `slot_${pageId}_ftr`;
    slots[headerSlotId] = {
      slotId: headerSlotId,
      label: "Header",
      role: "editable-slot",
      content: "",
      backDataRefs: [],
    };
    slots[footerSlotId] = {
      slotId: footerSlotId,
      label: "Footer",
      role: "editable-slot",
      content: "",
      backDataRefs: [],
    };
    const blocks: LayoutBlock[] = [];
    compileSectionChild(rootNode, blocks);
    for (const child of rootNode.children ?? []) {
      compileSectionChild(child, blocks);
    }
    pushPage({
      pageId,
      pageNumber: sectionIndex,
      pageLabel: raw.slice(0, 32),
      unitKind: profile?.unitKind ?? viewProfile.unitKind,
      sourceNodeId: rootNode.id,
      headerSlotId,
      footerSlotId,
      hideHeaderFooter: true,
      blocks,
    });
  }

  const schemaRef: VDocSchemaRef = {
    profileId,
    registryPath: options.registryPath ?? baseDoc?.schemaRef?.registryPath,
    registryVersion: registry.getVersion(),
    elementIds: profile?.allowedElementIds ?? ["section", "table"],
  };

  // `.outline` 사이드카 `nodeEvidence` -> 컴파일된 블록 슬롯 `evidenceLinks` 자동 승계
  const mergedEvidenceLinks: EvidenceLink[] = [...(baseDoc?.evidenceLinks ?? [])];
  if (options.nodeEvidence && Object.keys(options.nodeEvidence).length > 0) {
    const seenEvidence = new Set(
      mergedEvidenceLinks.map((l) => `${l.slotId}|${evidenceKey(l.locator)}`)
    );
    let linkSeq = mergedEvidenceLinks.length + 1;
    const attachNodeEvidenceToBlock = (sourceNodeId: string | undefined, blk: LayoutBlock) => {
      if (!sourceNodeId) return;
      const locs = options.nodeEvidence?.[sourceNodeId];
      if (!locs || locs.length === 0) return;
      for (const slotId of getBlockSlotIds(blk)) {
        for (const locator of locs) {
          const dedup = `${slotId}|${evidenceKey(locator)}`;
          if (seenEvidence.has(dedup)) continue;
          seenEvidence.add(dedup);
          mergedEvidenceLinks.push({
            linkId: `ev-ol-${linkSeq++}`,
            slotId,
            locator,
            origin: "ai",
            createdAt: now,
            status: "ok",
          });
        }
      }
    };
    for (const page of pages) {
      for (const blk of page.blocks) {
        attachNodeEvidenceToBlock(blk.sourceNodeId, blk);
        if (page.sourceNodeId && page.sourceNodeId !== blk.sourceNodeId) {
          attachNodeEvidenceToBlock(page.sourceNodeId, blk);
        }
      }
    }
  }

  return {
    version: "1.0.0",
    docId,
    title: docTitle,
    viewId: profileId,
    surface: profile ? { ...profile.surface } : { ...viewProfile.surface },
    genre: profileId === "a4" ? "document" : profileId,
    status: baseDoc?.status ?? "Draft",
    updatedAt: now,
    schemaRef,
    ...(effectiveStyleRef ? { styleRef: effectiveStyleRef } : {}),
    ...(effectiveSourceRef ? { sourceRef: effectiveSourceRef } : {}),
    ...(effectiveOutlineRef ? { outlineRef: effectiveOutlineRef } : {}),
    ...(baseDoc?.preview ? { preview: baseDoc.preview } : {}),
    ...(mergedEvidenceLinks.length > 0 ? { evidenceLinks: mergedEvidenceLinks } : {}),
    ...(baseDoc?.revision !== undefined ? { revision: baseDoc.revision } : {}),
    ...(baseDoc?.projectId ? { projectId: baseDoc.projectId } : {}),
    origin: baseDoc?.origin ?? {
      createdBy: "import",
      createdAt: now,
    },
    variables: Object.keys(variables).length > 0 ? variables : (baseDoc?.variables ?? {}),
    pages,
    slots,
    backdata: baseDoc?.backdata ?? {},
  };
}

/**
 * 마스터 `.outline` 트리 안의 **임의 깊이**에 위치한 특정 지시어 노드(`<<doc:...>>`, `<<view:...>>`, `<<asset:...>>`)
 * 하나만 골라내어 `VDocDocument` 로 컴파일한다.
 * 형제 브레인스토밍/Todo/리서치 노드는 완전히 격리된다.
 */
export function compileDirectiveSubtreeToVDoc(
  rootNodes: readonly OutlineSyntaxNode[],
  targetNodeId: string,
  options: CompileOutlineToVDocOptions = {}
): VDocDocument | null {
  const chain = findOutlineNodeChain(rootNodes, targetNodeId);
  const targetNode = chain?.[chain.length - 1];
  if (!targetNode) return null;

  const directive = parseOutlineDirective(targetNode.text);
  if (!directive) return null;

  const outlineAssets = options.outlineAssets ?? extractOutlineAssets(rootNodes);
  const registry = options.registry ?? createElementSyntaxRegistry();
  const kvSym = registry.resolveSymbol("section", "kv-meta", "::");

  if (directive.kind === "doc") {
    const docProfileId = options.profileId ?? (directive.target || "blog");
    const children = targetNode.children ?? [];
    const isMetaNode = (c: OutlineSyntaxNode) =>
      Boolean(kvSym && c.text.trim().startsWith("문서 메타") && c.text.includes(kvSym));
    // Only explicit `<<view:section>>` splits pages/sections!
    // Block-level directives (`<<view:list>>`, `<<view:table>>`, `<<view:title>>`, `<<view:columns>>`)
    // directly under `<<doc>>` without `<<view:section>>` stay together on a single default page.
    const hasExplicitSectionChild = children.some((c) => {
      const d = parseOutlineDirective(c.text);
      return d?.kind === "view" && d.target === "section";
    });

    const docRootNodes: OutlineSyntaxNode[] = hasExplicitSectionChild
      ? children.filter((c) => {
        const d = parseOutlineDirective(c.text);
        if (d?.kind === "view") return true;
        if (isMetaNode(c)) return true;
        return false;
      })
      : [
        ...children.filter(isMetaNode),
        {
          id: targetNode.id,
          text: `<<view:section>> ${directive.label || "본문"}`,
          children: children.filter((c) => !isMetaNode(c)),
        },
      ];

    return compileOutlineToVDoc(
      {
        version: 1,
        title: directive.label || options.baseDoc?.title || "Untitled Document",
        rootNodes: docRootNodes,
      },
      {
        ...options,
        registry,
        profileId: docProfileId,
        outlineAssets,
      }
    );
  }

  if (directive.kind === "view") {
    const inferredProfile =
      options.profileId ??
      (directive.target === "table" && !options.baseDoc ? "a4" : "blog");
    return compileOutlineToVDoc(
      {
        version: 1,
        title: directive.label || `미리보기 (${directive.target})`,
        rootNodes: [targetNode],
      },
      {
        ...options,
        registry,
        profileId: inferredProfile,
        outlineAssets,
        assetHint: options.assetHint ?? directive.assetHint,
      }
    );
  }

  if (directive.kind === "asset") {
    const asset = outlineAssets[directive.target];
    if (!asset?.templateNode) return null;
    const templateViewTag = asset.targetViewTag || "table";
    const syntheticNode: OutlineSyntaxNode = {
      ...asset.templateNode,
      id: targetNode.id,
      text: `<<view:${templateViewTag} @${asset.assetId}>> ${asset.label}`,
    };
    return compileOutlineToVDoc(
      {
        version: 1,
        title: asset.label,
        rootNodes: [syntheticNode],
      },
      {
        ...options,
        registry,
        profileId: options.profileId ?? (templateViewTag === "table" ? "a4" : "blog"),
        outlineAssets,
        assetHint: asset.assetId,
      }
    );
  }

  return null;
}

function buildOutlineNodesForPage(
  page: VDocPage,
  doc: VDocDocument,
  registry: ElementSyntaxRegistry,
  allocId: (existing?: string) => string,
  stampTarget?: { blocks: LayoutBlock[] }
): OutlineSyntaxNode[] {
  const children: OutlineSyntaxNode[] = [];
  const stampedBlocks: LayoutBlock[] = [];

  for (const blk of page.blocks) {
    const nodeId = allocId(blk.sourceNodeId);
    const spec = extractSingleBlockOutlineSpec(blk, doc.slots, registry);
    if (spec) {
      children.push({
        id: nodeId,
        text: spec.text,
        children: spec.children.map((c) => ({
          id: allocId(),
          text: c.text,
          children: [],
        })),
      });
    }

    if (stampTarget) {
      stampedBlocks.push(spec ? { ...blk, sourceNodeId: nodeId } : blk);
    }
  }

  if (stampTarget) {
    stampTarget.blocks = stampedBlocks;
  }

  return children;
}

/**
 * 정비된 `VDocDocument` 를 현재 `ElementSyntaxRegistry` 의 기호 체계로 역추출하여
 * `.outline` 문서 구조를 생성한다 (양방향 라운드트립 검증용).
 */
export function extractOutlineFromVDoc(
  doc: VDocDocument,
  registry: ElementSyntaxRegistry = createElementSyntaxRegistry()
): OutlineSyntaxDocument {
  const kvSym = registry.resolveSymbol("section", "kv-meta", "::");

  let seq = 0;
  const allocId = (existing?: string) => existing || `ext_${++seq}`;

  const rootNodes: OutlineSyntaxNode[] = [];
  const varEntries = Object.entries(doc.variables ?? {});
  if (doc.title || varEntries.length > 0) {
    rootNodes.push({
      id: allocId(),
      text: `문서 메타 ${kvSym} ${doc.title}`,
      children: varEntries.map(([k, v]) => ({
        id: allocId(),
        text: `${k} ${kvSym} ${v}`,
        children: [],
      })),
    });
  }

  for (const page of doc.pages) {
    const roleSuffix = page.sectionRole && page.sectionRole !== "body" ? `:${page.sectionRole}` : "";
    const sectionHeader = `<<view:section${roleSuffix}>> ${page.pageLabel}`.trim();
    const children = buildOutlineNodesForPage(page, doc, registry, allocId);

    rootNodes.push({
      id: allocId(page.sourceNodeId),
      text: sectionHeader,
      children,
    });
  }

  return {
    version: 1,
    id: `outline-${doc.docId}`,
    title: doc.title,
    defaultView: "bullets",
    rootNodes,
  };
}

export interface ExtractBoundOutlineOptions {
  readonly docNodeId?: string;
  readonly wrapInDocDirective?: boolean;
}

export interface ExtractBoundOutlineResult {
  readonly outline: OutlineSyntaxDocument;
  readonly patchedDoc: VDocDocument;
  readonly docNodeId: string;
}

/**
 * `.vdoc` 문서에서 양방향 바인딩용 `.outline` 을 무손실 역추출하고,
 * 모든 페이지·블록에 `sourceNodeId` 를 양쪽 동일하게 스탬핑한다.
 * 이후 `.outline` 을 편집해 `baseDoc: patchedDoc` 으로 재컴파일해도 이미지 URL·그리드 비율·스타일이 100% 보존된다.
 */
export function extractBoundOutlineFromVDoc(
  doc: VDocDocument,
  registry: ElementSyntaxRegistry = createElementSyntaxRegistry(),
  options: ExtractBoundOutlineOptions = {}
): ExtractBoundOutlineResult {
  const kvSym = registry.resolveSymbol("section", "kv-meta", "::");
  const resolvedView = resolveDocumentView(doc);
  const profileId = doc.schemaRef?.profileId ?? doc.viewId ?? resolvedView.id;

  const usedIds = new Set<string>();
  let seq = 0;
  const allocId = (existing?: string): string => {
    if (existing && !usedIds.has(existing)) {
      usedIds.add(existing);
      return existing;
    }
    let candidate = `nd_${doc.docId.slice(-6)}_${++seq}`;
    while (usedIds.has(candidate)) {
      candidate = `nd_${doc.docId.slice(-6)}_${++seq}`;
    }
    usedIds.add(candidate);
    return candidate;
  };

  const docNodeId = allocId(options.docNodeId ?? doc.outlineRef?.rootNodeId ?? `doc_${doc.docId}`);
  const innerNodes: OutlineSyntaxNode[] = [];

  const varEntries = Object.entries(doc.variables ?? {});
  if (varEntries.length > 0) {
    innerNodes.push({
      id: allocId(`meta_${doc.docId}`),
      text: `문서 메타 ${kvSym} ${doc.title}`,
      children: varEntries.map(([k, v]) => ({
        id: allocId(),
        text: `${k} ${kvSym} ${v}`,
        children: [],
      })),
    });
  }

  const patchedPages: VDocPage[] = [];
  for (const page of doc.pages) {
    const pageNodeId = allocId(page.sourceNodeId);
    const roleSuffix = page.sectionRole && page.sectionRole !== "body" ? `:${page.sectionRole}` : "";
    const sectionHeader = `<<view:section${roleSuffix}>> ${page.pageLabel}`.trim();
    const stampTarget = { blocks: [] as LayoutBlock[] };
    const children = buildOutlineNodesForPage(page, doc, registry, allocId, stampTarget);

    innerNodes.push({
      id: pageNodeId,
      text: sectionHeader,
      children,
    });

    patchedPages.push({
      ...page,
      sourceNodeId: pageNodeId,
      blocks: stampTarget.blocks,
    });
  }

  const wrap = options.wrapInDocDirective !== false;
  const rootNodes: OutlineSyntaxNode[] = wrap
    ? [
      {
        id: docNodeId,
        text: `<<doc:${profileId}>> ${doc.title}`,
        children: innerNodes,
      },
    ]
    : innerNodes;

  return {
    outline: {
      version: 1,
      id: `outline-${doc.docId}`,
      title: doc.title,
      defaultView: "bullets",
      rootNodes,
    },
    patchedDoc: {
      ...doc,
      pages: patchedPages,
    },
    docNodeId,
  };
}

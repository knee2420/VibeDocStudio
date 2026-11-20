/**
 * @vibe/vdoc-schema — Outline DSL <-> 불변 IR <-> VDocDocument 양방향 컴파일러.
 *
 * `ElementSyntaxRegistry` 의 현재 CRUD 규칙을 런타임에 참조하여
 * `<<view:section>>` 및 `<<view:table>>` 아웃라인 트리를 `.vdoc` 으로 컴파일하고,
 * 반대로 `.vdoc` 에서 아웃라인 스키마를 역추출한다.
 */
import type { VDocStyleRef } from "@vibe/style-core";
import type { CalloutAccentColor, CalloutBoxBlockDef, CalloutKvItem } from "../blocks/callout-block";
import type { DividerBlockDef } from "../blocks/divider-block";
import type { ColumnsGridBlockDef } from "../blocks/grid-block";
import type { ImageBlockDef } from "../blocks/image-block";
import type { LinkCardBlockDef } from "../blocks/link-card-block";
import type { StructuredTableBlockDef } from "../blocks/table-block";
import type { TextBlockDef } from "../blocks/text-block";
import type { LayoutBlock } from "../blocks";
import { htmlToPlainText } from "../html-text";
import type { GridColumnDef, TableCellSlotDef, VDocDocument, VDocPage, VDocSchemaRef, VDocSlot } from "../types";
import { BLOG_DOCUMENT_VIEW, getDocumentView } from "../view-registry";
import type { OutlineSyntaxDocument, OutlineSyntaxNode } from "./contract";
import { ElementSyntaxRegistry, createElementSyntaxRegistry } from "./registry";

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
  /** `[img:라벨]` 에서 라벨 -> 실제 이미지 URL/경로로 해석할 선택적 미디어 맵. */
  mediaMap?: Record<string, string>;
  /** 고정 타임스탬프 (테스트/결정적 빌드용). */
  now?: string;
}

const VIEW_TAG_RE = /^<<view:([a-zA-Z0-9_-]+)(?::([a-zA-Z0-9_-]+))?>>(?:\s*(.*))?$/;

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
}

function parseImageBracket(
  token: string,
  imgPrefix: string,
  mediaMap?: Record<string, string>
): ParsedImageToken | null {
  const trimmed = token.trim();
  const baseTag = imgPrefix.replace(/^\[|\]$/g, ""); // e.g. "img"
  const re = new RegExp(`^\\[${escapeRegExp(baseTag)}(?::(\\d+))?(?::\\s*(.*?))?\\]$`);
  // Also support `[img:설명 -> url]` or `[img:설명]` or `[img]`
  if (!trimmed.startsWith(`[${baseTag}`) || !trimmed.endsWith("]")) return null;
  const inner = trimmed.slice(1 + baseTag.length, -1).trim();
  if (!inner) {
    return { label: "이미지", src: mediaMap?.["이미지"] ?? "" };
  }
  const body = inner.startsWith(":") ? inner.slice(1).trim() : inner;
  let weight: number | undefined;
  let rest = body;
  const weightMatch = /^(\d+):(.*)$/.exec(body);
  if (weightMatch) {
    weight = Number(weightMatch[1]);
    rest = weightMatch[2].trim();
  }
  const arrowIdx = rest.indexOf("->");
  if (arrowIdx >= 0) {
    const label = rest.slice(0, arrowIdx).trim() || "이미지";
    const explicitUrl = rest.slice(arrowIdx + 2).trim();
    return { label, src: explicitUrl || mediaMap?.[label] || "", weight };
  }
  const label = rest || "이미지";
  const matched = re.test(trimmed);
  void matched;
  return { label, src: mediaMap?.[label] ?? "", weight };
}

interface ParsedCtaToken {
  label: string;
  url: string;
}

function parseCtaBracket(token: string, ctaPrefix: string): ParsedCtaToken | null {
  const trimmed = token.trim();
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

/**
 * `<<view:table>>` 노드를 한국형 복합 표(`StructuredTableBlockDef`)로 컴파일한다.
 * - 트리 들여쓰기 -> 자동 `rowspan` 헤더 셀
 * - `|` -> 열 구분
 * - `[-]` -> 빈 입력 칸
 * - `[<]` -> 왼쪽 셀과 `colSpan` 병합
 * - `[^]` -> 위쪽 셀과 `rowSpan` 병합
 * - 부족한 말단 열 -> 최대 열 수까지 마지막 셀 자동 `colSpan` 확장
 */
export function compileTableOutlineNode(
  tableNode: OutlineSyntaxNode,
  slots: Record<string, VDocSlot>,
  registry: ElementSyntaxRegistry,
  idPrefix: string
): StructuredTableBlockDef {
  const colSplit = registry.resolveSymbol("table", "col-split", "|");
  const emptySym = registry.resolveSymbol("table", "empty-slot", "[-]");
  const mergeLeftSym = registry.resolveSymbol("table", "merge-left", "[<]");
  const mergeUpSym = registry.resolveSymbol("table", "merge-up", "[^]");

  interface RawGridRow {
    prefixes: Array<{ text: string; rowSpan: number; isFirstRow: boolean }>;
    leafTokens: string[];
  }

  const rawRows: RawGridRow[] = [];

  const unfold = (
    node: OutlineSyntaxNode,
    ancestors: Array<{ text: string; totalLeaves: number; consumed: number }>
  ) => {
    const kids = (node.children ?? []).filter((c) => c.text.trim().length > 0 || (c.children?.length ?? 0) > 0);
    if (kids.length === 0) {
      const tokens = splitOutsideBrackets(node.text.trim(), colSplit);
      const prefixes = ancestors.map((anc) => {
        const isFirst = anc.consumed === 0;
        anc.consumed += 1;
        return { text: anc.text, rowSpan: anc.totalLeaves, isFirstRow: isFirst };
      });
      rawRows.push({ prefixes, leafTokens: tokens });
      return;
    }
    const countLeaves = (n: OutlineSyntaxNode): number => {
      const ch = (n.children ?? []).filter((c) => c.text.trim().length > 0 || (c.children?.length ?? 0) > 0);
      return ch.length === 0 ? 1 : ch.reduce((acc, c) => acc + countLeaves(c), 0);
    };
    const ancEntry = { text: node.text.trim(), totalLeaves: countLeaves(node), consumed: 0 };
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

  const compiledRows: StructuredTableBlockDef["rows"] = [];
  // Track cell references per (rowIdx, colIdx) for `[^]` up-merge
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
          backgroundColor: "#e6ecf5",
        };
        cells.push(cell);
        gridRow[colCursor] = cell;
      } else {
        // Covered by ancestor rowspan above
        gridRow[colCursor] = cellGrid[rIdx - 1]?.[colCursor] ?? null;
      }
      colCursor += 1;
    });

    // 2. Leaf cells separated by `|`
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

      const isEmpty = trimmed === emptySym;
      const nextTok = raw.leafTokens[tIdx + 1]?.trim();
      // Form-table heuristic: first leaf cell OR cell immediately preceding `[-]` is a header label
      const isFormHeader = !isEmpty && (tIdx === 0 || nextTok === emptySym);
      const cellId = `${rowId}_c${colCursor + 1}`;
      const slotId = `slot_${cellId}`;
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
        backgroundColor: isFormHeader ? "#e6ecf5" : undefined,
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

  const colWidthPct = `${Math.floor((100 / Math.max(1, maxCols)) * 10) / 10}%`;
  const headingMatch = VIEW_TAG_RE.exec(tableNode.text.trim());
  const tableTitle = headingMatch?.[3]?.trim() || "표";

  return {
    blockId: `${idPrefix}_table`,
    kind: "structured-table",
    title: tableTitle,
    columnWidths: Array.from({ length: maxCols }, () => colWidthPct),
    borderRules: {
      outer: "1px solid #94a3b8",
      headerBottom: "1px solid #94a3b8",
      rowBottom: "1px solid #cbd5e1",
      vertical: "1px solid #cbd5e1",
      radius: "0px",
    },
    headerStyle: {
      bg: "#e6ecf5",
      textColor: "#1e293b",
      fontWeight: "600",
      padding: "8px 10px",
    },
    cellPadding: "8px 10px",
    rows: compiledRows,
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

/**
 * 아웃라인 문서(`.outline`)의 `<<view:section>>` 노드들을 CRUD 레지스트리 규칙에 따라
 * `blog`(또는 지정 프로파일) 포맷 `VDocDocument` 로 컴파일한다.
 */
export function compileOutlineToVDoc(
  outline: OutlineSyntaxDocument,
  options: CompileOutlineToVDocOptions = {}
): VDocDocument {
  const registry = options.registry ?? createElementSyntaxRegistry();
  const profileId = options.profileId ?? "blog";
  const profile = registry.getProfile(profileId);
  const viewProfile = getDocumentView(profileId) ?? BLOG_DOCUMENT_VIEW;
  const now = options.now ?? new Date().toISOString();
  const docId = options.docId ?? `vdoc-${profileId}-${Date.now().toString(36)}`;

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

  const defaultSkin = sectionDef?.skins?.[sectionDef.defaultSkin];
  const usesExternalStyleEngine = Boolean(options.styleRef);
  const defaultAlign = defaultSkin?.align ?? "center";
  const defaultImageGap = defaultSkin?.imageGap ?? 4;

  const variables: Record<string, string> = {};
  let docTitle = outline.title || "Untitled Blog";
  const slots: Record<string, VDocSlot> = {};
  const pages: VDocPage[] = [];

  let blockSeq = 0;
  const nextId = (prefix: string) => `${prefix}_${++blockSeq}`;

  const pushPlainTextBlock = (
    blocks: LayoutBlock[],
    text: string,
    title: string,
    align: "left" | "center" | "right" = defaultAlign
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
    };
    blocks.push(blk);
  };

  const compileSectionChild = (node: OutlineSyntaxNode, blocks: LayoutBlock[]) => {
    const raw = node.text.trim();
    if (!raw && !(node.children?.length)) return;

    // 1. Nested <<view:...>> inside a section (e.g. <<view:table>> or unknown fallback)
    const nestedView = VIEW_TAG_RE.exec(raw);
    if (nestedView) {
      const nestedTag = nestedView[1].toLowerCase();
      if (nestedTag === "table" && tableDef) {
        const tbl = compileTableOutlineNode(node, slots, registry, nextId("tbl"));
        blocks.push(tbl);
        return;
      }
      // Fallback for deleted or unregistered custom view tags
      const fallbackLines = flattenNodeTextLines(node);
      for (const line of fallbackLines) {
        pushPlainTextBlock(blocks, line, `폴백(${nestedTag})`, "left");
      }
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
      };
      blocks.push(divBlk);
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
          ...(usesExternalStyleEngine ? {} : { align: "center" as const }),
        };
        blocks.push(callout);
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
        };
        blocks.push(callout);
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
      };
      blocks.push(linkBlk);
      return;
    }

    // 5. Frame / Quote (`>`)
    if (frameSym && raw.startsWith(frameSym)) {
      const titleText = raw.slice(frameSym.length).trim();
      const children = (node.children ?? []).filter((c) => c.text.trim().length > 0);
      const blockId = nextId("blk_frame");
      const slotId = `slot_${blockId}`;

      if (children.length === 0) {
        // Standalone quote
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
          ...(usesExternalStyleEngine ? {} : { align: "center" as const }),
        };
        blocks.push(quoteBlk);
      } else {
        // Framed info card with Key :: Value children
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
        };
        blocks.push(infoBlk);
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
      };
      blocks.push(accentBlk);
      return;
    }

    // 7. Horizontal Split (`|`) — e.g. `[img:A] | [img:B]` or `[img:A] | 텍스트`
    const splitParts = splitOutsideBrackets(raw, splitSym);
    if (splitParts.length > 1) {
      const blockId = nextId("blk_grid");
      const columns: GridColumnDef[] = [];
      const widths: string[] = [];

      splitParts.forEach((part, idx) => {
        const parsedImg = parseImageBracket(part, imgSym, options.mediaMap);
        if (parsedImg) {
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
      };
      blocks.push(gridBlk);
      return;
    }

    // 8. Standalone Image Slot (`[img:설명]` or `[img:설명 -> url]`)
    const singleImg = parseImageBracket(raw, imgSym, options.mediaMap);
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
      };
      blocks.push(imgBlk);
      return;
    }

    // 9. Standalone Key :: Value line outside frame
    const kvIdx = kvSym ? raw.indexOf(kvSym) : -1;
    if (kvIdx > 0) {
      const k = raw.slice(0, kvIdx).trim();
      const v = raw.slice(kvIdx + kvSym.length).trim();
      pushPlainTextBlock(blocks, `${k} : ${v}`, k, "left");
      return;
    }

    // 10. Regular paragraph text (with optional inline `==강조==`)
    pushPlainTextBlock(blocks, raw, raw.slice(0, 26), defaultAlign);
  };

  let sectionIndex = 0;

  for (const rootNode of outline.rootNodes) {
    const raw = rootNode.text.trim();
    if (!raw) continue;

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

    const viewMatch = VIEW_TAG_RE.exec(raw);
    if (viewMatch) {
      const tag = viewMatch[1].toLowerCase();
      const role = viewMatch[2]?.toLowerCase();
      const label = viewMatch[3]?.trim() || (role ? `섹션 (${role})` : `섹션 ${sectionIndex + 1}`);

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
          // Safe fallback if `"section"` definition was deleted from the CRUD registry!
          for (const line of flattenNodeTextLines(rootNode)) {
            pushPlainTextBlock(blocks, line, "섹션 폴백", "left");
          }
        }

        pages.push({
          pageId,
          pageNumber: sectionIndex,
          pageLabel: label,
          unitKind: "section",
          sectionRole: role || "body",
          outlineDsl: flattenNodeTextLines(rootNode),
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

      // Top-level <<view:table>> or unknown view tag wrapped in a section
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
      pages.push({
        pageId,
        pageNumber: sectionIndex,
        pageLabel: label,
        unitKind: profile?.unitKind ?? viewProfile.unitKind,
        sectionRole: tag,
        outlineDsl: flattenNodeTextLines(rootNode),
        headerSlotId,
        footerSlotId,
        hideHeaderFooter: true,
        blocks,
      });
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
    pages.push({
      pageId,
      pageNumber: sectionIndex,
      pageLabel: raw.slice(0, 32),
      unitKind: profile?.unitKind ?? viewProfile.unitKind,
      headerSlotId,
      footerSlotId,
      hideHeaderFooter: true,
      blocks,
    });
  }

  const schemaRef: VDocSchemaRef = {
    profileId,
    registryPath: options.registryPath,
    registryVersion: registry.getVersion(),
    elementIds: profile?.allowedElementIds ?? ["section", "table"],
  };

  return {
    version: "1.0.0",
    docId,
    title: docTitle,
    viewId: profileId,
    surface: profile ? { ...profile.surface } : { ...viewProfile.surface },
    genre: profileId === "a4" ? "document" : profileId,
    status: "Draft",
    updatedAt: now,
    schemaRef,
    ...(options.styleRef ? { styleRef: options.styleRef } : {}),
    sourceRef: options.sourceRef,
    origin: {
      createdBy: "import",
      createdAt: now,
    },
    variables,
    pages,
    slots,
    backdata: {},
  };
}

/**
 * 정비된 `VDocDocument` 를 현재 `ElementSyntaxRegistry` 의 기호 체계로 역추출하여
 * `.outline` 문서 구조를 생성한다 (양방향 라운드트립 검증용).
 */
export function extractOutlineFromVDoc(
  doc: VDocDocument,
  registry: ElementSyntaxRegistry = createElementSyntaxRegistry()
): OutlineSyntaxDocument {
  const splitSym = registry.resolveSymbol("section", "horizontal-split", "|");
  const frameSym = registry.resolveSymbol("section", "frame-box", ">");
  const accentSym = registry.resolveSymbol("section", "accent-bar", "!");
  const kvSym = registry.resolveSymbol("section", "kv-meta", "::");
  const dividerSym = registry.resolveSymbol("section", "divider-line", "---");
  const imgTag = registry.resolveSymbol("section", "image-slot", "[img]").replace(/^\[|\]$/g, "");
  const ctaTag = registry.resolveSymbol("section", "cta-slot", "[cta]").replace(/^\[|\]$/g, "");
  const embedTag = registry.resolveSymbol("section", "embed-slot", "[embed]").replace(/^\[|\]$/g, "");

  let seq = 0;
  const nid = () => `ext_${++seq}`;

  const rootNodes: OutlineSyntaxNode[] = [];
  const varEntries = Object.entries(doc.variables ?? {});
  if (doc.title || varEntries.length > 0) {
    rootNodes.push({
      id: nid(),
      text: `문서 메타 ${kvSym} ${doc.title}`,
      children: varEntries.map(([k, v]) => ({
        id: nid(),
        text: `${k} ${kvSym} ${v}`,
        children: [],
      })),
    });
  }

  for (const page of doc.pages) {
    const roleSuffix = page.sectionRole && page.sectionRole !== "body" ? `:${page.sectionRole}` : "";
    const sectionHeader = `<<view:section${roleSuffix}>> ${page.pageLabel}`.trim();
    const children: OutlineSyntaxNode[] = [];

    for (const blk of page.blocks) {
      if (blk.kind === "image") {
        const label = blk.alt || blk.title || "이미지";
        children.push({
          id: nid(),
          text: `[${imgTag}:${label}]`,
          children: blk.caption ? [{ id: nid(), text: blk.caption, children: [] }] : [],
        });
      } else if (blk.kind === "columns-grid") {
        const cols = blk.columns ?? [];
        const parts = cols.map((col) => {
          if (col.image) {
            return `[${imgTag}:${col.image.alt || "이미지"}]`;
          }
          if (col.slotId && doc.slots[col.slotId]) {
            return htmlToPlainText(doc.slots[col.slotId].content).trim();
          }
          return "";
        });
        children.push({
          id: nid(),
          text: parts.join(` ${splitSym} `),
          children: [],
        });
      } else if (blk.kind === "callout-box") {
        const text = htmlToPlainText(doc.slots[blk.slotId]?.content ?? "").trim();
        if (blk.variant === "disclosure") {
          children.push({
            id: nid(),
            text: `[${embedTag}:disclosure | ${text}]`,
            children: [],
          });
        } else if (blk.variant === "accent-bar") {
          children.push({
            id: nid(),
            text: `${accentSym} ${text}`,
            children: [],
          });
        } else if (blk.variant === "info-frame") {
          const kvChildren: OutlineSyntaxNode[] = (blk.kvItems ?? []).map((kv) => ({
            id: nid(),
            text: `${kv.key} ${kvSym} ${kv.value}`,
            children: [],
          }));
          children.push({
            id: nid(),
            text: `${frameSym} ${text}`,
            children: kvChildren,
          });
        } else {
          children.push({
            id: nid(),
            text: `${frameSym} ${text}`,
            children: [],
          });
        }
      } else if (blk.kind === "link-card") {
        const label = htmlToPlainText(doc.slots[blk.slotId]?.content ?? "").trim() || blk.title || "링크";
        children.push({
          id: nid(),
          text: `[${ctaTag}:${label} -> ${blk.url}]`,
          children: [],
        });
      } else if (blk.kind === "divider") {
        children.push({
          id: nid(),
          text: dividerSym,
          children: [],
        });
      } else if (blk.kind === "structured-table") {
        const tblRows: OutlineSyntaxNode[] = blk.rows.map((r) => ({
          id: nid(),
          text: r.cells
            .map((c) => {
              const t = htmlToPlainText(doc.slots[c.slotId]?.content ?? "").trim();
              return t || "[-]";
            })
            .join(" | "),
          children: [],
        }));
        children.push({
          id: nid(),
          text: `<<view:table>> ${blk.title || ""}`.trim(),
          children: tblRows,
        });
      } else if ("slotId" in blk && typeof blk.slotId === "string" && doc.slots[blk.slotId]) {
        const text = htmlToPlainText(doc.slots[blk.slotId].content).trim();
        if (text) {
          children.push({ id: nid(), text, children: [] });
        }
      }
    }

    rootNodes.push({
      id: nid(),
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

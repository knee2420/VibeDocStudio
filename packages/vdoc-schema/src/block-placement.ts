/**
 * @vibe/vdoc-schema — 캔버스 블록 배치 · 붙여넣기 좌표 · 정렬 가이드 스냅 · Y 위치 삽입 순수 연산.
 */
import type { BlockFrameRect, LayoutBlockKind } from "./base-block";
import {
  A4_PAGE_HEIGHT_PX,
  A4_PAGE_WIDTH_PX,
  DEFAULT_PAGE_MARGIN_NO_HF,
  DEFAULT_PAGE_MARGIN_WITH_HF,
  DEFAULT_SNAP_THRESHOLD_PX,
  PASTE_FRAME_OFFSET_PX,
} from "./layout-constants";
import type { LayoutBlock, VDocPage } from "./types";

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SnapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageSnapBox {
  width: number;
  height: number;
  margin: PageMargins;
}

export interface AlignmentGuideLine {
  axis: "vertical" | "horizontal";
  pos: number;
  start: number;
  end: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: AlignmentGuideLine[];
}

export interface PastePlacementContext {
  sourcePageId?: string | null;
  sourceFrame?: BlockFrameRect | null;
  selectedBlockId?: string | null;
  /** 같은 복사본을 동일 고정 페이지에 연달아 붙여넣은 횟수 (`1, 2, 3...`). */
  pasteCount?: number;
  /** 고정 블록 중 `frame.h` 가 없는 블록의 실측 높이(px). */
  blockHeights?: Record<string, number>;
}

export interface PlacedBlockResult {
  block: LayoutBlock;
  /** 일반(flow) 페이지에서의 삽입 인덱스. 고정 좌표 페이지는 끝(append)이라 `undefined`. */
  atIndex?: number;
}

export interface FlowGap {
  index: number;
  y: number;
}

export interface InsertAtYContext {
  flowGaps?: readonly FlowGap[];
  defaultHeight?: number;
}

export interface InsertAtYResult {
  block: LayoutBlock;
  atIndex?: number;
}

const MIN_BLOCK_SIZE = 24;
const FALLBACK_BLOCK_HEIGHT = 72;

const DEFAULT_HEIGHT_BY_KIND: Partial<Record<LayoutBlockKind, number>> = {
  text: 48,
  heading: 48,
  "form-title": 56,
  image: 180,
  "structured-table": 140,
  table: 140,
  "columns-grid": 96,
  "section-block": 120,
  "fillable-group": 72,
  "composite-form-frame": 220,
  "summary-list": 110,
  "cover-banner": 240,
  "callout-box": 84,
};

export function getDefaultBlockFrameHeight(kind: LayoutBlockKind | string): number {
  return DEFAULT_HEIGHT_BY_KIND[kind as LayoutBlockKind] ?? FALLBACK_BLOCK_HEIGHT;
}

export interface PageDimensionsPx {
  width: number;
  height: number;
}

const MIN_PAGE_DIM_PX = 240;

function toCssPx(value: number, unit: "px" | "pt" | "mm" | "%" | undefined, fallbackPx: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallbackPx;
  if (unit === "pt") return Math.max(MIN_PAGE_DIM_PX, Math.round(value * (96 / 72)));
  if (unit === "mm") return Math.max(MIN_PAGE_DIM_PX, Math.round(value * (96 / 25.4)));
  if (unit === "%") return fallbackPx;
  return Math.max(MIN_PAGE_DIM_PX, Math.round(value));
}

/** 페이지 `pageRect` 규격(미지정 시 A4 794×1123px)을 96dpi CSS px 단위로 해석한다. */
export function resolvePageDimensionsPx(page?: Pick<VDocPage, "pageRect"> | null): PageDimensionsPx {
  const rect = page?.pageRect;
  if (!rect) {
    return { width: A4_PAGE_WIDTH_PX, height: A4_PAGE_HEIGHT_PX };
  }
  return {
    width: toCssPx(rect.width, rect.unit, A4_PAGE_WIDTH_PX),
    height: toCssPx(rect.height, rect.unit, A4_PAGE_HEIGHT_PX),
  };
}

/** 페이지 여백(px)을 반환한다 (`layout.margin` 우선, 생략 시 시트 기본 패딩과 동일). */
export function resolvePageMargins(page: Pick<VDocPage, "layout" | "hideHeaderFooter">): PageMargins {
  if (page.layout?.margin) {
    return {
      top: page.layout.margin.top,
      right: page.layout.margin.right,
      bottom: page.layout.margin.bottom,
      left: page.layout.margin.left,
    };
  }
  return page.hideHeaderFooter ? { ...DEFAULT_PAGE_MARGIN_NO_HF } : { ...DEFAULT_PAGE_MARGIN_WITH_HF };
}

/** 페이지 본문 너비(px). */
export function getPageContentWidth(page: Pick<VDocPage, "layout" | "hideHeaderFooter" | "pageRect">): number {
  const m = resolvePageMargins(page);
  const { width } = resolvePageDimensionsPx(page);
  return Math.max(MIN_BLOCK_SIZE, Math.round(width - m.left - m.right));
}

/** 고정 좌표(`frame`) 블록이 하나라도 있으면 고정 좌표 페이지로 다룬다. */
export function isFramedPage(page: Pick<VDocPage, "blocks">): boolean {
  return page.blocks.some((b) => Boolean(b.frame));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 블록 프레임을 페이지(`pageRect` 또는 A4 794×1123px) 경계 안으로 제한한다. */
export function clampFrameToPage(
  frame: BlockFrameRect,
  fallbackHeight = 40,
  pageDims: PageDimensionsPx = { width: A4_PAGE_WIDTH_PX, height: A4_PAGE_HEIGHT_PX }
): BlockFrameRect {
  const w = Math.round(clampNumber(frame.w, MIN_BLOCK_SIZE, pageDims.width));
  const h =
    frame.h !== undefined
      ? Math.round(clampNumber(frame.h, MIN_BLOCK_SIZE, pageDims.height))
      : undefined;
  const effectiveH = h ?? Math.round(clampNumber(fallbackHeight, MIN_BLOCK_SIZE, pageDims.height));
  const x = Math.round(clampNumber(frame.x, 0, Math.max(0, pageDims.width - w)));
  const y = Math.round(clampNumber(frame.y, 0, Math.max(0, pageDims.height - effectiveH)));
  return {
    x,
    y,
    w,
    ...(h !== undefined ? { h } : {}),
    ...(frame.zIndex !== undefined ? { zIndex: frame.zIndex } : {}),
  };
}

/** HTML 본문에서 `data-variable` 및 `{{key}}` 변수 키를 추출한다 (`page-ops` 와 동일 규칙). */
export function extractBlockVariableKeys(html: string): string[] {
  if (!html) return [];
  const keys = new Set<string>();
  const dataVarRe = /data-variable=["']([^"']+)["']/gi;
  for (const m of html.matchAll(dataVarRe)) {
    const k = m[1]?.trim();
    if (k) keys.add(k);
  }
  const mustacheRe = /\{\{\s*([^{}\s]+)\s*\}\}/g;
  for (const m of html.matchAll(mustacheRe)) {
    const k = m[1]?.trim();
    if (k) keys.add(k);
  }
  return [...keys];
}

/** 대상 문서에 없는 변수 키만 원본 변수 맵에서 병합한다. 바뀐 게 없으면 `targetVars` 참조를 유지한다. */
export function mergeMissingVariables(
  targetVars: Record<string, string>,
  sourceVars: Record<string, string>,
  slotHtmlList: readonly string[]
): Record<string, string> {
  let nextVars = targetVars;
  let changed = false;
  for (const html of slotHtmlList) {
    for (const key of extractBlockVariableKeys(html)) {
      if (!(key in nextVars) && key in sourceVars) {
        if (!changed) {
          nextVars = { ...targetVars };
          changed = true;
        }
        nextVars[key] = sourceVars[key];
      }
    }
  }
  return nextVars;
}

/**
 * 붙여넣기·복제 시 복사한 블록과 대상 페이지 성질(고정 좌표 vs 일반)에 따라 좌표와 삽입 순서를 결정한다.
 */
export function placePastedBlock(
  targetPage: VDocPage,
  block: LayoutBlock,
  ctx: PastePlacementContext = {}
): PlacedBlockResult {
  const targetIsFramed = isFramedPage(targetPage);
  const sourceFrame = ctx.sourceFrame ?? block.frame;
  const sourceIsFramed = Boolean(sourceFrame);

  if (targetIsFramed) {
    const pageDims = resolvePageDimensionsPx(targetPage);
    if (sourceIsFramed && sourceFrame) {
      const samePage = Boolean(ctx.sourcePageId && ctx.sourcePageId === targetPage.pageId);
      const count = samePage ? Math.max(1, ctx.pasteCount ?? 1) : 0;
      const offset = PASTE_FRAME_OFFSET_PX * count;
      const nextFrame = clampFrameToPage(
        {
          ...sourceFrame,
          x: sourceFrame.x + offset,
          y: sourceFrame.y + offset,
        },
        getDefaultBlockFrameHeight(block.kind),
        pageDims
      );
      return { block: { ...block, frame: nextFrame }, atIndex: undefined };
    }

    // 일반 -> 고정 좌표: x = 페이지 왼쪽 여백, y = 선택한 블록 아래 + 16px(없으면 위쪽 여백), 너비 = 본문 너비
    const margins = resolvePageMargins(targetPage);
    const width = getPageContentWidth(targetPage);
    const selected = ctx.selectedBlockId
      ? targetPage.blocks.find((b) => b.blockId === ctx.selectedBlockId)
      : undefined;
    let y = margins.top;
    if (selected?.frame) {
      const selH =
        selected.frame.h ?? ctx.blockHeights?.[selected.blockId] ?? getDefaultBlockFrameHeight(selected.kind);
      y = selected.frame.y + selH + PASTE_FRAME_OFFSET_PX;
    }
    const nextFrame = clampFrameToPage(
      { x: margins.left, y, w: width },
      getDefaultBlockFrameHeight(block.kind),
      pageDims
    );
    return { block: { ...block, frame: nextFrame }, atIndex: undefined };
  }

  // 일반 페이지(일반 -> 일반, 고정 좌표 -> 일반): 좌표를 버리고 선택 블록 바로 뒤 또는 페이지 끝에 넣는다.
  const { frame: _droppedFrame, ...flowBlock } = block;
  const selectedIdx = ctx.selectedBlockId
    ? targetPage.blocks.findIndex((b) => b.blockId === ctx.selectedBlockId)
    : -1;
  const atIndex = selectedIdx >= 0 ? selectedIdx + 1 : targetPage.blocks.length;
  return { block: flowBlock as LayoutBlock, atIndex };
}

interface CandidateLine {
  pos: number;
  start: number;
  end: number;
}

function mergeAxisGuides(
  axis: "vertical" | "horizontal",
  edges: readonly number[],
  candidates: readonly CandidateLine[]
): AlignmentGuideLine[] {
  const byPos = new Map<number, { start: number; end: number }>();
  for (const edge of edges) {
    for (const cand of candidates) {
      if (Math.abs(cand.pos - edge) <= 0.5) {
        const key = Math.round(cand.pos * 10) / 10;
        const prev = byPos.get(key);
        if (!prev) {
          byPos.set(key, { start: cand.start, end: cand.end });
        } else {
          prev.start = Math.min(prev.start, cand.start);
          prev.end = Math.max(prev.end, cand.end);
        }
      }
    }
  }
  return [...byPos.entries()].map(([pos, span]) => ({
    axis,
    pos,
    start: span.start,
    end: span.end,
  }));
}

/**
 * 고정 좌표 블록 드래그 중 6개 기준선(좌·중앙·우 / 상·중앙·하)을
 * 같은 페이지 형제 블록·여백·페이지 중앙에 `threshold`px 이내로 스냅하고 가이드선을 반환한다.
 */
export function snapFrame(
  moving: SnapRect,
  others: readonly SnapRect[],
  pageBox: PageSnapBox,
  threshold = DEFAULT_SNAP_THRESHOLD_PX,
  disableSnap = false
): SnapResult {
  const clampX = (val: number) => Math.round(clampNumber(val, 0, Math.max(0, pageBox.width - moving.w)));
  const clampY = (val: number) => Math.round(clampNumber(val, 0, Math.max(0, pageBox.height - moving.h)));

  if (disableSnap || threshold <= 0) {
    return { x: clampX(moving.x), y: clampY(moving.y), guides: [] };
  }

  const movingXEdges = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const xCandidates: CandidateLine[] = [
    { pos: pageBox.margin.left, start: 0, end: pageBox.height },
    { pos: pageBox.width / 2, start: 0, end: pageBox.height },
    { pos: pageBox.width - pageBox.margin.right, start: 0, end: pageBox.height },
  ];
  for (const o of others) {
    const spanStart = Math.min(moving.y, o.y);
    const spanEnd = Math.max(moving.y + moving.h, o.y + o.h);
    xCandidates.push(
      { pos: o.x, start: spanStart, end: spanEnd },
      { pos: o.x + o.w / 2, start: spanStart, end: spanEnd },
      { pos: o.x + o.w, start: spanStart, end: spanEnd }
    );
  }

  let bestXDelta = 0;
  let bestXDist = threshold + 0.0001;
  let snappedXAxis = false;
  for (const edge of movingXEdges) {
    for (const cand of xCandidates) {
      const dist = Math.abs(cand.pos - edge);
      if (dist <= threshold && dist < bestXDist) {
        bestXDist = dist;
        bestXDelta = cand.pos - edge;
        snappedXAxis = true;
      }
    }
  }

  const nextX = clampX(snappedXAxis ? moving.x + bestXDelta : moving.x);
  const effectiveSnappedX = snappedXAxis && Math.abs(nextX - Math.round(moving.x + bestXDelta)) <= 1;

  const movingYEdges = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];
  const yCandidates: CandidateLine[] = [
    { pos: pageBox.margin.top, start: 0, end: pageBox.width },
    { pos: pageBox.height / 2, start: 0, end: pageBox.width },
    { pos: pageBox.height - pageBox.margin.bottom, start: 0, end: pageBox.width },
  ];
  for (const o of others) {
    const spanStart = Math.min(nextX, o.x);
    const spanEnd = Math.max(nextX + moving.w, o.x + o.w);
    yCandidates.push(
      { pos: o.y, start: spanStart, end: spanEnd },
      { pos: o.y + o.h / 2, start: spanStart, end: spanEnd },
      { pos: o.y + o.h, start: spanStart, end: spanEnd }
    );
  }

  let bestYDelta = 0;
  let bestYDist = threshold + 0.0001;
  let snappedYAxis = false;
  for (const edge of movingYEdges) {
    for (const cand of yCandidates) {
      const dist = Math.abs(cand.pos - edge);
      if (dist <= threshold && dist < bestYDist) {
        bestYDist = dist;
        bestYDelta = cand.pos - edge;
        snappedYAxis = true;
      }
    }
  }

  const nextY = clampY(snappedYAxis ? moving.y + bestYDelta : moving.y);
  const effectiveSnappedY = snappedYAxis && Math.abs(nextY - Math.round(moving.y + bestYDelta)) <= 1;

  const guides: AlignmentGuideLine[] = [];
  if (effectiveSnappedX) {
    const finalXEdges = [nextX, nextX + moving.w / 2, nextX + moving.w];
    guides.push(...mergeAxisGuides("vertical", finalXEdges, xCandidates));
  }
  if (effectiveSnappedY) {
    const finalYEdges = [nextY, nextY + moving.h / 2, nextY + moving.h];
    guides.push(...mergeAxisGuides("horizontal", finalYEdges, yCandidates));
  }

  return { x: nextX, y: nextY, guides };
}

/** 주어진 Y 좌표와 가장 가까운 일반 페이지 블록 간 틈을 고른다. */
export function findNearestFlowGap(gaps: readonly FlowGap[], pointerY: number): FlowGap | null {
  if (gaps.length === 0) return null;
  let best = gaps[0];
  let bestDist = Math.abs(best.y - pointerY);
  for (let i = 1; i < gaps.length; i++) {
    const dist = Math.abs(gaps[i].y - pointerY);
    if (dist < bestDist) {
      best = gaps[i];
      bestDist = dist;
    }
  }
  return best;
}

/**
 * 플로팅 `+` 메뉴에서 새 블록을 `y` 높이에 삽입할 때의 블록 프레임/순서를 결정한다.
 */
export function insertAtY(
  page: VDocPage,
  y: number,
  block: LayoutBlock,
  ctx: InsertAtYContext = {}
): InsertAtYResult {
  if (isFramedPage(page)) {
    const pageDims = resolvePageDimensionsPx(page);
    const margins = resolvePageMargins(page);
    const width = getPageContentWidth(page);
    const height = ctx.defaultHeight ?? getDefaultBlockFrameHeight(block.kind);
    const frame = clampFrameToPage({ x: margins.left, y, w: width, h: height }, height, pageDims);
    return { block: { ...block, frame }, atIndex: undefined };
  }

  const { frame: _droppedFrame, ...flowBlock } = block;
  const nearest = ctx.flowGaps ? findNearestFlowGap(ctx.flowGaps, y) : null;
  const atIndex = nearest ? nearest.index : page.blocks.length;
  return { block: flowBlock as LayoutBlock, atIndex };
}


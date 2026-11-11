/**
 * @vibe/vdoc-schema — 페이지 단위 순수 문서 연산 (삽입 · 템플릿 가져오기 · 복제 · 이름 변경 · 삭제).
 *
 * - 모든 구조 변경 뒤에는 `pageNumber` 를 `1..N` 으로 다시 매긴다.
 * - `preview.pageThumbnails` 도 페이지 삽입 · 삭제 위치에 맞춰 함께 끼우거나 뺀다 (썸네일 밀림 방지).
 * - 같은 문서 내 사본 복제는 머리말 · 바닥글 · 백데이터 참조를 유지하고,
 *   다른 문서에서 가져올 때는 고아 참조를 비우며 미정의 `{{변수}}` 만 병합한다.
 */
import { cloneBlockWithSlots, getBlockSlotIds, iterPageSlotIds } from "./block-ops";
import type { IdFactory } from "./document-ops";
import type { BackdataChunk, LayoutBlock, VDocDocument, VDocPage, VDocSlot } from "./types";

function renumberPages(pages: VDocPage[]): VDocPage[] {
  return pages.map((page, index) => {
    const nextNumber = index + 1;
    return page.pageNumber === nextNumber ? page : { ...page, pageNumber: nextNumber };
  });
}

function clampIndex(index: number | undefined, length: number): number {
  if (index === undefined) return length;
  return Math.max(0, Math.min(length, index));
}

/** HTML 본문에서 Tiptap 변수 칩(`data-variable="..."`)과 평문 머스타시(`{{key}}`) 키를 모두 추출한다. */
function extractVariableKeys(html: string): string[] {
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

function spliceThumbnailsOnInsert(
  existing: string[] | undefined,
  prevPageCount: number,
  insertAt: number,
  insertedThumbnails: string[]
): string[] | undefined {
  const hasAnyInserted = insertedThumbnails.some((t) => Boolean(t));
  if (!existing && !hasAnyInserted) return undefined;
  // 기존 썸네일이 페이지 수보다 적더라도 뒤쪽 삽입 시 밀리지 않게 기존 길이 기준으로 패딩한다.
  const base = Array.from({ length: prevPageCount }, (_, i) => existing?.[i] ?? "");
  base.splice(insertAt, 0, ...insertedThumbnails);
  return base;
}

/**
 * 새 페이지 목록과 슬롯 맵을 `doc.pages` 의 지정 위치(`atIndex`, 생략 시 끝)에 삽입한다.
 * `thumbnails` 를 함께 넘기면 `preview.pageThumbnails` 를 같은 순번에 맞춘다.
 */
export function insertPages(
  doc: VDocDocument,
  pagesToInsert: VDocPage[],
  newSlots: Record<string, VDocSlot>,
  atIndex?: number,
  thumbnails?: string[]
): VDocDocument {
  if (pagesToInsert.length === 0) return doc;
  const insertAt = clampIndex(atIndex, doc.pages.length);
  const nextPagesRaw = [...doc.pages];
  nextPagesRaw.splice(insertAt, 0, ...pagesToInsert);
  const nextPages = renumberPages(nextPagesRaw);

  const insertedThumbs = pagesToInsert.map((_, i) => thumbnails?.[i] ?? "");
  const nextThumbnails = spliceThumbnailsOnInsert(
    doc.preview?.pageThumbnails,
    doc.pages.length,
    insertAt,
    insertedThumbs
  );
  const nextPreview =
    nextThumbnails !== undefined
      ? { ...doc.preview, pageThumbnails: nextThumbnails }
      : doc.preview;

  return {
    ...doc,
    pages: nextPages,
    slots: { ...doc.slots, ...newSlots },
    ...(nextPreview ? { preview: nextPreview } : {}),
    updatedAt: new Date().toISOString(),
  };
}

export interface ImportPagesOptions {
  /** 다른 문서(템플릿 · PDF)에서 가져오는지 여부. 생략 시 `target.docId !== source.docId` 로 판단한다. */
  fromOtherDocument?: boolean;
  /** 다른 문서에서 가져올 때 `backDataRefs` 가 가리키는 `backdata` 청크도 함께 복사할지 여부 (기본 `false`: 참조 비움). */
  copyBackdata?: boolean;
  /** 복제되는 페이지 라벨 변환기 (예: 사본 이름 붙이기). */
  labelTransform?: (label: string, page: VDocPage) => string;
}

interface ClonePageUnitContext {
  sourceSlots: Record<string, VDocSlot>;
  sourceVariables: Record<string, string>;
  sourceBackdata: Record<string, BackdataChunk>;
  newId: IdFactory;
  fromOther: boolean;
  copyBackdata: boolean;
  sharedHeaderFooterMap: Map<string, string>;
  nextVariables: Record<string, string>;
  nextBackdata: Record<string, BackdataChunk>;
  variablesChanged: boolean;
  backdataChanged: boolean;
  addedSlots: Record<string, VDocSlot>;
}

function sanitizeImportedSlot(orig: VDocSlot, newSlotId: string, ctx: ClonePageUnitContext, keepCopySuffix: boolean): VDocSlot {
  if (ctx.fromOther) {
    for (const key of extractVariableKeys(orig.content)) {
      if (!(key in ctx.nextVariables) && key in ctx.sourceVariables) {
        ctx.nextVariables[key] = ctx.sourceVariables[key];
        ctx.variablesChanged = true;
      }
    }
    const nextRefs: string[] = [];
    if (ctx.copyBackdata) {
      for (const refId of orig.backDataRefs) {
        nextRefs.push(refId);
        if (!(refId in ctx.nextBackdata) && ctx.sourceBackdata[refId]) {
          ctx.nextBackdata[refId] = { ...ctx.sourceBackdata[refId], tags: [...ctx.sourceBackdata[refId].tags] };
          ctx.backdataChanged = true;
        }
      }
    }
    return {
      slotId: newSlotId,
      label: orig.label,
      role: orig.role,
      content: orig.content,
      ...(orig.assignee ? { assignee: orig.assignee } : {}),
      ...(orig.constraints ? { constraints: { ...orig.constraints } } : {}),
      backDataRefs: nextRefs,
      ...(orig.rect ? { rect: { ...orig.rect } } : {}),
    };
  }

  return {
    ...orig,
    slotId: newSlotId,
    label: keepCopySuffix ? orig.label : orig.label.replace(/ \(복제\)$/, ""),
    backDataRefs: [...orig.backDataRefs],
    ...(orig.constraints ? { constraints: { ...orig.constraints } } : {}),
    ...(orig.rect ? { rect: { ...orig.rect } } : {}),
    ...(orig.fill ? { fill: { ...orig.fill } } : {}),
  };
}

function resolveImportedHeaderFooterSlot(slotId: string, ctx: ClonePageUnitContext): string {
  if (!ctx.fromOther) return slotId;
  const cached = ctx.sharedHeaderFooterMap.get(slotId);
  if (cached) return cached;
  const orig = ctx.sourceSlots[slotId];
  const clonedId = `${slotId}_imp_${ctx.newId()}`;
  ctx.sharedHeaderFooterMap.set(slotId, clonedId);
  if (orig) {
    ctx.addedSlots[clonedId] = sanitizeImportedSlot(orig, clonedId, ctx, false);
  }
  return clonedId;
}

function cloneImportedPageUnit(
  page: VDocPage,
  ctx: ClonePageUnitContext,
  opts?: { preservePageId?: string; pageNumber?: number; labelTransform?: (label: string, page: VDocPage) => string }
): VDocPage {
  const nextPageId = opts?.preservePageId ?? `page_${ctx.newId()}`;
  const nextHeaderId = page.headerSlotId ? resolveImportedHeaderFooterSlot(page.headerSlotId, ctx) : page.headerSlotId;
  const nextFooterId = page.footerSlotId ? resolveImportedHeaderFooterSlot(page.footerSlotId, ctx) : page.footerSlotId;

  const clonedBlocks: LayoutBlock[] = [];
  for (const block of page.blocks) {
    const { block: clonedBlock, slots: mergedSourceSlots } = cloneBlockWithSlots(block, ctx.sourceSlots, ctx.newId);
    clonedBlocks.push(clonedBlock);
    for (const sid of getBlockSlotIds(clonedBlock)) {
      const clonedSlot = mergedSourceSlots[sid];
      if (!clonedSlot) continue;
      if (ctx.fromOther) {
        // 타 문서 임포트 시 `cloneBlockWithSlots` 가 붙인 `(복제)` 를 떼고 원본 라벨을 보존하며 참조/편집상태 초기화
        ctx.addedSlots[sid] = sanitizeImportedSlot(
          { ...clonedSlot, label: clonedSlot.label.replace(/ \(복제\)$/, "") },
          sid,
          ctx,
          false
        );
      } else {
        ctx.addedSlots[sid] = clonedSlot;
      }
    }
  }

  return {
    ...page,
    pageId: nextPageId,
    ...(opts?.pageNumber !== undefined ? { pageNumber: opts.pageNumber } : {}),
    pageLabel: opts?.labelTransform ? opts.labelTransform(page.pageLabel, page) : page.pageLabel,
    headerSlotId: nextHeaderId,
    footerSlotId: nextFooterId,
    blocks: clonedBlocks,
  };
}

/**
 * `source` 문서에서 지정한 `pageIds` 들을 새 ID로 복제해 `target` 문서의 `atIndex` 위치에 삽입한다.
 *
 * - 같은 문서 복제: 머리말/바닥글 슬롯 및 `backDataRefs` 공유 유지.
 * - 다른 문서에서 가져오기: 머리말/바닥글도 새 ID로 복제(가져오는 페이지들 간의 내부 공유 관계는 유지),
 *   `backDataRefs` 비움(또는 `copyBackdata`), `evidenceLinks` 미복사, `fill`/`isEdited`/`originalContent` 초기화,
 *   사용된 `{{변수}}` 중 대상 문서에 없는 키만 원본 값으로 병합.
 */
export function importPagesFromDocument(
  target: VDocDocument,
  source: VDocDocument,
  pageIds: readonly string[],
  newId: IdFactory,
  atIndex?: number,
  options: ImportPagesOptions = {}
): VDocDocument {
  if (pageIds.length === 0) return target;
  const fromOther = options.fromOtherDocument ?? target.docId !== source.docId;
  const copyBackdata = Boolean(options.copyBackdata);

  const sourcePageById = new Map(source.pages.map((p, idx) => [p.pageId, { page: p, idx }]));
  const selected = pageIds.flatMap((id) => {
    const hit = sourcePageById.get(id);
    return hit ? [hit] : [];
  });
  if (selected.length === 0) return target;

  const ctx: ClonePageUnitContext = {
    sourceSlots: source.slots,
    sourceVariables: source.variables,
    sourceBackdata: source.backdata,
    newId,
    fromOther,
    copyBackdata,
    sharedHeaderFooterMap: new Map<string, string>(),
    nextVariables: { ...target.variables },
    nextBackdata: { ...target.backdata },
    variablesChanged: false,
    backdataChanged: false,
    addedSlots: {},
  };

  const addedPages: VDocPage[] = [];
  const addedThumbs: string[] = [];
  for (const { page, idx } of selected) {
    addedPages.push(cloneImportedPageUnit(page, ctx, { labelTransform: options.labelTransform }));
    addedThumbs.push(source.preview?.pageThumbnails?.[idx] ?? "");
  }

  const baseResult = insertPages(target, addedPages, ctx.addedSlots, atIndex, addedThumbs);
  return {
    ...baseResult,
    ...(ctx.variablesChanged ? { variables: ctx.nextVariables } : {}),
    ...(ctx.backdataChanged ? { backdata: ctx.nextBackdata } : {}),
  };
}

/**
 * 같은 문서 안의 `pageId` 페이지를 바로 다음 위치에 복제한다.
 * 머리말/바닥글 슬롯과 `backDataRefs` 공유를 유지하며, 본문 블록·슬롯만 새 ID로 복제한다.
 */
export function duplicatePage(doc: VDocDocument, pageId: string, newId: IdFactory): VDocDocument {
  const index = doc.pages.findIndex((p) => p.pageId === pageId);
  if (index < 0) return doc;
  return importPagesFromDocument(doc, doc, [pageId], newId, index + 1, {
    fromOtherDocument: false,
    labelTransform: (label) => `${label} (사본)`,
  });
}

/** 페이지의 `pageLabel` 을 바꾼다. 비어 있거나 같으면 기존 문서 참조를 돌려준다. */
export function renamePage(doc: VDocDocument, pageId: string, nextLabel: string): VDocDocument {
  const trimmed = nextLabel.trim();
  if (!trimmed) return doc;
  let changed = false;
  const pages = doc.pages.map((p) => {
    if (p.pageId !== pageId || p.pageLabel === trimmed) return p;
    changed = true;
    return { ...p, pageLabel: trimmed };
  });
  return changed ? { ...doc, pages, updatedAt: new Date().toISOString() } : doc;
}

/**
 * `pageId` 페이지를 삭제한다.
 * - 마지막 1페이지는 삭제할 수 없다.
 * - 남은 다른 페이지가 더 이상 참조하지 않는 고아 슬롯(본문·단독 머리말/바닥글)을 `doc.slots` 에서 함께 정리한다.
 * - `preview.pageThumbnails` 도 같은 순번을 제거해 밀림을 막는다.
 */
export function removePage(doc: VDocDocument, pageId: string): VDocDocument {
  if (doc.pages.length <= 1) return doc;
  const index = doc.pages.findIndex((p) => p.pageId === pageId);
  if (index < 0) return doc;

  const targetPage = doc.pages[index];
  const remainingRaw = doc.pages.filter((p) => p.pageId !== pageId);
  const nextPages = renumberPages(remainingRaw);

  // 남은 페이지들이 아직 참조하고 있는 슬롯 ID 집합 (공유 머리말·바닥글 보호)
  const stillReferenced = new Set<string>();
  for (const p of nextPages) {
    if (p.headerSlotId) stillReferenced.add(p.headerSlotId);
    if (p.footerSlotId) stillReferenced.add(p.footerSlotId);
    for (const id of iterPageSlotIds(p)) stillReferenced.add(id);
  }

  const candidateRemove = new Set<string>();
  if (targetPage.headerSlotId) candidateRemove.add(targetPage.headerSlotId);
  if (targetPage.footerSlotId) candidateRemove.add(targetPage.footerSlotId);
  for (const id of iterPageSlotIds(targetPage)) candidateRemove.add(id);

  let nextSlots = doc.slots;
  let slotsChanged = false;
  for (const id of candidateRemove) {
    if (!stillReferenced.has(id) && id in nextSlots) {
      if (!slotsChanged) {
        nextSlots = { ...doc.slots };
        slotsChanged = true;
      }
      delete nextSlots[id];
    }
  }

  let nextPreview = doc.preview;
  if (doc.preview?.pageThumbnails && index < doc.preview.pageThumbnails.length) {
    const nextThumbs = [...doc.preview.pageThumbnails];
    nextThumbs.splice(index, 1);
    nextPreview = { ...doc.preview, pageThumbnails: nextThumbs };
  }

  return {
    ...doc,
    pages: nextPages,
    slots: nextSlots,
    ...(nextPreview ? { preview: nextPreview } : {}),
    updatedAt: new Date().toISOString(),
  };
}

export interface ReplacePageContentOptions {
  /** 다중 삽입 시 블록 · 슬롯 ID 충돌을 막기 위해 새 접미사를 부여할 팩토리. */
  newId?: IdFactory;
  /** 교체된 페이지 순번에 맞출 썸네일 URL/DataURL. */
  thumbnail?: string;
  /** 원본 문서의 변수 맵 (대상 문서에 없는 키만 병합). */
  sourceVariables?: Record<string, string>;
}

/**
 * 미리 예약해 둔 `placeholderPageId` 자리(`pageId`, `pageNumber`, 위치)를 유지한 채,
 * 순차 추출이 끝난 `hydratedPage` 의 블록 · 레이아웃 · 슬롯을 채워 넣는다.
 */
export function replacePageContent(
  doc: VDocDocument,
  placeholderPageId: string,
  hydratedPage: VDocPage,
  sourceSlots: Record<string, VDocSlot>,
  opts: ReplacePageContentOptions = {}
): VDocDocument {
  const index = doc.pages.findIndex((p) => p.pageId === placeholderPageId);
  if (index < 0) return doc;
  const oldPage = doc.pages[index];

  let nextPage: VDocPage;
  let addedSlots: Record<string, VDocSlot> = {};
  let nextVariables = doc.variables;
  let variablesChanged = false;

  if (opts.newId) {
    const ctx: ClonePageUnitContext = {
      sourceSlots,
      sourceVariables: opts.sourceVariables ?? {},
      sourceBackdata: {},
      newId: opts.newId,
      fromOther: true,
      copyBackdata: false,
      sharedHeaderFooterMap: new Map<string, string>(),
      nextVariables: { ...doc.variables },
      nextBackdata: {},
      variablesChanged: false,
      backdataChanged: false,
      addedSlots: {},
    };
    nextPage = cloneImportedPageUnit(hydratedPage, ctx, {
      preservePageId: placeholderPageId,
      pageNumber: index + 1,
    });
    addedSlots = ctx.addedSlots;
    nextVariables = ctx.nextVariables;
    variablesChanged = ctx.variablesChanged;
  } else {
    nextPage = {
      ...hydratedPage,
      pageId: placeholderPageId,
      pageNumber: index + 1,
    };
    addedSlots = sourceSlots;
    if (opts.sourceVariables) {
      const mergedVars = { ...doc.variables };
      for (const sid of iterPageSlotIds(hydratedPage)) {
        const s = sourceSlots[sid];
        if (!s) continue;
        for (const key of extractVariableKeys(s.content)) {
          if (!(key in mergedVars) && key in opts.sourceVariables) {
            mergedVars[key] = opts.sourceVariables[key];
            variablesChanged = true;
          }
        }
      }
      nextVariables = mergedVars;
    }
  }

  const nextPages = doc.pages.map((p, i) => (i === index ? nextPage : p));

  // 기존 예약 페이지가 단독으로 쓰던 임시 머리글/바닥글 슬롯 등 고아 슬롯 정리
  const referencedElsewhere = new Set<string>();
  for (let i = 0; i < nextPages.length; i++) {
    const p = nextPages[i];
    if (p.headerSlotId) referencedElsewhere.add(p.headerSlotId);
    if (p.footerSlotId) referencedElsewhere.add(p.footerSlotId);
    for (const id of iterPageSlotIds(p)) referencedElsewhere.add(id);
  }
  const nextSlots: Record<string, VDocSlot> = { ...doc.slots, ...addedSlots };
  const oldIds = new Set<string>([
    ...(oldPage.headerSlotId ? [oldPage.headerSlotId] : []),
    ...(oldPage.footerSlotId ? [oldPage.footerSlotId] : []),
    ...iterPageSlotIds(oldPage),
  ]);
  for (const id of oldIds) {
    if (!referencedElsewhere.has(id)) delete nextSlots[id];
  }

  let nextPreview = doc.preview;
  if (opts.thumbnail !== undefined) {
    const existing = doc.preview?.pageThumbnails ?? [];
    const base = Array.from({ length: nextPages.length }, (_, i) => existing[i] ?? "");
    base[index] = opts.thumbnail;
    nextPreview = { ...doc.preview, pageThumbnails: base };
  }

  return {
    ...doc,
    pages: nextPages,
    slots: nextSlots,
    ...(variablesChanged ? { variables: nextVariables } : {}),
    ...(nextPreview ? { preview: nextPreview } : {}),
    updatedAt: new Date().toISOString(),
  };
}

export interface ReservedPdfPlaceholderSpec {
  pageNumber: number;
  thumbnailDataUrl?: string | null;
}

export interface ReservedPdfPlaceholdersBundle {
  pages: VDocPage[];
  slots: Record<string, VDocSlot>;
  thumbnails: string[];
  mappings: { pageNumber: number; placeholderPageId: string; thumbnail: string }[];
}

/**
 * 1단계에서 고른 PDF 페이지 목록만큼 빈 예약 페이지(`blocks: []`) · 임시 머리말/바닥글 슬롯 · 썸네일 배열을 생성한다.
 * 나중에 순차 스캐폴딩이 끝나면 `replacePageContent` 로 제자리 교체한다.
 */
export function buildReservedPdfPlaceholders(
  items: readonly ReservedPdfPlaceholderSpec[],
  sourceTitle: string,
  startPageNumber: number,
  newId: IdFactory
): ReservedPdfPlaceholdersBundle {
  const cleanTitle = sourceTitle.trim() || "PDF 양식";
  const pages: VDocPage[] = [];
  const slots: Record<string, VDocSlot> = {};
  const thumbnails: string[] = [];
  const mappings: { pageNumber: number; placeholderPageId: string; thumbnail: string }[] = [];

  items.forEach((item, idx) => {
    const suffix = newId();
    const pageId = `page_${suffix}`;
    const headerSlotId = `slot_hdr_${suffix}`;
    const footerSlotId = `slot_ftr_${suffix}`;
    slots[headerSlotId] = {
      slotId: headerSlotId,
      label: "머리말",
      role: "boilerplate",
      content: "",
      backDataRefs: [],
    };
    slots[footerSlotId] = {
      slotId: footerSlotId,
      label: "바닥글",
      role: "boilerplate",
      content: "",
      backDataRefs: [],
    };
    pages.push({
      pageId,
      pageNumber: startPageNumber + idx,
      pageLabel: `${cleanTitle} (${item.pageNumber}p)`,
      headerSlotId,
      footerSlotId,
      hideHeaderFooter: true,
      blocks: [],
    });
    const thumb = item.thumbnailDataUrl ?? "";
    thumbnails.push(thumb);
    mappings.push({
      pageNumber: item.pageNumber,
      placeholderPageId: pageId,
      thumbnail: thumb,
    });
  });

  return { pages, slots, thumbnails, mappings };
}


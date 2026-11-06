import { findBlock, getBlockSlotIds, type VDocDocument } from "@vibe/vdoc-schema";

/**
 * AI 작업 범위 — Composer 가 "어디까지 보고 · 고칠 수 있나".
 *
 *   selection  고른 칸 · 블록 · 칸 범위만 (다른 페이지 · 다른 블록은 없는 것처럼)
 *   page       한 페이지만
 *   document   문서 전체 (빼 둔 페이지 제외)
 *
 * 설정바에 오래 걸어 두는 값(DocScopeSetting)과, 메시지 하나에만 쓰는 값(프롬프트의 @선택)이 있다.
 * 보낼 때 둘을 합쳐 ResolvedScope 하나를 만들고, 문서 도구가 그 범위 밖을 거부한다.
 */
export type ScopeMode = "selection" | "page" | "document";

export interface ScopeTarget {
  kind: "slot" | "block" | "slot-range";
  id: string;
  label: string;
  pageId: string;
  slotIds: string[];
  blockIds: string[];
}

export interface DocScopeSetting {
  mode: ScopeMode;
  /** 고정: 캔버스 초점이 바뀌어도 범위를 그대로 둔다 (바뀐 초점은 제안으로만) */
  fixed: boolean;
  /** 고정된 선택 (mode=selection) */
  target: ScopeTarget | null;
  /** 고정된 페이지 (mode=page) */
  pageId: string | null;
  /** 문서 전체에서 뺀 페이지 */
  excludedPageIds: string[];
}

export const DEFAULT_SCOPE: DocScopeSetting = { mode: "page", fixed: false, target: null, pageId: null, excludedPageIds: [] };

export interface ResolvedScope {
  docId: string;
  /** off = 설정바에서 범위를 끔 (문서 없이 대화 — 문서 도구 전부 거부) */
  mode: ScopeMode | "off";
  label: string;
  /** null = 제한 없음 */
  pageIds: Set<string> | null;
  slotIds: Set<string> | null;
  blockIds: Set<string> | null;
  /** 프롬프트 @선택으로 이번 메시지만 좁힌 범위 */
  oneOff: boolean;
  /** 설정바에서 자료를 끔 — RM 원본 도구도 거부 */
  sourcesOff?: boolean;
}

/** 범위 OFF — 문서를 싣지도 읽지도 고치지도 않는다. */
export function offScope(docId: string): ResolvedScope {
  return { docId, mode: "off", label: "문서 끔", pageIds: new Set(), slotIds: new Set(), blockIds: new Set(), oneOff: false };
}

const pageNo = (doc: VDocDocument, pageId: string) => doc.pages.findIndex((p) => p.pageId === pageId) + 1;

export function pageTitle(doc: VDocDocument, pageId: string): string {
  const page = doc.pages.find((p) => p.pageId === pageId);
  const no = pageNo(doc, pageId);
  // 페이지 밖 칸(문서 머리글 등)
  if (no === 0) return "공통";
  return page?.pageLabel?.trim() ? `p${no} ${page.pageLabel}` : `p${no}`;
}

/** 칸 · 블록 · 칸 범위 → 범위 대상 (어느 페이지 · 어떤 칸들인지). */
export function targetFromSlots(doc: VDocDocument, slotIds: string[], unitIds: string[] = slotIds, label?: string): ScopeTarget | null {
  const slots = new Set<string>();
  const blocks = new Set<string>();
  let pageId = "";
  for (const unit of unitIds) {
    const loc = findBlock(doc, unit);
    if (loc) {
      blocks.add(loc.block.blockId);
      getBlockSlotIds(loc.block).forEach((s) => slots.add(s));
      pageId ||= loc.pageId;
    }
  }
  for (const sid of slotIds) {
    if (!doc.slots[sid]) continue;
    slots.add(sid);
    for (const page of doc.pages) {
      const block = page.blocks.find((b) => getBlockSlotIds(b).includes(sid));
      if (block) {
        blocks.add(block.blockId);
        pageId ||= page.pageId;
        break;
      }
    }
  }
  if (!slots.size && !blocks.size) return null;
  const first = doc.slots[slotIds[0]]?.label ?? findBlock(doc, unitIds[0])?.block.title ?? unitIds[0];
  return {
    kind: unitIds.length > 1 || slotIds.length > 1 ? "slot-range" : findBlock(doc, unitIds[0]) ? "block" : "slot",
    id: [...unitIds].sort().join("|"),
    label: label ?? (unitIds.length > 1 ? `${first} 외 ${unitIds.length - 1}` : first || "선택"),
    pageId,
    slotIds: [...slots],
    blockIds: [...blocks],
  };
}

export function targetFromBlock(doc: VDocDocument, blockId: string): ScopeTarget | null {
  return targetFromSlots(doc, [], [blockId]);
}

/** 설정 + 지금 캔버스 초점 → 실제 범위. 고정이 아니면 초점을 따른다. */
export function resolveScope(
  doc: VDocDocument,
  setting: DocScopeSetting,
  live: { target: ScopeTarget | null; pageId: string | null }
): ResolvedScope {
  const target = setting.fixed ? setting.target : live.target ?? setting.target;
  const pageId = (setting.fixed ? setting.pageId : live.pageId) ?? setting.pageId ?? doc.pages[0]?.pageId ?? "";
  if (setting.mode === "selection" && target) {
    return {
      docId: doc.docId,
      mode: "selection",
      label: `선택만 · ${pageTitle(doc, target.pageId)} ${target.label}`,
      pageIds: new Set([target.pageId]),
      slotIds: new Set(target.slotIds),
      blockIds: new Set(target.blockIds),
      oneOff: false,
    };
  }
  if (setting.mode === "document") {
    const excluded = setting.excludedPageIds.filter((id) => doc.pages.some((p) => p.pageId === id));
    return {
      docId: doc.docId,
      mode: "document",
      label: excluded.length ? `문서 전체 (−${excluded.length}쪽)` : "문서 전체",
      pageIds: excluded.length ? new Set(doc.pages.map((p) => p.pageId).filter((id) => !excluded.includes(id))) : null,
      slotIds: null,
      blockIds: null,
      oneOff: false,
    };
  }
  // page (선택 모드인데 고른 것이 없으면 페이지로)
  return {
    docId: doc.docId,
    mode: "page",
    label: `이 페이지 · ${pageTitle(doc, pageId)}`,
    pageIds: new Set([pageId]),
    slotIds: null,
    blockIds: null,
    oneOff: false,
  };
}

/** 프롬프트 @선택들로 이번 메시지만 좁힌 범위. */
export function oneOffScope(doc: VDocDocument, targets: ScopeTarget[], pageIds: string[]): ResolvedScope | null {
  if (!targets.length && !pageIds.length) return null;
  const pages = new Set([...targets.map((t) => t.pageId), ...pageIds]);
  const onlyPages = targets.length === 0;
  return {
    docId: doc.docId,
    mode: onlyPages ? "page" : "selection",
    label: `이번 메시지만 · ${[...targets.map((t) => t.label), ...pageIds.map((p) => pageTitle(doc, p))].slice(0, 3).join(", ")}`,
    pageIds: pages,
    slotIds: onlyPages ? null : new Set(targets.flatMap((t) => t.slotIds)),
    blockIds: onlyPages ? null : new Set(targets.flatMap((t) => t.blockIds)),
    oneOff: true,
  };
}

/** 칸 · 블록 · 페이지가 범위 안인가. */
export function scopeAllowsSlot(doc: VDocDocument, scope: ResolvedScope | null, slotId: string): boolean {
  if (!scope || scope.docId !== doc.docId) return true;
  if (scope.slotIds) return scope.slotIds.has(slotId);
  if (!scope.pageIds) return true;
  return doc.pages.some((p) => scope.pageIds!.has(p.pageId) && p.blocks.some((b) => getBlockSlotIds(b).includes(slotId)));
}

export function scopeAllowsBlock(doc: VDocDocument, scope: ResolvedScope | null, blockId: string): boolean {
  if (!scope || scope.docId !== doc.docId) return true;
  if (scope.blockIds) return scope.blockIds.has(blockId);
  if (!scope.pageIds) return true;
  const loc = findBlock(doc, blockId);
  return !!loc && scope.pageIds.has(loc.pageId);
}

export function scopeAllowsPage(doc: VDocDocument, scope: ResolvedScope | null, pageId: string): boolean {
  if (!scope || scope.docId !== doc.docId || !scope.pageIds) return true;
  return scope.pageIds.has(pageId);
}

export const isRestricted = (scope: ResolvedScope | null): boolean => !!scope && (!!scope.pageIds || !!scope.slotIds);

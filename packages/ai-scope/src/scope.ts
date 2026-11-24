// AI 작업 범위 규칙 — studio · playground 가 함께 쓴다 (규칙은 studio 동작이 명세).
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
  /** 고정된 페이지 (단일 / 하위 호환) */
  pageId: string | null;
  /** 고정/선택된 복수 페이지 목록 (mode=page) */
  pageIds?: string[];
  /** 문서 전체에서 뺀 페이지 */
  excludedPageIds: string[];
}

export const DEFAULT_SCOPE: DocScopeSetting = { mode: "page", fixed: false, target: null, pageId: null, pageIds: [], excludedPageIds: [] };

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
  const selectedPages = (setting.pageIds && setting.pageIds.length > 0)
    ? setting.pageIds.filter((id) => doc.pages.some((p) => p.pageId === id))
    : (pageId ? [pageId] : [doc.pages[0]?.pageId ?? ""]);

  if (selectedPages.length > 1) {
    const labels = selectedPages.map((id) => pageTitle(doc, id).split(" ")[0]).join(", ");
    return {
      docId: doc.docId,
      mode: "page",
      label: `페이지 ${selectedPages.length}쪽 (${labels})`,
      pageIds: new Set(selectedPages),
      slotIds: null,
      blockIds: null,
      oneOff: false,
    };
  }

  const singlePage = selectedPages[0] || pageId;
  return {
    docId: doc.docId,
    mode: "page",
    label: `이 페이지 · ${pageTitle(doc, singlePage)}`,
    pageIds: new Set([singlePage]),
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

/**
 * 읽기에서 숨기는 페이지인가. 범위는 '고칠 범위'라서 읽기는 막지 않는다 —
 * 예외는 '문서 전체' 모드에서 사용자가 직접 뺀 페이지 (보지도 고치지도 않게 한 것)뿐이다.
 */
export function scopeHidesPage(doc: VDocDocument, scope: ResolvedScope | null, pageId: string): boolean {
  return !!scope && scope.mode === "document" && !scopeAllowsPage(doc, scope, pageId);
}

export function scopeHidesSlot(doc: VDocDocument, scope: ResolvedScope | null, slotId: string): boolean {
  return !!scope && scope.mode === "document" && !scopeAllowsSlot(doc, scope, slotId);
}

export function scopeHidesBlock(doc: VDocDocument, scope: ResolvedScope | null, blockId: string): boolean {
  return !!scope && scope.mode === "document" && !scopeAllowsBlock(doc, scope, blockId);
}

// --- 아웃라인(`.outline`) 작업 범위 & 서브트리 지문 --------------------------------------------

export type OutlineScopeMode = "selection" | "subtree" | "document";

export interface OutlineNodeLike {
  readonly id: string;
  readonly text: string;
  readonly note?: string;
  readonly isCompleted?: boolean;
  readonly nodeType?: string;
  readonly file?: { readonly target: string; readonly options?: Record<string, unknown> };
  readonly children: readonly OutlineNodeLike[];
}

export interface OutlineScopeSetting {
  readonly mode: OutlineScopeMode;
  readonly fixed: boolean;
  readonly rootNodeIds: readonly string[];
}

export const DEFAULT_OUTLINE_SCOPE: OutlineScopeSetting = {
  mode: "document",
  fixed: false,
  rootNodeIds: [],
};

export interface ResolvedOutlineScope {
  readonly path: string;
  readonly mode: OutlineScopeMode | "off";
  readonly label: string;
  /** null = 제한 없음(아웃라인 전체), Set = 허용된 nodeId 집합(지정 루트 + 모든 후손) */
  readonly allowedNodeIds: Set<string> | null;
  readonly rootNodeIds: readonly string[];
  readonly oneOff: boolean;
}

function walkOutlineNodes(nodes: readonly OutlineNodeLike[], visit: (node: OutlineNodeLike) => void): void {
  for (const n of nodes) {
    visit(n);
    if (n.children.length > 0) walkOutlineNodes(n.children, visit);
  }
}

export function findOutlineNodeById<T extends OutlineNodeLike>(roots: readonly T[], nodeId: string): T | null {
  for (const n of roots) {
    if (n.id === nodeId) return n;
    const hit = findOutlineNodeById(n.children as readonly T[], nodeId);
    if (hit) return hit;
  }
  return null;
}

/** 지정된 루트 nodeId 들과 그 하위 모든 후손 nodeId 집합을 수집한다. */
export function collectOutlineSubtreeIds(roots: readonly OutlineNodeLike[], rootIds: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const rid of rootIds) {
    const start = findOutlineNodeById(roots, rid);
    if (!start) continue;
    walkOutlineNodes([start], (n) => out.add(n.id));
  }
  return out;
}

export function resolveOutlineScope(
  path: string,
  roots: readonly OutlineNodeLike[],
  setting: OutlineScopeSetting,
  live: { readonly selectedNodeIds?: readonly string[]; readonly activeRootId?: string | null } = {},
  scopeOn = true
): ResolvedOutlineScope {
  if (!scopeOn) {
    return { path, mode: "off", label: "문서 끔", allowedNodeIds: new Set(), rootNodeIds: [], oneOff: false };
  }
  if (setting.mode === "document") {
    return { path, mode: "document", label: "아웃라인 전체", allowedNodeIds: null, rootNodeIds: [], oneOff: false };
  }
  const picked = setting.fixed
    ? [...setting.rootNodeIds]
    : setting.mode === "subtree"
      ? (live.activeRootId ? [live.activeRootId] : [...(live.selectedNodeIds ?? []).slice(0, 1)])
      : [...(live.selectedNodeIds ?? [])];
  const valid = picked.filter((id) => Boolean(findOutlineNodeById(roots, id)));
  if (valid.length === 0) {
    return { path, mode: "document", label: "아웃라인 전체", allowedNodeIds: null, rootNodeIds: [], oneOff: false };
  }
  const allowed = collectOutlineSubtreeIds(roots, valid);
  const firstText = (findOutlineNodeById(roots, valid[0])?.text ?? valid[0]).trim().slice(0, 20) || valid[0];
  const prefix = setting.mode === "subtree" ? "서브트리" : "선택 불릿";
  return {
    path,
    mode: setting.mode,
    label: valid.length > 1 ? `${prefix} · ${firstText} 외 ${valid.length - 1}` : `${prefix} · ${firstText}`,
    allowedNodeIds: allowed,
    rootNodeIds: valid,
    oneOff: false,
  };
}

export function outlineScopeAllowsNode(scope: ResolvedOutlineScope | null, nodeId: string): boolean {
  if (!scope) return true;
  if (scope.mode === "off") return false;
  if (scope.allowedNodeIds === null) return true;
  return scope.allowedNodeIds.has(nodeId);
}

function serializeSubtreeCanonical(node: OutlineNodeLike): string {
  const file = node.file ? `${node.file.target}|${JSON.stringify(node.file.options ?? {})}` : "";
  const children = node.children.map(serializeSubtreeCanonical).join(",");
  return `${node.id}|${node.text}|${node.note ?? ""}|${node.isCompleted ? 1 : 0}|${node.nodeType ?? ""}|${file}|[${children}]`;
}

function fnv1aHex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + (i & 0xff);
    h2 = Math.imul(h2, 0x01000193);
  }
  return ((h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0"));
}

/**
 * 대상 서브트리(들)의 결정적 지문(`baseHash`)을 계산한다.
 * 파일 전체가 아닌 대상 서브트리만 해싱하므로, 다른 섹션을 편집해도 이 변경안은 stale 되지 않는다.
 */
export function computeOutlineSubtreeHash(roots: readonly OutlineNodeLike[], targetNodeIds: readonly string[]): string {
  const uniq = [...new Set(targetNodeIds.filter(Boolean))].sort();
  if (uniq.length === 0) {
    return fnv1aHex(roots.map(serializeSubtreeCanonical).join(";"));
  }
  const parts = uniq.map((id) => {
    const node = findOutlineNodeById(roots, id);
    return node ? serializeSubtreeCanonical(node) : `${id}:<missing>`;
  });
  return fnv1aHex(parts.join(";"));
}

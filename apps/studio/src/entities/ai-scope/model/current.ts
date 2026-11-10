import type { ContextRef, ToolRunContext } from "@vibe/ai-kernel";
import type { VDocDocument } from "@vibe/vdoc-schema";

import { composerController } from "@/shared/ai";

import { isRestricted, pageTitle, resolveScope, targetFromBlock, targetFromSlots, type ResolvedScope, type ScopeTarget } from "./scope";
import { useAiScopeStore } from "./useAiScopeStore";

/**
 * 지금 범위 계산 · 범위 첨부 · 도구 호출의 범위 — Composer 설정바 · 문서 도구 · 범위 첨부가 함께 쓴다.
 * (문서 · 선택 상태는 다른 entity 라 인자로 받는다 — 부르는 feature 가 스토어에서 넘긴다.)
 */
export const SCOPE_CONTEXT_KIND = "scope";

export interface CanvasFocus {
  slotRange?: { slotIds: string[]; unitIds: string[] } | null;
  selectedSlotId?: string | null;
  selectedBlockId?: string | null;
}

/** 캔버스 초점 → 범위 대상 (칸 범위 > 칸 > 블록). */
export function liveTarget(doc: VDocDocument, focus: CanvasFocus): ScopeTarget | null {
  if (focus.slotRange) return targetFromSlots(doc, focus.slotRange.slotIds, focus.slotRange.unitIds);
  if (focus.selectedSlotId && doc.slots[focus.selectedSlotId]) return targetFromSlots(doc, [focus.selectedSlotId]);
  if (focus.selectedBlockId) return targetFromBlock(doc, focus.selectedBlockId);
  return null;
}

/** 설정바 기준의 현재 범위 (이번 메시지 @선택 반영 전). */
export function currentScope(doc: VDocDocument | undefined, focus: CanvasFocus, activePageId: string | null): ResolvedScope | null {
  if (!doc) return null;
  const store = useAiScopeStore.getState();
  const live = store.live.docId === doc.docId ? store.live : { target: liveTarget(doc, focus), pageId: activePageId };
  return resolveScope(doc, store.settingFor(doc.docId), live);
}

/** 범위 첨부 — 예전 "열린 문서" 자리. 범위가 좁으면 문서 제목(다른 페이지 이름이 섞일 수 있다)도 싣지 않는다. */
export function scopeContextRef(doc: VDocDocument, scope: ResolvedScope, activePageId: string | null): ContextRef {
  const lines: string[] = [];
  if (scope.mode === "off") {
    lines.push("범위: 문서 끔 — 사용자가 문서를 이 대화에서 뺐다. 문서를 읽거나 고치지 말고, 문서 내용을 추측하지 마라. 문서 도구는 모두 거부된다.");
  } else if (!isRestricted(scope)) {
    lines.push(`고칠 범위: 문서 전체`, `docId: ${doc.docId}`, `title: ${doc.title}`, `pages: ${doc.pages.length}`);
    if (activePageId) lines.push(`activePage: ${pageTitle(doc, activePageId)}`);
  } else {
    lines.push(
      `고칠 범위: ${scope.label}`,
      scope.mode === "document"
        ? "바꾸는 것은 이 범위 안만 된다. 사용자가 뺀 페이지는 읽지도 고치지도 않는다 (문서 도구가 거부한다)."
        : "바꾸는 것은 이 범위 안만 된다 (밖을 바꾸는 변경안은 거부된다). 읽기는 문서 전체를 볼 수 있다 — 맥락 · 일관성 확인에 쓰고, 밖의 내용을 범위 안에 지어 넣지는 마라.",
      `docId: ${doc.docId}`,
      `페이지: ${[...(scope.pageIds ?? [])].map((p) => `${pageTitle(doc, p)} (${p})`).join(", ")}`
    );
    if (scope.slotIds) lines.push(`칸: ${[...scope.slotIds].slice(0, 60).map((s) => `${s} ${doc.slots[s]?.label ?? ""}`.trim()).join(" · ")}`);
  }
  if (scope.mode !== "off") lines.push("(구조는 document.getOutline 으로 읽는다 — 고칠 범위 밖은 [범위밖] 으로 표시된다)");
  if (scope.sourcesOff) lines.push("자료 끔: 사용자가 이번 대화에서 참고 자료(지식 덱 · RM 원본)를 뺐다. 자료 도구를 쓰지 마라.");
  return {
    kind: SCOPE_CONTEXT_KIND,
    id: `scope:${doc.docId}`,
    label: scope.label,
    content: lines.join("\n"),
    hint: scope.oneOff ? "이번 메시지만 좁힌 범위 (프롬프트의 @선택)" : "설정바의 범위 — 매 메시지에 포함",
    access: "read",
    role: "reference",
    // 메시지마다 자기 범위를 싣는다 — 문서 도구는 "지금 처리 중인 메시지"의 범위를 여기서 읽는다 (대기열 · 새로고침에도 맞다)
    meta: { docId: doc.docId, scopeMode: scope.mode, oneOff: scope.oneOff, scope: serializeScope(scope) },
  };
}

interface SerializedScope {
  docId: string;
  mode: ResolvedScope["mode"];
  label: string;
  pageIds: string[] | null;
  slotIds: string[] | null;
  blockIds: string[] | null;
  oneOff: boolean;
  sourcesOff?: boolean;
}

const serializeScope = (s: ResolvedScope): SerializedScope => ({
  docId: s.docId,
  mode: s.mode,
  label: s.label,
  pageIds: s.pageIds ? [...s.pageIds] : null,
  slotIds: s.slotIds ? [...s.slotIds] : null,
  blockIds: s.blockIds ? [...s.blockIds] : null,
  oneOff: s.oneOff,
  sourcesOff: s.sourcesOff,
});

function deserializeScope(raw: unknown): ResolvedScope | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as SerializedScope;
  if (typeof s.docId !== "string") return null;
  const set = (v: string[] | null) => (Array.isArray(v) ? new Set(v) : null);
  return { docId: s.docId, mode: s.mode, label: s.label, pageIds: set(s.pageIds), slotIds: set(s.slotIds), blockIds: set(s.blockIds), oneOff: !!s.oneOff, sourcesOff: !!s.sourcesOff };
}

/** Composer 가 지금 처리 중인(마지막) 사용자 메시지의 범위. */
function messageScope(): ResolvedScope | null {
  const items = composerController.getState().items;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind !== "user") continue;
    const ref = item.contexts.find((c) => c.kind === SCOPE_CONTEXT_KIND);
    return ref ? deserializeScope(ref.meta?.scope) : null;
  }
  return null;
}

/** 이번 메시지에서 자료(RM 원본)가 꺼져 있는가 — Composer 대화의 호출일 때만. */
export function toolSourcesOff(ctx?: ToolRunContext): boolean {
  const turn = messageScope() ?? useAiScopeStore.getState().turn;
  if (!turn?.sourcesOff) return false;
  const composerSession = composerController.getState().sessionId;
  return !(ctx && ctx.sessionId && composerSession && ctx.sessionId !== composerSession);
}

/** 이 도구 호출에 걸린 범위 — Composer 대화의 호출일 때만 (인라인 AI 등 다른 세션은 제한 없음). */
export function toolScope(doc: VDocDocument, ctx?: ToolRunContext): ResolvedScope | null {
  const turn = messageScope() ?? useAiScopeStore.getState().turn;
  if (!turn || turn.docId !== doc.docId || !isRestricted(turn)) return null;
  const composerSession = composerController.getState().sessionId;
  if (ctx && ctx.sessionId && composerSession && ctx.sessionId !== composerSession) return null;
  return turn;
}

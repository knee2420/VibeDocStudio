import { useEffect } from "react";

import type { ContextProvider, ToolRunContext, WorkspaceTool } from "@vibe/ai-kernel";
import type { VDocDocument } from "@vibe/vdoc-schema";

import {
  currentScope,
  liveTarget,
  scopeAllowsBlock,
  scopeAllowsPage,
  scopeAllowsSlot,
  scopeHidesBlock,
  scopeHidesPage,
  scopeHidesSlot,
  offScope,
  scopeContextRef,
  toolScope,
  toolSourcesOff,
  useAiScopeStore,
  type ResolvedScope,
} from "@/entities/ai-scope";
import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";

/**
 * AI 작업 범위 — 설정바(오래 걸어 두는 범위) + 프롬프트 @선택(이번 메시지만)을 Composer 와 문서 도구에 잇는다.
 *
 *   1) 캔버스 초점 → `live` (고정이 아니면 범위가 초점을 따른다)
 *   2) "범위" 자동 첨부 — 예전 "열린 문서" 첨부 자리. 범위가 좁으면 문서 제목 · 다른 페이지 이름도 싣지 않는다
 *   3) 문서 도구 가드 — 범위는 '고칠 범위'다. 범위 밖을 바꾸는 도구는 거부하고, 읽기 도구는 막지 않는다
 *      (예외: '문서 전체' 모드에서 사용자가 뺀 페이지는 읽기도 거부)
 */
const activeDoc = (): VDocDocument | undefined => selectActiveDocument(useStudioDocumentStore.getState());
const activePage = () => useStudioDocumentStore.getState().activePageId || null;

/** 스토어 기준 현재 범위 (설정바 범위 — 이번 메시지 @선택 반영 전). */
export const scopeNow = () => currentScope(activeDoc(), useSlotSelectionStore.getState(), activePage());

/** 캔버스 초점을 범위 저장소에 흘려 넣는다 (스튜디오에서 한 번). */
export function useAiScopeLiveSync(): void {
  useEffect(() => {
    const sync = () => {
      const doc = activeDoc();
      if (!doc) return useAiScopeStore.getState().setLive(null, null, null);
      useAiScopeStore.getState().setLive(doc.docId, liveTarget(doc, useSlotSelectionStore.getState()), activePage());
    };
    sync();
    const offs = [useSlotSelectionStore.subscribe(sync), useStudioDocumentStore.subscribe((s, prev) => {
      if (s.activeDocId !== prev.activeDocId || s.activePageId !== prev.activePageId) sync();
    })];
    return () => offs.forEach((off) => off());
  }, []);
}

export const SCOPE_CONTEXT_PROVIDER: ContextProvider = {
  id: "ai-scope",
  label: "작업 범위",
  auto: true,
  current: () => {
    const doc = activeDoc();
    const store = useAiScopeStore.getState();
    const scope = doc && !store.scopeOn ? offScope(doc.docId) : scopeNow();
    return doc && scope ? [scopeContextRef(doc, { ...scope, sourcesOff: !store.sourcesOn }, activePage())] : [];
  },
};

// --- 문서 도구 가드 ----------------------------------------------------------------

const outOfScope = (what: string, scope: ResolvedScope) =>
  new Error(`범위 밖입니다: ${what} — 지금 범위는 "${scope.label}". 범위를 넓히려면 사용자가 Composer 설정바에서 바꿔야 한다.`);

/** 칸 · 블록 하나를 대상으로 하는 도구 — 범위 밖이면 실행 전에 거부. */
function guardArgs(tool: WorkspaceTool<any>): WorkspaceTool<any> {
  const run = tool.run;
  return {
    ...tool,
    run: (args: any, ctx: ToolRunContext) => {
      const doc = activeDoc();
      const scope = doc ? toolScope(doc, ctx) : null;
      if (doc && scope) {
        if (typeof args?.slotId === "string" && !scopeAllowsSlot(doc, scope, args.slotId)) throw outOfScope(`칸 ${args.slotId}`, scope);
        if (typeof args?.blockId === "string" && !scopeAllowsBlock(doc, scope, args.blockId)) throw outOfScope(`블록 ${args.blockId}`, scope);
        if (typeof args?.pageId === "string" && !scopeAllowsPage(doc, scope, args.pageId)) throw outOfScope(`페이지 ${args.pageId}`, scope);
        if (Array.isArray(args?.changes)) {
          const outside = args.changes.filter((c: { slotId?: string }) => c?.slotId && !scopeAllowsSlot(doc, scope, c.slotId));
          if (outside.length) {
            const inside = args.changes.filter((c: { slotId?: string }) => !outside.includes(c));
            const skipped = outside.map((c: { slotId: string }) => ({ slotId: c.slotId, why: "범위 밖" }));
            if (!inside.length) throw outOfScope(`칸 ${outside.map((c: { slotId: string }) => c.slotId).join(", ")}`, scope);
            return Promise.resolve(run({ ...args, changes: inside }, ctx)).then((res: any) => ({
              ...res,
              skipped: [...(res?.skipped ?? []), ...skipped],
            }));
          }
        }
      }
      return run(args, ctx);
    },
  };
}

/** 고칠 범위 가드를 씌울 쓰기 도구 (인자로 칸 · 블록 · 페이지를 받는 것들). */
const GUARDED = new Set(["slot.proposeContent", "slots.proposeBatch", "blocks.proposeProps", "canvas.selectSlot"]);
/** 읽기 도구 — 범위 밖도 읽는다. 사용자가 뺀 페이지만 거부한다. 목록 · 구조 도구는 도구 안에서 직접 거른다. */
const READ_GUARDED = new Set(["slot.read", "backdata.list", "evidence.forSlot"]);

function guardHidden(tool: WorkspaceTool<any>): WorkspaceTool<any> {
  return {
    ...tool,
    run: (args: any, ctx: ToolRunContext) => {
      const doc = activeDoc();
      const scope = doc ? toolScope(doc, ctx) : null;
      if (doc && scope) {
        const hidden = (what: string) =>
          new Error(`사용자가 뺀 페이지입니다: ${what} — 읽지도 고치지도 않는다 (Composer 설정바의 고칠 범위에서 뺐다).`);
        if (typeof args?.slotId === "string" && scopeHidesSlot(doc, scope, args.slotId)) throw hidden(`칸 ${args.slotId}`);
        if (typeof args?.blockId === "string" && scopeHidesBlock(doc, scope, args.blockId)) throw hidden(`블록 ${args.blockId}`);
        if (typeof args?.pageId === "string" && scopeHidesPage(doc, scope, args.pageId)) throw hidden(`페이지 ${args.pageId}`);
      }
      return tool.run(args, ctx);
    },
  };
}

/** 자료 OFF 면 RM 원본 도구를 거부한다. */
function guardSources(tool: WorkspaceTool<any>): WorkspaceTool<any> {
  return {
    ...tool,
    run: (args: any, ctx: ToolRunContext) => {
      if (toolSourcesOff(ctx)) throw new Error("자료가 꺼져 있습니다 — 사용자가 Composer 설정바에서 참고 자료를 뺐다. 자료 없이 답하라.");
      return tool.run(args, ctx);
    },
  };
}

export const withScopeGuards = (tools: WorkspaceTool<any>[]): WorkspaceTool<any>[] =>
  tools.map((t) =>
    GUARDED.has(t.name) ? guardArgs(t) : READ_GUARDED.has(t.name) ? guardHidden(t) : t.name.startsWith("resources.") ? guardSources(t) : t
  );

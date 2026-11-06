import React from "react";

import type { ContextRef, EngineStatus } from "@vibe/ai-kernel";
import { ComposerPanel, type ComposerSuggestion } from "@vibe/ai-composer";
import { useRegistryList } from "@vibe/ai-react";

import {
  currentScope,
  offScope,
  oneOffScope,
  SCOPE_CONTEXT_KIND,
  scopeContextRef,
  targetFromBlock,
  targetFromSlots,
  useAiScopeStore,
  type ScopeTarget,
} from "@/entities/ai-scope";
import { useKnowledgeDeckStore } from "@/entities/knowledge-deck";
import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { aiRuntime, composerController } from "@/shared/ai";

import { ComposerSettingsBar } from "./ComposerSettingsBar";

/** 지식 덱 첨부 종류 (knowledge-deck-ai 의 DECK_CONTEXT_KIND 와 같은 값 — 기능끼리 import 하지 않으려 값만 맞춘다) */
const DECK_KIND = "deck";

/** 📌 고정 · 이번 메시지 범위가 될 수 있는 첨부 — 칸 · 블록 · 칸 범위 */
const SELECTION_KINDS = new Set(["slot", "block", "slot-range"]);

function refTarget(ref: ContextRef): ScopeTarget | null {
  const doc = selectActiveDocument(useStudioDocumentStore.getState());
  if (!doc) return null;
  const meta = ref.meta ?? {};
  if (typeof meta.docId === "string" && meta.docId !== doc.docId) return null;
  if (ref.kind === "slot") return targetFromSlots(doc, [ref.id], [ref.id], ref.label);
  if (ref.kind === "block") return targetFromBlock(doc, ref.id);
  if (ref.kind === "slot-range") {
    const slotIds = Array.isArray(meta.slotIds) ? (meta.slotIds as string[]) : [];
    const unitIds = Array.isArray(meta.unitIds) ? (meta.unitIds as string[]) : slotIds;
    return targetFromSlots(doc, slotIds, unitIds, ref.label);
  }
  return null;
}

/**
 * 보내기 직전: 이번 메시지의 범위를 정한다.
 * 프롬프트에 @선택(칸 · 블록 · 칸 범위 · 페이지)이 있으면 이번 메시지만 그것으로 좁히고, 없으면 설정바 범위.
 * 범위 첨부를 그 범위로 바꿔 싣고, 문서 도구가 같은 범위를 지키도록 `turn` 에 걸어 둔다.
 */
function scopeForSend(_text: string, contexts: ContextRef[]): ContextRef[] {
  const docState = useStudioDocumentStore.getState();
  const doc = selectActiveDocument(docState);
  const { sourcesOn, scopeOn } = useAiScopeStore.getState();
  // 자료 OFF: 자동으로 붙는 덱을 뺀다 (프롬프트에서 직접 @멘션한 덱은 사용자의 뜻이므로 둔다)
  const kept = sourcesOn ? contexts : contexts.filter((c) => !(c.kind === DECK_KIND && !c.handle));
  if (!doc) {
    useAiScopeStore.getState().setTurn(null);
    return kept;
  }
  const explicit = kept.filter((c) => c.handle);
  const targets = explicit.filter((c) => SELECTION_KINDS.has(c.kind)).map(refTarget).filter((t): t is ScopeTarget => !!t);
  const pages = explicit.filter((c) => c.kind === "page" && doc.pages.some((p) => p.pageId === c.id)).map((c) => c.id);
  // 프롬프트의 @선택이 가장 우선 (범위 OFF 여도 사용자가 이번 메시지에 직접 집은 것) → 설정바 범위 → 범위 OFF 면 문서 없이
  const base =
    oneOffScope(doc, targets, pages) ??
    (scopeOn ? currentScope(doc, useSlotSelectionStore.getState(), docState.activePageId || null) : offScope(doc.docId));
  if (!base) {
    useAiScopeStore.getState().setTurn(null);
    return kept;
  }
  const scope = { ...base, sourcesOff: !sourcesOn };
  useAiScopeStore.getState().setTurn(scope);
  const ref = scopeContextRef(doc, scope, docState.activePageId || null);
  return [ref, ...kept.filter((c) => c.kind !== SCOPE_CONTEXT_KIND)];
}

/** 📌 — 범위로 고정. 이미 그것이 고정돼 있으면 다시 눌러 해제한다. */
function pinContext(ref: ContextRef) {
  const doc = selectActiveDocument(useStudioDocumentStore.getState());
  const target = refTarget(ref);
  if (!doc || !target) return;
  const store = useAiScopeStore.getState();
  const current = store.settingFor(doc.docId);
  if (current.fixed && current.target?.id === target.id) store.clearPin(doc.docId);
  else store.pinTarget(doc.docId, target);
}

/** 이 첨부가 지금 범위로 고정돼 있는가 (📌 표시) */
function isPinned(ref: ContextRef): boolean {
  const doc = selectActiveDocument(useStudioDocumentStore.getState());
  const target = refTarget(ref);
  if (!doc || !target) return false;
  const current = useAiScopeStore.getState().settingFor(doc.docId);
  return current.fixed && current.target?.id === target.id;
}

const SUGGESTIONS: ComposerSuggestion[] = [
  { label: "이 문서 구조를 요약하고 비어 있는 슬롯을 찾아줘", prompt: "이 문서 구조를 요약하고, 내용이 비어 있거나 부족한 슬롯을 찾아줘." },
  { label: "선택한 슬롯을 백데이터 근거로 다시 써서 변경안으로 올려줘", prompt: "선택한 슬롯을 연결된 백데이터를 근거로 다시 써서 변경안으로 올려줘." },
  { label: "결의사항 슬롯으로 이동해서 보여줘", prompt: "결의사항이나 결론에 해당하는 슬롯을 찾아서 캔버스에서 보여줘." },
];

function useEngineStatus() {
  const [engines, setEngines] = React.useState<EngineStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const refresh = React.useCallback(async () => {
    try {
      const next = await aiRuntime.client.engines();
      // 15초 폴링 결과가 같으면 상태를 바꾸지 않는다 (패널 전체 재렌더 방지).
      setEngines((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);
  React.useEffect(() => {
    // Composer 를 여는 순간 agy 프로세스를 예열해 첫 질문의 기동 지연(~5초)을 없앤다.
    void aiRuntime.client.warmup().catch(() => undefined).finally(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return { engines, error, refresh };
}

/**
 * 배경 정보 · 첨부 제안. 선택 · 문서 스토어를 컴포넌트 밖에서 구독해 다시 계산하고, 결과가 실제로
 * 달라졌을 때만 상태를 바꾼다. (예전에는 `docs` 를 구독해 슬롯에 글자를 칠 때마다 Composer 패널
 * 전체 — 대화 기록까지 — 가 다시 그려졌다.)
 */
function useAutoContexts(): { auto: ContextRef[]; suggested: ContextRef[] } {
  // 제공자 등록은 페이지 effect 에서 일어나므로(첫 렌더 이후) 레지스트리 변화도 구독한다.
  const providers = useRegistryList(aiRuntime.contexts);
  const compute = () => ({ auto: aiRuntime.contexts.autoContexts(), suggested: aiRuntime.contexts.suggestedContexts() });
  const [value, setValue] = React.useState(compute);
  const keyRef = React.useRef(JSON.stringify(value));

  React.useEffect(() => {
    let timer: number | null = null;
    const recompute = () => {
      timer = null;
      const next = compute();
      const key = JSON.stringify(next);
      if (key === keyRef.current) return;
      keyRef.current = key;
      setValue(next);
    };
    // 같은 틱의 여러 변경(선택 + 문서)은 한 번만 계산한다.
    const schedule = () => {
      if (timer === null) timer = window.setTimeout(recompute, 0);
    };
    recompute();
    const unsubscribers = [
      useSlotSelectionStore.subscribe(schedule),
      useStudioDocumentStore.subscribe(schedule),
      // 체크된 지식 덱도 자동 첨부된다 — 덱 목록이 늦게 오거나 체크가 바뀌면 다시 계산한다
      useKnowledgeDeckStore.subscribe(schedule),
      // 설정바 범위가 바뀌면 범위 첨부도 다시
      useAiScopeStore.subscribe(schedule),
    ];
    return () => {
      unsubscribers.forEach((u) => u());
      if (timer !== null) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers]);

  return value;
}

export interface AiComposerViewProps {
  headerActions?: React.ReactNode;
}

/** 스튜디오 오른쪽 패널의 AI Composer (공용 런타임 · 세션에 연결). */
export const AiComposerView: React.FC<AiComposerViewProps> = ({ headerActions }) => {
  const { engines, error, refresh } = useEngineStatus();
  const { auto: autoContexts, suggested: suggestedContexts } = useAutoContexts();
  // 고정 상태가 바뀌면 입력창의 📌 표시도 다시 그린다 (판정 함수가 새로 만들어져 칩이 다시 그려진다)
  const scopeSettings = useAiScopeStore((s) => s.settings);
  const isPinnedNow = React.useCallback((ref: ContextRef) => isPinned(ref), [scopeSettings]); // eslint-disable-line react-hooks/exhaustive-deps

  const onChangeEngine = async (provider: string, model: string) => {
    composerController.setEngine(provider, model);
    try {
      // AI 설정 모달과 같은 원장(런타임 정책)에 기록 — 다음 세션 · 인라인도 같은 엔진을 쓴다.
      await aiRuntime.client.updatePrimaryEngine(provider, model);
      await aiRuntime.client.warmup();
    } catch {
      /* 정책 저장 실패여도 이 세션은 선택한 엔진으로 진행한다 */
    }
    void refresh();
  };

  return (
    <ComposerPanel
      runtime={aiRuntime}
      controller={composerController}
      autoContexts={autoContexts}
      suggestedContexts={suggestedContexts}
      engines={engines}
      enginesError={error}
      onChangeEngine={(p, m) => void onChangeEngine(p, m)}
      suggestions={SUGGESTIONS}
      headerActions={headerActions}
      settingsBar={<ComposerSettingsBar />}
      pinnable={(ref) => SELECTION_KINDS.has(ref.kind)}
      onPinContext={pinContext}
      isPinned={isPinnedNow}
      onBeforeSend={scopeForSend}
    />
  );
};

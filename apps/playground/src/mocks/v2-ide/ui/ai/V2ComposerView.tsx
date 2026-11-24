import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ContextRef, EngineStatus } from "@vibe/ai-kernel";
import { ComposerPanel, type ComposerSuggestion } from "@vibe/ai-composer";
import { useRegistryList } from "@vibe/ai-react";

import type { V2AiWorkspace } from "@vibe/ai-vault";
import { V2ComposerSettingsBar } from "./V2ComposerSettingsBar";
import { V2StagedChangesPanel } from "./V2StagedChangesPanel";

/**
 * v2 우측 도크 AI 탭 — studio `AiComposerView` 와 같은 ComposerPanel (공용 패키지) 에 v2 설정바 · 변경안 검토를 붙인다.
 */
const SUGGESTIONS: ComposerSuggestion[] = [
  { label: "이 문서 구조를 요약하고 비어 있는 슬롯을 찾아줘", prompt: "이 문서 구조를 요약하고, 내용이 비어 있거나 부족한 슬롯을 찾아줘." },
  { label: "선택한 칸을 리소스를 근거로 채워 변경안으로 올려줘", prompt: "선택한 칸을 리소스를 근거로 채워서 변경안으로 올려줘." },
  { label: "결론에 해당하는 칸을 찾아서 캔버스에서 보여줘", prompt: "결의사항이나 결론에 해당하는 슬롯을 찾아서 캔버스에서 보여줘." },
];

function useEngineStatus(ai: V2AiWorkspace) {
  const [engines, setEngines] = useState<EngineStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const next = await ai.runtime.client.engines();
      setEngines((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [ai]);
  useEffect(() => {
    // 패널을 여는 순간 agy 를 예열해 첫 질문의 기동 지연을 없앤다 (studio 와 같다)
    void ai.runtime.client.warmup().catch(() => undefined).finally(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [ai, refresh]);
  return { engines, error, refresh };
}

/** 자동 첨부 · 첨부 제안 — 설정 · 선택 · 탭 · 볼트가 바뀌면 다시 계산 (값이 같으면 다시 그리지 않는다). */
function useAutoContexts(ai: V2AiWorkspace, subscribe: (cb: () => void) => () => void): { auto: ContextRef[]; suggested: ContextRef[]; revision: number } {
  const providers = useRegistryList(ai.runtime.contexts);
  const compute = () => ({ auto: ai.runtime.contexts.autoContexts(), suggested: ai.runtime.contexts.suggestedContexts() });
  const [value, setValue] = useState(() => ({ ...compute(), revision: 0 }));
  const keyRef = useRef(JSON.stringify(value.auto) + JSON.stringify(value.suggested));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const recompute = () => {
      timer = null;
      const next = compute();
      const key = JSON.stringify(next.auto) + JSON.stringify(next.suggested);
      if (key === keyRef.current) return;
      keyRef.current = key;
      setValue((prev) => ({ ...next, revision: prev.revision + 1 }));
    };
    const schedule = () => {
      if (timer === null) timer = setTimeout(recompute, 120);
    };
    recompute();
    const off = subscribe(schedule);
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers, ai, subscribe]);
  return value;
}

export const V2ComposerView: React.FC<{
  readonly ai: V2AiWorkspace;
  /** 탭 · 선택 · 볼트 변경 구독 (런타임이 넘긴다) */
  readonly subscribe: (cb: () => void) => () => void;
}> = ({ ai, subscribe }) => {
  const { engines, error, refresh } = useEngineStatus(ai);
  const { auto, suggested, revision } = useAutoContexts(ai, subscribe);
  const scopeByPath = useStore(ai, "scopeByPath");
  const resourceFolders = useStore(ai, "resourceFolders");
  const isPinned = useCallback((ref: ContextRef) => ai.isPinned(ref), [ai, scopeByPath, resourceFolders]); // eslint-disable-line react-hooks/exhaustive-deps

  const onChangeEngine = async (provider: string, model: string) => {
    ai.controller.setEngine(provider, model);
    try {
      await ai.runtime.client.updatePrimaryEngine(provider, model);
      await ai.runtime.client.warmup();
    } catch {
      /* 정책 저장 실패여도 이 세션은 고른 엔진으로 */
    }
    void refresh();
  };

  return (
    <div data-testid="v2-ai-composer" className="flex min-h-0 flex-1 flex-col bg-white text-slate-900">
      <ComposerPanel
        runtime={ai.runtime}
        controller={ai.controller}
        autoContexts={auto}
        suggestedContexts={suggested}
        engines={engines}
        enginesError={error}
        onChangeEngine={(p, m) => void onChangeEngine(p, m)}
        suggestions={SUGGESTIONS}
        settingsBar={
          <>
            <V2StagedChangesPanel ai={ai} />
            <V2ComposerSettingsBar ai={ai} revision={revision} />
          </>
        }
        pinnable={ai.pinnable}
        onPinContext={ai.pinContext}
        isPinned={isPinned}
        onBeforeSend={ai.scopeForSend}
        onAttachFiles={(files) => ai.attachFiles(files)}
      />
    </div>
  );
};

/** 스토어의 한 필드만 구독 (설정이 바뀌면 📌 표시를 다시 그린다). */
function useStore<K extends keyof ReturnType<V2AiWorkspace["store"]["getState"]>>(ai: V2AiWorkspace, key: K) {
  const [value, setValue] = useState(() => ai.store.getState()[key]);
  useEffect(() => ai.store.subscribe((s) => setValue(s[key])), [ai, key]);
  return value;
}

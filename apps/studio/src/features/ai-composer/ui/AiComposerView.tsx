import React from "react";

import type { ContextRef, EngineStatus } from "@vibe/ai-kernel";
import { ComposerPanel, type ComposerSuggestion } from "@vibe/ai-composer";
import { useRegistryList } from "@vibe/ai-react";

import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { aiRuntime, composerController } from "@/shared/ai";

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
    const unsubscribers = [useSlotSelectionStore.subscribe(schedule), useStudioDocumentStore.subscribe(schedule)];
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
    />
  );
};

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type { ComposerSessionController, ContextRef, EngineStatus } from "@vibe/ai-kernel";
import { ComposerPanel, ComposerTabs, type ComposerSuggestion } from "@vibe/ai-composer";
import { useRegistryList, type AssetCardSummary } from "@vibe/ai-react";
import type { VaultPort } from "@vibe/vault-core";
import { collectVaultAssets } from "@vibe/vault-formats";
import { getActiveAssetDriver } from "@vibe/vdoc-schema";

import type { V2AiWorkspace } from "@vibe/ai-vault";
import {
  dispatchAssetHubCommand,
  type AguiAssetFunnelRequest,
} from "../../model/assetActionBus";
import { AguiAssetFunnelCard } from "./AguiAssetFunnelCard";
import { V2ComposerSettingsBar } from "./V2ComposerSettingsBar";
import { V2StagedChangesPanel } from "./V2StagedChangesPanel";

/**
 * v2 우측 도크 AI 탭 — studio `AiComposerView` 와 같은 ComposerPanel (공용 패키지) 에 v2 설정바 · 변경안 검토를 붙인다.
 */
const SUGGESTIONS: ComposerSuggestion[] = [
  {
    label: "✨ 지금 내용에 맞는 문서 양식(에셋) 추천해줘",
    prompt:
      "현재 열린 아웃라인/문서 내용을 읽고 assets.search 로 볼트 에셋 중 가장 적합한 Top 3를 <<agui:asset-picks: ...>> 로 추천해줘.",
  },
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
function useAutoContexts(
  ai: V2AiWorkspace,
  subscribe: (cb: () => void) => () => void,
  sessionKey: string
): { auto: ContextRef[]; suggested: ContextRef[]; revision: number } {
  const providers = useRegistryList(ai.runtime.contexts);
  // 메인은 지금 화면 기준, 기준점 세션은 기준점 기준
  const compute = () => ai.contextsFor(sessionKey);
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
  }, [providers, ai, subscribe, sessionKey]);
  return value;
}

export const V2ComposerView: React.FC<{
  readonly ai: V2AiWorkspace;
  /** 탭 · 선택 · 볼트 변경 구독 (런타임이 넘긴다) */
  readonly subscribe: (cb: () => void) => () => void;
  readonly vault?: VaultPort;
  readonly activeResourceId?: string | null;
  readonly aguiFunnelTrigger?: { readonly seq: number; readonly req: AguiAssetFunnelRequest } | null;
}> = ({ ai, subscribe, vault, activeResourceId = null, aguiFunnelTrigger = null }) => {
  const engineStatus = useEngineStatus(ai);
  return (
    <div data-testid="v2-ai-composer" className="flex min-h-0 flex-1 flex-col bg-white text-slate-900">
      <ComposerTabs
        registry={ai.sessions}
        onSelect={ai.openSession}
        onReveal={ai.revealAnchor}
        onComplete={ai.requestCompleteSession}
        renderPanel={(key, controller) => (
          <V2SessionPanel
            ai={ai}
            subscribe={subscribe}
            sessionKey={key}
            controller={controller}
            engineStatus={engineStatus}
            vault={vault}
            activeResourceId={activeResourceId}
            aguiFunnelTrigger={aguiFunnelTrigger}
          />
        )}
      />
    </div>
  );
};

/** 탭 하나의 Composer (메인 또는 기준점 세션) */
const V2SessionPanel: React.FC<{
  readonly ai: V2AiWorkspace;
  readonly subscribe: (cb: () => void) => () => void;
  readonly sessionKey: string;
  readonly controller: ComposerSessionController;
  readonly engineStatus: ReturnType<typeof useEngineStatus>;
  readonly vault?: VaultPort;
  readonly activeResourceId: string | null;
  readonly aguiFunnelTrigger: { readonly seq: number; readonly req: AguiAssetFunnelRequest } | null;
}> = ({
  ai,
  subscribe,
  sessionKey,
  controller,
  engineStatus,
  vault,
  activeResourceId,
  aguiFunnelTrigger,
}) => {
    const { engines, error, refresh } = engineStatus;
    const isMain = sessionKey === ai.sessions.mainKey;
    const { auto, suggested, revision } = useAutoContexts(ai, subscribe, sessionKey);
    const scopeByPath = useStore(ai, "scopeByPath");
    const resourceFolders = useStore(ai, "resourceFolders");
    const isPinned = useCallback((ref: ContextRef) => ai.isPinned(ref), [ai, scopeByPath, resourceFolders]); // eslint-disable-line react-hooks/exhaustive-deps

    const [funnelOpen, setFunnelOpen] = useState(false);
    const lastTriggerSeqRef = useRef<number>(0);
    useEffect(() => {
      if (!isMain || !aguiFunnelTrigger) return;
      if (aguiFunnelTrigger.seq !== lastTriggerSeqRef.current) {
        lastTriggerSeqRef.current = aguiFunnelTrigger.seq;
        setFunnelOpen(true);
      }
    }, [isMain, aguiFunnelTrigger]);

    const resolveAssetCard = useCallback(
      (assetId: string): AssetCardSummary | null => {
        if (!vault) return null;
        const entry = collectVaultAssets(vault).find(
          (e) => e.asset.assetId === assetId || e.asset.title === assetId
        );
        if (!entry) return null;
        const meta = getActiveAssetDriver().summarizeForSelect(entry.asset);
        return {
          id: entry.asset.assetId,
          title: entry.asset.title,
          badges: meta.badges,
          summary: entry.asset.nuance.summary,
          flowMode: meta.flowMode,
        };
      },
      [vault]
    );

    const handlePreviewAsset = useCallback((assetId: string) => {
      dispatchAssetHubCommand({ type: "stage-preview", assetId });
    }, []);

    const handleInsertAssetSkeleton = useCallback((assetId: string) => {
      dispatchAssetHubCommand({ type: "insert-skeleton", assetId });
    }, []);

    const onChangeEngine = async (provider: string, model: string) => {
      controller.setEngine(provider, model);
      if (!isMain) return; // 기준점 세션은 그 세션만 바꾼다 (기본 엔진 정책은 메인에서)
      try {
        await ai.runtime.client.updatePrimaryEngine(provider, model);
        await ai.runtime.client.warmup();
      } catch {
        /* 정책 저장 실패여도 이 세션은 고른 엔진으로 */
      }
      void refresh();
    };

    return (
      <ComposerPanel
        runtime={ai.runtime}
        controller={controller}
        autoContexts={auto}
        suggestedContexts={suggested}
        engines={engines}
        enginesError={error}
        onChangeEngine={(p, m) => void onChangeEngine(p, m)}
        suggestions={isMain ? SUGGESTIONS : []}
        headerActions={
          vault && isMain ? (
            <button
              type="button"
              data-testid="composer-agui-funnel-toggle"
              onClick={() => setFunnelOpen((prev) => !prev)}
              title="AG-UI 2-클릭 양식(에셋) 추천 깔때기 열기/닫기"
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10.5px] font-semibold transition-colors cursor-pointer ${funnelOpen
                ? "border-emerald-500 bg-emerald-600 text-white"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                }`}
            >
              <Sparkles className="h-3 w-3" />
              <span>양식 추천</span>
            </button>
          ) : undefined
        }
        topBanner={
          vault && isMain && funnelOpen ? (
            <AguiAssetFunnelCard
              vault={vault}
              activeResourceId={activeResourceId}
              request={aguiFunnelTrigger?.req ?? null}
              onClose={() => setFunnelOpen(false)}
              onSendAiPrompt={(prompt) => {
                const ctxs = ai.scopeForSend(prompt, auto);
                void controller.send(prompt, ctxs);
              }}
            />
          ) : undefined
        }
        settingsBar={
          <>
            <V2StagedChangesPanel ai={ai} sessionKey={sessionKey} />
            <V2ComposerSettingsBar ai={ai} revision={revision} />
          </>
        }
        pinnable={ai.pinnable}
        onPinContext={ai.pinContext}
        isPinned={isPinned}
        onBeforeSend={isMain ? ai.scopeForSend : ai.scopeForSendIn(sessionKey)}
        onAttachFiles={(files) => ai.attachFiles(files)}
        onOpenResource={(rawTag) => {
          ai.revealResource(rawTag);
        }}
        onPreviewAsset={handlePreviewAsset}
        onInsertAssetSkeleton={handleInsertAssetSkeleton}
        resolveAssetCard={resolveAssetCard}
      />
    );
  };

/** 스토어의 한 필드만 구독 (설정이 바뀌면 📌 표시를 다시 그린다). */
function useStore<K extends keyof ReturnType<V2AiWorkspace["store"]["getState"]>>(ai: V2AiWorkspace, key: K) {
  const [value, setValue] = useState(() => ai.store.getState()[key]);
  useEffect(() => ai.store.subscribe((s) => setValue(s[key])), [ai, key]);
  return value;
}

import { useCallback, useRef, useState, useSyncExternalStore } from "react";

import {
  runInlineAction,
  type AiAction,
  type AiRuntime,
  type ComposerSessionController,
  type ComposerState,
  type ContextRef,
  type Registry,
} from "@vibe/ai-kernel";

export function useComposerState(controller: ComposerSessionController): ComposerState {
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
}

export function useRegistryList<T>(registry: Registry<T>): T[] {
  return useSyncExternalStore(
    (l) => registry.subscribe(l),
    () => registry.list(),
    () => registry.list()
  );
}

export type InlineRunStatus = "idle" | "running" | "done" | "error";

export interface InlineRunRequest {
  instruction: string;
  contexts: ContextRef[];
  outputFormat: "html" | "text" | "markdown" | "slot-map";
  action?: AiAction;
}

/** 인라인 실행 하나의 상태 (스트리밍 미리보기 · 결과 · 오류 · 중단 · 재시도). */
export function useInlineAiRun(runtime: AiRuntime) {
  const [status, setStatus] = useState<InlineRunStatus>("idle");
  const [streamText, setStreamText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<InlineRunRequest | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (request: InlineRunRequest) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLastRequest(request);
      setStatus("running");
      setStreamText("");
      setResult(null);
      setError(null);
      setStatusMessage(null);
      const startedAt = performance.now();
      try {
        const text = await runInlineAction(
          runtime,
          request,
          { onDelta: setStreamText, onStatus: setStatusMessage },
          controller.signal
        );
        if (controller.signal.aborted) return;
        setResult(text);
        setStatus("done");
        setStatusMessage(`${((performance.now() - startedAt) / 1000).toFixed(1)}초`);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error && err.message ? err.message : "AI 실행에 실패했습니다.");
        setStatus("error");
      }
    },
    [runtime]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus((s) => (s === "running" ? "idle" : s));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
    setStreamText("");
    setResult(null);
    setError(null);
  }, []);

  const retry = useCallback(() => {
    if (lastRequest) void run(lastRequest);
  }, [lastRequest, run]);

  return { status, streamText, result, error, statusMessage, lastRequest, run, cancel, reset, retry };
}

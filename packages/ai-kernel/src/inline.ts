import type { InlineRunPayload } from "./client";
import type { AiRuntime } from "./runtime";
import type { AiAction, AiActionInput, ContextRef } from "./types";

/**
 * 인라인 AI 표면 어댑터. 화면마다 다른 부분(대상 · 미리보기 · 반영 방법)은 여기서만 정의하고,
 * 실행 · 스트리밍 · 재시도 · 중단은 공용 훅(`useInlineAiRun`)이 맡는다.
 */
export interface InlineAiSurface<TTarget = unknown> {
  /** `slot-richtext` | `outline-node` | `table-cell` | `reference-selection` … — 액션 필터 키. */
  id: string;
  /** 칩에 보일 대상 이름. */
  targetLabel(target: TTarget): string;
  /** 공용 컨텍스트 참조로 변환 (Composer 로 넘길 때도 같은 값). */
  toContexts(target: TTarget): ContextRef[];
  outputFormat: InlineRunPayload["outputFormat"];
  /** 결과 미리보기 방식. */
  preview: "html" | "text" | "inline-diff";
  /** 사용자가 결과를 수락했을 때 반영 (직접 쓰기 또는 Staged 제출). */
  apply(target: TTarget, result: string): void;
  /** 빠른 지시(액션)의 지시문을 만들 때 넘길 입력 (선택 텍스트 등). */
  actionInput?(target: TTarget): AiActionInput;
}

export interface InlineRunCallbacks {
  onDelta?(text: string): void;
  onStatus?(message: string): void;
}

/** 인라인 실행 한 번. 결과 본문을 돌려준다 (실패 시 예외). */
export async function runInlineAction(
  runtime: AiRuntime,
  request: { instruction: string; contexts: ContextRef[]; outputFormat: InlineRunPayload["outputFormat"]; action?: AiAction },
  callbacks: InlineRunCallbacks = {},
  signal?: AbortSignal
): Promise<string> {
  let streamed = "";
  let result: string | null = null;
  let error: string | null = null;
  await runtime.client.runInline(
    {
      actionId: request.action?.id,
      instruction: request.instruction,
      contexts: runtime.contexts.resolve(request.contexts),
      outputFormat: request.outputFormat,
    },
    (event) => {
      if (event.type === "text_delta") {
        streamed += event.text;
        callbacks.onDelta?.(streamed);
      } else if (event.type === "result") {
        result = event.text;
      } else if (event.type === "error") {
        error = event.message;
      } else if (event.type === "status") {
        callbacks.onStatus?.(event.message);
      }
    },
    signal
  );
  if (error) throw new Error(error);
  const final = (result ?? streamed).trim();
  if (!final) throw new Error("AI 가 빈 결과를 돌려주었습니다.");
  return final;
}

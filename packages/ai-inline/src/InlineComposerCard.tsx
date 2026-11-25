import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, ListChecks, Loader2, MessageSquareShare, Minimize2, Plus, Sparkles, Square, Wand2, X } from "lucide-react";

import {
  resolveActionInstruction,
  type AiAction,
  type AiRuntime,
  type ContextRef,
  type InlineAiSurface,
} from "@vibe/ai-kernel";
import { AcceptRejectBar, ContextChip, useInlineAiRun, useRegistryList } from "@vibe/ai-react";

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "file-text": FileText,
  "list-checks": ListChecks,
  wand: Wand2,
  minimize: Minimize2,
};

export interface InlineEscalation {
  instruction: string;
  contexts: ContextRef[];
  result: string | null;
}

export interface InlineComposerCardProps<TTarget> {
  runtime: AiRuntime;
  surface: InlineAiSurface<TTarget>;
  target: TTarget;
  /** 대상 칩 옆에 붙일 화면 고유 칩 (백데이터 연결 버튼, 줄 수 제약 …). */
  extraChips?: React.ReactNode;
  placeholder?: string;
  /** 열리자마자 실행할 지시 (선택 영역 AI 바). */
  initialInstruction?: string;
  onClose(): void;
  /** "Composer 에서 이어하기" — 이 실행의 컨텍스트와 결과를 Composer 로 넘긴다. */
  onEscalate?(payload: InlineEscalation): void;
}

/**
 * 대상(슬롯 · 노드 · 셀 …) 옆에 붙는 인라인 AI 카드 — 피그마 "프롬프트로 편집하기" 팝오버 모양.
 * 위: 지시 입력 · 아래 줄: + (빠른 지시) · 대상 칩 · 맥락 칩 · 화면 칩 · Composer 로 · 보내기.
 * 실행 · 스트리밍 · 재시도 · 중단은 공용 훅, 대상 · 반영 방법은 표면 어댑터가 정한다 (기능은 예전과 같다).
 */
export function InlineComposerCard<TTarget>({
  runtime,
  surface,
  target,
  extraChips,
  placeholder,
  initialInstruction,
  onClose,
  onEscalate,
}: InlineComposerCardProps<TTarget>) {
  const [instruction, setInstruction] = useState(initialInstruction ?? "");
  const run = useInlineAiRun(runtime);
  const allActions = useRegistryList(runtime.actions);
  const actions = allActions.filter((a) => a.surfaces.includes(surface.id));
  const contexts = surface.toContexts(target);

  const start = (text: string, action?: AiAction) => {
    const body = text.trim();
    if (!body) return;
    void run.run({ instruction: body, contexts, outputFormat: action?.outputFormat ?? surface.outputFormat, action });
  };

  const ranInitial = useRef<string | null>(null);
  useEffect(() => {
    if (initialInstruction && ranInitial.current !== initialInstruction) {
      ranInitial.current = initialInstruction;
      setInstruction(initialInstruction);
      start(initialInstruction);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInstruction]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (run.status === "running") run.cancel();
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, onClose]);

  const preview = run.status === "done" ? run.result : run.status === "running" ? run.streamText : null;
  const [actionsOpen, setActionsOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 입력 높이를 내용에 맞춘다 (피그마 입력처럼 1줄에서 시작해 최대 6줄까지).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 6 * 20 + 16)}px`;
  }, [instruction]);

  const submit = () => {
    if (run.status !== "running") start(instruction);
  };

  return (
    <div data-testid="inline-ai-card" onClick={(e) => e.stopPropagation()} className="fig-panel fig-prompt">
      {run.status === "error" && (
        <div role="alert" data-testid="composer-error" className="px-3 py-2 text-[11px] text-[#c4320a] bg-[#fff1ee] border-b border-[#ffd8cf]">
          {run.error}
        </div>
      )}

      {preview !== null && (
        <div className="px-3 pt-3 pb-2 border-b border-[var(--fig-border)]">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 font-semibold text-black/80">
              {run.status === "running" ? <Loader2 className="w-3 h-3 animate-spin text-[var(--vds-accent)]" /> : <Sparkles className="w-3 h-3 text-[var(--vds-accent)]" />}
              {run.status === "running" ? "작성 중…" : "미리보기 · 반영 전"}
            </span>
            <span className="text-black/40 truncate max-w-[200px]">
              {run.statusMessage ?? ""} {run.lastRequest ? `· "${run.lastRequest.instruction.slice(0, 40)}"` : ""}
            </span>
          </div>
          {surface.preview === "html" && run.status === "done" ? (
            <div
              className="max-h-56 overflow-y-auto p-2.5 rounded-[5px] bg-[#f5f5f5] text-black/90 text-xs prose prose-sm max-w-none select-text"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(preview) }}
            />
          ) : (
            <div className="max-h-56 overflow-y-auto p-2.5 rounded-[5px] bg-[#f5f5f5] text-black/80 text-xs whitespace-pre-wrap break-words select-text">
              {preview || "…"}
            </div>
          )}
          {run.status === "done" && run.result && (
            <div className="mt-2">
              <AcceptRejectBar
                tone="light"
                acceptLabel="반영 (Accept)"
                onAccept={() => {
                  surface.apply(target, run.result!);
                  run.reset();
                  onClose();
                }}
                onRetry={run.retry}
                onReject={run.reset}
              />
            </div>
          )}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="relative"
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            // Enter 보내기 · Shift+Enter 줄바꿈. 한글 조합 중 Enter 는 글자 확정이라 보내지 않는다.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder ?? "이 대상을 어떻게 작성·수정할까요?"}
          className="fig-prompt-input select-text"
          autoFocus
        />
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 fig-icon-btn !w-6 !h-6"
          title="닫기 (Esc)"
          data-testid="inline-ai-close"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-1 px-2 pb-2 pt-1">
          {actions.length > 0 && (
            <div className="relative shrink-0">
              <button
                type="button"
                data-testid="inline-ai-actions-btn"
                aria-expanded={actionsOpen}
                onClick={() => setActionsOpen((v) => !v)}
                title="빠른 지시"
                className="fig-icon-btn"
              >
                <Plus className="w-4 h-4" />
              </button>
              {actionsOpen && (
                <div className="fig-menu absolute left-0 bottom-8 w-56 z-10">
                  <div className="px-2 pb-1 text-white/50">빠른 지시</div>
                  {actions.map((action) => {
                    const Icon = (action.icon && ACTION_ICONS[action.icon]) || Wand2;
                    return (
                      <button
                        key={action.id}
                        type="button"
                        disabled={run.status === "running"}
                        onClick={() => {
                          const text = resolveActionInstruction(action, { target: contexts[0], ...surface.actionInput?.(target) });
                          setInstruction(text);
                          setActionsOpen(false);
                          start(text, action);
                        }}
                        className="fig-menu-item disabled:opacity-40"
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {action.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1">
            <span className="fig-prompt-chip" title={surface.targetLabel(target)}>
              <Sparkles className="w-3 h-3 shrink-0" />
              <span className="truncate">{surface.targetLabel(target)}</span>
            </span>
            {contexts
              .filter((c) => c.kind !== "slot")
              .map((c) => (
                <ContextChip key={`${c.kind}:${c.id}`} context={c} tone="light" />
              ))}
            {extraChips}
          </div>

          {onEscalate && (
            <button
              type="button"
              data-testid="inline-ai-escalate"
              onClick={() => onEscalate({ instruction: instruction || run.lastRequest?.instruction || "", contexts, result: run.result })}
              className="fig-icon-btn shrink-0"
              title="Composer 로 — 이 대상과 결과를 AI Composer 로 넘겨 대화로 이어가기"
            >
              <MessageSquareShare className="w-3.5 h-3.5" />
            </button>
          )}
          {run.status === "running" ? (
            <button type="button" onClick={run.cancel} className="fig-prompt-send" title="중단 (Esc)">
              <Square className="w-2.5 h-2.5 fill-current" />
            </button>
          ) : (
            <button type="submit" disabled={!instruction.trim()} className="fig-prompt-send" title="보내기 (Enter)">
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** 미리보기 전용 최소 정화 — 스크립트 · 이벤트 핸들러 · javascript: 링크를 걷어 낸다. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "");
}

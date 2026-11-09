import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, ListChecks, Loader2, MessageSquareShare, Minimize2, Sparkles, Wand2, X } from "lucide-react";

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
 * 대상(슬롯 · 노드 · 셀 …) 옆에 붙는 인라인 AI 카드.
 * 실행 · 스트리밍 · 재시도 · 중단은 공용 훅, 대상 · 반영 방법은 표면 어댑터가 정한다.
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

  return (
    <div
      data-testid="inline-ai-card"
      onClick={(e) => e.stopPropagation()}
      className="mt-2 rounded-xl bg-slate-900 text-slate-100 shadow-2xl border border-emerald-500/50 overflow-hidden transition-all z-30"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-950/80 border-b border-slate-800 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
            <Sparkles className="w-3 h-3" />
            {surface.targetLabel(target)}
          </span>
          {contexts
            .filter((c) => c.kind !== "slot")
            .map((c) => (
              <ContextChip key={`${c.kind}:${c.id}`} context={c} tone="dark" />
            ))}
          {extraChips}
        </div>
        <div className="flex items-center gap-1">
          {onEscalate && (
            <button
              type="button"
              data-testid="inline-ai-escalate"
              onClick={() => onEscalate({ instruction: instruction || run.lastRequest?.instruction || "", contexts, result: run.result })}
              className="inline-flex items-center gap-1 text-slate-400 hover:text-white px-1.5 py-1 rounded-md hover:bg-slate-800 transition text-[11px] cursor-pointer"
              title="이 대상과 결과를 AI Composer 로 넘겨 대화로 이어가기"
            >
              <MessageSquareShare className="w-3.5 h-3.5" /> Composer 로
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition cursor-pointer"
            title="닫기 (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {run.status === "error" && (
        <div role="alert" data-testid="composer-error" className="px-3 py-2 text-xs text-rose-200 bg-rose-950/60 border-b border-rose-900/60">
          {run.error}
        </div>
      )}

      {preview !== null && (
        <div className="p-3 bg-slate-900/95 border-b border-slate-800">
          <div className="text-[11px] font-medium text-emerald-400 mb-1.5 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1">
              {run.status === "running" ? <Loader2 className="w-3 h-3 animate-spin" /> : "✨"}
              {run.status === "running" ? "작성 중…" : "미리보기 (반영 전)"}
            </span>
            <span className="text-slate-500 font-normal truncate max-w-xs">
              {run.statusMessage ?? ""} {run.lastRequest ? `· "${run.lastRequest.instruction.slice(0, 40)}"` : ""}
            </span>
          </div>
          {surface.preview === "html" && run.status === "done" ? (
            <div
              className="p-2.5 rounded-lg bg-slate-800/90 border border-slate-700 text-slate-100 text-xs prose prose-invert prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(preview) }}
            />
          ) : (
            <div className="p-2.5 rounded-lg bg-slate-800/90 border border-slate-700 text-slate-200 text-xs whitespace-pre-wrap break-words font-mono">
              {preview || "…"}
            </div>
          )}
          {run.status === "done" && run.result && (
            <div className="mt-2.5">
              <AcceptRejectBar
                tone="dark"
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
          start(instruction);
        }}
        className="flex items-center gap-2 px-3 py-2 bg-slate-900"
      >
        <Sparkles className={`w-4 h-4 shrink-0 ${run.status === "running" ? "text-amber-400 animate-spin" : "text-emerald-400"}`} />
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={placeholder ?? "이 대상을 어떻게 작성·수정할까요?"}
          className="w-full bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none py-1 select-text"
          autoFocus
        />
        {run.status === "running" ? (
          <button
            type="button"
            onClick={run.cancel}
            className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-[11px] shrink-0 cursor-pointer"
          >
            중단
          </button>
        ) : (
          <button
            type="submit"
            disabled={!instruction.trim()}
            className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition shrink-0 cursor-pointer"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
        )}
      </form>

      {actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-slate-950/60 border-t border-slate-800/80">
          <span className="text-[11px] text-slate-400 mr-1">빠른 지시:</span>
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
                  start(text, action);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-[11px] border border-slate-700/80 transition cursor-pointer disabled:opacity-40"
              >
                <Icon className="w-3 h-3 text-emerald-400" />
                {action.label}
              </button>
            );
          })}
        </div>
      )}
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

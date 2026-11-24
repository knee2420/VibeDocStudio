import React, { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";

import type { SessionStatus } from "@vibe/ai-kernel";
import { SESSION_STATUS_LABEL, SessionStatusDot, useSessionList } from "@vibe/ai-react";
import type { SessionCompletionRequest, V2AiWorkspace } from "@vibe/ai-vault";

/**
 * 무마찰 디렉팅 — 앱 겹층: 알림(내 손이 필요할 때만) · 완료 확인 · 지시 입력.
 */

const ATTENTION: ReadonlySet<SessionStatus> = new Set(["awaiting_approval", "needs_review", "error"]);

/** 왼쪽 리본 배지 — 내 손이 필요한 세션 수 */
export function useAttentionCount(ai: V2AiWorkspace): number {
  return useSessionActivity(ai).attention;
}

/** 왼쪽 리본 — 지금 도는 세션 수(대기열 포함) · 내 손이 필요한 세션 수 */
export function useSessionActivity(ai: V2AiWorkspace): { running: number; queued: number; attention: number } {
  const views = useSessionList(ai.sessions);
  let running = 0;
  let queued = 0;
  let attention = 0;
  for (const v of views) {
    if (v.kind !== "anchored" || v.lifecycle === "completed") continue;
    if (v.status === "running") running++;
    else if (v.status === "queued") queued++;
    if (ATTENTION.has(v.status) || v.unread) attention++;
  }
  return { running, queued, attention };
}

interface Toast {
  readonly id: number;
  readonly key: string;
  readonly title: string;
  readonly status: SessionStatus;
}

/** 뒤 세션이 내 손을 부를 때 (승인 대기 · 검토 필요 · 오류 · 끝남)만 잠깐 띄운다. 앞 세션 · 메인은 띄우지 않는다 */
export function SessionToasts({ ai, onOpen }: { ai: V2AiWorkspace; onOpen(key: string): void }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  useEffect(
    () =>
      ai.sessions.onStatus((event) => {
        const view = ai.sessions.view(event.key);
        if (!view || view.kind !== "anchored" || event.foreground || event.to === "completed") return;
        const finished = event.from === "running" && event.to === "idle";
        if (!ATTENTION.has(event.to) && !finished) return;
        const id = ++seq.current;
        setToasts((list) => [...list.filter((t) => t.key !== event.key), { id, key: event.key, title: view.title, status: event.to }].slice(-4));
        window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 7000);
      }),
    [ai]
  );
  if (!toasts.length) return null;
  return (
    <div data-testid="session-toasts" className="pointer-events-none fixed bottom-12 right-4 z-[120] flex flex-col items-end gap-1.5">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          data-testid="session-toast"
          onClick={() => {
            setToasts((list) => list.filter((x) => x.id !== t.id));
            onOpen(t.key);
          }}
          className="pointer-events-auto flex max-w-[320px] items-center gap-2 rounded-lg border border-white/10 bg-[#24252b]/95 px-3 py-2 text-left text-[12px] text-slate-200 shadow-xl shadow-black/50 backdrop-blur hover:border-violet-400/50"
        >
          <SessionStatusDot status={t.status} />
          <span className="min-w-0 flex-1 truncate">{t.title}</span>
          <span className="shrink-0 text-[11px] text-slate-400">{t.status === "idle" ? "끝남" : SESSION_STATUS_LABEL[t.status]}</span>
        </button>
      ))}
    </div>
  );
}

/** 기준점 완료 · "완료" 버튼 — 검토 안 한 변경안이 있으면 묻는다 */
export function CompletionConfirm({ ai }: { ai: V2AiWorkspace }) {
  const [request, setRequest] = useState<SessionCompletionRequest | null>(null);
  useEffect(() => ai.onCompletionRequest((req) => setRequest(req)), [ai]);
  if (!request) return null;
  const close = (fn: () => void) => {
    fn();
    setRequest(null);
  };
  return (
    <div data-testid="session-complete-confirm" className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40">
      <div className="w-[380px] rounded-xl border border-white/10 bg-[#25262c] p-4 text-[13px] text-slate-200 shadow-2xl">
        <div className="mb-1 font-semibold">세션을 완료할까요?</div>
        <div className="mb-4 text-[12px] leading-relaxed text-slate-400">
          <b className="text-slate-200">{request.title}</b> 에 검토하지 않은 변경안 {request.reviewCount}개가 있습니다.
        </div>
        <div className="flex justify-end gap-1.5">
          <button type="button" onClick={() => close(request.cancel)} className="rounded px-3 py-1.5 text-[12px] text-slate-300 hover:bg-white/10">
            취소
          </button>
          <button
            type="button"
            data-testid="session-complete-keep"
            onClick={() => close(() => request.confirm(false))}
            className="rounded border border-white/15 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-white/10"
          >
            변경안 남기고 완료
          </button>
          <button
            type="button"
            data-testid="session-complete-discard"
            onClick={() => close(() => request.confirm(true))}
            className="rounded bg-violet-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-violet-500"
          >
            버리고 완료
          </button>
        </div>
      </div>
    </div>
  );
}

/** 지시 입력 — 탐색기 우클릭 등 입력창이 없는 화면에서 */
export function DirectivePromptDialog({
  label,
  onSubmit,
  onClose,
}: {
  label: string;
  onSubmit(prompt: string): void;
  onClose(): void;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const submit = () => {
    const prompt = text.trim();
    if (!prompt) return;
    onSubmit(prompt);
    onClose();
  };
  return (
    <div data-testid="directive-dialog" className="fixed inset-0 z-[130] flex items-start justify-center bg-black/30 pt-[18vh]" onMouseDown={onClose}>
      <div className="w-[520px] rounded-xl border border-white/10 bg-[#25262c] p-3 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between text-[12px] text-slate-400">
          <span className="truncate">
            AI 에 지시 던지기 · <b className="text-slate-200">{label}</b>
          </span>
          <button type="button" onClick={onClose} className="rounded p-0.5 hover:bg-white/10">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            data-testid="directive-input"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape") onClose();
            }}
            placeholder="예: 이 자료들을 research/ 폴더에 모으고 요약 md 를 만들어줘 — 뒤에서 돌고, 끝나면 알려 준다"
            className="min-h-[44px] flex-1 resize-none rounded-lg border border-white/10 bg-[#1b1c20] px-2.5 py-2 text-[13px] text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400/60"
          />
          <button
            type="button"
            data-testid="directive-send"
            disabled={!text.trim()}
            onClick={submit}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

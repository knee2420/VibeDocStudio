import React from "react";
import { ArrowUp, AtSign, Slash, Square } from "lucide-react";

import { resolveActionInstruction, type AiAction, type AiRuntime, type ContextRef } from "@vibe/ai-kernel";

import { ContextChip } from "./ContextChip";

type Popover =
  | { kind: "mention"; query: string; start: number; items: ContextRef[] }
  | { kind: "slash"; query: string; start: number; items: AiAction[] };

export interface PromptInputProps {
  runtime: AiRuntime;
  /** `/` 명령 후보를 고를 표면 id (액션 레지스트리 필터). */
  slashSurface: string;
  /** 자동 첨부 후보 (현재 선택 등). 사용자가 끌 수 있다. */
  autoContexts?: ContextRef[];
  busy?: boolean;
  placeholder?: string;
  /** 외부 초안 (인라인 → Composer 이어하기). revision 이 바뀌면 받아들인다. */
  draft?: { text: string; contexts: ContextRef[]; revision: number };
  onSubmit(text: string, contexts: ContextRef[]): void;
  onStop?(): void;
}

/** Composer 입력창 — `@` 멘션(컨텍스트 레지스트리) · `/` 명령(액션 레지스트리) · 첨부 칩. */
export const PromptInput: React.FC<PromptInputProps> = ({
  runtime,
  slashSurface,
  autoContexts = [],
  busy,
  placeholder,
  draft,
  onSubmit,
  onStop,
}) => {
  const [text, setText] = React.useState("");
  const [attached, setAttached] = React.useState<ContextRef[]>([]);
  const [disabledAuto, setDisabledAuto] = React.useState<Set<string>>(new Set());
  const [popover, setPopover] = React.useState<Popover | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const areaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!draft || draft.revision === 0) return;
    setText(draft.text);
    setAttached((prev) => mergeContexts(prev, draft.contexts));
    // 패널 전환 · 인라인 카드 언마운트가 끝난 뒤에 포커스를 가져온다.
    window.setTimeout(() => {
      const el = areaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 60);
  }, [draft?.revision]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  const autoKey = (c: ContextRef) => `${c.kind}:${c.id}`;
  // 같은 대상(id)을 직접 첨부했다면 자동 칩은 숨긴다 (선택 슬롯 = @슬롯).
  const shadowed = (c: ContextRef) => attached.some((a) => a.id === c.id);
  const activeAuto = autoContexts.filter((c) => !disabledAuto.has(autoKey(c)) && !shadowed(c));

  const refreshPopover = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const mention = /(^|\s)@([^\s@]*)$/.exec(before);
    if (mention) {
      const query = mention[2];
      setPopover({ kind: "mention", query, start: caret - query.length - 1, items: runtime.contexts.search(query) });
      setActiveIndex(0);
      return;
    }
    const slash = /^\/([^\s]*)$/.exec(before);
    if (slash) {
      const q = slash[1].toLowerCase();
      const items = runtime.actions
        .forSurface(slashSurface)
        .filter((a) => !q || a.id.toLowerCase().includes(q) || a.label.toLowerCase().includes(q));
      setPopover({ kind: "slash", query: slash[1], start: 0, items });
      setActiveIndex(0);
      return;
    }
    setPopover(null);
  };

  const pick = (index: number) => {
    if (!popover) return;
    const caret = areaRef.current?.selectionStart ?? text.length;
    if (popover.kind === "mention") {
      const ref = popover.items[index];
      if (!ref) return;
      setAttached((prev) => mergeContexts(prev, [ref]));
      setText(text.slice(0, popover.start) + text.slice(caret));
    } else {
      const action = popover.items[index];
      if (!action) return;
      setText(resolveActionInstruction(action) + " ");
    }
    setPopover(null);
    requestAnimationFrame(() => areaRef.current?.focus());
  };

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    onSubmit(body, [...activeAuto, ...attached]);
    setText("");
    setAttached([]);
    setPopover(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return; // 한글 조합 중 Enter 는 조합 확정
    if (popover && popover.items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % popover.items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + popover.items.length) % popover.items.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(activeIndex);
        return;
      }
    }
    if (e.key === "Escape") {
      if (popover) {
        e.preventDefault();
        setPopover(null);
      } else if (busy) {
        onStop?.();
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="relative">
      {popover && (
        <div
          data-testid={`prompt-popover-${popover.kind}`}
          className="absolute bottom-full left-0 right-0 mb-1.5 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl z-30 py-1"
        >
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {popover.kind === "mention" ? "컨텍스트 첨부 (@)" : "명령 (/)"}
          </div>
          {popover.items.length === 0 && <div className="px-3 py-2 text-[11px] text-slate-400">일치하는 항목이 없습니다</div>}
          {popover.kind === "mention"
            ? popover.items.map((ref, idx) => (
                <button
                  type="button"
                  key={`${ref.kind}:${ref.id}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(idx);
                  }}
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs cursor-pointer ${
                    idx === activeIndex ? "bg-indigo-50" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="px-1.5 py-px rounded bg-slate-100 text-[10px] text-slate-500 font-mono shrink-0">{ref.kind}</span>
                  <span className="truncate text-slate-800">{ref.label}</span>
                  {ref.hint && <span className="ml-auto truncate max-w-[45%] text-[10px] text-slate-400">{ref.hint}</span>}
                </button>
              ))
            : popover.items.map((action, idx) => (
                <button
                  type="button"
                  key={action.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(idx);
                  }}
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs cursor-pointer ${
                    idx === activeIndex ? "bg-indigo-50" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="font-mono text-[11px] text-indigo-700 shrink-0">/{action.id}</span>
                  <span className="truncate text-slate-700">{action.label}</span>
                </button>
              ))}
        </div>
      )}

      <div className="rounded-xl border border-slate-300 bg-white shadow-xs focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition">
        {(activeAuto.length > 0 || attached.length > 0 || autoContexts.length > 0) && (
          <div className="flex flex-wrap items-center gap-1 px-2 pt-2">
            {autoContexts.map((c) => {
              const off = disabledAuto.has(autoKey(c));
              if (shadowed(c)) return null;
              return (
                <ContextChip
                  key={`auto-${autoKey(c)}`}
                  context={c}
                  auto
                  muted={off}
                  onClick={() =>
                    setDisabledAuto((prev) => {
                      const next = new Set(prev);
                      if (next.has(autoKey(c))) next.delete(autoKey(c));
                      else next.add(autoKey(c));
                      return next;
                    })
                  }
                />
              );
            })}
            {attached.map((c) => (
              <ContextChip
                key={`att-${autoKey(c)}`}
                context={c}
                onRemove={() => setAttached((prev) => prev.filter((p) => autoKey(p) !== autoKey(c)))}
              />
            ))}
          </div>
        )}
        <textarea
          ref={areaRef}
          data-testid="composer-input"
          value={text}
          rows={1}
          placeholder={placeholder ?? "무엇을 할까요?  @ 로 컨텍스트 첨부, / 로 명령"}
          onChange={(e) => {
            setText(e.target.value);
            refreshPopover(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => window.setTimeout(() => setPopover(null), 120)}
          className="block w-full resize-none bg-transparent px-3 py-2 text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none select-text"
        />
        <div className="flex items-center justify-between px-2 pb-1.5">
          <div className="flex items-center gap-0.5 text-slate-400">
            <button
              type="button"
              title="컨텍스트 첨부 (@)"
              onClick={() => {
                const next = `${text}${text && !text.endsWith(" ") ? " " : ""}@`;
                setText(next);
                refreshPopover(next, next.length);
                areaRef.current?.focus();
              }}
              className="p-1 rounded hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            >
              <AtSign className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="명령 (/)"
              onClick={() => {
                setText("/");
                refreshPopover("/", 1);
                areaRef.current?.focus();
              }}
              className="p-1 rounded hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            >
              <Slash className="w-3.5 h-3.5" />
            </button>
            <span className="ml-1 text-[10px]">Enter 보내기 · Shift+Enter 줄바꿈{busy ? " · 실행 중 보내면 대기열" : ""}</span>
          </div>
          {busy ? (
            <div className="flex items-center gap-1">
              {text.trim() && (
                <button
                  type="button"
                  onClick={submit}
                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold cursor-pointer"
                  title="대기열에 추가"
                >
                  대기열
                </button>
              )}
              <button
                type="button"
                data-testid="composer-stop"
                onClick={onStop}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-700 text-white cursor-pointer"
                title="중단 (Esc)"
              >
                <Square className="w-3 h-3 fill-current" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="composer-send"
              onClick={submit}
              disabled={!text.trim()}
              className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white cursor-pointer disabled:cursor-default"
              title="보내기 (Enter)"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

function mergeContexts(prev: ContextRef[], next: ContextRef[]): ContextRef[] {
  const out = [...prev];
  for (const ref of next) if (!out.some((p) => p.kind === ref.kind && p.id === ref.id)) out.push(ref);
  return out;
}

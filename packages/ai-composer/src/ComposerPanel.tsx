import React from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Cpu,
  Eye,
  Hand,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  XCircle,
  Zap,
} from "lucide-react";

import { isAttachableDrag, readContextDrag } from "@vibe/ai-kernel";
import type {
  AiRuntime,
  ComposerItem,
  ComposerSessionController,
  ContextRef,
  EngineStatus,
  PermissionMode,
} from "@vibe/ai-kernel";
import {
  AiSurfaceProvider,
  ContextChip,
  EntityChip,
  MarkdownText,
  PromptInput,
  useComposerState,
  type AiSurfaceValue,
} from "@vibe/ai-react";

export interface ComposerSuggestion {
  label: string;
  prompt: string;
}

export interface ComposerPanelProps {
  runtime: AiRuntime;
  controller: ComposerSessionController;
  /** 매 메시지에 붙는 배경 정보 (열린 문서 등). 칩을 눌러 끌 수 있다. */
  autoContexts: ContextRef[];
  /** 첨부 제안 (현재 캔버스 선택 등) — 눌러야 첨부된다. */
  suggestedContexts?: ContextRef[];
  engines: EngineStatus | null;
  enginesError?: string | null;
  onChangeEngine(provider: string, model: string): void;
  suggestions?: ComposerSuggestion[];
  /** 헤더 오른쪽에 끼울 버튼 (AI 설정 · 패널 접기 등). */
  headerActions?: React.ReactNode;
  /**
   * 입력창 위 설정바 — 오래 걸어 두는 세팅(자료 · 범위). 이것을 주면 자동 첨부 칩은 입력창에 그리지 않는다
   * (입력창은 보내면 비워지는 일회용 칸: @멘션 · /스킬 · 이번 메시지의 선택).
   */
  settingsBar?: React.ReactNode;
  /** 📌 고정할 수 있는 첨부 / 고정 동작 (입력창 칩 → 설정바 범위) */
  pinnable?(ref: ContextRef): boolean;
  onPinContext?(ref: ContextRef): void;
  /** 이미 고정된 첨부인가 (📌 을 채워 보이고, 다시 누르면 해제) */
  isPinned?(ref: ContextRef): boolean;
  /** 보내기 직전에 첨부를 고친다 (이번 메시지의 범위 확정 등). */
  onBeforeSend?(text: string, contexts: ContextRef[]): ContextRef[];
}

const MODE_META: Record<PermissionMode, { label: string; icon: React.ComponentType<{ className?: string }>; hint: string }> = {
  "auto-stage": { label: "자동 제출", icon: ShieldCheck, hint: "변경안은 Staged 대기열로 자동 제출, 직접 쓰기만 확인" },
  ask: { label: "매번 확인", icon: Hand, hint: "문서 변경안을 낼 때마다 승인 요청" },
  plan: { label: "계획만", icon: Eye, hint: "읽기 · 화면 조작만 하고 문서는 바꾸지 않음" },
};

const STATUS_LABEL: Record<string, string> = {
  connecting: "연결 중…",
  streaming: "응답 중…",
  running_tools: "도구 실행 중…",
  awaiting_approval: "승인 대기",
};

/** 오른쪽 작업 패널의 AI Composer — 대화 · 도구 호출 카드 · 권한 모드 · 엔진 선택. */
export const ComposerPanel: React.FC<ComposerPanelProps> = ({
  runtime,
  controller,
  autoContexts,
  suggestedContexts = [],
  engines,
  enginesError,
  onChangeEngine,
  suggestions = [],
  headerActions,
  settingsBar,
  pinnable,
  onPinContext,
  isPinned,
  onBeforeSend,
}) => {
  const send = (text: string, contexts: ContextRef[]) => void controller.send(text, onBeforeSend ? onBeforeSend(text, contexts) : contexts);
  const state = useComposerState(controller);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const stickRef = React.useRef(true);
  const busy = state.status !== "idle";
  const surface = React.useMemo<AiSurfaceValue>(
    () => ({ runtime, attach: (refs) => controller.attach(refs) }),
    [runtime, controller]
  );
  // 패널 전체가 놓는 곳 — 자식 요소를 오가며 생기는 dragenter/leave 짝을 세어 깜빡임을 막는다.
  const [dropping, setDropping] = React.useState(false);
  const dragDepth = React.useRef(0);
  const dropHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!isAttachableDrag(e.dataTransfer, runtime)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDropping(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!isAttachableDrag(e.dataTransfer, runtime)) return;
      e.preventDefault();
      // 출처가 허용한 효과와 맞춰야 drop 이 일어난다 (캔버스 블록 핸들은 재배치용이라 move 만 허용).
      const allowed = e.dataTransfer.effectAllowed;
      e.dataTransfer.dropEffect = allowed === "move" ? "move" : allowed === "link" ? "link" : "copy";
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDropping(false);
    },
    onDrop: (e: React.DragEvent) => {
      dragDepth.current = 0;
      setDropping(false);
      if (!isAttachableDrag(e.dataTransfer, runtime)) return;
      e.preventDefault(); // 입력창에 텍스트로 붙는 기본 동작 막기
      const refs = readContextDrag(e.dataTransfer, runtime);
      if (refs.length) controller.attach(refs);
    },
  };

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [state.items]);

  return (
    <AiSurfaceProvider value={surface}>
    <div data-testid="ai-composer-panel" className="relative flex flex-col h-full min-h-0 bg-white" {...dropHandlers}>
      {dropping && (
        <div
          data-testid="composer-drop-overlay"
          className="absolute inset-1.5 z-40 rounded-xl border-2 border-dashed border-indigo-400 bg-indigo-50/95 backdrop-blur-[2px] flex flex-col items-center justify-center gap-1.5 pointer-events-none"
        >
          <Paperclip className="w-6 h-6 text-indigo-500" />
          <div className="text-[13px] font-bold text-indigo-900">여기에 놓아 첨부</div>
          <div className="text-[11px] text-indigo-700 text-center px-6 leading-relaxed">
            입력창에 <span className="font-mono font-bold">@이름</span> 이 들어갑니다. 칩의 <b>대상</b> · <b>참조</b> 를 눌러 역할을 바꿀 수 있어요.
          </div>
        </div>
      )}
      <ComposerHeader
        state={state}
        engines={engines}
        enginesError={enginesError}
        onChangeEngine={onChangeEngine}
        onMode={(m) => controller.setMode(m)}
        onNew={() => void controller.newSession()}
        actions={headerActions}
      />

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 space-y-2.5 select-text"
      >
        {state.items.length === 0 ? (
          <EmptyState suggestions={suggestions} onPick={(p) => send(p, autoContexts)} />
        ) : (
          state.items.map((item) => (
            <ThreadItem key={item.id} item={item} onApprove={(id) => controller.approve(id)} onDeny={(id) => controller.deny(id)} />
          ))
        )}
        {busy && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pl-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            {STATUS_LABEL[state.status] ?? "실행 중…"}
          </div>
        )}
      </div>

      <div className="px-3 pb-3 pt-1.5 border-t border-slate-100 bg-slate-50/60">
        {state.queue.length > 0 && (
          <div className="mb-1.5 text-[10.5px] text-slate-500">대기열 {state.queue.length}건 — 현재 실행이 끝나면 순서대로 보냅니다</div>
        )}
        {settingsBar}
        <PromptInput
          runtime={runtime}
          slashSurface="composer"
          autoContexts={autoContexts}
          suggestedContexts={suggestedContexts}
          hideAutoChips={Boolean(settingsBar)}
          pinnable={pinnable}
          onPinContext={onPinContext}
          isPinned={isPinned}
          busy={busy}
          draft={state.draft}
          inbox={state.inbox}
          onSubmit={(text, contexts) => send(text, contexts)}
          onStop={() => controller.stop()}
        />
      </div>
    </div>
    </AiSurfaceProvider>
  );
};

// --- 헤더 ---------------------------------------------------------------------------

const ComposerHeader: React.FC<{
  state: ReturnType<typeof useComposerState>;
  engines: EngineStatus | null;
  enginesError?: string | null;
  onChangeEngine(provider: string, model: string): void;
  onMode(mode: PermissionMode): void;
  onNew(): void;
  actions?: React.ReactNode;
}> = ({ state, engines, enginesError, onChangeEngine, onMode, onNew, actions }) => {
  const current = state.engine ?? engines?.composer ?? null;
  const providers: { id: string; label: string }[] = [
    { id: "agy_cli", label: "agy CLI" },
    { id: "google_api", label: "Google API" },
  ];
  const models = current ? engines?.models?.[current.provider] ?? [] : [];
  const offline = engines ? !engines.externalLlmEnabled : false;
  const warm = engines && current ? engines.warmPool?.[current.model] : undefined;
  const ModeIcon = MODE_META[state.mode].icon;

  return (
    <div className="px-3 py-2 border-b border-slate-200 bg-white shrink-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </span>
          <span className="text-[13px] font-bold text-slate-900">AI Composer</span>
          {state.sessionId && <span className="text-[10px] font-mono text-slate-400 truncate">{state.sessionId.slice(-6)}</span>}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            data-testid="composer-new-session"
            onClick={onNew}
            title="새 대화"
            className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
          >
            <MessageSquarePlus className="w-4 h-4" />
          </button>
          {actions}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[11px]">
        {offline ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
            <CircleDashed className="w-3 h-3" /> 오프라인 엔진 (VIBE_EXTERNAL_LLM=0)
          </span>
        ) : (
          <>
            <select
              data-testid="composer-engine-provider"
              value={current?.provider ?? "agy_cli"}
              onChange={(e) => {
                const provider = e.target.value;
                const first = engines?.models?.[provider]?.[0]?.id;
                if (first) onChangeEngine(provider, first);
              }}
              className="h-6 rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[11px] text-slate-700 cursor-pointer"
              title="실행 엔진 (AI 설정의 1순위 엔진과 같은 값)"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <select
              data-testid="composer-engine-model"
              value={current?.model ?? ""}
              onChange={(e) => current && onChangeEngine(current.provider, e.target.value)}
              className="h-6 min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[11px] text-slate-700 cursor-pointer"
              title="모델"
            >
              {current && !models.some((m) => m.id === current.model) && <option value={current.model}>{current.model}</option>}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <span
              title={
                current?.provider !== "agy_cli"
                  ? "API 엔진"
                  : warm?.ready
                    ? `예열된 agy 프로세스 ${warm.ready}개 대기 중 — 기동 지연 없음`
                    : "agy 예열 중"
              }
              className={`inline-flex items-center gap-0.5 px-1.5 h-6 rounded-md border ${
                current?.provider !== "agy_cli"
                  ? "border-slate-200 text-slate-400"
                  : warm?.ready
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-400"
              }`}
            >
              {current?.provider === "agy_cli" ? <Zap className="w-3 h-3" /> : <Cpu className="w-3 h-3" />}
            </span>
          </>
        )}
        <div className="relative group">
          <select
            data-testid="composer-mode"
            value={state.mode}
            onChange={(e) => onMode(e.target.value as PermissionMode)}
            className="h-6 rounded-md border border-slate-200 bg-slate-50 pl-5 pr-1 text-[11px] text-slate-700 cursor-pointer appearance-none"
            title={MODE_META[state.mode].hint}
          >
            {(Object.keys(MODE_META) as PermissionMode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_META[m].label}
              </option>
            ))}
          </select>
          <ModeIcon className="w-3 h-3 absolute left-1.5 top-1.5 text-slate-500 pointer-events-none" />
        </div>
      </div>
      {enginesError && <div className="text-[10.5px] text-rose-600">AI 서버 연결 실패: {enginesError}</div>}
    </div>
  );
};

// --- 스레드 -----------------------------------------------------------------------

const ThreadItem: React.FC<{ item: ComposerItem; onApprove(callId: string): void; onDeny(callId: string): void }> = ({
  item,
  onApprove,
  onDeny,
}) => {
  switch (item.kind) {
    case "user":
      return (
        <div className="flex justify-end">
          <div className="max-w-[88%] rounded-2xl rounded-br-md bg-indigo-600 text-white px-3 py-2 text-[13px] whitespace-pre-wrap break-words">
            {item.contexts.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {item.contexts.map((c) => (
                  <span
                    key={`${c.kind}:${c.id}`}
                    title={c.hint ?? c.label}
                    className={`px-1.5 py-px rounded text-[10.5px] ${c.handle && c.role === "target" ? "bg-amber-300/30 ring-1 ring-amber-200/60" : "bg-white/15"}`}
                  >
                    {c.handle ? `${c.handle} ${c.label}` : `@${c.label}`}
                    {c.handle && <span className="ml-1 opacity-75">{c.role === "target" ? "대상" : "참조"}</span>}
                  </span>
                ))}
              </div>
            )}
            {item.text}
          </div>
        </div>
      );
    case "assistant":
      if (!item.streaming && !item.text.trim()) return null; // 도구 호출 앞뒤의 줄바꿈 조각
      return (
        <div className="flex gap-2">
          <Bot className="w-4 h-4 mt-0.5 text-violet-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <MarkdownText text={item.text} />
            {item.streaming && <span className="inline-block w-1.5 h-3.5 bg-violet-400 animate-pulse align-middle ml-0.5" />}
          </div>
        </div>
      );
    case "thinking":
      return <Collapsible title="생각" body={item.text} />;
    case "agent_tool":
      return (
        <div className="ml-6 flex items-center gap-1.5 text-[11px] text-slate-500">
          <Terminal className="w-3 h-3" />
          <span className="font-mono">{item.name}</span>
          {item.state === "running" ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="text-slate-400 truncate">{item.output}</span>}
        </div>
      );
    case "tool_call":
      return <ToolCallCard item={item} onApprove={onApprove} onDeny={onDeny} />;
    case "notice":
      return (
        <div
          className={`text-[11.5px] rounded-lg px-2.5 py-1.5 border ${
            item.level === "error"
              ? "bg-rose-50 border-rose-200 text-rose-700"
              : item.level === "warning"
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-slate-50 border-slate-200 text-slate-500"
          }`}
        >
          {item.text}
        </div>
      );
    case "turn_meta":
      return (
        <div className="ml-6 text-[10px] text-slate-400 font-mono tabular-nums">
          {item.model}
          {item.firstTokenMs != null && ` · 첫 토큰 ${(item.firstTokenMs / 1000).toFixed(1)}s`}
          {item.durationMs != null && ` · ${(item.durationMs / 1000).toFixed(1)}s`}
          {item.usage?.input_tokens != null && ` · in ${item.usage.input_tokens} / out ${item.usage.output_tokens ?? 0}`}
        </div>
      );
    default:
      return null;
  }
};

const RISK_STYLE: Record<string, string> = {
  read: "bg-sky-50 text-sky-700 border-sky-200",
  ui: "bg-slate-50 text-slate-600 border-slate-200",
  stage: "bg-amber-50 text-amber-800 border-amber-200",
  write: "bg-rose-50 text-rose-700 border-rose-200",
  unknown: "bg-slate-50 text-slate-500 border-slate-200",
};

const ToolCallCard: React.FC<{
  item: Extract<ComposerItem, { kind: "tool_call" }>;
  onApprove(callId: string): void;
  onDeny(callId: string): void;
}> = ({ item, onApprove, onDeny }) => {
  const [open, setOpen] = React.useState(false);
  const StatusIcon =
    item.status === "done"
      ? CheckCircle2
      : item.status === "error" || item.status === "denied"
        ? XCircle
        : item.status === "awaiting_approval"
          ? ShieldAlert
          : Loader2;
  const statusColor =
    item.status === "done"
      ? "text-emerald-600"
      : item.status === "error" || item.status === "denied"
        ? "text-rose-500"
        : item.status === "awaiting_approval"
          ? "text-amber-600"
          : "text-slate-400 animate-spin";
  return (
    <div
      data-testid="composer-tool-card"
      className={`ml-6 rounded-xl border bg-white text-[11.5px] overflow-hidden ${
        item.status === "awaiting_approval" ? "border-amber-300 shadow-sm" : "border-slate-200"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left cursor-pointer hover:bg-slate-50"
      >
        <StatusIcon className={`w-3.5 h-3.5 shrink-0 ${statusColor}`} />
        <span className="font-mono text-[11px] text-slate-800 shrink-0">{item.name}</span>
        <span className="truncate text-slate-500">
          {item.status === "drafting"
            ? `작성 중… ${item.chars ?? 0}자`
            : item.summary !== item.name
              ? item.summary
              : ""}
        </span>
        {item.server && (
          <span className="shrink-0 px-1 py-px rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9.5px] font-bold" title="서버가 실행한 도구 (지식 덱 탐색) — 브라우저 왕복 없이 같은 답변 안에서 이어진다">
            서버
          </span>
        )}
        {item.async && item.status !== "drafting" && (
          <span className="shrink-0 px-1 py-px rounded bg-violet-50 text-violet-700 border border-violet-200 text-[9.5px] font-bold" title="결과를 기다리지 않고 답변 중에 바로 실행됨">
            즉시
          </span>
        )}
        <span className={`ml-auto shrink-0 px-1.5 py-px rounded border text-[9.5px] font-bold uppercase ${RISK_STYLE[item.risk]}`}>{item.risk}</span>
        {open ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
      </button>
      <ToolTargets args={item.arguments} />
      {item.status === "awaiting_approval" && (
        <div className="flex items-center gap-1.5 px-2.5 pb-2">
          <span className="text-amber-800 text-[11px] mr-auto">이 도구를 실행할까요?</span>
          <button
            type="button"
            data-testid="composer-tool-approve"
            onClick={() => onApprove(item.callId)}
            className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold cursor-pointer"
          >
            허용
          </button>
          <button
            type="button"
            onClick={() => onDeny(item.callId)}
            className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] cursor-pointer"
          >
            거부
          </button>
        </div>
      )}
      {open && (
        <div className="border-t border-slate-100 px-2.5 py-2 space-y-1.5 bg-slate-50/60">
          <JsonBlock label="arguments" value={item.arguments} />
          {item.output !== undefined && <JsonBlock label="result" value={item.output} />}
          {item.error && <div className="text-rose-600">{item.error}</div>}
        </div>
      )}
    </div>
  );
};

/** 도구 인자에 들어 있는 위치(slotId · blockId · pageId · docId)를 칩으로 — 어디가 바뀌는지 바로 눌러 본다. */
const TARGET_KEYS: [string, string][] = [
  ["pageId", "page"],
  ["blockId", "block"],
  ["slotId", "slot"],
  ["docId", "doc"],
  ["chunkId", "backdata"],
];

const ToolTargets: React.FC<{ args: Record<string, unknown> }> = ({ args }) => {
  const targets: { id: string; kind: string }[] = [];
  for (const [key, kind] of TARGET_KEYS) {
    const value = args?.[key];
    if (typeof value === "string" && value) targets.push({ id: value, kind });
  }
  const batch = Array.isArray(args?.changes) ? (args.changes as { slotId?: unknown }[]) : [];
  for (const change of batch.slice(0, 12)) {
    if (typeof change?.slotId === "string") targets.push({ id: change.slotId, kind: "slot" });
  }
  if (targets.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 px-2.5 pb-1.5 -mt-0.5">
      {targets.map((t) => (
        <EntityChip key={`${t.kind}:${t.id}`} id={t.id} kind={t.kind} fallback={null} />
      ))}
      {batch.length > 12 && <span className="text-[10.5px] text-slate-400">외 {batch.length - 12}개</span>}
    </div>
  );
};

const JsonBlock: React.FC<{ label: string; value: unknown }> = ({ label, value }) => (
  <div>
    <div className="text-[9.5px] font-bold uppercase text-slate-400 mb-0.5">{label}</div>
    <pre className="max-h-48 overflow-auto rounded-md bg-white border border-slate-200 p-1.5 text-[10.5px] font-mono text-slate-700 whitespace-pre-wrap break-all">
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  </div>
);

const Collapsible: React.FC<{ title: string; body: string }> = ({ title, body }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="ml-6 text-[11px] text-slate-500">
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 cursor-pointer hover:text-slate-700">
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} {title}
      </button>
      {open && <div className="mt-1 whitespace-pre-wrap border-l-2 border-slate-200 pl-2">{body}</div>}
    </div>
  );
};

const EmptyState: React.FC<{ suggestions: ComposerSuggestion[]; onPick(prompt: string): void }> = ({ suggestions, onPick }) => (
  <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8">
    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-3 shadow-md">
      <Sparkles className="w-5 h-5 text-white" />
    </div>
    <div className="text-[13px] font-bold text-slate-900 mb-1">워크스페이스 AI Composer</div>
    <p className="text-[11.5px] text-slate-500 leading-relaxed mb-4 max-w-[280px]">
      문서 구조를 읽고, 슬롯을 찾아 이동하고, 변경안을 Staged 대기열에 올립니다. <span className="font-mono">@</span> 로 슬롯 ·
      참조 · 백데이터를 첨부하고 <span className="font-mono">/</span> 로 명령을 고르세요.
    </p>
    <div className="w-full space-y-1.5">
      {suggestions.map((s) => (
        <button
          type="button"
          key={s.label}
          data-testid="composer-suggestion"
          onClick={() => onPick(s.prompt)}
          className="w-full text-left px-3 py-2 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-[12px] text-slate-700 cursor-pointer transition"
        >
          {s.label}
        </button>
      ))}
    </div>
  </div>
);

export { ContextChip };

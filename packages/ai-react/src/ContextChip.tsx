import React from "react";
import { AtSign, Crosshair, MousePointerSquareDashed, Paperclip, Pin, X } from "lucide-react";

import { contextRole, type ContextRef, type EntityInfo } from "@vibe/ai-kernel";

import { useAiSurface } from "./AiSurface";
import { entityIcon } from "./EntityChip";

const ICON_OVERRIDES: Record<string, React.ComponentType<{ className?: string }>> = {
  selection: MousePointerSquareDashed,
  "text-range": MousePointerSquareDashed,
  document: Paperclip,
  scope: Crosshair,
};

/** 첨부가 가리키는 화면 요소 id (영역 · 발췌는 소속 문서). */
function entityTarget(context: ContextRef): { id: string; kind?: string } {
  const meta = context.meta ?? {};
  if (typeof meta.entityId === "string") return { id: meta.entityId, kind: typeof meta.entityKind === "string" ? meta.entityKind : undefined };
  return { id: context.id, kind: context.kind === "reference" ? "doc" : context.kind };
}

export interface ContextChipProps {
  context: ContextRef;
  tone?: "light" | "dark";
  /** 자동 첨부(현재 선택) 칩 — 점선 테두리. */
  auto?: boolean;
  muted?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
  /** 대상 ↔ 참고자료 전환 (쓸 수 있는 요소만). */
  onToggleRole?: () => void;
  /** 📌 — 이 첨부를 설정바의 범위로 고정 (프롬프트는 보내면 비워지지만 고정한 범위는 남는다) */
  onPin?: () => void;
  /** 이미 고정됨 — 📌 을 채워 보이고 누르면 해제 */
  pinned?: boolean;
}

/**
 * 첨부 칩. 호버하면 화면에서 그 요소를 강조하고, 명시 첨부는 `@이름` 과 역할(대상 · 참조)을 보여준다.
 */
export const ContextChip: React.FC<ContextChipProps> = ({ context, tone = "light", auto, muted, onRemove, onClick, onToggleRole, onPin, pinned }) => {
  const surface = useAiSurface();
  const target = entityTarget(context);
  const Icon = ICON_OVERRIDES[context.kind] ?? (context.kind === "custom" ? AtSign : entityIcon(context.kind));
  const role = contextRole(context);
  const explicit = Boolean(context.handle);
  const hoverRef = React.useRef<EntityInfo | null>(null);

  React.useEffect(() => () => hoverRef.current?.highlight(false), []);

  const palette =
    tone === "dark"
      ? "bg-slate-800 text-slate-200 border-slate-700"
      : auto
        ? "bg-white text-slate-600 border-dashed border-slate-300"
        : explicit && role === "target"
          ? "bg-amber-50 text-amber-900 border-amber-300"
          : "bg-indigo-50 text-indigo-800 border-indigo-200";
  return (
    <span
      data-testid="ai-context-chip"
      data-context-kind={context.kind}
      data-context-role={explicit ? role : "auto"}
      title={`${context.hint ?? `${context.kind}: ${context.label}`}${explicit ? `\n${role === "target" ? "고칠 대상" : "참고자료"}` : ""}`}
      onClick={onClick}
      onMouseEnter={() => {
        const info = surface?.runtime.entities.lookup(target.id, target.kind) ?? null;
        hoverRef.current = info;
        info?.highlight(true);
      }}
      onMouseLeave={() => {
        hoverRef.current?.highlight(false);
        hoverRef.current = null;
      }}
      className={`inline-flex items-center gap-1 max-w-[240px] px-1.5 py-0.5 rounded-md border text-[11px] font-medium ${palette} ${
        muted ? "opacity-45 line-through" : ""
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      <Icon className="w-3 h-3 shrink-0 opacity-70" />
      {context.handle && <span className="shrink-0 font-bold">{context.handle}</span>}
      <span className="truncate">{context.label}</span>
      {explicit && (
        <button
          type="button"
          data-testid="ai-context-chip-role"
          disabled={!onToggleRole}
          onClick={(e) => {
            e.stopPropagation();
            onToggleRole?.();
          }}
          title={onToggleRole ? "클릭: 고칠 대상 ↔ 참고자료" : "읽기 전용 요소 — 참고자료로만 쓰입니다"}
          className={`shrink-0 px-1 rounded text-[9.5px] font-bold border ${
            role === "target" ? "bg-amber-500 text-white border-amber-500" : "bg-white text-indigo-600 border-indigo-200"
          } ${onToggleRole ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
        >
          {role === "target" ? "대상" : "참조"}
        </button>
      )}
      {onPin && (
        <button
          type="button"
          data-testid="ai-context-chip-pin"
          onClick={(e) => {
            e.stopPropagation();
            onPin();
          }}
          className={`shrink-0 rounded p-px cursor-pointer ${pinned ? "bg-amber-500 text-white hover:bg-amber-600" : "hover:bg-black/10"}`}
          title={pinned ? "범위로 고정됨 — 누르면 고정 해제" : "범위로 고정 — 설정바에 남아 다음 메시지에도 이 범위로 작업합니다"}
        >
          <Pin className="w-2.5 h-2.5" />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="shrink-0 rounded hover:bg-black/10 p-px cursor-pointer"
          title="첨부 해제"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
};

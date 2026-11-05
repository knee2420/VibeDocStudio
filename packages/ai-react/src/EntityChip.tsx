import React from "react";
import {
  BookOpen,
  Database,
  FileText,
  GitPullRequestDraft,
  Layers,
  LayoutGrid,
  ListTree,
  MapPin,
  SquareDashedMousePointer,
  Type,
  Variable,
} from "lucide-react";

import { writeContextDrag, type EntityInfo } from "@vibe/ai-kernel";

import { useAiSurface } from "./AiSurface";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  page: Layers,
  block: LayoutGrid,
  slot: Type,
  doc: BookOpen,
  document: FileText,
  reference: BookOpen,
  backdata: Database,
  node: ListTree,
  variable: Variable,
  staged: GitPullRequestDraft,
  "ref-region": SquareDashedMousePointer,
};

export function entityIcon(kind: string): React.ComponentType<{ className?: string }> {
  return ICONS[kind] ?? MapPin;
}

/** 화면 요소를 찾는다. 없으면 null (지워진 id · 다른 프로젝트). */
export function useEntity(id: string | undefined, kind?: string): EntityInfo | null {
  const surface = useAiSurface();
  if (!surface || !id) return null;
  return surface.runtime.entities.lookup(id, kind);
}

export interface EntityChipProps {
  id: string;
  kind?: string;
  /** 링크에 적힌 이름 (없으면 해석기가 준 이름). */
  label?: string;
  /** 찾지 못했을 때 그릴 것 (기본: 회색 이름). */
  fallback?: React.ReactNode;
  tone?: "light" | "dark";
}

/**
 * 답변 속 위치 칩 — 호버: 화면에서 강조 · 클릭: 그 위치로 이동 · Ctrl/⌘+클릭 · 끌기: Composer 에 첨부.
 */
export const EntityChip: React.FC<EntityChipProps> = ({ id, kind, label, fallback, tone = "light" }) => {
  const surface = useAiSurface();
  const info = useEntity(id, kind);
  const hovering = React.useRef(false);

  React.useEffect(
    () => () => {
      if (hovering.current) info?.highlight(false);
    },
    [info]
  );

  if (!info) {
    if (fallback !== undefined) return <>{fallback}</>;
    return (
      <span className="text-slate-400 line-through decoration-dotted" title={`찾을 수 없는 위치: ${id}`}>
        {label ?? id}
      </span>
    );
  }

  const Icon = entityIcon(info.kind);
  const text = label?.trim() || info.label;
  const palette =
    tone === "dark"
      ? "bg-white/15 text-white border-white/25 hover:bg-white/25"
      : "bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100 hover:border-violet-300";
  return (
    <span
      role="link"
      tabIndex={0}
      data-testid="ai-entity-chip"
      data-entity-kind={info.kind}
      data-entity-id={info.id}
      draggable={Boolean(info.toContext)}
      title={`${info.label}${info.detail ? ` · ${info.detail}` : ""}\n클릭: 이동 · Ctrl+클릭/끌기: Composer 에 첨부`}
      onMouseEnter={() => {
        hovering.current = true;
        info.highlight(true);
      }}
      onMouseLeave={() => {
        hovering.current = false;
        info.highlight(false);
      }}
      onDragStart={(e) => {
        const ref = info.toContext?.();
        if (ref) writeContextDrag(e.dataTransfer, [ref]);
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const ref = info.toContext?.();
        if ((e.ctrlKey || e.metaKey) && ref && surface?.attach) surface.attach([ref]);
        else info.reveal();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") info.reveal();
      }}
      className={`inline-flex items-center gap-1 align-baseline max-w-full px-1.5 py-px mx-px rounded-md border text-[12px] font-medium leading-snug cursor-pointer transition-colors ${palette}`}
    >
      <Icon className="w-3 h-3 shrink-0 opacity-75" />
      <span className="truncate">{text}</span>
      {info.detail && <span className="shrink-0 text-[10px] opacity-60">{info.detail}</span>}
    </span>
  );
};

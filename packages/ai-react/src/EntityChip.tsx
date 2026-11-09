import React from "react";
import {
  Bookmark,
  BookOpen,
  Compass,
  Database,
  FileText,
  FolderTree,
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

export type EntityCategory = "resource" | "reference" | "outliner" | "editor" | "staged";

export function getEntityCategory(kind?: string): EntityCategory {
  if (!kind) return "editor";
  switch (kind) {
    // 1. 리소스: 연보라 (Purple) - 사용자 지정 고정 (지식 덱, 카드, 백데이터, 원본 데이터)
    case "kcard":
    case "kdeck":
    case "ksection":
    case "deck":
    case "resource":
    case "backdata":
    case "sector":
      return "resource";

    // 2. 레퍼런스: 앰버 (Amber / Warm Gold) (좌측 Reference Manager - 참조 규정집, PDF/Doc 문서, 참조 구역 발췌)
    case "reference":
    case "ref-region":
    case "ref-text":
    case "ref-pin":
    case "pin":
      return "reference";

    // 3. 아웃라이너: 스카이 블루 (Sky Blue) (좌측 Outliner - 문서 구조, 트리 노드, 목차, 상위 문서)
    case "node":
    case "doc":
    case "document":
      return "outliner";

    // 4. 변경안: 로즈 (Rose / Coral) (슬롯/문서 변경안 제출 액션)
    case "staged":
      return "staged";

    // 5. 에디터 위치: 연두 (Emerald) - 사용자 지정 고정 (캔버스 내부 슬롯, 표 셀, 블록, 페이지, 변수)
    case "slot":
    case "block":
    case "page":
    case "slot-range":
    case "text-range":
    case "variable":
    default:
      return "editor";
  }
}

export const CATEGORY_STYLES: Record<EntityCategory, { light: string; dark: string; label: string }> = {
  // 1. 리소스: 연보라 / 퍼플 톤 (지식 베이스 · 지식 카드) - 사용자 지정 고정
  resource: {
    light: "bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100 hover:border-purple-300",
    dark: "bg-purple-950/60 text-purple-200 border-purple-700/60 hover:bg-purple-900/60",
    label: "리소스 (Resource)",
  },
  // 2. 레퍼런스: 앰버 / 웜 오렌지 톤 (참조 규정 · PDF 원본 문서)
  reference: {
    light: "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100 hover:border-amber-300",
    dark: "bg-amber-950/60 text-amber-200 border-amber-700/60 hover:bg-amber-900/60",
    label: "레퍼런스 (Reference)",
  },
  // 3. 아웃라이너: 스카이 블루 톤 (문서 구조 · 목차 · 트리 노드)
  outliner: {
    light: "bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100 hover:border-sky-300",
    dark: "bg-sky-950/60 text-sky-200 border-sky-700/60 hover:bg-sky-900/60",
    label: "아웃라이너 (Outliner)",
  },
  // 4. 에디터 위치: 연두 / 에메랄드 톤 (캔버스 슬롯 · 표 셀 · 블록) - 사용자 지정 고정
  editor: {
    light: "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300",
    dark: "bg-emerald-950/60 text-emerald-200 border-emerald-700/60 hover:bg-emerald-900/60",
    label: "에디터 위치 (Editor)",
  },
  // 5. 변경안: 로즈 / 코랄 톤 (슬롯 변경안 제안)
  staged: {
    light: "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100 hover:border-rose-300",
    dark: "bg-rose-950/60 text-rose-200 border-rose-700/60 hover:bg-rose-900/60",
    label: "변경안 (Staged)",
  },
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  // 아웃라이너 (문서 구조)
  node: ListTree,
  doc: FolderTree,
  document: FileText,

  // 에디터 위치 (작업 캔버스)
  page: Layers,
  block: LayoutGrid,
  slot: Type,
  variable: Variable,
  "slot-range": Type,
  "text-range": Type,

  // 변경안 (제안)
  staged: GitPullRequestDraft,

  // 레퍼런스 (참조 규정 / PDF)
  reference: BookOpen,
  "ref-region": SquareDashedMousePointer,
  "ref-text": FileText,
  "ref-pin": MapPin,
  pin: MapPin,

  // 리소스 (지식 덱 / 카드 / 백데이터)
  kcard: Bookmark,
  kdeck: Database,
  ksection: Compass,
  deck: Database,
  resource: Database,
  backdata: Database,
  sector: SquareDashedMousePointer,
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
 * 레퍼런스(보라), 인용 Resource(파랑), 에디터(초록) 3색 시맨틱 구분.
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
  const category = getEntityCategory(info.kind);
  const styleConfig = CATEGORY_STYLES[category];
  const palette = tone === "dark" ? styleConfig.dark : styleConfig.light;

  return (
    <span
      role="link"
      tabIndex={0}
      data-testid="ai-entity-chip"
      data-entity-kind={info.kind}
      data-entity-id={info.id}
      draggable={Boolean(info.toContext)}
      title={`${info.label}${info.detail ? ` · ${info.detail}` : ""}\n[${styleConfig.label}] 클릭: 이동 · Ctrl+클릭/끌기: Composer 에 첨부`}
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

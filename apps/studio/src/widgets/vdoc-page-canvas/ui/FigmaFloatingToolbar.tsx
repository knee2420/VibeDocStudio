import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Component,
  Eye,
  FileEdit,
  GitBranch,
  Hand,
  Hash,
  LayoutGrid,
  LayoutTemplate,
  MessageSquare,
  MousePointer2,
  PenLine,
  PenTool,
  Sparkles,
  Square,
  Type,
} from "lucide-react";

import type { WorkbenchPhase } from "@vibe/vdoc-schema";

import { useAssetLibraryStore, type FloatingToolId } from "@/entities/asset-library";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useSwitchWorkbenchPhase } from "@/features/switch-workbench-phase";

export type FigmaToolId = FloatingToolId;

const PHASE_MODES: ReadonlyArray<{
  id: WorkbenchPhase;
  step: string;
  label: string;
  desc: string;
  icon: React.FC<{ className?: string }>;
}> = [
  {
    id: "storylining",
    step: "Phase 1",
    label: "스토리라인 기획",
    desc: "참조 프로젝트 대조 & 목차 트리 구성",
    icon: GitBranch,
  },
  {
    id: "templating",
    step: "Phase 2",
    label: "템플릿·서식 조율",
    desc: "목차 노드별 서식 블록·테이블 매핑",
    icon: LayoutTemplate,
  },
  {
    id: "drafting",
    step: "Phase 3",
    label: "슬롯 본문 집필",
    desc: "A4 조판 캔버스 & 슬롯 정밀 편집",
    icon: FileEdit,
  },
];

export const FigmaFloatingToolbar: React.FC = () => {
  const activeTool = useAssetLibraryStore((s) => s.activeTool);
  const setActiveTool = useAssetLibraryStore((s) => s.setActiveTool);
  const [frameDropdown, setFrameDropdown] = useState(false);
  const [shapeDropdown, setShapeDropdown] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const didDragRef = useRef(false);
  const dragOriginRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const mode = useStudioDocumentStore((s) => s.mode);
  const toggleMode = useStudioDocumentStore((s) => s.toggleMode);
  const { currentPhase, switchPhase } = useSwitchWorkbenchPhase();

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const origin = dragOriginRef.current;
      if (!origin) return;
      const dx = e.clientX - origin.startX;
      const dy = e.clientY - origin.startY;
      if (!didDragRef.current && Math.hypot(dx, dy) <= 4) return;
      didDragRef.current = true;

      const el = toolbarRef.current;
      const parent = el?.parentElement;
      if (el && parent) {
        const pRect = parent.getBoundingClientRect();
        const tRect = el.getBoundingClientRect();
        const pad = 8;
        const maxDx = Math.max(0, pRect.width / 2 - tRect.width / 2 - pad);
        const minDy = Math.min(0, -(pRect.height - 24 - tRect.height - pad));
        const maxDy = 16;
        setOffset({
          x: Math.max(-maxDx, Math.min(maxDx, origin.origX + dx)),
          y: Math.max(minDy, Math.min(maxDy, origin.origY + dy)),
        });
      } else {
        setOffset({
          x: origin.origX + dx,
          y: origin.origY + dy,
        });
      }
    };
    const onUp = () => {
      const wasClick = !didDragRef.current;
      setIsDragging(false);
      dragOriginRef.current = null;
      didDragRef.current = false;
      if (wasClick) {
        setIsCollapsed((prev) => !prev);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    didDragRef.current = false;
    dragOriginRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
    setIsDragging(true);
  };

  return (
    <div
      ref={toolbarRef}
      data-testid="figma-floating-toolbar"
      style={{
        transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px)`,
      }}
      className="absolute bottom-6 left-1/2 z-40 select-none"
    >
      <div className="flex items-center gap-0.5 bg-white text-slate-700 px-1.5 py-1.5 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.06)] border border-slate-200/90 text-xs font-sans">
        {/* 1. 드래그 핸들 (파란색 점 4개 — 클릭 시 접기/펼치기, 드래그 시 페이지 뷰 내 자유 이동) */}
        <button
          type="button"
          data-testid="toolbar-drag-handle"
          onMouseDown={handleDragStart}
          title={isCollapsed ? "클릭하여 툴바 펼치기 · 드래그하여 이동" : "클릭하여 툴바 접기 · 드래그하여 이동"}
          className={`w-7 h-8 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-colors ${
            isDragging ? "cursor-grabbing bg-slate-100" : "cursor-grab"
          }`}
        >
          <span className="text-[#0d99ff] text-sm leading-none font-black">❖</span>
        </button>

        {!isCollapsed && (
          <>
            <div className="w-px h-5 bg-slate-200 mx-0.5" />

        {/* 2. 이동 / 선택 (Move) */}
        <div className="relative flex items-center">
          <button
            type="button"
            title="Move (V)"
            onClick={() => setActiveTool("select")}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
              activeTool === "select"
                ? "bg-[#0d99ff] text-white shadow-xs"
                : "hover:bg-slate-100 text-slate-700"
            }`}
          >
            <MousePointer2 className="w-4 h-4" />
          </button>
        </div>

        {/* 3. 프레임 / 섹션 (Frame / Section) */}
        <div className="relative flex items-center">
          <button
            type="button"
            title="Frame (F)"
            onClick={() => setActiveTool("frame")}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
              activeTool === "frame" || activeTool === "section"
                ? "bg-[#0d99ff] text-white shadow-xs"
                : "hover:bg-slate-100 text-slate-700"
            }`}
          >
            <Hash className="w-4 h-4 stroke-[2.2]" />
          </button>
          <button
            type="button"
            onClick={() => setFrameDropdown(!frameDropdown)}
            className="w-3.5 h-8 -ml-0.5 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
          {frameDropdown && (
            <div className="absolute left-0 bottom-11 mb-1 w-36 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 p-1 z-50 text-[11px] space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  setActiveTool("frame");
                  setFrameDropdown(false);
                }}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5" />
                  <span>Frame</span>
                </div>
                <span className="text-slate-400 font-mono text-[10px]">F</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTool("section");
                  setFrameDropdown(false);
                }}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Section</span>
                </div>
                <span className="text-slate-400 font-mono text-[10px]">⇧S</span>
              </button>
            </div>
          )}
        </div>

        {/* 4. 도형 / Shape (Rectangle) */}
        <div className="relative flex items-center">
          <button
            type="button"
            title="Rectangle (R)"
            onClick={() => setActiveTool("rectangle")}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
              activeTool === "rectangle"
                ? "bg-[#0d99ff] text-white shadow-xs"
                : "hover:bg-slate-100 text-slate-700"
            }`}
          >
            <Square className="w-3.5 h-3.5 stroke-[2]" />
          </button>
          <button
            type="button"
            onClick={() => setShapeDropdown(!shapeDropdown)}
            className="w-3.5 h-8 -ml-0.5 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
          {shapeDropdown && (
            <div className="absolute left-0 bottom-11 mb-1 w-32 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 p-1 z-50 text-[11px] space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  setActiveTool("rectangle");
                  setShapeDropdown(false);
                }}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <Square className="w-3.5 h-3.5" />
                  <span>Rectangle</span>
                </div>
                <span className="text-slate-400 font-mono text-[10px]">R</span>
              </button>
            </div>
          )}
        </div>

        {/* 5. 펜 / 그리기 도구 (Pen) */}
        <button
          type="button"
          title="Pen (P)"
          onClick={() => setActiveTool("pen")}
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
            activeTool === "pen"
              ? "bg-[#0d99ff] text-white shadow-xs"
              : "hover:bg-slate-100 text-slate-700"
          }`}
        >
          <PenTool className="w-4 h-4" />
        </button>

        {/* 6. 텍스트 도구 (Text) */}
        <button
          type="button"
          title="Text (T)"
          onClick={() => setActiveTool("text")}
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
            activeTool === "text"
              ? "bg-[#0d99ff] text-white shadow-xs"
              : "hover:bg-slate-100 text-slate-700"
          }`}
        >
          <Type className="w-4 h-4 stroke-[2.2]" />
        </button>

        {/* 7. 컴포넌트 / 리소스 도구 (Resources) */}
        <button
          type="button"
          title="Resources / Components (⇧I)"
          onClick={() => setActiveTool("resources")}
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
            activeTool === "resources"
              ? "bg-[#0d99ff] text-white shadow-xs"
              : "hover:bg-slate-100 text-slate-700"
          }`}
        >
          <Component className="w-4 h-4" />
        </button>

        {/* 8. 손 도구 / 화면 이동 (Hand) */}
        <button
          type="button"
          title="Hand tool (H)"
          onClick={() => setActiveTool("hand")}
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
            activeTool === "hand"
              ? "bg-[#0d99ff] text-white shadow-xs"
              : "hover:bg-slate-100 text-slate-700"
          }`}
        >
          <Hand className="w-4 h-4" />
        </button>

        {/* 9. 코멘트 / 댓글 도구 (Comment C) */}
        <button
          type="button"
          title="Add comment (C)"
          onClick={() => setActiveTool("comment")}
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
            activeTool === "comment"
              ? "bg-[#0d99ff] text-white shadow-xs"
              : "hover:bg-slate-100 text-slate-700"
          }`}
        >
          <MessageSquare className="w-4 h-4" />
        </button>

        {/* 10. AI / Actions 버튼 */}
        <button
          type="button"
          title="AI / Actions"
          onClick={() => setActiveTool("ai")}
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
            activeTool === "ai"
              ? "bg-[#0d99ff] text-white shadow-xs"
              : "hover:bg-slate-100 text-slate-700"
          }`}
        >
          <Sparkles className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {/* 11. 편집 / 읽기 모드 단일 아이콘 토글 (툴바와 동일한 파란색) */}
        <button
          type="button"
          data-testid="toolbar-mode-toggle-btn"
          onClick={toggleMode}
          title={
            mode === "Editing"
              ? "편집 모드 (클릭 시 읽기 모드로 전환)"
              : "읽기 모드 (클릭 시 편집 모드로 전환)"
          }
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
            mode === "Editing"
              ? "bg-[#0d99ff] text-white shadow-xs"
              : "hover:bg-slate-100 text-slate-600"
          }`}
        >
          {mode === "Editing" ? <PenLine className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>

        {/* 12. Phase 1 / 2 / 3 세그먼트 모드 전환 (피그마 UI3 스타일) */}
        <div
          data-testid="execution-phase-stepper"
          className="flex items-center gap-0.5 bg-[#f3f4f6] p-0.5 rounded-xl ml-0.5"
        >
          {PHASE_MODES.map((p) => {
            const Icon = p.icon;
            const active = currentPhase === p.id;
            return (
              <button
                key={p.id}
                type="button"
                data-testid={`phase-step-${p.id}`}
                onClick={() => switchPhase(p.id)}
                title={`${p.step}: ${p.label} — ${p.desc}`}
                className={`w-8 h-7 rounded-[10px] flex items-center justify-center transition-all cursor-pointer ${
                  active
                    ? "bg-white text-[#0d99ff] shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white/60"
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
          </>
        )}
      </div>
    </div>
  );
};

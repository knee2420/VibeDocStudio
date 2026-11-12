import React, { useState } from "react";
import {
  ChevronDown,
  Component,
  Hand,
  MessageSquare,
  MousePointer2,
  PenTool,
  Sparkles,
  Square,
  Type,
  LayoutGrid,
  Hash,
} from "lucide-react";

export type FigmaToolId = "select" | "hand" | "frame" | "section" | "rectangle" | "pen" | "text" | "resources" | "comment" | "ai";

export const FigmaFloatingToolbar: React.FC = () => {
  const [activeTool, setActiveTool] = useState<FigmaToolId>("select");
  const [frameDropdown, setFrameDropdown] = useState(false);
  const [shapeDropdown, setShapeDropdown] = useState(false);

  return (
    <div
      data-testid="figma-floating-toolbar"
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 select-none animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <div className="flex items-center gap-0.5 bg-[#2c2c2c]/95 backdrop-blur-md text-white/90 p-1 rounded-2xl shadow-[0_12px_32px_rgba(0,0,0,0.35)] border border-white/10 text-xs font-sans">
        {/* 1. 피그마 / Vibe 메인 로고 드롭다운 버튼 */}
        <button
          type="button"
          title="메인 메뉴"
          className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/15 text-white transition-colors cursor-pointer"
        >
          <div className="w-4 h-4 flex items-center justify-center font-black tracking-tighter text-sky-400 text-xs">
            ❖
          </div>
        </button>

        <div className="w-px h-4 bg-white/15 mx-0.5" />

        {/* 2. 이동 / 선택 (Move / Hand) */}
        <div className="relative flex items-center">
          <button
            type="button"
            title="Move (V)"
            onClick={() => setActiveTool("select")}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
              activeTool === "select"
                ? "bg-[#0d99ff] text-white shadow-xs"
                : "hover:bg-white/15 text-white/80 hover:text-white"
            }`}
          >
            <MousePointer2 className="w-4 h-4 fill-current" />
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
                : "hover:bg-white/15 text-white/80 hover:text-white"
            }`}
          >
            <Hash className="w-4 h-4 stroke-[2.5]" />
          </button>
          <button
            type="button"
            onClick={() => setFrameDropdown(!frameDropdown)}
            className="w-3.5 h-8 -ml-1 rounded-r-lg flex items-center justify-center hover:bg-white/15 text-white/60 hover:text-white cursor-pointer"
          >
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
          {frameDropdown && (
            <div className="absolute left-0 bottom-10 mb-1 w-36 bg-[#2c2c2c] text-white rounded-xl shadow-xl border border-white/10 p-1 z-50 text-[11px] space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  setActiveTool("frame");
                  setFrameDropdown(false);
                }}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5" />
                  <span>Frame</span>
                </div>
                <span className="text-white/40 font-mono text-[10px]">F</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTool("section");
                  setFrameDropdown(false);
                }}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Section</span>
                </div>
                <span className="text-white/40 font-mono text-[10px]">⇧S</span>
              </button>
            </div>
          )}
        </div>

        {/* 4. 도형 / Shape (Rectangle, Ellipse...) */}
        <div className="relative flex items-center">
          <button
            type="button"
            title="Rectangle (R)"
            onClick={() => setActiveTool("rectangle")}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
              activeTool === "rectangle"
                ? "bg-[#0d99ff] text-white shadow-xs"
                : "hover:bg-white/15 text-white/80 hover:text-white"
            }`}
          >
            <Square className="w-3.5 h-3.5 stroke-[2.2]" />
          </button>
          <button
            type="button"
            onClick={() => setShapeDropdown(!shapeDropdown)}
            className="w-3.5 h-8 -ml-1 rounded-r-lg flex items-center justify-center hover:bg-white/15 text-white/60 hover:text-white cursor-pointer"
          >
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
        </div>

        {/* 5. 펜 도구 (Pen P) */}
        <button
          type="button"
          title="Pen (P)"
          onClick={() => setActiveTool("pen")}
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
            activeTool === "pen"
              ? "bg-[#0d99ff] text-white shadow-xs"
              : "hover:bg-white/15 text-white/80 hover:text-white"
          }`}
        >
          <PenTool className="w-4 h-4" />
        </button>

        {/* 6. 텍스트 도구 (Text T) */}
        <button
          type="button"
          title="Text (T)"
          onClick={() => setActiveTool("text")}
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
            activeTool === "text"
              ? "bg-[#0d99ff] text-white shadow-xs"
              : "hover:bg-white/15 text-white/80 hover:text-white"
          }`}
        >
          <Type className="w-4 h-4 stroke-[2.5]" />
        </button>

        {/* 7. 리소스 / 컴포넌트 에셋 (Resources Shift+I) */}
        <button
          type="button"
          title="Resources & Components (Shift+I)"
          onClick={() => setActiveTool("resources")}
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
            activeTool === "resources"
              ? "bg-[#0d99ff] text-white shadow-xs"
              : "hover:bg-white/15 text-white/80 hover:text-white"
          }`}
        >
          <Component className="w-4 h-4" />
        </button>

        {/* 8. 핸드 도구 (Hand H) */}
        <button
          type="button"
          title="Hand tool (H)"
          onClick={() => setActiveTool("hand")}
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
            activeTool === "hand"
              ? "bg-[#0d99ff] text-white shadow-xs"
              : "hover:bg-white/15 text-white/80 hover:text-white"
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
              : "hover:bg-white/15 text-white/80 hover:text-white"
          }`}
        >
          <MessageSquare className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-white/15 mx-1" />

        {/* 10. AI / Actions 버튼 */}
        <button
          type="button"
          title="Figma AI / Actions"
          onClick={() => setActiveTool("ai")}
          className={`h-8 px-2.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer font-medium text-[11px] ${
            activeTool === "ai"
              ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/30"
              : "bg-white/10 hover:bg-white/20 text-white"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
          <span>AI</span>
        </button>
      </div>
    </div>
  );
};


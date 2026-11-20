import React from "react";
import { Check, LayoutTemplate, Lock, MousePointerClick, SlidersHorizontal } from "lucide-react";
import {
  getLayoutOptionsForNode,
  SEMANTIC_ROLE_META,
} from "../model/playgroundCompiler";
import type {
  DensityPreset,
  DocumentTheme,
  LayoutChoice,
  PlaygroundNode,
  SurfaceKind,
} from "../model/types";

export interface LayoutBindingSidebarProps {
  nodes: readonly PlaygroundNode[];
  surfaceKind: SurfaceKind;
  density: DensityPreset;
  theme: DocumentTheme;
  locked: boolean;
  onUnlockToWysiwym: () => void;
  onJumpToWysiwygForm: (nodeId: string) => void;
  onChangeNodeLayout: (nodeId: string, choice: LayoutChoice) => void;
  onChangeSurface: (surface: SurfaceKind) => void;
  onChangeDensity: (density: DensityPreset) => void;
  onChangeTheme: (theme: DocumentTheme) => void;
}

const DENSITY_OPTIONS: ReadonlyArray<{ id: DensityPreset; label: string }> = [
  { id: "relaxed", label: "여유형" },
  { id: "standard", label: "표준" },
  { id: "compact", label: "고밀도" },
];

/**
 * 우측 도킹형 레이아웃 바인딩 패널.
 * - `WYSIWYM` 노드: 지면·밀도·테마·시각 틀을 비파괴로 갈아끼운다.
 * - `form-ref`(복합양식): WYSIWYG 소유 블록이므로 본문 마감 모드로 안내한다.
 */
export const LayoutBindingSidebar: React.FC<LayoutBindingSidebarProps> = ({
  nodes,
  surfaceKind,
  density,
  theme,
  locked,
  onUnlockToWysiwym,
  onJumpToWysiwygForm,
  onChangeNodeLayout,
  onChangeSurface,
  onChangeDensity,
  onChangeTheme,
}) => {
  return (
    <aside className="w-[340px] shrink-0 border-l border-slate-200 bg-white flex flex-col min-h-0">
      <div className="px-3.5 py-2.5 border-b border-slate-200 bg-slate-50/80 space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <LayoutTemplate className="w-3.5 h-3.5 text-indigo-600" />
            <span>바인딩 엔진 (틀 · 테마 · 밀도)</span>
          </div>
          {locked ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold">
              <Lock className="w-2.5 h-2.5" />
              잠금
            </span>
          ) : null}
        </div>

        {locked ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-2 text-[11px] text-amber-900 space-y-1.5">
            <p>본문 마감(WYSIWYG) 모드에서는 틀 변경이 잠겨 있습니다.</p>
            <button
              type="button"
              onClick={onUnlockToWysiwym}
              className="w-full py-1 rounded-md bg-white border border-amber-300 text-amber-900 font-semibold hover:bg-amber-100/60 cursor-pointer transition"
            >
              구조·틀 모드(WYSIWYM)로 전환
            </button>
          </div>
        ) : null}

        <div className={`space-y-2 ${locked ? "opacity-45 pointer-events-none" : ""}`}>
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1 text-slate-500">
              <SlidersHorizontal className="w-3 h-3" />
              <span>지면</span>
            </div>
            <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5">
              <button
                type="button"
                onClick={() => onChangeSurface("paged")}
                className={`px-2 py-0.5 rounded-md font-medium cursor-pointer transition ${surfaceKind === "paged"
                  ? "bg-white text-indigo-700 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
                  }`}
              >
                A4형
              </button>
              <button
                type="button"
                onClick={() => onChangeSurface("scroll")}
                className={`px-2 py-0.5 rounded-md font-medium cursor-pointer transition ${surfaceKind === "scroll"
                  ? "bg-white text-emerald-700 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
                  }`}
              >
                블로그형
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-500">테마</span>
            <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5">
              <button
                type="button"
                onClick={() => onChangeTheme("modern")}
                className={`px-2 py-0.5 rounded-md font-medium cursor-pointer transition ${theme === "modern"
                  ? "bg-white text-slate-900 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
                  }`}
              >
                표준 모던
              </button>
              <button
                type="button"
                onClick={() => onChangeTheme("official")}
                className={`px-2 py-0.5 rounded-md font-medium cursor-pointer transition ${theme === "official"
                  ? "bg-white text-blue-800 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
                  }`}
              >
                공공 공문서(Ⅰ·가·❏)
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-500">밀도</span>
            <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5">
              {DENSITY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeDensity(opt.id)}
                  className={`px-2 py-0.5 rounded-md font-medium cursor-pointer transition ${density === opt.id
                    ? "bg-white text-slate-900 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        className={`flex-1 overflow-y-auto p-3 space-y-2.5 ${locked ? "opacity-45 pointer-events-none select-none" : ""
          }`}
      >
        {nodes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-6 text-center text-[11px] leading-relaxed text-slate-500">
            좌측 아웃라이너에 내용을 작성하면 항목별 틀 전환 옵션이 여기에 표시됩니다.
          </div>
        ) : null}
        {nodes.map((node, idx) => {
          const roleMeta = SEMANTIC_ROLE_META[node.role];
          const options = getLayoutOptionsForNode(node);

          return (
            <div
              key={node.id}
              className="rounded-xl border border-slate-200 bg-white p-2.5 space-y-2 shadow-2xs"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-mono text-slate-400">#{idx + 1}</span>
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border leading-none ${roleMeta.badgeClass}`}
                  >
                    {roleMeta.label}
                  </span>
                  {node.children.length > 0 ? (
                    <span className="text-[10px] text-slate-400">
                      하위 {node.children.length}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs font-bold text-slate-900 truncate">{node.text}</p>
              </div>

              {node.role === "form-ref" ? (
                <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 p-2 text-[11px] text-amber-900 space-y-1.5">
                  <p className="leading-snug">
                    복합 병합(`rowSpan`/`colSpan`) 양식은 WYSIWYG 가 직접 소유합니다. 아웃라이너에서는 순서만 바꿀 수 있습니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => onJumpToWysiwygForm(node.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-amber-300 text-amber-900 font-semibold hover:bg-amber-100/70 cursor-pointer transition"
                  >
                    <MousePointerClick className="w-3 h-3" />
                    본문 마감 모드에서 표 편집
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {options.map((opt) => {
                    const selected = node.layoutChoice === opt.choice;
                    return (
                      <button
                        key={opt.choice}
                        type="button"
                        onClick={() => onChangeNodeLayout(node.id, opt.choice)}
                        title={opt.hint}
                        className={`px-2 py-1.5 rounded-lg border text-left transition cursor-pointer ${selected
                          ? "border-indigo-500 bg-indigo-50/70 text-indigo-900 ring-1 ring-indigo-500"
                          : "border-slate-200 hover:bg-slate-50 text-slate-700"
                          }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-semibold truncate">{opt.label}</span>
                          {selected ? <Check className="w-3 h-3 text-indigo-600 shrink-0" /> : null}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">{opt.hint}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};

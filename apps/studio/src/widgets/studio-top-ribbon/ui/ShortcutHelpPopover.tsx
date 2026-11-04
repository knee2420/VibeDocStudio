import React from "react";
import { HelpCircle, Keyboard, X } from "lucide-react";

import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";

const SHORTCUT_ITEMS = [
  { keys: "● 불릿 클릭", desc: "해당 노드 계층(Project/Doc/Page/Slot)으로 4단계 Zoom-In" },
  { keys: "Ctrl + Z / Y", desc: "아웃라이너·템플릿·문서 구조 통합 실행 취소(Undo) / 재실행" },
  { keys: "Enter / Delete", desc: "아웃라이너 형제 노드 즉시 추가 / 선택 노드 삭제" },
  { keys: "Tab / Shift+Tab", desc: "아웃라이너 노드 계층 깊이(Depth L1~L4) 들여쓰기·내어쓰기" },
  { keys: "Esc", desc: "AI 스트리밍 즉시 중단(Abort) · 팝오버/컴포저 닫기" },
  { keys: "?", desc: "단축키 및 조작 치트시트 열기/닫기" },
];

export const ShortcutHelpPopover: React.FC = () => {
  const open = useWorkspaceLayoutStore((s) => s.shortcutHelpOpen);
  const setOpen = useWorkspaceLayoutStore((s) => s.setShortcutHelpOpen);

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="shortcut-help-trigger"
        onClick={() => setOpen(!open)}
        title="단축키 및 4단계 줌 조작 가이드 (?)"
        className={`w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold cursor-pointer transition ${
          open
            ? "bg-slate-900 text-white border-slate-900"
            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
        }`}
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="단축키 및 조작 치트시트"
          data-testid="shortcut-help-popover"
          className="absolute right-0 top-10 z-50 w-84 rounded-xl bg-white border border-slate-200 shadow-xl p-3.5 space-y-2.5 text-xs"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <Keyboard className="w-4 h-4 text-[#248567]" />
              Pro-Tool 단축키 & 줌 위계 가이드
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer"
              title="닫기 (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1.5">
            {SHORTCUT_ITEMS.map((item) => (
              <div
                key={item.keys}
                className="flex items-center justify-between gap-2 py-1 border-b border-slate-50 last:border-b-0"
              >
                <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[10px] font-semibold text-slate-800 shrink-0">
                  {item.keys}
                </kbd>
                <span className="text-[11px] text-slate-600 text-right">
                  {item.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};


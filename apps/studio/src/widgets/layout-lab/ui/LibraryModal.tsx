import React from "react";
import { BookOpen, LayoutTemplate, Upload, X } from "lucide-react";

import { LAB_ITEMS } from "../model/dummy";
import { useLabStore } from "../model/useLabStore";
import { KindBadge } from "./shell";

/**
 * 자료실 — 레퍼런스와 리소스를 같이 관리하는 곳 (상시 칸이 아니라 필요할 때 여는 관리 화면).
 * 역할은 이 문서에서 물릴 때 정한다. 한 자료가 둘 다일 수도 있다.
 */
export const LibraryModal: React.FC = () => {
  const open = useLabStore((s) => s.libraryOpen);
  const setOpen = useLabStore((s) => s.setLibrary);
  const roles = useLabStore((s) => s.roles);
  const setRole = useLabStore((s) => s.setRole);
  const say = useLabStore((s) => s.say);
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-[70] bg-black/30 flex items-center justify-center p-8" onMouseDown={() => setOpen(false)} data-testid="lab-library">
      <div className="fig-panel w-[760px] max-w-full max-h-full flex flex-col rounded-xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="h-12 px-4 flex items-center gap-2 border-b border-[var(--fig-border)]">
          <span className="font-semibold text-[14px]">자료실</span>
          <span className="text-[var(--fig-text-secondary)]">레퍼런스와 리소스를 한곳에서 관리 · 역할은 이 문서에서 정합니다</span>
          <button type="button" className="fig-btn ml-auto" onClick={() => say("폴더 · 웹 URL 가져오기 (더미)")}>
            <Upload className="w-3 h-3" />가져오기
          </button>
          <button type="button" className="fig-icon-btn" onClick={() => setOpen(false)} title="닫기">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-[11px] text-[var(--fig-text-secondary)] border-b border-[var(--fig-border)]">
                <th className="font-medium px-4 py-2">이름</th>
                <th className="font-medium px-2 py-2 w-[70px]">종류</th>
                <th className="font-medium px-2 py-2 w-[230px]">이 문서에서의 역할</th>
              </tr>
            </thead>
            <tbody>
              {LAB_ITEMS.map((item) => {
                const r = roles[item.id] ?? { ref: false, res: false };
                return (
                  <tr key={item.id} className="border-b border-[var(--fig-border)] hover:bg-[var(--fig-hover)]">
                    <td className="px-4 py-2">
                      <div className="line-clamp-1">{item.title}</div>
                      <div className="text-[10.5px] text-[var(--fig-text-tertiary)]">{item.source}</div>
                    </td>
                    <td className="px-2 py-2"><KindBadge kind={item.kind} /></td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setRole(item.id, "ref", !r.ref)}
                          className={`h-6 px-2 rounded-md border text-[11px] inline-flex items-center gap-1 ${r.ref ? "bg-[#9747ff]/10 border-[#9747ff]/40 text-[#7a3bd6]" : "border-[var(--fig-border)] text-[var(--fig-text-secondary)]"}`}
                          title="글 흐름 · 레이아웃 뼈대로 따라 하기"
                        >
                          <LayoutTemplate className="w-3 h-3" />레퍼런스
                        </button>
                        <button
                          type="button"
                          onClick={() => setRole(item.id, "res", !r.res)}
                          className={`h-6 px-2 rounded-md border text-[11px] inline-flex items-center gap-1 ${r.res ? "bg-[#0f9d58]/10 border-[#0f9d58]/40 text-[#0b7a43]" : "border-[var(--fig-border)] text-[var(--fig-text-secondary)]"}`}
                          title="사실 · 수치를 인용하는 근거"
                        >
                          <BookOpen className="w-3 h-3" />근거
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-[11px] text-[var(--fig-text-secondary)] border-t border-[var(--fig-border)]">
          레퍼런스 = 흉내 내기 (형식 · 흐름 · 말투) · 근거 = 인용하기 (사실 · 수치 · 출처). 같은 자료가 둘 다일 수 있습니다.
        </div>
      </div>
    </div>
  );
};

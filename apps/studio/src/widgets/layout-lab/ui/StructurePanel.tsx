import React from "react";
import { ChevronDown, FileText, Image as ImageIcon, LayoutGrid, Search, Table2, Type } from "lucide-react";

import { useLayoutLabStore } from "@/features/layout-lab";

import { CURRENT_TREE } from "../model/outline";
import { useLabStore } from "../model/useLabStore";
import { OutlineO5 } from "./outline/OutlineBlocks";
import { OutlineO6 } from "./outline/OutlineSchema";
import { SkeletonPanel } from "./skeleton/SkeletonPanel";
import { OutlineO1, OutlineO2, OutlineO3, OutlineO4 } from "./outline/OutlineVersions";

const ICON = { grid: LayoutGrid, text: Type, table: Table2, image: ImageIcon };

/** 지금 앱의 트리 흉내 (Documents & Pages + Elements) — 아웃라인 시제품과 견주라고. */
const CurrentTree: React.FC = () => {
  const activePage = useLabStore((s) => s.activePage);
  const setPage = useLabStore((s) => s.setPage);
  const rows = CURRENT_TREE.elements[activePage] ?? [];
  const page = CURRENT_TREE.pages.find((p) => p.id === activePage);
  return (
  <div className="flex-1 min-h-0 overflow-y-auto py-1" data-testid="lab-structure">
    <div className="fig-section-header !h-8 !pl-3">
      <span>Documents &amp; Pages <span className="fig-section-meta">16</span></span>
    </div>
    <div className="fig-row">
      <ChevronDown className="w-3 h-3 mx-1 text-[var(--fig-text-tertiary)]" />
      <FileText className="w-3.5 h-3.5 mr-1.5 text-[var(--fig-brand)]" />
      <span className="fig-row-label text-[#c2410c]">01. 아키텍처 위원회 의사결정 회의록</span>
    </div>
    {CURRENT_TREE.pages.map((p) => (
      <div
        key={p.id}
        className="fig-row !pl-[46px]"
        data-sel={p.id === activePage ? "on" : undefined}
        onClick={() => {
          setPage(p.id);
          document.getElementById(`lab-page-${p.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      >
        <span className="fig-row-label">{p.t}</span>
      </div>
    ))}
    <div className="fig-section-header !h-8 !pl-3 mt-2 border-t border-[var(--fig-border)]">
      <span className="truncate">Elements <span className="fig-section-meta">{page?.t.replace(/^Page \d+ · /, "")} · {rows.length}개</span></span>
    </div>
    <label className="fig-input mx-2 mb-1">
      <Search className="fig-input-prefix w-3 h-3" />
      <input placeholder="Search elements..." readOnly />
    </label>
    {rows.length === 0 && <p className="px-3 py-2 text-[11px] text-[var(--fig-text-tertiary)]">(이 쪽은 더미 요소가 없습니다 — 1 · 6 · 7쪽을 보세요)</p>}
    {rows.map((e, i) => {
      const Icon = ICON[e.icon];
      return (
        <div key={i} className="fig-row" style={{ paddingLeft: 8 + e.d * 18 }}>
          <Icon className="w-3.5 h-3.5 mr-1.5 text-[var(--fig-text-secondary)] shrink-0" />
          <span className="fig-row-label">{e.t}</span>
        </div>
      );
    })}
  </div>
  );
};

/** 구조 칸 — 아웃라인 실험에서 고른 버전 (지금 트리 · O1~O4). */
export const StructurePanel: React.FC = () => {
  const outline = useLayoutLabStore((s) => s.outline);
  if (outline === "o1") return <OutlineO1 />;
  if (outline === "o2") return <OutlineO2 />;
  if (outline === "o3") return <OutlineO3 />;
  if (outline === "o4") return <OutlineO4 />;
  if (outline === "o5") return <OutlineO5 />;
  if (outline === "o6") return <OutlineO6 />;
  if (outline === "o7") return <SkeletonPanel />;
  return <CurrentTree />;
};

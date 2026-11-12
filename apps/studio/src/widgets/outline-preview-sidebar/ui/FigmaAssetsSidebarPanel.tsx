import React, { useState } from "react";
import {
  Component,
  Folder,
  Grid,
  Layers,
  LayoutGrid,
  Plus,
  Search,
  SlidersHorizontal,
  Table,
} from "lucide-react";

interface AssetTemplateItem {
  id: string;
  name: string;
  category: "components" | "sections" | "blocks";
  description: string;
  icon: React.ReactNode;
}

const DEFAULT_ASSETS: AssetTemplateItem[] = [
  {
    id: "sec-grid-2col",
    name: "2단 개요 그리드 섹션",
    category: "sections",
    description: "회의 개요 및 핵심 결론 2단 배치 와꾸",
    icon: <LayoutGrid className="w-4 h-4 text-sky-500" />,
  },
  {
    id: "sec-signature-box",
    name: "정밀 결재란 & 서명 프레임",
    category: "sections",
    description: "기안/검토/승인 서명 슬롯 세트",
    icon: <Layers className="w-4 h-4 text-emerald-500" />,
  },
  {
    id: "comp-spec-table",
    name: "오픈소스 스펙 결정표 (Table)",
    category: "blocks",
    description: "레이어별 기술 선정 및 역할 비교 매트릭스",
    icon: <Table className="w-4 h-4 text-violet-500" />,
  },
  {
    id: "comp-blog-pattern",
    name: "소제목 + 대형 이미지 + 본문 블록",
    category: "components",
    description: "자주 쓰는 블로그/보고서용 복합 스몰 템플릿",
    icon: <Component className="w-4 h-4 text-amber-500" />,
  },
  {
    id: "comp-action-items",
    name: "실행 과제 (Action Items) 리스트",
    category: "components",
    description: "담당자 및 기한이 포함된 할 일 체크리스트",
    icon: <Grid className="w-4 h-4 text-indigo-500" />,
  },
];

export const FigmaAssetsSidebarPanel: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const filteredAssets = DEFAULT_ASSETS.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === "all" || item.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div
      data-testid="figma-assets-panel"
      className="flex-1 flex flex-col min-h-0 bg-white select-none overflow-hidden text-slate-800 text-[11px]"
    >
      {/* 1. 검색창 */}
      <div className="p-2 border-b border-slate-200">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assets..."
            className="w-full pl-7 pr-7 py-1 text-xs bg-slate-100 hover:bg-slate-200/70 focus:bg-white rounded-md border border-transparent focus:border-[#0d99ff] outline-none transition-colors text-slate-800 placeholder-slate-400 font-sans"
          />
          <button
            type="button"
            title="필터 옵션"
            className="absolute right-1.5 p-0.5 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <SlidersHorizontal className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 2. 카테고리 필터 칩 */}
      <div className="px-2 py-1.5 flex items-center gap-1 border-b border-slate-100 overflow-x-auto text-[10px]">
        {["all", "components", "sections", "blocks"].map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`px-2 py-0.5 rounded-full capitalize cursor-pointer transition-colors ${
              selectedCategory === cat
                ? "bg-[#0d99ff] text-white font-medium shadow-2xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {cat === "all" ? "All Assets" : cat}
          </button>
        ))}
      </div>

      {/* 3. 에셋 목록 트리 & 카드 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {/* Local components 섹션 */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-1 mb-1.5">
            <span className="flex items-center gap-1">
              <Folder className="w-3 h-3 text-slate-400" />
              Local components
            </span>
            <span className="text-[10px] text-slate-400 font-mono">({filteredAssets.length})</span>
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            {filteredAssets.map((asset) => (
              <div
                key={asset.id}
                draggable
                title="캔버스로 드래그하여 배치하거나 더블클릭하여 삽입"
                className="group flex items-start gap-2.5 p-2 rounded-lg border border-slate-200/80 hover:border-[#0d99ff] hover:bg-sky-50/40 cursor-grab active:cursor-grabbing transition-all shadow-2xs"
              >
                <div className="w-7 h-7 rounded-md bg-slate-100 group-hover:bg-white flex items-center justify-center shrink-0 border border-slate-200/60 shadow-2xs">
                  {asset.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800 text-[11px] truncate group-hover:text-[#0d99ff]">
                    {asset.name}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {asset.description}
                  </div>
                </div>
                <button
                  type="button"
                  title="문서에 추가"
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#0d99ff] hover:text-white text-slate-400 transition-opacity cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {filteredAssets.length === 0 && (
              <div className="p-4 text-center text-slate-400 text-xs">
                일치하는 에셋이 없습니다.
              </div>
            )}
          </div>
        </div>

        {/* 템플릿 라이브러리 안내 */}
        <div className="p-2.5 rounded-lg bg-slate-50 border border-dashed border-slate-200 text-center">
          <p className="text-[10px] text-slate-500">
            원하는 블록을 우클릭하여<br />
            <strong className="text-slate-700 font-medium">"컴포넌트로 등록"</strong>하면 여기에 추가됩니다.
          </p>
        </div>
      </div>
    </div>
  );
};


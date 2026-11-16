import React, { useMemo, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import { NEW_BLOCK_DRAG_MIME } from "@vibe/slot-canvas";
import { listInsertableBlocks } from "@vibe/vdoc-schema";

import { useAssetLibraryStore } from "@/entities/asset-library";
import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import type { InsertableBlockKind } from "@/features/mutate-canvas-blocks";
import { AssetWireframeThumb } from "@/shared/ui";

import { SectionAssetPreview } from "./SectionAssetPreview";

type ViewMode = "grid" | "list";
type FolderId = "blocks" | "local" | "sections";

interface AssetItem {
  id: string;
  name: string;
  description: string;
  folder: FolderId;
  blockKind: InsertableBlockKind;
  thumbKind: string;
  sectionId?: string;
}

const FOLDER_META: ReadonlyArray<{ id: FolderId; label: string; subtitle: string; thumbKind: string }> = [
  { id: "blocks", label: "기본 블록 (Blocks)", subtitle: "우측 블록 도구함 전체 구성요소", thumbKind: "columns-grid" },
  { id: "sections", label: "문서 섹션 & 와꾸", subtitle: "자주 쓰는 보고서·회의록 복합 레이아웃", thumbKind: "hero" },
  { id: "local", label: "이 파일에서 생성됨", subtitle: "등록한 로컬 컴포넌트 · 재사용 템플릿", thumbKind: "section-block" },
];

const SECTION_PRESETS: AssetItem[] = [
  {
    id: "sec-grid-2col",
    name: "2단 개요 그리드 섹션",
    description: "회의 개요 및 핵심 결론 2단 배치 와꾸",
    folder: "sections",
    blockKind: "columns-grid",
    thumbKind: "columns-grid",
  },
  {
    id: "sec-spec-table",
    name: "오픈소스 스펙 결정표",
    description: "레이어별 기술 선정 및 역할 비교 매트릭스",
    folder: "sections",
    blockKind: "structured-table",
    thumbKind: "structured-table",
  },
  {
    id: "sec-hero-banner",
    name: "문서 타이틀 히어로 배너",
    description: "표지·섹션 도입부용 강조 헤더 블록",
    folder: "sections",
    blockKind: "section-block",
    thumbKind: "hero",
  },
  {
    id: "sec-fillable-card",
    name: "결재·입력 폼 그룹",
    description: "기안·검토·담당자 입력용 필드 묶음",
    folder: "sections",
    blockKind: "fillable-group",
    thumbKind: "fillable-group",
  },
];

const INITIAL_LOCAL_ASSETS: AssetItem[] = [
  {
    id: "local-action-items",
    name: "실행 과제 (Action Items)",
    description: "담당자·기한 포함 체크리스트 섹션",
    folder: "local",
    blockKind: "section-block",
    thumbKind: "section-block",
  },
  {
    id: "local-ref-link",
    name: "근거 링크 카드",
    description: "외부 문서·백데이터 참조 링크 카드",
    folder: "local",
    blockKind: "text",
    thumbKind: "link-card",
  },
];

export const FigmaAssetsSidebarPanel: React.FC = () => {
  const doc = useStudioDocumentStore(selectActiveDocument);
  const activePageId = useStudioDocumentStore((s) => s.activePageId);
  const selectedBlockId = useSlotSelectionStore((s) => s.selectedBlockId);
  const setActiveActivityTab = useWorkspaceLayoutStore((s) => s.setActiveActivityTab);
  const sectionAssets = useAssetLibraryStore((s) => s.sectionAssets);
  const armPlacement = useAssetLibraryStore((s) => s.armPlacement);
  const armedKind = useAssetLibraryStore((s) => (s.activeTool === "place" ? s.placement?.kind ?? null : null));

  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [activeFolder, setActiveFolder] = useState<FolderId | null>(null);
  const [localAssets, setLocalAssets] = useState<AssetItem[]>(INITIAL_LOCAL_ASSETS);
  const [registerName, setRegisterName] = useState("");
  const [showRegisterForm, setShowRegisterForm] = useState(false);

  const sectionItems = useMemo<AssetItem[]>(
    () =>
      sectionAssets.map((sec) => ({
        id: sec.id,
        name: sec.name,
        description: sec.description,
        folder: "local",
        blockKind: "section-block",
        thumbKind: "section-block",
        sectionId: sec.id,
      })),
    [sectionAssets],
  );

  const schemaBlocks = useMemo<AssetItem[]>(
    () =>
      listInsertableBlocks().map((item) => ({
        id: `block-${item.kind}`,
        name: item.label,
        description: item.description,
        folder: "blocks",
        blockKind: item.kind as InsertableBlockKind,
        thumbKind: item.kind,
      })),
    [],
  );

  const allAssets = useMemo(
    () => [...sectionItems, ...schemaBlocks, ...SECTION_PRESETS, ...localAssets],
    [sectionItems, schemaBlocks, localAssets],
  );

  const targetPageId = activePageId ?? doc?.pages[0]?.pageId ?? "";

  const activePageLayout = useMemo(
    () => doc?.pages.find((p) => p.pageId === targetPageId)?.layout ?? doc?.pages[0]?.layout,
    [doc, targetPageId],
  );

  const renderAssetPreview = (item: AssetItem, opts?: { large?: boolean; defaultScale?: number }) => {
    if (item.sectionId) {
      const sec = sectionAssets.find((s) => s.id === item.sectionId);
      if (sec) {
        return (
          <SectionAssetPreview
            section={sec}
            pageLayout={activePageLayout}
            defaultScale={opts?.defaultScale ?? (opts?.large ? 0.3 : 0.15)}
          />
        );
      }
    }
    return <AssetWireframeThumb kind={item.thumbKind} large={opts?.large} />;
  };

  const handleRegisterTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = registerName.trim();
    if (!trimmed) return;
    const selectedBlock = doc?.pages
      .flatMap((p) => p.blocks)
      .find((b) => b.blockId === selectedBlockId);
    const blockKind = (selectedBlock?.kind as InsertableBlockKind) ?? "section-block";

    setLocalAssets((prev) => [
      {
        id: `local-${Date.now()}`,
        name: trimmed,
        description: selectedBlock ? `선택 블록(${selectedBlock.kind}) 기반 등록` : "사용자 등록 로컬 템플릿",
        folder: "local",
        blockKind,
        thumbKind: blockKind,
      },
      ...prev,
    ]);
    setRegisterName("");
    setShowRegisterForm(false);
    setActiveFolder("local");
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  const visibleItems = useMemo(() => {
    return allAssets.filter((item) => {
      if (isSearching) {
        return (
          item.name.toLowerCase().includes(normalizedQuery) ||
          item.description.toLowerCase().includes(normalizedQuery)
        );
      }
      if (activeFolder) {
        return item.folder === activeFolder;
      }
      return item.folder === "blocks";
    });
  }, [allAssets, isSearching, normalizedQuery, activeFolder]);

  const activeFolderMeta = FOLDER_META.find((f) => f.id === activeFolder);

  const placementKindOf = (item: AssetItem) => (item.sectionId ? `section-asset:${item.sectionId}` : item.blockKind);
  const assetDragProps = (item: AssetItem) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData(NEW_BLOCK_DRAG_MIME, placementKindOf(item));
    },
  });
  /** 피그마처럼: 고르면 바로 넣지 않고 배치 도구가 된다 — 캔버스에서 넣을 자리를 클릭한다. 다시 누르면 취소. */
  const armAsset = (item: AssetItem) => armPlacement({ kind: placementKindOf(item), label: item.name });

  const renderAssetCard = (item: AssetItem) => {
    const isArmed = armedKind === placementKindOf(item);
    const hint = `${item.name} — ${item.description}
클릭: 고른 뒤 캔버스에서 넣을 자리 클릭 · 끌어서 원하는 자리에 놓기`;
    if (viewMode === "list") {
      return (
        <button
          key={item.id}
          type="button"
          data-testid={`asset-card-${item.id}`}
          aria-pressed={isArmed}
          {...assetDragProps(item)}
          onClick={() => armAsset(item)}
          title={hint}
          className={`w-full text-left flex items-center gap-2.5 p-1.5 rounded-[5px] cursor-grab active:cursor-grabbing ${
            isArmed ? "bg-[#e5f4ff]" : "hover:bg-black/[0.04]"
          }`}
        >
          <div className="w-9 h-9 rounded-[5px] bg-[#f5f5f5] border border-black/10 shrink-0 overflow-hidden">
            {renderAssetPreview(item, { defaultScale: 0.045 })}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-black/90 truncate">{item.name}</div>
            <div className="text-[10.5px] text-black/50 truncate">{item.description}</div>
          </div>
        </button>
      );
    }

    return (
      <button
        key={item.id}
        type="button"
        data-testid={`asset-card-${item.id}`}
        aria-pressed={isArmed}
        {...assetDragProps(item)}
        onClick={() => armAsset(item)}
        title={hint}
        className="group flex flex-col text-left cursor-grab active:cursor-grabbing"
      >
        <div
          className={`relative aspect-square w-full rounded-[5px] bg-[#f5f5f5] border overflow-hidden ${
            isArmed ? "border-[#0d99ff] ring-2 ring-[#0d99ff]/25" : "border-black/10 group-hover:border-black/25"
          }`}
        >
          {renderAssetPreview(item)}
        </div>
        <span className="mt-1 w-full px-0.5 text-[11px] text-black/80 truncate text-center">{item.name}</span>
      </button>
    );
  };

  return (
    <div
      data-testid="figma-assets-panel"
      className="flex-1 flex flex-col min-h-0 bg-white select-none overflow-hidden text-slate-800"
    >
      {/* 1. 피그마 스타일 헤더 ("에셋" + 라이브러리 허브 아이콘) */}
      <div className="h-10 px-3 border-b border-slate-200/90 flex items-center justify-between shrink-0">
        <span className="text-[12.5px] font-semibold text-slate-800">에셋</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setShowRegisterForm((v) => !v)}
            title="새 템플릿 / 에셋 등록"
            className={`fig-icon-btn ${showRegisterForm ? "bg-sky-50 text-[#0d99ff]" : ""}`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setActiveActivityTab("template-hub")}
            title="서식·템플릿 라이브러리 허브 열기"
            className="fig-icon-btn"
          >
            <BookOpen className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. 검색 + 그리드/리스트 뷰 전환 */}
      <div className="px-2.5 py-2 border-b border-slate-100 flex items-center gap-1.5 shrink-0">
        <div className="relative flex-1 flex items-center">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="이 라이브러리에서 검색"
            className="w-full pl-8 pr-6 py-1.5 text-[12px] bg-[#f3f4f6] hover:bg-slate-200/70 focus:bg-white rounded-md border border-transparent focus:border-[#0d99ff] outline-none transition-colors text-slate-800 placeholder-slate-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-1.5 p-0.5 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex items-center bg-[#f3f4f6] p-0.5 rounded-md shrink-0">
          <button
            type="button"
            data-testid="assets-view-grid-btn"
            onClick={() => setViewMode("grid")}
            title="그리드 보기"
            className={`p-1 rounded cursor-pointer transition ${
              viewMode === "grid" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            data-testid="assets-view-list-btn"
            onClick={() => setViewMode("list")}
            title="리스트 보기"
            className={`p-1 rounded cursor-pointer transition ${
              viewMode === "list" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 템플릿 등록 인라인 폼 */}
      {showRegisterForm && (
        <form onSubmit={handleRegisterTemplate} className="px-2.5 py-2 bg-sky-50/70 border-b border-sky-200/80 space-y-1.5 shrink-0">
          <div className="flex items-center justify-between text-[11px] font-semibold text-sky-900">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#0d99ff]" />
              로컬 에셋 · 템플릿 등록
            </span>
            <button type="button" onClick={() => setShowRegisterForm(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="flex gap-1">
            <input
              type="text"
              value={registerName}
              onChange={(e) => setRegisterName(e.target.value)}
              placeholder="새 에셋 이름 입력..."
              className="flex-1 min-w-0 px-2 py-1 text-[11.5px] bg-white border border-sky-200 rounded outline-none focus:border-[#0d99ff]"
              autoFocus
            />
            <button
              type="submit"
              className="px-2.5 py-1 rounded bg-[#0d99ff] hover:bg-[#0b87e3] text-white text-[11px] font-semibold cursor-pointer shrink-0"
            >
              등록
            </button>
          </div>
        </form>
      )}

      {/* 3. 본문: 폴더 목록(드릴다운) + 그리드/리스트 아이템 */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
        {!isSearching && activeFolder && activeFolderMeta && (
          <button
            type="button"
            onClick={() => setActiveFolder(null)}
            className="w-full flex items-center gap-1.5 py-1 px-1 text-[12px] font-semibold text-slate-700 hover:text-slate-950 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-slate-500" />
            <span>{activeFolderMeta.label}</span>
          </button>
        )}

        {!isSearching && !activeFolder && (
          <div className="space-y-1">
            {FOLDER_META.map((folder) => {
              const count = allAssets.filter((a) => a.folder === folder.id).length;
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => setActiveFolder(folder.id)}
                  className="w-full flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-100/90 transition text-left cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-md bg-[#f5f5f5] border border-slate-200/80 shrink-0 overflow-hidden">
                    <AssetWireframeThumb kind={folder.thumbKind} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-slate-800 truncate">{folder.label}</div>
                    <div className="text-[10.5px] text-slate-400 truncate">
                      {folder.subtitle} · {count}
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>
              );
            })}
          </div>
        )}

        {!isSearching && !activeFolder && sectionItems.length > 0 && (
          <div className="pt-1 border-t border-slate-100">
            <div className="px-0.5 mb-2 flex items-center justify-between text-[11px] font-semibold text-[#0d99ff]">
              <span>생성된 섹션 에셋</span>
              <span className="font-mono text-[10px]">{sectionItems.length}</span>
            </div>
            <div className={viewMode === "grid" ? "grid grid-cols-2 gap-2.5" : "space-y-1"}>
              {sectionItems.map(renderAssetCard)}
            </div>
          </div>
        )}

        {!isSearching && !activeFolder && (
          <div className="pt-1 border-t border-slate-100">
            <div className="px-0.5 mb-2 flex items-center justify-between text-[11px] font-semibold text-slate-500">
              <span>기본 블록 바로 배치</span>
              <span className="font-mono text-[10px] text-slate-400">{visibleItems.length}</span>
            </div>
          </div>
        )}

        {visibleItems.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-slate-400">
            일치하는 에셋이 없습니다.
          </div>
        ) : (
          <div className={viewMode === "grid" ? "grid grid-cols-2 gap-2.5" : "space-y-1"}>
            {visibleItems.map(renderAssetCard)}
          </div>
        )}
      </div>

    </div>
  );
};

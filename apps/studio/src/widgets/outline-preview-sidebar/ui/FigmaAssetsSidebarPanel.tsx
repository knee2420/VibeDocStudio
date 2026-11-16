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

import { useAssetLibraryStore, type AssetSource } from "@/entities/asset-library";
import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useMutateCanvasBlocks, type InsertableBlockKind } from "@/features/mutate-canvas-blocks";
import { AssetWireframeThumb } from "@/shared/ui";

import { AssetDetailPopover } from "./asset-insert/AssetDetailPopover";
import { AssetPreview } from "./asset-insert/AssetPreview";

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
  const insertSectionIntoPage = useAssetLibraryStore((s) => s.insertSectionIntoPage);
  const { addBlockToPage } = useMutateCanvasBlocks();

  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [activeFolder, setActiveFolder] = useState<FolderId | null>(null);
  const [localAssets, setLocalAssets] = useState<AssetItem[]>(INITIAL_LOCAL_ASSETS);
  const [detailPopover, setDetailPopover] = useState<{ item: AssetItem; top: number; left: number } | null>(null);
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

  /** 아이템별 미리보기 · 삽입 출처 (참조가 바뀌지 않게 메모 — 미리보기가 매번 다시 계산되지 않게). */
  const sourceById = useMemo(() => {
    const map = new Map<string, AssetSource>();
    for (const item of allAssets) {
      const section = item.sectionId ? sectionAssets.find((x) => x.id === item.sectionId) : undefined;
      map.set(item.id, section ? { type: "section", section } : { type: "block", blockKind: item.blockKind });
    }
    return map;
  }, [allAssets, sectionAssets]);

  /** 타일 · 목록 썸네일: 캔버스와 같은 모양의 실제 내용 미리보기 (예시 문구 · 더미 이미지 · 원본). */
  const renderAssetPreview = (item: AssetItem, height: number) => {
    const source = sourceById.get(item.id);
    return source ? <AssetPreview source={source} height={height} contentWidth={340} /> : <AssetWireframeThumb kind={item.thumbKind} />;
  };

  const handleInsertAsset = (item: AssetItem) => {
    if (!targetPageId) return;
    if (item.sectionId) {
      insertSectionIntoPage(item.sectionId, targetPageId);
    } else {
      addBlockToPage(targetPageId, item.blockKind);
    }
    setDetailPopover(null);
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

  const openDetails = (e: React.MouseEvent<HTMLElement>, item: AssetItem) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sidebarRight = e.currentTarget.closest("[data-testid='figma-assets-panel']")?.getBoundingClientRect().right ?? rect.right;
    const clampedTop = Math.max(48, Math.min(window.innerHeight - 310, rect.top));
    setDetailPopover({
      item,
      top: clampedTop,
      left: sidebarRight + 8,
    });
  };

  const renderAssetCard = (item: AssetItem) => {
    const isSelected = detailPopover?.item.id === item.id;
    if (viewMode === "list") {
      return (
        <div
          key={item.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "copy";
            e.dataTransfer.setData(
              NEW_BLOCK_DRAG_MIME,
              item.sectionId ? `section-asset:${item.sectionId}` : item.blockKind,
            );
          }}
          onClick={(e) => openDetails(e, item)}
          onDoubleClick={() => handleInsertAsset(item)}
          title={`${item.name} — 클릭: 세부 정보 · 드래그/더블클릭: 페이지에 삽입`}
          className={`group flex items-center gap-2.5 p-1.5 rounded-lg cursor-grab active:cursor-grabbing transition ${
            isSelected ? "bg-[#e5f4ff] ring-1 ring-[#0d99ff]" : "hover:bg-slate-100/90"
          }`}
        >
          <div className="w-9 h-9 rounded-md bg-[#f5f5f5] border border-slate-200/80 shrink-0 overflow-hidden">
            {renderAssetPreview(item, 34)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-slate-800 truncate">{item.name}</div>
            <div className="text-[10.5px] text-slate-400 truncate">{item.description}</div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleInsertAsset(item);
            }}
            title="현재 페이지에 바로 삽입"
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#0d99ff] hover:text-white text-slate-500 transition cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    return (
      <div
        key={item.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "copy";
          e.dataTransfer.setData(
            NEW_BLOCK_DRAG_MIME,
            item.sectionId ? `section-asset:${item.sectionId}` : item.blockKind,
          );
        }}
        onClick={(e) => openDetails(e, item)}
        onDoubleClick={() => handleInsertAsset(item)}
        title={`${item.name} — 클릭: 세부 정보 · 드래그/더블클릭: 페이지에 삽입`}
        className="group flex flex-col cursor-grab active:cursor-grabbing"
      >
        <div
          className={`relative h-[132px] w-full rounded-lg bg-white p-2 border overflow-hidden transition ${
            isSelected
              ? "border-[#0d99ff] ring-2 ring-[#0d99ff]/25"
              : "border-slate-200/80 group-hover:border-slate-300"
          }`}
        >
          {renderAssetPreview(item, 114)}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleInsertAsset(item);
            }}
            title="현재 페이지에 바로 삽입"
            className="opacity-0 group-hover:opacity-100 absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-white/95 border border-slate-200 shadow-xs flex items-center justify-center text-slate-600 hover:bg-[#0d99ff] hover:text-white hover:border-[#0d99ff] transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <span className="mt-1 px-0.5 text-[11.5px] font-medium text-slate-700 truncate text-center group-hover:text-slate-950">
          {item.name}
        </span>
      </div>
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
            onClick={() => {
              setActiveFolder(null);
              setDetailPopover(null);
            }}
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
                  onClick={() => {
                    setActiveFolder(folder.id);
                    setDetailPopover(null);
                  }}
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


      {/* 4. 세부 정보 (피그마 에셋 세부 정보 배치): 실제 내용 미리보기 → 원본 · 예시 · 빈 칸으로 삽입 */}
      {detailPopover && sourceById.get(detailPopover.item.id) && (
        <AssetDetailPopover
          key={detailPopover.item.id}
          source={sourceById.get(detailPopover.item.id)!}
          name={detailPopover.item.name}
          description={detailPopover.item.description}
          folderLabel={FOLDER_META.find((f) => f.id === detailPopover.item.folder)?.label ?? "에셋"}
          pageId={targetPageId}
          anchor={{ top: detailPopover.top, left: detailPopover.left }}
          onClose={() => setDetailPopover(null)}
          onInsertBlank={() => handleInsertAsset(detailPopover.item)}
        />
      )}
    </div>
  );
};

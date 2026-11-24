import React, { useMemo, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FilePlus2,
  LayoutGrid,
  List,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import { NEW_BLOCK_DRAG_MIME } from "@vibe/slot-canvas";
import { listInsertableBlocks, type VDocDocument, type VDocPage } from "@vibe/vdoc-schema";

import { availableVariants, useAssetLibraryStore, type AssetSource } from "@/entities/asset-library";
import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { pageMutations } from "@/features/mutate-document-pages";
import { AssetWireframeThumb } from "@/shared/ui";

import { AssetDetailPopover } from "./asset-insert/AssetDetailPopover";
import { AssetPreview } from "./asset-insert/AssetPreview";
import { insertAssetVariant } from "./asset-insert/insertAssetVariant";
import { LibraryManagerDialog } from "./asset-insert/LibraryManagerDialog";
import { pageAssetSource, templateDocForVariant } from "./asset-insert/templateSources";

type ViewMode = "grid" | "list";
type FolderId = "blocks" | "local" | "sections";

/** 패널 안 위치: 모든 라이브러리 → 폴더(에셋 묶음) · 템플릿(페이지 묶음). */
type View = { kind: "home" } | { kind: "folder"; id: FolderId } | { kind: "template"; docId: string };

interface AssetItem {
  id: string;
  name: string;
  description: string;
  folder: FolderId;
  /** 블록 종류 (끌어다 놓기 · 기본 블록 미리보기). */
  blockKind: string;
  thumbKind: string;
  sectionId?: string;
}

const FOLDER_META: Record<FolderId, { label: string; subtitle: string; thumbKind: string }> = {
  local: { label: "이 파일에서 생성됨", subtitle: "이 문서에서 만든 에셋", thumbKind: "section-block" },
  blocks: { label: "기본 블록", subtitle: "글 · 표 · 이미지 같은 낱개 블록", thumbKind: "columns-grid" },
  sections: { label: "섹션 레이아웃", subtitle: "제목 · 본문 · 표를 미리 묶어 둔 구성", thumbKind: "hero" },
};

const SECTION_PRESETS: AssetItem[] = [
  {
    id: "sec-grid-2col",
    name: "2단 개요",
    description: "개요와 핵심 결론을 나란히 두는 2단 구성",
    folder: "sections",
    blockKind: "columns-grid",
    thumbKind: "columns-grid",
  },
  {
    id: "sec-spec-table",
    name: "비교 결정표",
    description: "항목별 선택지와 결정을 비교하는 표",
    folder: "sections",
    blockKind: "structured-table",
    thumbKind: "structured-table",
  },
  {
    id: "sec-hero-banner",
    name: "표지 · 도입 배너",
    description: "표지나 장 도입부에 쓰는 강조 머리",
    folder: "sections",
    blockKind: "hero",
    thumbKind: "hero",
  },
  {
    id: "sec-fillable-card",
    name: "결재 · 입력란",
    description: "기안 · 검토 · 담당자가 채우는 입력칸",
    folder: "sections",
    blockKind: "fillable-group",
    thumbKind: "fillable-group",
  },
];

const INITIAL_LOCAL_ASSETS: AssetItem[] = [
  {
    id: "local-action-items",
    name: "실행 과제",
    description: "담당자 · 기한을 적는 체크리스트 섹션",
    folder: "local",
    blockKind: "section-block",
    thumbKind: "section-block",
  },
  {
    id: "local-ref-link",
    name: "근거 링크 카드",
    description: "외부 문서 · 백데이터를 가리키는 링크 카드",
    folder: "local",
    blockKind: "link-card",
    thumbKind: "link-card",
  },
];

type DetailTarget =
  | { kind: "asset"; item: AssetItem; top: number; left: number }
  | { kind: "page"; docId: string; pageId: string; top: number; left: number };

export const FigmaAssetsSidebarPanel: React.FC = () => {
  const doc = useStudioDocumentStore(selectActiveDocument);
  const docs = useStudioDocumentStore((s) => s.docs);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const activePageId = useStudioDocumentStore((s) => s.activePageId);
  const setActiveDocId = useStudioDocumentStore((s) => s.setActiveDocId);
  const selectedBlockId = useSlotSelectionStore((s) => s.selectedBlockId);
  const setActiveActivityTab = useWorkspaceLayoutStore((s) => s.setActiveActivityTab);
  const insertStorylineNode = useProjectStore((s) => s.insertStorylineNode);
  const sectionAssets = useAssetLibraryStore((s) => s.sectionAssets);
  const hiddenTemplateIds = useAssetLibraryStore((s) => s.hiddenTemplateIds);

  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [view, setView] = useState<View>({ kind: "home" });
  const [localAssets, setLocalAssets] = useState<AssetItem[]>(INITIAL_LOCAL_ASSETS);
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [registerName, setRegisterName] = useState("");
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const templates = useMemo(() => docs.filter((d) => !hiddenTemplateIds.includes(d.docId)), [docs, hiddenTemplateIds]);

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
        blockKind: item.kind,
        thumbKind: item.kind,
      })),
    [],
  );

  const allAssets = useMemo(
    () => [...sectionItems, ...localAssets, ...schemaBlocks, ...SECTION_PRESETS],
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

  /** 템플릿 페이지별 출처 (템플릿 화면 · 세부 정보 공통). */
  const pageSources = useMemo(() => {
    const map = new Map<string, AssetSource>();
    for (const d of templates) for (const p of d.pages) map.set(`${d.docId}:${p.pageId}`, pageAssetSource(d, p));
    return map;
  }, [templates]);

  const renderAssetPreview = (item: AssetItem, height: number) => {
    const source = sourceById.get(item.id);
    return source ? <AssetPreview source={source} height={height} contentWidth={340} /> : <AssetWireframeThumb kind={item.thumbKind} />;
  };

  /** 더블클릭 · + 버튼: 세부 정보의 첫 번째 방법(원본이 있으면 원본, 없으면 더미 데이터)으로 바로 넣는다. */
  const quickInsert = (item: AssetItem) => {
    const source = sourceById.get(item.id);
    if (!source || !targetPageId) return;
    insertAssetVariant(source, availableVariants(source)[0], targetPageId, `에셋 '${item.name}' 삽입`);
    setDetail(null);
  };

  const insertTemplatePage = (tplDoc: VDocDocument, page: VDocPage, variant: Parameters<typeof templateDocForVariant>[2]) => {
    const sourceDoc = templateDocForVariant(tplDoc, page, variant);
    if (!sourceDoc || !doc) return false;
    const idx = doc.pages.findIndex((p) => p.pageId === activePageId);
    const label = `템플릿 '${tplDoc.title}'에서 페이지 추가 (${variant === "original" ? "원본" : "더미 데이터"})`;
    return pageMutations.importTemplatePages(undefined, sourceDoc, [page.pageId], { atIndex: idx >= 0 ? idx + 1 : undefined, label }).length > 0;
  };

  const addTemplateAsDocument = (tplDoc: VDocDocument) => {
    insertStorylineNode(null, {
      title: `[템플릿] ${tplDoc.title}`,
      summary: "에셋 라이브러리에서 추가한 문서 템플릿",
      zoomLevel: "document",
      targetDocId: tplDoc.docId,
    });
    setActiveDocId(tplDoc.docId);
    setActiveActivityTab("explorer");
  };

  const handleRegisterTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = registerName.trim();
    if (!trimmed) return;
    const selectedBlock = doc?.pages.flatMap((p) => p.blocks).find((b) => b.blockId === selectedBlockId);
    const blockKind = selectedBlock?.kind ?? "section-block";

    setLocalAssets((prev) => [
      {
        id: `local-${Date.now()}`,
        name: trimmed,
        description: selectedBlock ? `선택한 블록(${selectedBlock.kind})으로 만든 에셋` : "직접 등록한 에셋",
        folder: "local",
        blockKind,
        thumbKind: blockKind,
      },
      ...prev,
    ]);
    setRegisterName("");
    setShowRegisterForm(false);
    setView({ kind: "folder", id: "local" });
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const matches = (text: string) => text.toLowerCase().includes(normalizedQuery);

  const folderCount = (id: FolderId) => allAssets.filter((a) => a.folder === id).length;

  const visibleItems = useMemo(() => {
    if (view.kind === "template") return [];
    return allAssets.filter((item) => {
      if (view.kind === "folder" && item.folder !== view.id) return false;
      if (isSearching) return item.name.toLowerCase().includes(normalizedQuery) || item.description.toLowerCase().includes(normalizedQuery);
      return view.kind === "folder" || item.folder === "blocks";
    });
  }, [allAssets, isSearching, normalizedQuery, view]);

  const go = (next: View) => {
    setView(next);
    setDetail(null);
    setSearchQuery("");
  };

  const anchorFrom = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sidebarRight = e.currentTarget.closest("[data-testid='figma-assets-panel']")?.getBoundingClientRect().right ?? rect.right;
    return { top: Math.max(48, Math.min(window.innerHeight - 310, rect.top)), left: sidebarRight + 8 };
  };

  const dragProps = (item: AssetItem) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData(NEW_BLOCK_DRAG_MIME, item.sectionId ? `section-asset:${item.sectionId}` : item.blockKind);
    },
  });

  const renderAssetCard = (item: AssetItem) => {
    const isSelected = detail?.kind === "asset" && detail.item.id === item.id;
    const quickButton = (cls: string) => (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          quickInsert(item);
        }}
        title="현재 페이지에 바로 삽입"
        className={cls}
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    );
    const common = {
      ...dragProps(item),
      onClick: (e: React.MouseEvent<HTMLElement>) => setDetail({ kind: "asset", item, ...anchorFrom(e) }),
      onDoubleClick: () => quickInsert(item),
      title: `${item.name} — 클릭: 세부 정보 · 드래그/더블클릭: 페이지에 삽입`,
    };

    if (viewMode === "list") {
      return (
        <div
          key={item.id}
          {...common}
          className={`group flex items-center gap-2.5 p-1.5 rounded-lg cursor-grab active:cursor-grabbing transition ${
            isSelected ? "bg-[#e5f4ff] ring-1 ring-[#0d99ff]" : "hover:bg-slate-100/90"
          }`}
        >
          <div className="w-9 h-9 rounded-md bg-[#f5f5f5] border border-slate-200/80 shrink-0 overflow-hidden">{renderAssetPreview(item, 34)}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-slate-800 truncate">{item.name}</div>
            <div className="text-[10.5px] text-slate-400 truncate">{item.description}</div>
          </div>
          {quickButton("opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#0d99ff] hover:text-white text-slate-500 transition cursor-pointer shrink-0")}
        </div>
      );
    }

    return (
      <div key={item.id} {...common} className="group flex flex-col cursor-grab active:cursor-grabbing">
        <div
          className={`relative h-[132px] w-full rounded-lg bg-white p-2 border overflow-hidden transition ${
            isSelected ? "border-[#0d99ff] ring-2 ring-[#0d99ff]/25" : "border-slate-200/80 group-hover:border-slate-300"
          }`}
        >
          {renderAssetPreview(item, 114)}
          {quickButton(
            "opacity-0 group-hover:opacity-100 absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-white/95 border border-slate-200 shadow-xs flex items-center justify-center text-slate-600 hover:bg-[#0d99ff] hover:text-white hover:border-[#0d99ff] transition cursor-pointer",
          )}
        </div>
        <span className="mt-1 px-0.5 text-[11.5px] font-medium text-slate-700 truncate text-center group-hover:text-slate-950">{item.name}</span>
      </div>
    );
  };

  /** 라이브러리 한 줄 (피그마 "모든 라이브러리" 목록 모양: 썸네일 · 이름 · 개수). */
  const libraryRow = (key: string, thumb: React.ReactNode, title: string, sub: string, onOpen: () => void, badge?: string) => (
    <button
      key={key}
      type="button"
      data-testid={`library-row-${key}`}
      onClick={onOpen}
      className="w-full flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-100/90 transition text-left cursor-pointer"
    >
      <div className="w-[72px] h-[48px] rounded-md bg-[#f5f5f5] border border-slate-200/80 shrink-0 overflow-hidden">{thumb}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-slate-800 truncate">{title}</div>
        <div className="text-[10.5px] text-slate-400 truncate">
          {sub}
          {badge && <span className="ml-1 text-[#0d99ff]">· {badge}</span>}
        </div>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
    </button>
  );

  const templateThumb = (d: VDocDocument) => {
    const first = d.pages[0];
    const source = first ? pageSources.get(`${d.docId}:${first.pageId}`) : undefined;
    return source ? <AssetPreview source={source} height={48} fit="width" contentWidth={714} className="bg-white" /> : null;
  };

  const folderRow = (id: FolderId) => {
    const meta = FOLDER_META[id];
    return libraryRow(id, <AssetWireframeThumb kind={meta.thumbKind} />, meta.label, `${folderCount(id)}개의 에셋 · ${meta.subtitle}`, () =>
      go({ kind: "folder", id }),
    );
  };

  const sectionHeading = (label: string, count?: number) => (
    <div className="px-0.5 pt-1 mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-500">
      <span>{label}</span>
      {count !== undefined && <span className="font-mono text-[10px] text-slate-400">{count}</span>}
    </div>
  );

  const currentTemplate = view.kind === "template" ? docs.find((d) => d.docId === view.docId) : undefined;
  const backLabel =
    view.kind === "folder" ? FOLDER_META[view.id].label : view.kind === "template" ? (currentTemplate?.title ?? "템플릿") : "";

  const templatePages = currentTemplate
    ? currentTemplate.pages.filter((p) => !isSearching || matches(p.pageLabel))
    : [];
  const searchedTemplates = isSearching && view.kind === "home" ? templates.filter((d) => matches(d.title)) : [];

  const detailPage =
    detail?.kind === "page"
      ? (() => {
          const d = docs.find((x) => x.docId === detail.docId);
          const p = d?.pages.find((x) => x.pageId === detail.pageId);
          const source = pageSources.get(`${detail.docId}:${detail.pageId}`);
          return d && p && source ? { doc: d, page: p, source } : null;
        })()
      : null;

  return (
    <div data-testid="figma-assets-panel" className="flex-1 flex flex-col min-h-0 bg-white select-none overflow-hidden text-slate-800">
      {/* 1. 헤더: "에셋" + 등록 + 라이브러리(책 아이콘) */}
      <div className="h-10 px-3 border-b border-slate-200/90 flex items-center justify-between shrink-0">
        <span className="text-[12.5px] font-semibold text-slate-800">에셋</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setShowRegisterForm((v) => !v)}
            title="새 에셋 등록"
            className={`fig-icon-btn ${showRegisterForm ? "bg-sky-50 text-[#0d99ff]" : ""}`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            data-testid="assets-library-btn"
            onClick={() => setLibraryOpen(true)}
            title="라이브러리"
            className={`fig-icon-btn ${libraryOpen ? "bg-sky-50 text-[#0d99ff]" : ""}`}
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
            placeholder={view.kind === "home" ? "모든 라이브러리 검색" : "이 라이브러리에서 검색"}
            className="w-full pl-8 pr-6 py-1.5 text-[12px] bg-[#f3f4f6] hover:bg-slate-200/70 focus:bg-white rounded-md border border-transparent focus:border-[#0d99ff] outline-none transition-colors text-slate-800 placeholder-slate-400"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery("")} className="absolute right-1.5 p-0.5 rounded text-slate-400 hover:text-slate-700 cursor-pointer">
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
            className={`p-1 rounded cursor-pointer transition ${viewMode === "grid" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            data-testid="assets-view-list-btn"
            onClick={() => setViewMode("list")}
            title="리스트 보기"
            className={`p-1 rounded cursor-pointer transition ${viewMode === "list" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"}`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 에셋 등록 인라인 폼 */}
      {showRegisterForm && (
        <form onSubmit={handleRegisterTemplate} className="px-2.5 py-2 bg-sky-50/70 border-b border-sky-200/80 space-y-1.5 shrink-0">
          <div className="flex items-center justify-between text-[11px] font-semibold text-sky-900">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#0d99ff]" />이 파일에 에셋 등록
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
            <button type="submit" className="px-2.5 py-1 rounded bg-[#0d99ff] hover:bg-[#0b87e3] text-white text-[11px] font-semibold cursor-pointer shrink-0">
              등록
            </button>
          </div>
        </form>
      )}

      {/* 3. 본문 */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
        {view.kind !== "home" && (
          <button
            type="button"
            onClick={() => go({ kind: "home" })}
            className="w-full flex items-center gap-1.5 py-1 px-1 text-[12px] font-semibold text-slate-700 hover:text-slate-950 cursor-pointer min-w-0"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="truncate">{backLabel}</span>
          </button>
        )}

        {/* 홈: 모든 라이브러리 (이 파일 · 기본 제공 · 템플릿) */}
        {view.kind === "home" && !isSearching && (
          <>
            <div className="space-y-0.5">
              {sectionHeading("모든 라이브러리")}
              {folderRow("local")}
            </div>
            <div className="space-y-0.5 pt-2 border-t border-slate-100">
              {sectionHeading("기본 제공")}
              {folderRow("blocks")}
              {folderRow("sections")}
            </div>
            <div className="space-y-0.5 pt-2 border-t border-slate-100">
              {sectionHeading("템플릿", templates.length)}
              {templates.map((d) =>
                libraryRow(
                  `tpl-${d.docId}`,
                  templateThumb(d),
                  d.title,
                  `${d.pages.length}개의 페이지`,
                  () => go({ kind: "template", docId: d.docId }),
                  d.docId === activeDocId ? "지금 문서" : undefined,
                ),
              )}
              {templates.length === 0 && <div className="px-1 py-2 text-[11.5px] text-slate-400">추가한 템플릿이 없습니다.</div>}
              <button
                type="button"
                onClick={() => setLibraryOpen(true)}
                className="mt-1.5 w-full h-8 rounded-md border border-slate-200 text-[12px] text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                라이브러리 추가
              </button>
            </div>
            <div className="pt-2 border-t border-slate-100">{sectionHeading("기본 블록 바로 배치", visibleItems.length)}</div>
          </>
        )}

        {/* 홈에서 검색: 템플릿 이름도 함께 */}
        {searchedTemplates.length > 0 && (
          <div className="space-y-0.5">
            {sectionHeading("템플릿", searchedTemplates.length)}
            {searchedTemplates.map((d) =>
              libraryRow(`tpl-${d.docId}`, templateThumb(d), d.title, `${d.pages.length}개의 페이지`, () => go({ kind: "template", docId: d.docId })),
            )}
          </div>
        )}

        {/* 템플릿 안: 문서 전체 추가 · 페이지별 추가 */}
        {view.kind === "template" && currentTemplate && (
          <>
            <div className="flex gap-1.5">
              <button
                type="button"
                data-testid="template-add-document-btn"
                onClick={() => addTemplateAsDocument(currentTemplate)}
                className="flex-1 h-8 rounded-md bg-[#0d99ff] hover:bg-[#0b8ae6] text-white text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                문서 전체 추가
              </button>
              <button
                type="button"
                onClick={() => setActiveDocId(currentTemplate.docId)}
                title="템플릿 문서 열기"
                className="h-8 px-2.5 rounded-md border border-slate-200 text-[12px] text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                열기
              </button>
            </div>
            {sectionHeading("페이지", templatePages.length)}
            <div className={viewMode === "grid" ? "grid grid-cols-2 gap-2.5" : "space-y-1"}>
              {templatePages.map((p, i) => {
                const source = pageSources.get(`${currentTemplate.docId}:${p.pageId}`);
                const selected = detail?.kind === "page" && detail.pageId === p.pageId;
                const open = (e: React.MouseEvent<HTMLElement>) =>
                  setDetail({ kind: "page", docId: currentTemplate.docId, pageId: p.pageId, ...anchorFrom(e) });
                return viewMode === "grid" ? (
                  <button key={p.pageId} type="button" onClick={open} className="group flex flex-col text-left cursor-pointer min-w-0">
                    <div
                      className={`w-full aspect-[1/1.25] rounded-lg bg-white border overflow-hidden transition ${
                        selected ? "border-[#0d99ff] ring-2 ring-[#0d99ff]/25" : "border-slate-200/80 group-hover:border-slate-300"
                      }`}
                    >
                      {source && <AssetPreview source={source} height={200} fit="width" contentWidth={714} />}
                    </div>
                    <span className="mt-1 px-0.5 text-[11.5px] font-medium text-slate-700 truncate">
                      {i + 1}. {p.pageLabel}
                    </span>
                  </button>
                ) : (
                  <button
                    key={p.pageId}
                    type="button"
                    onClick={open}
                    className={`w-full flex items-center gap-2.5 p-1.5 rounded-lg text-left cursor-pointer ${
                      selected ? "bg-[#e5f4ff] ring-1 ring-[#0d99ff]" : "hover:bg-slate-100/90"
                    }`}
                  >
                    <div className="w-9 h-11 rounded border border-slate-200/80 bg-white overflow-hidden shrink-0">
                      {source && <AssetPreview source={source} height={44} fit="width" contentWidth={714} />}
                    </div>
                    <span className="text-[12px] font-medium text-slate-800 truncate">
                      {i + 1}. {p.pageLabel}
                    </span>
                  </button>
                );
              })}
            </div>
            {templatePages.length === 0 && <div className="py-8 text-center text-[12px] text-slate-400">일치하는 페이지가 없습니다.</div>}
          </>
        )}

        {/* 폴더 · 홈 그리드 */}
        {view.kind !== "template" &&
          (visibleItems.length === 0 ? (
            searchedTemplates.length === 0 && <div className="py-8 text-center text-[12px] text-slate-400">일치하는 에셋이 없습니다.</div>
          ) : (
            <div className={viewMode === "grid" ? "grid grid-cols-2 gap-2.5" : "space-y-1"}>{visibleItems.map(renderAssetCard)}</div>
          ))}
      </div>

      {/* 4. 세부 정보: 미리보기 → 원본 그대로 / 더미 데이터로 넣기 → 속성 */}
      {detail?.kind === "asset" && sourceById.get(detail.item.id) && (
        <AssetDetailPopover
          key={detail.item.id}
          source={sourceById.get(detail.item.id)!}
          name={detail.item.name}
          description={detail.item.description}
          libraryLabel={FOLDER_META[detail.item.folder].label}
          canInsert={Boolean(targetPageId)}
          anchor={{ top: detail.top, left: detail.left }}
          onClose={() => setDetail(null)}
          onInsert={(variant, properties) =>
            insertAssetVariant(
              sourceById.get(detail.item.id)!,
              variant,
              targetPageId,
              `에셋 '${detail.item.name}' 삽입 (${variant === "original" ? "원본" : "더미 데이터"})`,
              properties,
            )
          }
        />
      )}
      {detailPage && detail && (
        <AssetDetailPopover
          key={`${detailPage.doc.docId}:${detailPage.page.pageId}`}
          kind="page"
          source={detailPage.source}
          name={detailPage.page.pageLabel}
          description={`'${detailPage.doc.title}' 템플릿의 페이지`}
          meta={`블록 ${detailPage.page.blocks.length}개`}
          libraryLabel={detailPage.doc.title}
          insertVerb="새 페이지 추가"
          canInsert={Boolean(doc)}
          anchor={{ top: detail.top, left: detail.left }}
          onClose={() => setDetail(null)}
          onInsert={(variant) => insertTemplatePage(detailPage.doc, detailPage.page, variant)}
        />
      )}

      {libraryOpen && (
        <LibraryManagerDialog
          docs={docs}
          activeDocId={activeDocId}
          localAssetCount={folderCount("local")}
          onClose={() => setLibraryOpen(false)}
          onOpenTemplate={(docId) => {
            setLibraryOpen(false);
            go({ kind: "template", docId });
          }}
        />
      )}
    </div>
  );
};

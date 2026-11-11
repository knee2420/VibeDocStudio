import React, { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  File,
  FileCode,
  FileSpreadsheet,
  FileText,
  Filter,
  Folder,
  Globe,
  Link2Off,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type { ResourceItem } from "@vibe/vdoc-schema";
import { computeAllNodeCounts, useResourceStore } from "@/entities/resource";
import { useKnowledgeDeckStore } from "@/entities/knowledge-deck";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import {
  type NodeCountInfo,
  ResourceNodeToolbox,
} from "./ResourceNodeToolbox";
import { slotsUsingResource, useEvidenceFocusStore } from "@/features/evidence-focus";
import { useResourcePeekTrigger } from "../../model/useResourcePeek";
import { MEDIA_DRAG_MIME, resourceMediaSrc } from "@vibe/slot-canvas";

const getFileIcon = (ext: string = "", type: string = "file") => {
  if (type === "web") return <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
  const e = ext.toLowerCase();
  if (e === ".pdf") return <FileText className="w-3.5 h-3.5 text-rose-500 shrink-0" />;
  if (e === ".csv" || e === ".xlsx") return <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
  if (e === ".ts" || e === ".tsx" || e === ".js" || e === ".py" || e === ".json") {
    return <FileCode className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
  }
  return <File className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
};

const collectFolderIds = (items: ResourceItem[]): string[] => {
  const result: string[] = [];
  const traverse = (list: ResourceItem[]) => {
    for (const node of list) {
      if (node.children && node.children.length > 0) {
        result.push(node.id);
        traverse(node.children);
      }
    }
  };
  traverse(items);
  return result;
};

const collectSubFolderIds = (item: ResourceItem): string[] => {
  const ids: string[] = [];
  const traverse = (node: ResourceItem) => {
    if (node.children && node.children.length > 0) {
      ids.push(node.id);
      node.children.forEach(traverse);
    }
  };
  if (item.children) {
    item.children.forEach(traverse);
  }
  return ids;
};

const NL = String.fromCharCode(10);

const subtreeHas = (node: ResourceItem, ids: ReadonlySet<string>): boolean =>
  (node.children ?? []).some((c) => ids.has(c.id) || subtreeHas(c, ids));

interface TreeNodeProps {
  item: ResourceItem;
  projectId?: string;
  depth?: number;
  collapsedNodeIds: Set<string>;
  countMap: Map<string, NodeCountInfo>;
  onToggleExpand: (id: string) => void;
  onToggleSubtree: (node: ResourceItem) => void;
  onOpenViewer: (item: ResourceItem) => void;
  onDecouple: (item: ResourceItem) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  item,
  projectId: propProjectId,
  depth = 0,
  collapsedNodeIds,
  countMap,
  onToggleExpand,
  onToggleSubtree,
  onOpenViewer,
  onDecouple,
}) => {
  const activeProject = useProjectStore(selectActiveProject);
  const projectId = propProjectId || activeProject?.projectId || "default_project";

  const isDirectory = Boolean(item.children && item.children.length > 0);
  const isExpanded = !collapsedNodeIds.has(item.id);

  const activeResourceId = useResourceStore((s) => s.activeResourceId);
  const setActiveResource = useResourceStore((s) => s.setActiveResource);
  const toggleItemChoice = useResourceStore((s) => s.toggleItemChoice);
  const choiceOnly = useResourceStore((s) => s.choiceOnly);
  const filterKeyword = useResourceStore((s) => s.filterKeyword);

  const subFolderIds = useMemo(() => (isDirectory ? collectSubFolderIds(item) : []), [isDirectory, item]);
  const peekTrigger = useResourcePeekTrigger();

  const nodeCount = countMap.get(item.id);
  const hasSubFolders = subFolderIds.length > 0;
  const isSubtreeAnyOpen = hasSubFolders ? subFolderIds.some((id) => !collapsedNodeIds.has(id)) : false;
  const peekHandlers: Partial<ReturnType<ReturnType<typeof useResourcePeekTrigger>>> = !isDirectory ? peekTrigger(item) : {};
  const isSelected = activeResourceId === item.id;
  // 근거 초점: 지금 고른 칸이 이 자료를 쓰면 칠한다 (폴더는 안에 초점 자료가 있으면 점)
  const isFocused = useEvidenceFocusStore((s) => !isDirectory && s.focusResourceIds.has(item.id));
  const focusInside = useEvidenceFocusStore(
    (s) => isDirectory && s.focusResourceIds.size > 0 && subtreeHas(item, s.focusResourceIds)
  );

  if (choiceOnly) {
    if (isDirectory) {
      if (!nodeCount || nodeCount.checkedLeafCount === 0) return null;
    } else {
      if (!item.isChecked) return null;
    }
  }

  if (filterKeyword.trim()) {
    const kw = filterKeyword.toLowerCase();
    const matchesSelf = item.title.toLowerCase().includes(kw);
    if (!matchesSelf && !isDirectory) return null;
  }

  const handleNodeClick = () => {
    setActiveResource(item.id);
    if (isDirectory) {
      onToggleExpand(item.id);
    }
  };

  return (
    <div className="text-xs group/node">
      <div
        onClick={handleNodeClick}
        {...peekHandlers}
        draggable={!isDirectory && isImagePath(item.pathOrUrl)}
        onDragStart={(e) => {
          if (isDirectory || !isImagePath(item.pathOrUrl)) return;
          // 캔버스에 놓으면 이미지 블록 — 경로가 아니라 원장 id 로 가리킨다 (에이전트 dc_build 와 같은 resource:<id>)
          e.dataTransfer.setData(MEDIA_DRAG_MIME, JSON.stringify({ src: resourceMediaSrc(item.id), alt: item.title }));
          e.dataTransfer.setData("text/plain", item.title);
          e.dataTransfer.effectAllowed = "copy";
        }}
        data-rm-item={item.id}
        data-focused={isFocused ? "1" : undefined}
        onMouseEnter={(e) => {
          peekHandlers.onMouseEnter?.(e);
          if (!isDirectory) useEvidenceFocusStore.getState().setHighlightedSlots(slotsUsingResource(item));
        }}
        onMouseLeave={() => {
          peekHandlers.onMouseLeave?.();
          if (!isDirectory) useEvidenceFocusStore.getState().clearHighlightedSlots();
        }}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        className={`py-1 pr-2 flex items-center justify-between rounded hover:bg-slate-100 transition cursor-pointer select-none group ${
          isSelected
            ? "bg-violet-100/60 font-semibold text-violet-900"
            : isFocused
            ? "bg-amber-50 text-amber-900 ring-1 ring-amber-300"
            : "text-slate-700"
        }`}
        title={isFocused ? "지금 고른 칸의 근거 자료" : undefined}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {isDirectory ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(item.id);
              }}
              className="p-0.5 rounded hover:bg-slate-200 text-slate-500 cursor-pointer"
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <div className="w-4 shrink-0" />
          )}

          <input
            type="checkbox"
            checked={item.isChecked}
            onChange={(e) => {
              e.stopPropagation();
              void toggleItemChoice(projectId, item.id, e.target.checked);
            }}
            className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer w-3.5 h-3.5 shrink-0"
          />

          {isDirectory ? (
            <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          ) : (
            getFileIcon(item.extension, item.type)
          )}

          <span className="truncate" title={item.title}>
            {item.title}
          </span>
          {(isFocused || focusInside) && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="초점 근거" />
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          {nodeCount && (
            <span
              className={`text-[10px] font-mono px-1 rounded ${
                isDirectory
                  ? nodeCount.checkedLeafCount > 0
                    ? "bg-violet-100 text-violet-700 font-bold"
                    : "bg-slate-100 text-slate-400"
                  : item.isChecked
                  ? "text-slate-400"
                  : "text-slate-300"
              }`}
            >
              {isDirectory ? `${nodeCount.checkedLeafCount}/${nodeCount.totalLeafCount}` : "1"}
            </span>
          )}

          <ResourceNodeToolbox
            item={item}
            depth={depth}
            isDirectory={isDirectory}
            hasSubFolders={hasSubFolders}
            isSubtreeAnyOpen={isSubtreeAnyOpen}
            onToggleSubtree={() => onToggleSubtree(item)}
            onOpenViewer={() => onOpenViewer(item)}
            onDecouple={() => onDecouple(item)}
          />
        </div>
      </div>

      {isDirectory && isExpanded && item.children && (
        <div className="space-y-0.5">
          {item.children.map((child) => (
            <TreeNode
              key={child.id}
              item={child}
                depth={depth + 1}
              collapsedNodeIds={collapsedNodeIds}
              countMap={countMap}
              onToggleExpand={onToggleExpand}
              onToggleSubtree={onToggleSubtree}
              onOpenViewer={onOpenViewer}
              onDecouple={onDecouple}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg)$/i;
const isImagePath = (path?: string | null) => Boolean(path && IMAGE_EXT.test(path));

export const RmSourceTreeSection: React.FC = () => {
  const activeProject = useProjectStore(selectActiveProject);
  const projectId = activeProject?.projectId || "default_project";

  const items = useResourceStore((s) => s.items);
  const choiceOnly = useResourceStore((s) => s.choiceOnly);
  const setChoiceOnly = useResourceStore((s) => s.setChoiceOnly);
  const filterKeyword = useResourceStore((s) => s.filterKeyword);
  const setFilterKeyword = useResourceStore((s) => s.setFilterKeyword);
  const toggleAllChoice = useResourceStore((s) => s.toggleAllChoice);
  const openPreview = useResourceStore((s) => s.openPreview);
  const rescan = useResourceStore((s) => s.rescan);
  const isSyncing = useResourceStore((s) => s.isSyncing);
  const decoupleItem = useResourceStore((s) => s.decoupleItem);
  const batchDecouple = useResourceStore((s) => s.batchDecouple);

  // 지식 덱 스토어
  const promoteToDeck = useKnowledgeDeckStore((s) => s.promoteToDeck);
  const promoteEach = useKnowledgeDeckStore((s) => s.promoteEach);
  const isPromoting = useKnowledgeDeckStore((s) => s.isPromoting);

  // 아코디언 접힘/펼침 세션 스토리지 유지
  const [isExplorerOpen, setIsExplorerOpen] = useState(() => {
    try {
      const stored = sessionStorage.getItem("vdoc:rm_raw_explorer_open");
      return stored !== null ? stored === "true" : true;
    } catch {
      return true;
    }
  });

  const handleToggleExplorerSection = () => {
    setIsExplorerOpen((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem("vdoc:rm_raw_explorer_open", String(next));
      } catch {}
      return next;
    });
  };

  const handleDecouple = (item: ResourceItem) => {
    void decoupleItem(projectId, item.id);
  };

  // 폴더 접힘 상태
  const collapsedFolderIds = useResourceStore((s) => s.collapsedFolderIds);
  const toggleFolderCollapse = useResourceStore((s) => s.toggleFolderCollapse);
  const toggleSubtreeCollapse = useResourceStore((s) => s.toggleSubtreeCollapse);
  const expandAllFolders = useResourceStore((s) => s.expandAllFolders);
  const collapseAllFolders = useResourceStore((s) => s.collapseAllFolders);

  const collapsedNodeIds = useMemo(() => new Set(collapsedFolderIds), [collapsedFolderIds]);
  const countMap = useMemo(() => computeAllNodeCounts(items), [items]);

  // 체크된 leaf 노드 목록 추출
  const checkedLeafItems = useMemo(() => {
    const list: ResourceItem[] = [];
    const traverse = (node: ResourceItem) => {
      if (!node.children || node.children.length === 0) {
        if (node.isChecked) list.push(node);
        return;
      }
      node.children.forEach(traverse);
    };
    items.forEach(traverse);
    return list;
  }, [items]);

  // 전체 leaf 노드 수
  const totalLeafCount = useMemo(() => {
    let count = 0;
    const traverse = (node: ResourceItem) => {
      if (!node.children || node.children.length === 0) {
        count += 1;
        return;
      }
      node.children.forEach(traverse);
    };
    items.forEach(traverse);
    return count;
  }, [items]);

  const handleExpandAll = () => {
    expandAllFolders();
  };

  const handleCollapseAll = () => {
    collapseAllFolders(collectFolderIds(items));
  };

  const handleToggleExpand = (id: string) => {
    toggleFolderCollapse(id);
  };

  const handleToggleSubtree = (folderNode: ResourceItem) => {
    const subIds = collectSubFolderIds(folderNode);
    if (subIds.length === 0) return;
    toggleSubtreeCollapse(subIds);
  };

  // 일괄 연결 해제 실행
  const handleBatchDecouple = async () => {
    if (checkedLeafItems.length === 0) return;
    const confirmMsg = `선택된 ${checkedLeafItems.length}개 리소스 연결을 해제(Decouple)하시겠습니까?
(로컬 원본 파일은 삭제되지 않고 안전하게 보존됩니다)`;
    if (window.confirm(confirmMsg)) {
      const ids = checkedLeafItems.map((it) => it.id);
      await batchDecouple(projectId, ids);
    }
  };

  // 지식 덱으로 승격 — 고른 원본마다 덱 하나씩 서버 색인 대기열에 올린다 (서버가 차례로 돌린다)
  const handlePromoteToDeck = async () => {
    const targets = checkedLeafItems.filter((it) => it.pathOrUrl);
    if (targets.length === 0) return;
    const baseTitle = (it: (typeof targets)[number]) => `${it.title.replace(/\.[^/.]+$/, "")} 지식 덱`;

    if (targets.length === 1) {
      const title = window.prompt("생성할 Knowledge Deck의 이름을 입력하세요:", baseTitle(targets[0]));
      if (!title || !title.trim()) return;
      await promoteToDeck(projectId, { title: title.trim(), itemIds: [targets[0].id], sourcePaths: [targets[0].pathOrUrl!], depth: "enriched" });
      return;
    }

    const ok = window.confirm(
      [`선택한 원본 ${targets.length}개를 각각 지식 덱으로 만듭니다 (덱 ${targets.length}개).`, "", ...targets.map((it) => `· ${it.title}`), "", "색인 대기열에 순서대로 올라가 차례로 처리됩니다."].join(NL)
    );
    if (!ok) return;
    await promoteEach(
      projectId,
      targets.map((it) => ({ title: baseTitle(it), itemIds: [it.id], sourcePaths: [it.pathOrUrl!], depth: "enriched" as const }))
    );
  };

  const allChecked = totalLeafCount > 0 && checkedLeafItems.length === totalLeafCount;
  const hasSelection = checkedLeafItems.length > 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* 1. Raw Resource Explorer 아코디언 마스터 헤더 */}
      <div
        onClick={handleToggleExplorerSection}
        className="px-3 py-2 bg-slate-100/70 hover:bg-slate-200/60 border-b border-slate-200 flex items-center justify-between cursor-pointer transition select-none"
      >
        <div className="flex items-center gap-1.5">
          {isExplorerOpen ? (
            <ChevronDown className="w-4 h-4 text-slate-700" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-700" />
          )}
          <Folder className="w-3.5 h-3.5 text-amber-500 fill-amber-100" />
          <span className="text-xs font-bold text-slate-800 tracking-tight">
            Raw Resource Explorer (원본 탐색기)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700">
            {checkedLeafItems.length}/{totalLeafCount}
          </span>
        </div>
      </div>

      {/* 2. 섹션 본체 (열려있을 때만 렌더) */}
      {isExplorerOpen && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* 전용 도구 모음바 (컨텍스트 모핑 적용) */}
          <div className="px-3 py-1.5 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0 bg-slate-50/50">
            {/* 좌측 영역: 선택 상태에 따른 모핑 */}
            {!hasSelection ? (
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => void toggleAllChoice(projectId, e.target.checked)}
                  className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer w-3.5 h-3.5"
                />
                <span>모두 선택</span>
              </label>
            ) : (
              <div className="flex items-center gap-1.5">
                <label className="flex items-center gap-1 text-xs font-bold text-violet-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => void toggleAllChoice(projectId, e.target.checked)}
                    className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer w-3.5 h-3.5"
                  />
                  <span>{checkedLeafItems.length}개</span>
                </label>

                <button
                  type="button"
                  onClick={() => void toggleAllChoice(projectId, false)}
                  className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
                  title="선택 초기화"
                >
                  <X className="w-3 h-3" />
                </button>

                <div className="w-[1px] h-3 bg-slate-200 mx-0.5" />

                {/* ⚡ 지식 덱으로 승격 버튼 */}
                <button
                  type="button"
                  onClick={handlePromoteToDeck}
                  disabled={isPromoting}
                  className="px-2 py-0.5 rounded text-[11px] font-bold bg-violet-600 hover:bg-violet-700 text-white transition flex items-center gap-1 cursor-pointer shadow-2xs disabled:opacity-50"
                  title="선택한 파일마다 지식 덱을 하나씩 만들어 색인 대기열에 올립니다 (서버가 차례로 처리)"
                >
                  <Sparkles className="w-3 h-3 text-amber-300 fill-amber-300" />
                  <span>지식 덱 승격</span>
                </button>

                {/* 🔗 일괄 연결 해제 버튼 */}
                <button
                  type="button"
                  onClick={handleBatchDecouple}
                  className="px-1.5 py-0.5 rounded text-[11px] font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition flex items-center gap-1 cursor-pointer"
                  title="선택된 항목들의 세션 연결을 일괄 해제 (로컬 원본 보존)"
                >
                  <Link2Off className="w-3 h-3 text-rose-500" />
                  <span>일괄 해제</span>
                </button>
              </div>
            )}

            {/* 우측 공통 컨트롤: 동기화, 접기/펼치기, 필터 */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void rescan(projectId)}
                disabled={isSyncing}
                className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 transition cursor-pointer disabled:opacity-50 flex items-center justify-center"
                title="로컬 원본 동기화 (최신 파일 스캔 및 사라진 파일 정리)"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-violet-600" : ""}`} />
              </button>

              <button
                type="button"
                onClick={handleExpandAll}
                className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 transition cursor-pointer"
                title="모든 폴더 펼치기"
              >
                <ChevronsUpDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleCollapseAll}
                className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 transition cursor-pointer"
                title="모든 폴더 접기"
              >
                <ChevronsDownUp className="w-3.5 h-3.5" />
              </button>

              <div className="w-[1px] h-3.5 bg-slate-200 mx-0.5" />

              <button
                type="button"
                onClick={() => setChoiceOnly(!choiceOnly)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition border ${
                  choiceOnly
                    ? "bg-violet-100 border-violet-300 text-violet-900"
                    : "bg-white border-slate-200 text-slate-600 hover:text-slate-900"
                }`}
                title="Choice(체크)된 소스만 모아보기"
              >
                <Filter className="w-3 h-3" />
                <span>선택된 것만</span>
              </button>
            </div>
          </div>

          {/* 검색 입력창 */}
          <div className="px-3 py-1.5 border-b border-slate-100 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              placeholder="소스 검색..."
              className="w-full text-xs bg-transparent focus:outline-none placeholder:text-slate-400"
            />
            {filterKeyword && (
              <button
                type="button"
                onClick={() => setFilterKeyword("")}
                className="text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                초기화
              </button>
            )}
          </div>

          {/* 트리 목록 */}
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {items.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs leading-relaxed">
                <p className="font-semibold">등록된 리소스가 없습니다.</p>
                <p className="text-[11px] mt-1 text-slate-400">
                  상단의 [폴더 덤핑] 버튼을 눌러
                  <br />
                  자료 디렉토리를 통째로 추가해보세요.
                </p>
              </div>
            ) : (
              items.map((item) => (
                <TreeNode
                  key={item.id}
                  item={item}
                        depth={0}
                  collapsedNodeIds={collapsedNodeIds}
                  countMap={countMap}
                  onToggleExpand={handleToggleExpand}
                  onToggleSubtree={handleToggleSubtree}
                  onOpenViewer={openPreview}
                  onDecouple={handleDecouple}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

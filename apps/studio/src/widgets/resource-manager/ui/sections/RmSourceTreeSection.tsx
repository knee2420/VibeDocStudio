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
  Search,
} from "lucide-react";
import type { ResourceItem } from "@vibe/vdoc-schema";
import { useResourceStore } from "@/entities/resource";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import {
  type NodeCountInfo,
  ResourceNodeToolbox,
} from "./ResourceNodeToolbox";
import { useResourcePeekTrigger } from "../../model/useResourcePeek";

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

const collectSubFolderIds = (node: ResourceItem): string[] => {
  const ids: string[] = [];
  const traverse = (n: ResourceItem) => {
    if (n.children && n.children.length > 0) {
      ids.push(n.id);
      n.children.forEach(traverse);
    }
  };
  if (node.children) {
    node.children.forEach(traverse);
  }
  return ids;
};

const computeAllNodeCounts = (items: ResourceItem[]): Map<string, NodeCountInfo> => {
  const map = new Map<string, NodeCountInfo>();
  const traverse = (node: ResourceItem): NodeCountInfo => {
    if (!node.children || node.children.length === 0) {
      const info: NodeCountInfo = {
        totalLeafCount: 1,
        checkedLeafCount: node.isChecked ? 1 : 0,
      };
      map.set(node.id, info);
      return info;
    }

    let total = 0;
    let checked = 0;
    for (const child of node.children) {
      const cInfo = traverse(child);
      total += cInfo.totalLeafCount;
      checked += cInfo.checkedLeafCount;
    }
    const info: NodeCountInfo = { totalLeafCount: total, checkedLeafCount: checked };
    map.set(node.id, info);
    return info;
  };

  for (const item of items) {
    traverse(item);
  }
  return map;
};

interface TreeNodeProps {
  item: ResourceItem;
  projectId: string;
  depth?: number;
  collapsedNodeIds: Set<string>;
  countMap: Map<string, NodeCountInfo>;
  onToggleExpand: (id: string) => void;
  onToggleSubtree: (node: ResourceItem) => void;
  onOpenViewer: (item: ResourceItem) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  item,
  projectId,
  depth = 0,
  collapsedNodeIds,
  countMap,
  onToggleExpand,
  onToggleSubtree,
  onOpenViewer,
}) => {
  // 1. 모든 React Hook 호출 (React Rules of Hooks: 어떤 조건문/early return 보다도 항상 위에 위치)
  const isDirectory = Boolean(item.children && item.children.length > 0);
  const isExpanded = !collapsedNodeIds.has(item.id);

  const activeResourceId = useResourceStore((s) => s.activeResourceId);
  const setActiveResource = useResourceStore((s) => s.setActiveResource);
  const toggleItemChoice = useResourceStore((s) => s.toggleItemChoice);
  const choiceOnly = useResourceStore((s) => s.choiceOnly);
  const filterKeyword = useResourceStore((s) => s.filterKeyword);

  const subFolderIds = useMemo(() => (isDirectory ? collectSubFolderIds(item) : []), [isDirectory, item]);
  const peekTrigger = useResourcePeekTrigger();

  // 2. 파생 상태 및 헬퍼 계산
  const nodeCount = countMap.get(item.id);
  const hasSubFolders = subFolderIds.length > 0;
  const isSubtreeAnyOpen = hasSubFolders ? subFolderIds.some((id) => !collapsedNodeIds.has(id)) : false;
  const peekHandlers = !isDirectory ? peekTrigger(item) : {};
  const isSelected = activeResourceId === item.id;

  // 3. ChoiceOnly / 검색어 필터링 (모든 Hook 호출이 완료된 후 early return)
  if (choiceOnly) {
    if (isDirectory) {
      if (!nodeCount || nodeCount.checkedLeafCount === 0) return null;
    } else if (!item.isChecked) {
      return null;
    }
  }

  if (filterKeyword && !item.title.toLowerCase().includes(filterKeyword.toLowerCase()) && !isDirectory) {
    return null;
  }

  return (
    <div className="select-none text-xs">
      <div
        className={`flex items-center gap-1.5 py-1 px-1.5 rounded-md hover:bg-slate-100 transition cursor-pointer group ${
          isSelected ? "bg-violet-100/70 font-semibold text-violet-950" : "text-slate-700"
        }`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        title={!isDirectory ? `${item.title} (Ctrl + 호버 시 퀵 미리보기)` : item.title}
        {...peekHandlers}
        onClick={() => {
          if (isDirectory) onToggleExpand(item.id);
          else {
            setActiveResource(item.id);
            onOpenViewer(item);
          }
        }}
      >
        {/* 폴더 접기/펼치기 화살표 */}
        {isDirectory ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(item.id);
            }}
            className="p-0.5 hover:bg-slate-200 rounded text-slate-500 cursor-pointer"
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-3.5" />
        )}

        {/* Choice / Not Choice 체크박스 (NotebookLM 핵심) */}
        <input
          type="checkbox"
          checked={item.isChecked}
          onChange={(e) => {
            e.stopPropagation();
            void toggleItemChoice(projectId, item.id, e.target.checked);
          }}
          className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer w-3.5 h-3.5"
          title={item.isChecked ? "AI 컨텍스트 및 참조 활성화 (Choice)" : "참조 비활성화 (Not Choice)"}
        />

        {/* 아이콘 */}
        {isDirectory ? (
          <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0 fill-amber-100" />
        ) : (
          getFileIcon(item.extension, item.type)
        )}

        {/* 파일명 / 폴더명 */}
        <span className="truncate flex-1" title={item.title}>
          {item.title}
        </span>

        {/* 우측 확장형 도구 박스: 1) 기본/선택 개수 2) Heptabase View 아이콘 3) 하위 접기/펼치기 */}
        <ResourceNodeToolbox
          item={item}
          isDirectory={isDirectory}
          countInfo={countMap.get(item.id)}
          hasSubFolders={hasSubFolders}
          isSubtreeAnyOpen={isSubtreeAnyOpen}
          onToggleSubtree={() => onToggleSubtree(item)}
          onOpenViewer={onOpenViewer}
        />
      </div>

      {/* 하위 자식 노드 재귀 */}
      {isDirectory && isExpanded && item.children && (
        <div className="flex flex-col">
          {item.children.map((child) => (
            <TreeNode
              key={child.id}
              item={child}
              projectId={projectId}
              depth={depth + 1}
              collapsedNodeIds={collapsedNodeIds}
              countMap={countMap}
              onToggleExpand={onToggleExpand}
              onToggleSubtree={onToggleSubtree}
              onOpenViewer={onOpenViewer}
            />
          ))}
        </div>
      )}
    </div>
  );
};

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

  // 폴더 접힘 상태 관리 (기본적으로 모두 펼침)
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set());

  // 모든 노드의 카운트 정보(선택수 / 전체수) 사전 계산
  const countMap = useMemo(() => computeAllNodeCounts(items), [items]);

  const handleToggleExpand = (id: string) => {
    setCollapsedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSubtree = (folderNode: ResourceItem) => {
    const subIds = collectSubFolderIds(folderNode);
    if (subIds.length === 0) return;

    setCollapsedNodeIds((prev) => {
      const next = new Set(prev);
      const isAnyOpen = subIds.some((id) => !next.has(id));
      if (isAnyOpen) {
        subIds.forEach((id) => next.add(id));
      } else {
        subIds.forEach((id) => next.delete(id));
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setCollapsedNodeIds(new Set());
  };

  const handleCollapseAll = () => {
    setCollapsedNodeIds(new Set(collectFolderIds(items)));
  };

  const allChecked = items.length > 0 && items.every((it) => it.isChecked);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* 상단 컨트롤러: 모두 선택 & 접기/펼치기 & 검색 필터 */}
      <div className="px-3 py-1.5 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0 bg-slate-50/50">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => void toggleAllChoice(projectId, e.target.checked)}
            className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer w-3.5 h-3.5"
          />
          <span>모두 선택</span>
        </label>

        {/* 전체 펼치기 / 전체 접기 및 선택 필터 */}
        <div className="flex items-center gap-1">
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
              projectId={projectId}
              collapsedNodeIds={collapsedNodeIds}
              countMap={countMap}
              onToggleExpand={handleToggleExpand}
              onToggleSubtree={handleToggleSubtree}
              onOpenViewer={openPreview}
            />
          ))
        )}
      </div>
    </div>
  );
};


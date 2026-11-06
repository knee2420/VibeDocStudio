import React from "react";
import { ChevronsDownUp, ChevronsUpDown, Eye, Link2Off } from "lucide-react";
import type { ResourceItem } from "@vibe/vdoc-schema";

export interface NodeCountInfo {
  totalLeafCount: number;
  checkedLeafCount: number;
}

export interface ResourceNodeToolboxProps {
  item: ResourceItem;
  isDirectory: boolean;
  depth?: number;
  countInfo?: NodeCountInfo;
  hasSubFolders?: boolean;
  isSubtreeAnyOpen?: boolean;
  onToggleSubtree?: () => void;
  onOpenViewer?: (item: ResourceItem) => void;
  onDecouple?: (item: ResourceItem) => void;
  /** 향후 필요한 기능(추가 액션, 플러그인, 컨텍스트 메뉴 등)을 유연하게 주입할 수 있는 확장 슬롯 */
  extraActions?: React.ReactNode;
}

const VIEWABLE_EXTENSIONS = new Set([
  ".pdf",
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg",
  ".md", ".markdown", ".txt", ".json", ".csv",
  ".ts", ".tsx", ".js", ".jsx", ".py", ".html", ".css",
]);

export const isResourceViewable = (item: ResourceItem): boolean => {
  if (item.type === "web") return true;
  const ext = (item.extension || "").toLowerCase();
  return VIEWABLE_EXTENSIONS.has(ext);
};

/**
 * 리소스 트리 노드 우측에 위치하는 확장형 도구 박스(Toolbox) 컨테이너.
 *
 * 1) 기본 갯수 / 선택된 갯수 인디케이터 배지
 * 2) 하위 트리 일괄 접기 / 펼치기 컨트롤
 * 3) 차후 추가될 커스텀 액션을 위한 모듈형 슬롯
 */
export const ResourceNodeToolbox: React.FC<ResourceNodeToolboxProps> = ({
  item,
  isDirectory,
  depth,
  countInfo,
  hasSubFolders = false,
  isSubtreeAnyOpen = true,
  onToggleSubtree,
  onOpenViewer,
  onDecouple,
  extraActions,
}) => {
  const isViewable = !isDirectory && isResourceViewable(item);
  const canDecouple = depth === undefined || depth === 0 || !isDirectory;

  const handleDecoupleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const isRoot = isDirectory;
    const msg = isRoot
      ? `[${item.title}] 루트 폴더를 프로젝트 리소스에서 연결 해제하시겠습니까?\n\n※ 로컬 디스크의 원본 파일은 전혀 삭제되지 않고 안전하게 유지됩니다.`
      : `[${item.title}] 리소스를 프로젝트에서 연결 해제하시겠습니까?\n\n※ 로컬 원본 파일은 삭제되지 않습니다.`;
    if (window.confirm(msg)) {
      onDecouple?.(item);
    }
  };

  return (
    <div
      data-testid="resource-node-toolbox"
      className="ml-auto flex items-center justify-end gap-1 shrink-0 select-none"
    >
      {/* 1. 액션 버튼 그룹 (호버 시 노출되며, 뱃지 왼쪽에 위치하여 뱃지의 우측 정렬선을 흔들지 않음) */}
      <div className="flex items-center gap-0.5">
        {/* 파일 노드: 지원되는 문서 확장자인 경우 Heptabase 스타일 View 아이콘 */}
        {isViewable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenViewer?.(item);
            }}
            className="p-0.5 rounded text-slate-400 hover:text-violet-700 hover:bg-violet-100 hidden group-hover:flex items-center justify-center transition-all cursor-pointer"
            title="문서 미리보기 (오른쪽 패널 열기)"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        )}

        {/* 연결 해제 (Decouple / Unlink) 버튼: 로컬 원본을 삭제하지 않고 프로젝트 세션에서만 분리 */}
        {onDecouple && canDecouple && (
          <button
            type="button"
            onClick={handleDecoupleClick}
            className="p-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 hidden group-hover:flex items-center justify-center transition-all cursor-pointer"
            title={isDirectory ? "루트 폴더 연결 해제 (로컬 원본 파일 보존)" : "리소스 연결 해제 (로컬 원본 보존)"}
          >
            <Link2Off className="w-3.5 h-3.5" />
          </button>
        )}

        {/* 하위 폴더 일괄 접기 / 펼치기 버튼 */}
        {isDirectory && hasSubFolders && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSubtree?.();
            }}
            className="p-0.5 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-200/80 hidden group-hover:flex items-center justify-center transition-opacity cursor-pointer"
            title={isSubtreeAnyOpen ? "하위 모든 폴더 접기" : "하위 모든 폴더 펼치기"}
          >
            {isSubtreeAnyOpen ? (
              <ChevronsDownUp className="w-3 h-3" />
            ) : (
              <ChevronsUpDown className="w-3 h-3" />
            )}
          </button>
        )}

        {/* 향후 추가 툴/액션을 위한 확장 슬롯 */}
        {extraActions && (
          <div className="hidden group-hover:flex items-center gap-0.5">
            {extraActions}
          </div>
        )}
      </div>

      {/* 2. 맨 우측 고정 뱃지: 폴더 카운트 / 파일 섹터 (우측 끝선 칼정렬) */}
      {isDirectory && countInfo && (
        <span
          className={`text-[10px] font-mono px-1.5 py-0.2 rounded border text-right transition-colors ${
            countInfo.checkedLeafCount > 0
              ? "bg-violet-50 text-violet-700 border-violet-200 font-bold"
              : "bg-slate-50 text-slate-400 border-slate-200/70"
          }`}
          title={`선택된 소스: ${countInfo.checkedLeafCount}개 / 하위 전체 소스: ${countInfo.totalLeafCount}개`}
        >
          {countInfo.checkedLeafCount}/{countInfo.totalLeafCount}
        </span>
      )}

      {/* 파일 노드의 경우: 추출된 섹터 뱃지 */}
      {!isDirectory && item.sectors && item.sectors.length > 0 && (
        <span
          className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 text-right"
          title={`추출된 섹터: ${item.sectors.length}개`}
        >
          {item.sectors.length}
        </span>
      )}
    </div>
  );
};

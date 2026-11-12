import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock,
  Component,
  Copy,
  Eye,
  EyeOff,
  FilePlus2,
  FolderTree,
  Hash,
  LayoutGrid,
  Loader2,
  Lock,
  Pencil,
  Table,
  Trash2,
  Type,
  Unlock,
} from "lucide-react";

import { documentSurface, type OutlinerNode, type WorkbenchPhase } from "@vibe/vdoc-schema";

import { usePdfScaffoldJobStore } from "@/entities/scaffold-job";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { attachable, outlineNodeRef, withPicked } from "@/features/ai-workspace";
import { areSlotsLocked } from "@/features/layer-visibility";
import { isDocumentTargetNode, isEditableOutlineNode, isPageTargetNode } from "@/features/edit-outline";
import { DocumentSurfaceIcon, type DocumentSurfaceKind } from "@/shared/ui";

import { outlineNodeTargetId, type RowSelection } from "../model/outlineSections";
import type { RowHidden } from "../model/useLayerFlags";
import type { OutlineRowActions } from "../model/useOutlineRowActions";
import { ADD_PAGE_TRIGGER_ATTR } from "./AddPageFlow";

/** 피그마 레이어 들여쓰기 (한 단계 24px, 6단계까지). */
const INDENT_PX = 24;
const MAX_INDENT_LEVELS = 6;
const ICON = "w-3 h-3";

const includesAny = (text: string, words: readonly string[]) => words.some((w) => text.includes(w));
const SECTION_WORDS = ["섹션", "구역", "그리드"] as const;
const TABLE_WORDS = ["표", "테이블", "매트릭스"] as const;
const COMPONENT_WORDS = ["컴포넌트", "템플릿"] as const;

type RowKind = "component" | "static" | undefined;

function rowKind(node: OutlinerNode): RowKind {
  if (node.zoomLevel === "slot" && includesAny(node.title.toLowerCase(), COMPONENT_WORDS)) return "component";
  if (node.isStatic) return "static";
  return undefined;
}

/** 피그마 레이어 아이콘: Frame(#) · Section · Table · Component · Text. 페이지 행은 아이콘이 없다. */
function nodeIcon(node: OutlinerNode, docSurface: DocumentSurfaceKind): React.ReactNode {
  if (node.zoomLevel === "project") return <FolderTree className={ICON} />;
  if (node.zoomLevel === "document") {
    return <DocumentSurfaceIcon surface={docSurface} className={`${ICON} ${docSurface === "scroll" ? "text-emerald-500" : "text-[#0d99ff]"}`} />;
  }
  const title = node.title.toLowerCase();
  if (node.zoomLevel === "page") {
    if (!node.targetBlockId) return null;
    if (includesAny(title, SECTION_WORDS)) return <LayoutGrid className={ICON} />;
    if (includesAny(title, TABLE_WORDS)) return <Table className={ICON} />;
    return <Hash className={ICON} />;
  }
  if (title.includes("표")) return <Table className={ICON} />;
  if (rowKind(node) === "component") return <Component className={ICON} />;
  return <Type className={ICON} />;
}

export interface OutlineNodeRowProps {
  node: OutlinerNode;
  actions: OutlineRowActions;
  phase: WorkbenchPhase;
  /** 선택 표시 (`on` 선택 · `child` 선택된 노드의 자손). */
  sel?: RowSelection;
  /** Documents & Pages 의 현재 페이지 (피그마 페이지 목록처럼 회색 바탕 + 굵게). */
  isCurrent?: boolean;
  /** 활성 문서 행 (굵게만). */
  isStrong?: boolean;
  hasChildren: boolean;
  /** `node.targetDocId` 가 없을 때 쓰는 문서 (활성 문서). */
  fallbackDocId: string;
  /** 계층 절단 시 상위 레벨을 건너뛰는 들여쓰기 오프셋. */
  depthOffset?: number;
  /** 현재 인라인 이름 편집 중일 때 초기 입력값 (undefined 면 일반 표시). */
  renamingInitialTitle?: string;
  /** 자물쇠가 잠그고 푸는 슬롯 (이 행 아래 전부). 비어 있으면 자물쇠를 보이지 않는다. */
  lockSlotIds?: readonly string[];
  /** 눈 아이콘 상태. */
  hidden?: RowHidden;
}

/**
 * 메모된 아웃라인 한 줄 (피그마 UI3 레이어 행 — 스타일은 `styles.css` 의 `.fig-row`).
 *
 * 선택 표시는 구역이 한 번에 계산해 `sel` 로 넘긴다. 접힘 · PDF 변환 상태 · 페이지 수 · 지면 서식 ·
 * AI 칩 강조는 줄이 직접 구독한다 (값이 바뀐 줄만 다시 그린다). `node` 는 투영이 구조 공유로 유지한다.
 */
export const OutlineNodeRow = React.memo<OutlineNodeRowProps>(function OutlineNodeRow({
  node,
  actions,
  phase,
  sel,
  isCurrent = false,
  isStrong = false,
  hasChildren,
  fallbackDocId,
  depthOffset = 0,
  renamingInitialTitle,
  lockSlotIds,
  hidden,
}) {
  const docId = node.targetDocId || fallbackDocId;
  const isPageRow = isPageTargetNode(node);
  const isDocRow = isDocumentTargetNode(node);
  const targetId = outlineNodeTargetId(node);

  // AI 칩 호버는 정확히 그 대상을 가리키는 행만 (사이드바 자체 호버는 CSS :hover 가 맡는다).
  const isHighlighted = useWorkspaceSessionStore((s) => s.highlightedEntityId !== null && (s.highlightedEntityId === targetId || s.highlightedEntityId === node.nodeId));
  const isCollapsed = useWorkspaceSessionStore((s) => hasChildren && s.collapsedNodeIds.includes(node.nodeId));
  const pendingState = usePdfScaffoldJobStore((s) => (isPageRow && node.targetPageId ? (s.pageStatesByPageId[node.targetPageId] ?? null) : null));
  const pageCount = useStudioDocumentStore((s) => (isPageRow ? (s.docs.find((d) => d.docId === docId)?.pages.length ?? 0) : 0));
  const isLocked = useStudioDocumentStore((s) => (lockSlotIds?.length ? areSlotsLocked(s.docs.find((d) => d.docId === docId)?.slots ?? {}, lockSlotIds) : false));
  const docSurface = useStudioDocumentStore((s): DocumentSurfaceKind =>
    node.zoomLevel === "document" ? documentSurface(s.docs.find((d) => d.docId === node.targetDocId)).kind : "paged"
  );

  const bound = useMemo(
    () => ({
      attachProps: attachable(() => withPicked("outline", outlineNodeRef(node))),
      peekHandlers: actions.peek(node),
    }),
    [node, actions]
  );

  const isRenaming = renamingInitialTitle !== undefined;
  const [draft, setDraft] = useState(renamingInitialTitle ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingInitialTitle === undefined) return;
    setDraft(renamingInitialTitle);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [renamingInitialTitle]);

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  const commitIfNeeded = () => {
    if (!isRenaming) return;
    const trimmed = draft.trim();
    if (trimmed && trimmed !== renamingInitialTitle) actions.commitRename(node, trimmed);
    else actions.cancelRename();
  };

  const editable = isEditableOutlineNode(node, phase);
  const canRename = isPageRow || editable;
  const canManageDocument = isDocRow && node.nodeId.startsWith("auto-doc-");
  const isBusyPending = pendingState?.status === "queued" || pendingState?.status === "running";
  const canDeletePage = pageCount > 1 && !isBusyPending;
  const isPageOrDoc = node.zoomLevel === "project" || node.zoomLevel === "document" || (node.zoomLevel === "page" && !node.targetBlockId);
  const level = Math.min(Math.max(0, node.depth - depthOffset), MAX_INDENT_LEVELS);
  const { peekHandlers } = bound;

  const statusIcon =
    pendingState?.status === "running" ? (
      <Loader2 data-testid={`outline-page-spinner-${node.nodeId}`} className={`${ICON} text-[#0d99ff] animate-spin`} />
    ) : pendingState?.status === "queued" ? (
      <Clock data-testid={`outline-page-queued-${node.nodeId}`} className={ICON} />
    ) : pendingState?.status === "failed" || pendingState?.status === "cancelled" ? (
      <AlertTriangle data-testid={`outline-page-failed-${node.nodeId}`} className={`${ICON} text-[#f24822]`} />
    ) : null;
  const icon = statusIcon ?? nodeIcon(node, docSurface);

  return (
    <div
      role="treeitem"
      tabIndex={0}
      aria-selected={sel === "on" || isCurrent}
      aria-expanded={hasChildren ? !isCollapsed : undefined}
      data-testid={`outline-node-row-${node.nodeId}`}
      data-node-id={node.nodeId}
      data-sel={sel}
      data-current={isCurrent || undefined}
      data-strong={isStrong || undefined}
      data-kind={rowKind(node)}
      data-hl={isHighlighted || undefined}
      data-hidden={hidden}
      data-locked={isLocked || undefined}
      {...(isRenaming ? {} : bound.attachProps)}
      style={{ paddingLeft: 4 + level * INDENT_PX }}
      className="fig-row"
      onClick={(e) => actions.select(e, node)}
      onDoubleClick={(e) => {
        if (!canRename || isRenaming) return;
        e.stopPropagation();
        actions.startRename(node);
      }}
      onKeyDown={(e) => actions.keyDown(e, node)}
      onMouseEnter={(e) => {
        actions.hover(node, true);
        peekHandlers.onMouseEnter?.(e);
      }}
      onMouseMove={peekHandlers.onMouseMove}
      onMouseLeave={(e) => {
        actions.hover(node, false);
        peekHandlers.onMouseLeave?.(e);
      }}
    >
      {hasChildren ? (
        <button
          type="button"
          data-testid={`fold-toggle-${node.nodeId}`}
          onClick={stop(() => actions.toggleCollapse(node))}
          title={isCollapsed ? "펼치기" : "접기"}
          className="fig-row-chevron"
        >
          {isCollapsed ? <ChevronRight className="w-3 h-3" strokeWidth={1.75} /> : <ChevronDown className="w-3 h-3" strokeWidth={1.75} />}
        </button>
      ) : (
        <span className="fig-row-chevron" aria-hidden />
      )}

      {/* 페이지 행은 피그마처럼 아이콘 없이, 자리만 비워 문서 제목보다 한 단계(24px) 들어가게 맞춘다. */}
      {(icon || isPageOrDoc) && <span className="fig-row-icon">{icon}</span>}

      {isRenaming ? (
        <input
          ref={inputRef}
          type="text"
          data-testid={`rename-outline-input-${node.nodeId}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={commitIfNeeded}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              commitIfNeeded();
            } else if (e.key === "Escape") {
              e.preventDefault();
              actions.cancelRename();
            }
          }}
          className="flex-1 min-w-0 h-6 px-1.5 -ml-1.5 rounded-[3px] bg-white border border-[#0d99ff] text-[11px] font-normal text-black/90 outline-none"
        />
      ) : (
        <span
          data-testid={`outline-node-title-${node.nodeId}`}
          title={`${node.title}${
            node.zoomLevel === "document" ? `\n서식: ${docSurface === "scroll" ? "블로그 글 (스크롤)" : "A4 페이지 문서"}` : ""
          }${node.summary ? `\n\n${node.summary}` : ""}${
            node.nameNeedsReview ? "\n\n⚠ 이름 확인 필요 (라벨을 찾지 못해 위치로 지은 이름)" : ""
          }${canRename ? "\n\n더블클릭 또는 F2: 이름 변경" : ""}`}
          className="fig-row-label"
        >
          {node.title}
        </span>
      )}

      {!isRenaming && (
        <>
          {node.nameNeedsReview && (
            <span data-testid={`outline-node-review-${node.nodeId}`} title="이름 확인 필요" className="ml-1 text-[11px] text-amber-500 shrink-0">
              ⚠
            </span>
          )}
          {pendingState?.status === "running" && <span className="fig-badge">{pendingState.iter ? `${pendingState.iter}회 검증` : "변환 중"}</span>}
          {pendingState?.status === "queued" && <span className="fig-badge">대기</span>}
          {(pendingState?.status === "failed" || pendingState?.status === "cancelled") && (
            <span className="fig-badge text-[#f24822]">{pendingState.status === "cancelled" ? "중단" : "실패"}</span>
          )}
          {node.provenanceSourceProjectId && (
            <span title={`참조 출처: ${node.provenanceSourceProjectId}`} className="fig-badge">
              참조
            </span>
          )}

          <div className="fig-row-actions">
            {!isPageOrDoc && (
              <button type="button" data-testid={`zoom-bullet-${node.nodeId}`} onClick={stop(() => actions.zoomIn(node))} title="이 엘리먼트 안으로 Zoom-In" className="fig-icon-btn">
                <CircleDot className={ICON} />
              </button>
            )}

            {isDocRow && (
              <button
                type="button"
                {...ADD_PAGE_TRIGGER_ATTR}
                data-testid={`add-page-menu-btn-${node.nodeId}`}
                onClick={(e) => {
                  e.stopPropagation();
                  actions.openAddPageMenu(node, e.currentTarget);
                }}
                title="페이지 추가 (기본 페이지 · PDF · 템플릿)"
                className="fig-icon-btn"
              >
                <FilePlus2 className={ICON} />
              </button>
            )}

            {canManageDocument && (
              <>
                <button type="button" data-testid={`rename-doc-btn-${node.nodeId}`} onClick={stop(() => actions.startRename(node))} title="문서 이름 바꾸기 (F2 / 더블클릭)" className="fig-icon-btn">
                  <Pencil className={ICON} />
                </button>
                <button type="button" data-testid={`duplicate-doc-btn-${node.nodeId}`} onClick={stop(() => actions.duplicateDocument(node))} title="문서 복제" className="fig-icon-btn">
                  <Copy className={ICON} />
                </button>
                <button type="button" data-testid={`delete-doc-btn-${node.nodeId}`} onClick={stop(() => actions.deleteDocument(node))} title="문서 삭제" className="fig-icon-btn fig-danger">
                  <Trash2 className={ICON} />
                </button>
              </>
            )}

            {isPageRow && (
              <>
                <button type="button" data-testid={`rename-page-btn-${node.nodeId}`} onClick={stop(() => actions.startRename(node))} title="페이지 이름 변경 (F2 / 더블클릭)" className="fig-icon-btn">
                  <Pencil className={ICON} />
                </button>
                {!pendingState && (
                  <button type="button" data-testid={`duplicate-page-btn-${node.nodeId}`} onClick={stop(() => actions.duplicatePage(node))} title="페이지 사본 만들기" className="fig-icon-btn">
                    <Copy className={ICON} />
                  </button>
                )}
                <button
                  type="button"
                  data-testid={`delete-page-btn-${node.nodeId}`}
                  disabled={!canDeletePage}
                  onClick={stop(() => {
                    if (canDeletePage) actions.deletePage(node);
                  })}
                  title={canDeletePage ? "페이지 삭제 (Delete)" : isBusyPending ? "변환 중인 페이지는 삭제할 수 없습니다" : "마지막 1페이지는 삭제할 수 없습니다"}
                  className="fig-icon-btn fig-danger"
                >
                  <Trash2 className={ICON} />
                </button>
              </>
            )}

            {editable && (
              <>
                <button type="button" onClick={stop(() => actions.move(node, -1))} title="위로 이동" className="fig-icon-btn">
                  <ArrowUp className={ICON} />
                </button>
                <button type="button" onClick={stop(() => actions.move(node, 1))} title="아래로 이동" className="fig-icon-btn">
                  <ArrowDown className={ICON} />
                </button>
                {!isPageRow && (
                  <button type="button" data-testid={`delete-outline-node-${node.nodeId}`} onClick={stop(() => actions.remove(node))} title="기획 노드 삭제" className="fig-icon-btn fig-danger">
                    <Trash2 className={ICON} />
                  </button>
                )}
              </>
            )}
          </div>

          {/* 피그마 자물쇠 · 눈: 호버 때 보이고, 잠금 · 숨김 상태면 늘 보인다. */}
          {!isPageOrDoc && (
            <div className="fig-row-toggles">
              {Boolean(lockSlotIds?.length) && (
                <button
                  type="button"
                  data-testid={`lock-toggle-${node.nodeId}`}
                  data-on={isLocked || undefined}
                  aria-pressed={isLocked}
                  onClick={stop(() => actions.toggleLock(node, lockSlotIds!))}
                  title={isLocked ? "잠금 해제 (편집 허용)" : "잠금 (캔버스에서 편집 막기)"}
                  className="fig-icon-btn fig-row-toggle"
                >
                  {isLocked ? <Lock className={ICON} /> : <Unlock className={ICON} />}
                </button>
              )}
              <button
                type="button"
                data-testid={`visibility-toggle-${node.nodeId}`}
                data-on={hidden === "self" || undefined}
                aria-pressed={hidden === "self"}
                onClick={stop(() => actions.toggleHidden(node))}
                title={hidden === "self" ? "보이기" : "캔버스에서 숨기기 (보기 전용 · 문서에는 남음)"}
                className="fig-icon-btn fig-row-toggle"
              >
                {hidden === "self" ? <EyeOff className={ICON} /> : <Eye className={ICON} />}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
});

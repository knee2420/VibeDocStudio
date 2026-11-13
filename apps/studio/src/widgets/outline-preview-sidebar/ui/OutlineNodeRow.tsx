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
  Image as ImageIcon,
  Images,
  LayoutGrid,
  Loader2,
  Lock,
  Minus,
  MessageSquare,
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
import type { NodeDiffState } from "../model/useFigmaDiffStatus";
import { ADD_PAGE_TRIGGER_ATTR } from "./AddPageFlow";
import { FigmaDiffBadge } from "./FigmaDiffBadge";

/** 피그마 레이어 들여쓰기 (한 단계 24px, 6단계까지). */
const INDENT_PX = 24;
const MAX_INDENT_LEVELS = 6;
const ICON = "w-3 h-3";

const includesAny = (text: string, words: readonly string[]) => words.some((w) => text.includes(w));
const SECTION_WORDS = ["섹션", "구역", "그리드"] as const;
const TABLE_WORDS = ["표", "테이블", "매트릭스"] as const;
const COMPONENT_WORDS = ["컴포넌트", "템플릿"] as const;
const IMAGE_WORDS = ["이미지", "사진", "image", "photo", "스카이라인", "전경", "일몰", "갤러리"] as const;
const DIVIDER_WORDS = ["구분선", "divider"] as const;
const CALLOUT_WORDS = ["안내 상자", "콜아웃", "callout", "안내문"] as const;

type RowKind = "component" | "static" | undefined;

function rowKind(node: OutlinerNode, blockKind?: string): RowKind {
  const kind = (node.recommendedTemplateId || blockKind || "").toLowerCase();
  if (kind === "component" || includesAny(node.title.toLowerCase(), COMPONENT_WORDS)) return "component";
  if (node.isStatic) return "static";
  return undefined;
}

/** 피그마 레이어 아이콘:
 * - Image (ImageIcon / Images): 이미지 블록, 사진 묶음, 이미지 슬롯
 * - Text (Type): 일반 본문 텍스트, 제목(Heading)
 * - Divider (Minus): 구분선
 * - Callout (MessageSquare): 안내 상자
 * - Table (Table): 표
 * - Section / Grid (LayoutGrid): 다단 그리드, 섹션
 * - Frame (Hash): 복합 서식 프레임, 페이지 컨테이너
 * - Component (Component): 컴포넌트 마스터 / 템플릿
 * 페이지 행은 피그마 페이지 목록처럼 아이콘이 없다.
 */
function nodeIcon(node: OutlinerNode, docSurface: DocumentSurfaceKind, blockKind?: string): React.ReactNode {
  if (node.zoomLevel === "project") return <FolderTree className={ICON} />;
  if (node.zoomLevel === "document") {
    return <DocumentSurfaceIcon surface={docSurface} className={`${ICON} ${docSurface === "scroll" ? "text-emerald-500" : "text-[#0d99ff]"}`} />;
  }

  // 페이지 행은 피그마 페이지 목록처럼 아이콘이 없다
  if (node.zoomLevel === "page" && !node.targetBlockId) {
    return null;
  }

  const title = node.title.toLowerCase();
  const kind = (node.recommendedTemplateId || blockKind || "").toLowerCase();

  // 1. 이미지 (피그마 Image 아이콘)
  if (
    kind === "image" ||
    title === "이미지" ||
    title.includes("사진 묶음") ||
    (kind === "columns-grid" && title.includes("사진")) ||
    node.nodeId.includes("blk_img") ||
    node.targetBlockId?.startsWith("b_img_") ||
    node.targetBlockId?.startsWith("blk_img_") ||
    includesAny(title, IMAGE_WORDS)
  ) {
    return title.includes("묶음") ? <Images className={ICON} /> : <ImageIcon className={ICON} />;
  }

  // 2. 구분선 (피그마 Line / Vector 스타일의 Minus 아이콘)
  if (
    kind === "divider" ||
    node.targetBlockId?.startsWith("b_hr_") ||
    node.targetBlockId?.includes("divider") ||
    includesAny(title, DIVIDER_WORDS)
  ) {
    return <Minus className={ICON} />;
  }

  // 3. 안내 상자 / 콜아웃
  if (
    kind === "callout-box" ||
    kind === "callout" ||
    node.targetBlockId?.startsWith("b_box_") ||
    includesAny(title, CALLOUT_WORDS)
  ) {
    return <MessageSquare className={ICON} />;
  }

  // 4. 표 / 테이블 / 매트릭스
  if (
    kind === "table" ||
    kind === "structured-table" ||
    includesAny(title, TABLE_WORDS)
  ) {
    return <Table className={ICON} />;
  }

  // 5. 복합 서식 프레임 / 섹션 / 그리드 컨테이너 (피그마 Frame #)
  if (node.zoomLevel === "page" && node.targetBlockId) {
    if (includesAny(title, SECTION_WORDS) || kind === "columns-grid") {
      return <LayoutGrid className={ICON} />;
    }
    return <Hash className={ICON} />;
  }

  // 6. 컴포넌트 (피그마 Component ❖ 아이콘)
  if (kind === "component" || includesAny(title, COMPONENT_WORDS)) {
    return <Component className={ICON} />;
  }

  // 7. 기본값: 피그마 텍스트 'T' (Type) 아이콘 (제목, 본문 텍스트 등)
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
  /** 안티그래비티 (VS Code Git 트리) 스타일 변경 상태 (U / M 또는 상위 도트 ●). */
  diffState?: NodeDiffState;
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
  diffState,
}) {
  const docId = node.targetDocId || fallbackDocId;
  const isPageRow = isPageTargetNode(node);
  const isDocRow = isDocumentTargetNode(node);
  const targetId = outlineNodeTargetId(node);

  // AI 칩 호버는 정확히 그 대상을 가리키는 행만 (사이드바 자체 호버는 CSS :hover 가 맡는다).
  const isHighlighted = useWorkspaceSessionStore((s) => s.highlightedEntityId !== null && (s.highlightedEntityId === targetId || s.highlightedEntityId === node.nodeId));
  const isCollapsed = useWorkspaceSessionStore((s) => hasChildren && s.collapsedNodeIds.includes(node.nodeId));
  // 문서 · 페이지 행의 줌 토글 상태 (이 행으로 줌했는가).
  const isZoomRoot = useWorkspaceSessionStore((s) => (isDocRow || isPageRow) && s.zoomRootNodeId === node.nodeId);
  const pendingState = usePdfScaffoldJobStore((s) => (isPageRow && node.targetPageId ? (s.pageStatesByPageId[node.targetPageId] ?? null) : null));
  const pageCount = useStudioDocumentStore((s) => (isPageRow ? (s.docs.find((d) => d.docId === docId)?.pages.length ?? 0) : 0));
  const isLocked = useStudioDocumentStore((s) => (lockSlotIds?.length ? areSlotsLocked(s.docs.find((d) => d.docId === docId)?.slots ?? {}, lockSlotIds) : false));
  const doc = useStudioDocumentStore((s) => s.docs.find((d) => d.docId === docId));
  const docSurface = useStudioDocumentStore((s): DocumentSurfaceKind =>
    node.zoomLevel === "document" ? documentSurface(s.docs.find((d) => d.docId === node.targetDocId)).kind : "paged"
  );
  const blockKind = useMemo(() => {
    if (!node.targetBlockId || !doc) return undefined;
    for (const page of doc.pages) {
      const blk = page.blocks.find((b) => b.blockId === node.targetBlockId);
      if (blk) return blk.kind;
    }
    return undefined;
  }, [doc, node.targetBlockId]);

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
  const icon = statusIcon ?? nodeIcon(node, docSurface, blockKind);

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
      data-kind={rowKind(node, blockKind)}
      data-diff={diffState?.kind}
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
          <FigmaDiffBadge diffState={diffState} />

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

          {/* 문서 · 페이지 줌 토글: 호버 때 보이고, 이 행으로 줌한 동안은 늘 보인다. 다시 누르면 한 단계 위로. */}
          {(isDocRow || isPageRow) && (
            <div className="fig-row-toggles">
              <button
                type="button"
                data-testid={`zoom-bullet-${node.nodeId}`}
                data-on={isZoomRoot || undefined}
                aria-pressed={isZoomRoot}
                onClick={stop(() => actions.toggleZoom(node))}
                title={
                  isZoomRoot
                    ? "집중 보기 중 · 누르면 상위로 Zoom-Out (Alt+↑)"
                    : isPageRow
                      ? "이 페이지만 보기 (Zoom-In)"
                      : "이 문서 안으로 Zoom-In"
                }
                className={`fig-icon-btn fig-row-toggle${isZoomRoot ? " !text-[var(--fig-brand)]" : ""}`}
              >
                <CircleDot className={ICON} strokeWidth={isZoomRoot ? 2.5 : 2} />
              </button>
            </div>
          )}

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

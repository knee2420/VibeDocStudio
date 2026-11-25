import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Eye,
  GripVertical,
  Hand,
  LayoutGrid,
  List,
  MousePointer2,
  PenLine,
  Search,
  Shapes,
  Sliders,
  Sparkles,
  SquareDashed,
  X,
} from "lucide-react";

import { blockIcon, NEW_BLOCK_DRAG_MIME } from "@vibe/slot-canvas";
import { listInsertableBlocks, type InsertableBlockMenuItem } from "@vibe/vdoc-schema";

import { useAssetLibraryStore } from "@/entities/asset-library";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { LabModeToggle } from "@/features/playground";
import { useSwitchWorkbenchPhase } from "@/features/switch-workbench-phase";
import { AssetWireframeThumb } from "@/shared/ui";

/**
 * 피그마 툴바의 도형 · 텍스트 칸처럼 묶은 블록 도구. 버튼 아이콘은 블록 레지스트리의 아이콘 그대로다
 * (팔레트 · 에셋 · 캔버스 블록 메뉴와 같은 아이콘 — 버튼이 넣는 블록과 아이콘이 어긋나지 않게).
 */
const TOOL_GROUPS: ReadonlyArray<{ id: string; title: string; shortcut?: string; kinds: readonly string[] }> = [
  { id: "text", title: "텍스트", shortcut: "T", kinds: ["text", "section-block"] },
  { id: "media", title: "이미지 · 미디어", kinds: ["image", "hero", "link-card"] },
  { id: "layout", title: "레이아웃", kinds: ["columns-grid", "structured-table", "divider"] },
];

const toolButton = (active: boolean) =>
  `w-8 h-8 rounded-[10px] flex items-center justify-center transition-colors cursor-default outline-none focus-visible:ring-2 focus-visible:ring-[var(--vds-accent)]/40 ${
    active ? "bg-[var(--vds-accent)] text-white" : "hover:bg-black/[0.06] text-black/80"
  }`;
const caretButton = "w-3.5 h-8 -ml-0.5 rounded-md flex items-center justify-center hover:bg-black/[0.06] text-black/40 hover:text-black/80 cursor-default";

/** 블록을 툴바 · 팔레트에서 캔버스로 끌어 놓을 때 쓰는 드래그 데이터. */
const dragBlock = (kind: string) => ({
  draggable: true,
  onDragStart: (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData(NEW_BLOCK_DRAG_MIME, kind);
  },
});

/**
 * 캔버스 하단 플로팅 툴바 (피그마 UI3).
 * 블록 도구는 고르자마자 넣지 않는다: 도구를 고르면 커서가 십자로 바뀌고, 캔버스에서 넣을 자리를
 * 클릭하면 그 자리에 들어간 뒤 이동(V) 도구로 돌아간다 (`BlockPlacementLayer`). 끌어서 놓아도 된다.
 */
export const FigmaFloatingToolbar: React.FC = () => {
  const activeTool = useAssetLibraryStore((s) => s.activeTool);
  const placementKind = useAssetLibraryStore((s) => (s.activeTool === "place" ? s.placement?.kind ?? null : null));
  const setActiveTool = useAssetLibraryStore((s) => s.setActiveTool);
  const armPlacement = useAssetLibraryStore((s) => s.armPlacement);
  const openRightPanel = useWorkspaceLayoutStore((s) => s.openRightPanel);
  const mode = useStudioDocumentStore((s) => s.mode);
  const toggleMode = useStudioDocumentStore((s) => s.toggleMode);
  const { currentPhase } = useSwitchWorkbenchPhase();

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [blockViewMode, setBlockViewMode] = useState<"grid" | "list">("grid");
  const [blockSearch, setBlockSearch] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  // 피그마처럼 묶음 버튼은 마지막에 고른 블록을 보여준다.
  const [groupPick, setGroupPick] = useState<Record<string, string>>({});

  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const didDragRef = useRef(false);
  const dragOriginRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const insertableBlocks = useMemo(() => listInsertableBlocks(), []);
  const metaOf = useMemo(() => new Map(insertableBlocks.map((b) => [b.kind as string, b])), [insertableBlocks]);
  const groupedKinds = useMemo(() => new Set(TOOL_GROUPS.flatMap((g) => g.kinds)), []);
  const filteredBlocks = useMemo(() => {
    const q = blockSearch.trim().toLowerCase();
    if (!q) return insertableBlocks;
    return insertableBlocks.filter(
      (b) => b.label.toLowerCase().includes(q) || b.description.toLowerCase().includes(q) || b.kind.toLowerCase().includes(q)
    );
  }, [insertableBlocks, blockSearch]);

  const canPlace = mode === "Editing" && currentPhase === "drafting";
  const pick = (item: InsertableBlockMenuItem) => {
    armPlacement({ kind: item.kind, label: item.label });
    setOpenMenu(null);
  };

  // 바깥 클릭 또는 Esc 시 열린 메뉴 닫기
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!toolbarRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  // Hand 도구: 캔버스 드래그 패닝
  useEffect(() => {
    if (activeTool !== "hand") return;
    const main = document.querySelector<HTMLElement>("[data-vdoc-canvas-main]");
    if (!main) return;
    const prevCursor = main.style.cursor;
    main.style.cursor = "grab";
    let pan: { startX: number; startY: number; scrollLeft: number; scrollTop: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement | null)?.closest("[data-testid='figma-floating-toolbar']")) return;
      pan = { startX: e.clientX, startY: e.clientY, scrollLeft: main.scrollLeft, scrollTop: main.scrollTop };
      main.style.cursor = "grabbing";
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (!pan) return;
      main.scrollLeft = pan.scrollLeft - (e.clientX - pan.startX);
      main.scrollTop = pan.scrollTop - (e.clientY - pan.startY);
    };
    const onUp = () => {
      if (!pan) return;
      pan = null;
      main.style.cursor = "grab";
    };
    main.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      main.style.cursor = prevCursor;
      main.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [activeTool]);

  // 손잡이: 끌면 툴바 이동, 그냥 클릭하면 접기 · 펼치기
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const origin = dragOriginRef.current;
      if (!origin) return;
      const dx = e.clientX - origin.startX;
      const dy = e.clientY - origin.startY;
      if (!didDragRef.current && Math.hypot(dx, dy) <= 4) return;
      didDragRef.current = true;
      const el = toolbarRef.current;
      const parent = el?.parentElement;
      if (el && parent) {
        const pRect = parent.getBoundingClientRect();
        const tRect = el.getBoundingClientRect();
        const pad = 8;
        const maxDx = Math.max(0, pRect.width / 2 - tRect.width / 2 - pad);
        const minDy = Math.min(0, -(pRect.height - 24 - tRect.height - pad));
        setOffset({
          x: Math.max(-maxDx, Math.min(maxDx, origin.origX + dx)),
          y: Math.max(minDy, Math.min(16, origin.origY + dy)),
        });
      } else {
        setOffset({ x: origin.origX + dx, y: origin.origY + dy });
      }
    };
    const onUp = () => {
      const wasClick = !didDragRef.current;
      setIsDragging(false);
      dragOriginRef.current = null;
      didDragRef.current = false;
      if (wasClick) {
        setOpenMenu(null);
        setIsCollapsed((prev) => !prev);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    didDragRef.current = false;
    dragOriginRef.current = { startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y };
    setIsDragging(true);
  };

  const renderGroup = (group: (typeof TOOL_GROUPS)[number]) => {
    const items = group.kinds.map((k) => metaOf.get(k)).filter((m): m is InsertableBlockMenuItem => Boolean(m));
    if (items.length === 0) return null;
    const active = placementKind !== null && group.kinds.includes(placementKind);
    // 지금 배치 중인 블록 → 마지막으로 고른 블록 → 첫 블록 순으로 버튼 아이콘을 정한다 (피그마와 같다).
    const current = (active ? metaOf.get(placementKind!) : undefined) ?? metaOf.get(groupPick[group.id] ?? "") ?? items[0];
    const CurrentIcon = blockIcon(current.icon);
    return (
      <div key={group.id} className="relative flex items-center">
        <button
          type="button"
          data-testid={`toolbar-tool-${group.id}`}
          disabled={!canPlace}
          aria-pressed={active}
          {...dragBlock(current.kind)}
          onClick={() => pick(current)}
          title={`${current.label}${group.shortcut && current.kind === items[0].kind ? ` (${group.shortcut})` : ""} — 고른 뒤 캔버스에서 넣을 자리를 클릭 · 끌어 놓기도 됨`}
          className={`${toolButton(active)} disabled:opacity-35`}
        >
          <CurrentIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={!canPlace}
          data-testid={`toolbar-tool-${group.id}-menu`}
          onClick={() => setOpenMenu((m) => (m === group.id ? null : group.id))}
          title={`${group.title} 더 보기`}
          className={`${caretButton} disabled:opacity-35`}
        >
          <ChevronDown className="w-2.5 h-2.5" />
        </button>
        {openMenu === group.id && (
          <div className="fig-menu absolute left-0 bottom-11 w-44 z-50">
            {items.map((item) => {
              const Icon = blockIcon(item.icon);
              return (
                <button
                  key={item.kind}
                  type="button"
                  {...dragBlock(item.kind)}
                  onClick={() => {
                    setGroupPick((p) => ({ ...p, [group.id]: item.kind }));
                    pick(item);
                  }}
                  className="fig-menu-item justify-between"
                >
                  <span className="flex items-center gap-2">
                    {placementKind === item.kind ? <span className="w-3 text-center">✓</span> : <span className="w-3" />}
                    <Icon className="w-3.5 h-3.5" />
                    {item.label}
                  </span>
                  {group.shortcut && item.kind === items[0].kind && <span className="text-white/50">{group.shortcut}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const paletteActive = openMenu === "blocks" || (placementKind !== null && !groupedKinds.has(placementKind));

  return (
    <div
      ref={toolbarRef}
      data-testid="figma-floating-toolbar"
      style={{ transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px)` }}
      className="absolute bottom-6 left-1/2 z-40 select-none"
    >
      <div className="flex items-center gap-0.5 bg-white text-black/80 p-1 rounded-[13px] shadow-[0_2px_14px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.12)] text-xs">
        <button
          type="button"
          data-testid="toolbar-drag-handle"
          onMouseDown={handleDragStart}
          title={isCollapsed ? "클릭: 툴바 펼치기 · 드래그: 이동" : "클릭: 툴바 접기 · 드래그: 이동"}
          className={`w-5 h-8 rounded-[8px] flex items-center justify-center text-black/30 hover:text-black/60 hover:bg-black/[0.06] ${
            isDragging ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        {!isCollapsed && (
          <>
            <div className="w-px h-5 bg-black/10 mx-0.5" />

            <button
              type="button"
              data-testid="toolbar-tool-move"
              aria-pressed={activeTool === "select"}
              onClick={() => {
                setActiveTool("select");
                setOpenMenu(null);
              }}
              title="이동 · 선택 (V)"
              className={toolButton(activeTool === "select")}
            >
              <MousePointer2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              data-testid="toolbar-tool-section"
              aria-pressed={activeTool === "section"}
              onClick={() => {
                setActiveTool(activeTool === "section" ? "select" : "section");
                setOpenMenu(null);
              }}
              title="섹션 — 캔버스에서 범위를 끌어 섹션 에셋으로 저장"
              className={toolButton(activeTool === "section")}
            >
              <SquareDashed className="w-4 h-4" />
            </button>

            {TOOL_GROUPS.map(renderGroup)}

            {/* 리소스 (피그마 Resources): 모든 기본 블록 */}
            <div className="relative flex items-center">
              <button
                type="button"
                data-testid="toolbar-blocks-palette-btn"
                disabled={!canPlace}
                aria-pressed={paletteActive}
                onClick={() => setOpenMenu((m) => (m === "blocks" ? null : "blocks"))}
                title="리소스 — 모든 기본 블록 (골라서 캔버스에 클릭 · 끌어 놓기)"
                className={`${toolButton(paletteActive)} disabled:opacity-35`}
              >
                <Shapes className="w-4 h-4" />
              </button>

              {openMenu === "blocks" && (
                <div
                  data-testid="toolbar-blocks-popover"
                  className="fig-panel absolute left-1/2 -translate-x-1/2 bottom-12 w-[300px] bg-white rounded-[13px] shadow-[0_5px_17px_rgba(0,0,0,0.2),0_2px_7px_rgba(0,0,0,0.15)] overflow-hidden z-50 flex flex-col"
                >
                  <div className="fig-section-header !h-10">
                    <span>
                      기본 블록 <span className="fig-section-meta">{filteredBlocks.length}</span>
                    </span>
                    <div className="flex items-center">
                      <button type="button" onClick={() => setBlockViewMode("grid")} aria-pressed={blockViewMode === "grid"} title="그리드 보기" className="fig-icon-btn">
                        <LayoutGrid className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => setBlockViewMode("list")} aria-pressed={blockViewMode === "list"} title="리스트 보기" className="fig-icon-btn">
                        <List className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <label className="fig-search">
                    <Search className="w-3 h-3 shrink-0" />
                    <input type="text" value={blockSearch} onChange={(e) => setBlockSearch(e.target.value)} placeholder="블록 검색" autoFocus />
                    {blockSearch && (
                      <button type="button" onClick={() => setBlockSearch("")} className="fig-icon-btn !w-4 !h-4">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </label>

                  <div className="p-2 max-h-[340px] overflow-y-auto">
                    {filteredBlocks.length === 0 ? (
                      <div className="py-6 text-center text-black/50">일치하는 블록이 없습니다.</div>
                    ) : blockViewMode === "grid" ? (
                      <div className="grid grid-cols-2 gap-2">
                        {filteredBlocks.map((item) => (
                          <button
                            key={item.kind}
                            type="button"
                            data-testid={`toolbar-palette-item-${item.kind}`}
                            {...dragBlock(item.kind)}
                            onClick={() => pick(item)}
                            title={`${item.label} — ${item.description}`}
                            className="group flex flex-col cursor-default text-left"
                          >
                            <div
                              className={`aspect-square w-full rounded-[5px] bg-[#f5f5f5] border overflow-hidden ${
                                placementKind === item.kind ? "border-[var(--vds-accent)] ring-2 ring-[var(--vds-accent)]/25" : "border-black/10 group-hover:border-black/25"
                              }`}
                            >
                              <AssetWireframeThumb kind={item.kind} iconName={item.icon} />
                            </div>
                            <span className="mt-1 truncate text-center w-full">{item.label}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      filteredBlocks.map((item) => {
                        const Icon = blockIcon(item.icon);
                        return (
                          <button
                            key={item.kind}
                            type="button"
                            {...dragBlock(item.kind)}
                            onClick={() => pick(item)}
                            data-sel={placementKind === item.kind ? "on" : undefined}
                            className="fig-row w-full !mx-0"
                          >
                            <span className="fig-row-icon">
                              <Icon className="w-3.5 h-3.5" />
                            </span>
                            <span className="fig-row-label text-left">{item.label}</span>
                            <span className="ml-2 truncate text-black/40 max-w-[50%]">{item.description}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              data-testid="toolbar-tool-hand"
              aria-pressed={activeTool === "hand"}
              onClick={() => {
                setActiveTool(activeTool === "hand" ? "select" : "hand");
                setOpenMenu(null);
              }}
              title="손 도구 — 캔버스 끌어 이동 (H)"
              className={toolButton(activeTool === "hand")}
            >
              <Hand className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                openRightPanel("inspector");
                setOpenMenu(null);
              }}
              title="인스펙터 열기 (슬롯 상세 · 백데이터)"
              className={toolButton(false)}
            >
              <Sliders className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                openRightPanel("composer");
                setOpenMenu(null);
              }}
              title="AI Composer 열기"
              className={toolButton(false)}
            >
              <Sparkles className="w-4 h-4" />
            </button>

            <div className="w-px h-5 bg-black/10 mx-1" />

            <button
              type="button"
              data-testid="toolbar-mode-toggle-btn"
              onClick={toggleMode}
              title={mode === "Editing" ? "편집 모드 (클릭: 읽기 모드)" : "읽기 모드 (클릭: 편집 모드)"}
              className={toolButton(mode === "Editing")}
            >
              {mode === "Editing" ? <PenLine className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>

            <div className="ml-0.5">
              <LabModeToggle />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

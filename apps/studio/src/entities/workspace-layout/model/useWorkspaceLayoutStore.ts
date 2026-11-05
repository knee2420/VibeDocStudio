import { create } from "zustand";

import { readStoredNumber, writeStoredValue } from "@/shared/lib";

/**
 * 스튜디오 화면 배치 (패널 열림 · 크기 · 활성 도구 탭 · 팝오버).
 * 문서나 작업 위치와 무관한 순수 UI 상태이며, 패널 크기만 브라우저에 기억한다.
 */
export type ActivityBarTab = "explorer" | "source-control" | "template-hub";

/** 오른쪽 작업 패널의 탭. AI Composer 가 기본이다. */
export type RightPanelTab = "composer" | "blockbox" | "inspector";

export const SIDEBAR_WIDTH = { default: 320, min: 250, max: 650 } as const;
export const REFERENCE_DECK_HEIGHT = { default: 140, min: 50 } as const;
export const REFERENCE_SPLIT_WIDTH = { default: 520, min: 360, max: 1000 } as const;
export const RIGHT_SIDEBAR_WIDTH = { default: 420, min: 320, max: 960 } as const;

const SIDEBAR_WIDTH_KEY = "vdoc-sidebar-width";
const DECK_HEIGHT_KEY = "vdoc-ref-deck-height";
const REFERENCE_SPLIT_WIDTH_KEY = "vdoc-ref-split-width";
const RIGHT_SIDEBAR_WIDTH_KEY = "vdoc-right-sidebar-width";

function maxDeckHeight(): number {
  return typeof window === "undefined" ? 500 : Math.max(300, Math.floor(window.innerHeight * 0.75));
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export interface WorkspaceLayoutState {
  activeActivityTab: ActivityBarTab;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  rightPanelTab: RightPanelTab;
  sidebarWidth: number;
  rightSidebarWidth: number;
  referenceDeckHeight: number;
  referenceSplitWidth: number;
  /** 아웃라이너 왼쪽의 페이지 미리보기 패널. */
  pagePreviewOpen: boolean;
  shortcutHelpOpen: boolean;
  /** 우측 인스펙터의 "새 백데이터 등록" 양식 (파일 메뉴에서도 연다). */
  backdataFormOpen: boolean;

  setActiveActivityTab: (tab: ActivityBarTab) => void;
  /** 이미 열린 탭을 다시 누르면 사이드바를 접는다 (VS Code 액티비티 바와 같다). */
  toggleActivityTab: (tab: ActivityBarTab) => void;
  setLeftSidebarOpen: (open: boolean) => void;
  setRightSidebarOpen: (open: boolean) => void;
  /** 오른쪽 패널을 펼치고 해당 탭으로 간다. */
  openRightPanel: (tab: RightPanelTab) => void;
  setSidebarWidth: (width: number) => void;
  resetSidebarWidth: () => void;
  setRightSidebarWidth: (width: number) => void;
  resetRightSidebarWidth: () => void;
  setReferenceDeckHeight: (height: number) => void;
  resetReferenceDeckHeight: () => void;
  setReferenceSplitWidth: (width: number) => void;
  resetReferenceSplitWidth: () => void;
  setPagePreviewOpen: (open: boolean) => void;
  togglePagePreview: () => void;
  setShortcutHelpOpen: (open: boolean) => void;
  setBackdataFormOpen: (open: boolean) => void;
  /** 인스펙터를 펼치고 백데이터 등록 양식을 연다. */
  openBackdataForm: () => void;
}

export const useWorkspaceLayoutStore = create<WorkspaceLayoutState>((set, get) => ({
  activeActivityTab: "explorer",
  leftSidebarOpen: true,
  rightSidebarOpen: true,
  rightPanelTab: "composer",
  sidebarWidth: clamp(readStoredNumber(SIDEBAR_WIDTH_KEY, SIDEBAR_WIDTH.default), SIDEBAR_WIDTH.min, SIDEBAR_WIDTH.max),
  rightSidebarWidth: clamp(
    readStoredNumber(RIGHT_SIDEBAR_WIDTH_KEY, RIGHT_SIDEBAR_WIDTH.default),
    RIGHT_SIDEBAR_WIDTH.min,
    RIGHT_SIDEBAR_WIDTH.max
  ),
  referenceDeckHeight: clamp(
    readStoredNumber(DECK_HEIGHT_KEY, REFERENCE_DECK_HEIGHT.default),
    REFERENCE_DECK_HEIGHT.min,
    maxDeckHeight()
  ),
  referenceSplitWidth: clamp(
    readStoredNumber(REFERENCE_SPLIT_WIDTH_KEY, REFERENCE_SPLIT_WIDTH.default),
    REFERENCE_SPLIT_WIDTH.min,
    REFERENCE_SPLIT_WIDTH.max
  ),
  pagePreviewOpen: false,
  shortcutHelpOpen: false,
  backdataFormOpen: false,

  setActiveActivityTab: (tab) => set({ activeActivityTab: tab, leftSidebarOpen: true }),
  toggleActivityTab: (tab) => {
    const { activeActivityTab, leftSidebarOpen } = get();
    set(activeActivityTab === tab && leftSidebarOpen ? { leftSidebarOpen: false } : { activeActivityTab: tab, leftSidebarOpen: true });
  },
  setLeftSidebarOpen: (open) => set({ leftSidebarOpen: open }),
  setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),
  openRightPanel: (tab) => set({ rightSidebarOpen: true, rightPanelTab: tab }),

  setSidebarWidth: (width) => {
    const next = clamp(width, SIDEBAR_WIDTH.min, SIDEBAR_WIDTH.max);
    writeStoredValue(SIDEBAR_WIDTH_KEY, next);
    set({ sidebarWidth: next });
  },
  resetSidebarWidth: () => get().setSidebarWidth(SIDEBAR_WIDTH.default),

  setRightSidebarWidth: (width) => {
    const next = clamp(width, RIGHT_SIDEBAR_WIDTH.min, RIGHT_SIDEBAR_WIDTH.max);
    writeStoredValue(RIGHT_SIDEBAR_WIDTH_KEY, next);
    set({ rightSidebarWidth: next });
  },
  resetRightSidebarWidth: () => get().setRightSidebarWidth(RIGHT_SIDEBAR_WIDTH.default),

  setReferenceDeckHeight: (height) => {
    const next = clamp(height, REFERENCE_DECK_HEIGHT.min, maxDeckHeight());
    writeStoredValue(DECK_HEIGHT_KEY, next);
    set({ referenceDeckHeight: next });
  },
  resetReferenceDeckHeight: () => get().setReferenceDeckHeight(REFERENCE_DECK_HEIGHT.default),

  setReferenceSplitWidth: (width) => {
    const next = clamp(width, REFERENCE_SPLIT_WIDTH.min, REFERENCE_SPLIT_WIDTH.max);
    writeStoredValue(REFERENCE_SPLIT_WIDTH_KEY, next);
    set({ referenceSplitWidth: next });
  },
  resetReferenceSplitWidth: () => get().setReferenceSplitWidth(REFERENCE_SPLIT_WIDTH.default),

  setPagePreviewOpen: (open) => set({ pagePreviewOpen: open }),
  togglePagePreview: () => set((s) => ({ pagePreviewOpen: !s.pagePreviewOpen })),
  setShortcutHelpOpen: (open) => set({ shortcutHelpOpen: open }),
  setBackdataFormOpen: (open) => set({ backdataFormOpen: open }),
  openBackdataForm: () => set({ rightSidebarOpen: true, rightPanelTab: "inspector", backdataFormOpen: true }),
}));

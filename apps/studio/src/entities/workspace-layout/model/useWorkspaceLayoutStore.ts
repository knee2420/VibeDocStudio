import { create } from "zustand";

import { readStoredNumber, writeStoredValue } from "@/shared/lib";

/**
 * 스튜디오 화면 배치 (패널 열림 · 크기 · 활성 도구 탭 · 팝오버).
 * 문서나 작업 위치와 무관한 순수 UI 상태이며, 패널 크기만 브라우저에 기억한다.
 */
export type ActivityBarTab = "explorer" | "source-control" | "template-hub";

/** 오른쪽 작업 패널의 탭. AI Composer 가 기본이다. */
export type RightPanelTab = "composer" | "blockbox" | "inspector" | "resource-manager";

/** Resource Manager 도킹 및 배치 위치 */
export type RmPlacement = "right-tab" | "between-split" | "left-dock" | "closed";

/** 좌측 사이드바(탐색기) 내부 탭: 레이어(아웃라이너) · 에셋 · 레퍼런스 매니저 */
export type LeftPanelTab = "outliner" | "assets" | "reference-manager";

/** Reference Manager 도킹 및 배치 위치: 좌측 탭 모드 vs 에디터 독립 스플릿 vs 닫힘 */
export type RefPlacement = "left-tab" | "split" | "closed";

export const SIDEBAR_WIDTH = { default: 320, min: 250, max: 650 } as const;
/** 좌측 사이드바의 Documents & Pages 목록 높이 (Elements 와의 경계를 끌어 조절). */
export const PAGES_PANE_HEIGHT = { default: 248, min: 64, max: 900 } as const;
export const REFERENCE_SPLIT_WIDTH = { default: 520, min: 360, max: 1000 } as const;
export const RIGHT_SIDEBAR_WIDTH = { default: 420, min: 320, max: 960 } as const;
export const RM_SPLIT_WIDTH = { default: 460, min: 320, max: 800 } as const;

const SIDEBAR_WIDTH_KEY = "vdoc-sidebar-width";
const PAGES_PANE_HEIGHT_KEY = "vdoc-pages-pane-height";
const REFERENCE_SPLIT_WIDTH_KEY = "vdoc-ref-split-width";
const RIGHT_SIDEBAR_WIDTH_KEY = "vdoc-right-sidebar-width";
const RM_SPLIT_WIDTH_KEY = "vdoc-rm-split-width";
const REF_VIEWER_OPEN_KEY = "vdoc:ref_viewer_open";

const loadRefViewerOpenFromSession = (): boolean => {
  if (typeof window === "undefined" || !window.sessionStorage) return true;
  try {
    const val = window.sessionStorage.getItem(REF_VIEWER_OPEN_KEY);
    return val !== null ? val === "true" : true;
  } catch {
    return true;
  }
};

const saveRefViewerOpenToSession = (open: boolean) => {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(REF_VIEWER_OPEN_KEY, String(open));
  } catch {
    // ignore
  }
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export interface WorkspaceLayoutState {
  activeActivityTab: ActivityBarTab;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  rightPanelTab: RightPanelTab;
  sidebarWidth: number;
  pagesPaneHeight: number;
  rightSidebarWidth: number;
  referenceSplitWidth: number;
  /** Resource Manager 배치 위치 */
  rmPlacement: RmPlacement;
  rmSplitWidth: number;
  /** 좌측 탐색기 내부 탭 */
  leftPanelTab: LeftPanelTab;
  /** Reference Manager 도킹 위치 */
  refPlacement: RefPlacement;
  /** 참조 매니저 하단 뷰어 패널 열림 여부 (세션 보관) */
  refViewerOpen: boolean;
  /** 참조 스플릿 패널 접힘 여부 (CollapsedPanelRail 로 접힘) */
  refSplitCollapsed: boolean;
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
  setRmPlacement: (placement: RmPlacement) => void;
  setRmSplitWidth: (width: number) => void;
  resetRmSplitWidth: () => void;
  setLeftPanelTab: (tab: LeftPanelTab) => void;
  setRefPlacement: (placement: RefPlacement) => void;
  setRefViewerOpen: (open: boolean) => void;
  /** 레퍼런스 작업창을 스플릿으로 연다 (어느 레퍼런스를 볼지는 reference 스토어의 activeRefId). */
  openReferenceSplit: () => void;
  setRefSplitCollapsed: (collapsed: boolean) => void;
  setSidebarWidth: (width: number) => void;
  resetSidebarWidth: () => void;
  setPagesPaneHeight: (height: number) => void;
  resetPagesPaneHeight: () => void;
  setRightSidebarWidth: (width: number) => void;
  resetRightSidebarWidth: () => void;
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
  rmPlacement: "right-tab",
  rmSplitWidth: clamp(readStoredNumber(RM_SPLIT_WIDTH_KEY, RM_SPLIT_WIDTH.default), RM_SPLIT_WIDTH.min, RM_SPLIT_WIDTH.max),
  leftPanelTab: "outliner",
  refPlacement: "closed",
  refViewerOpen: loadRefViewerOpenFromSession(),
  refSplitCollapsed: false,
  sidebarWidth: clamp(readStoredNumber(SIDEBAR_WIDTH_KEY, SIDEBAR_WIDTH.default), SIDEBAR_WIDTH.min, SIDEBAR_WIDTH.max),
  pagesPaneHeight: clamp(readStoredNumber(PAGES_PANE_HEIGHT_KEY, PAGES_PANE_HEIGHT.default), PAGES_PANE_HEIGHT.min, PAGES_PANE_HEIGHT.max),
  rightSidebarWidth: clamp(
    readStoredNumber(RIGHT_SIDEBAR_WIDTH_KEY, RIGHT_SIDEBAR_WIDTH.default),
    RIGHT_SIDEBAR_WIDTH.min,
    RIGHT_SIDEBAR_WIDTH.max
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
  setRmPlacement: (placement) => {
    const { rightPanelTab } = get();
    if (placement === "between-split") {
      set({
        rmPlacement: placement,
        rightPanelTab: rightPanelTab === "resource-manager" ? "composer" : rightPanelTab,
      });
    } else if (placement === "right-tab") {
      set({
        rmPlacement: placement,
        rightSidebarOpen: true,
        rightPanelTab: "resource-manager",
      });
    } else {
      set({ rmPlacement: placement });
    }
  },
  setLeftPanelTab: (tab) => set({ leftPanelTab: tab }),
  setRefPlacement: (placement) => {
    const { leftPanelTab } = get();
    if (placement === "split") {
      set({
        refPlacement: placement,
        leftPanelTab: leftPanelTab === "reference-manager" ? "outliner" : leftPanelTab,
      });
    } else if (placement === "left-tab") {
      set({
        refPlacement: placement,
        leftSidebarOpen: true,
        leftPanelTab: "reference-manager",
      });
    } else {
      set({ refPlacement: placement });
    }
  },
  setRefViewerOpen: (open) => {
    saveRefViewerOpenToSession(open);
    set({ refViewerOpen: open });
  },
  openReferenceSplit: () => {
    const { leftPanelTab } = get();
    set({
      refPlacement: "split",
      refSplitCollapsed: false,
      leftPanelTab: leftPanelTab === "reference-manager" ? "outliner" : leftPanelTab,
    });
  },
  setRefSplitCollapsed: (collapsed) => set({ refSplitCollapsed: collapsed }),
  setRmSplitWidth: (width) => {
    const next = clamp(width, RM_SPLIT_WIDTH.min, RM_SPLIT_WIDTH.max);
    writeStoredValue(RM_SPLIT_WIDTH_KEY, next);
    set({ rmSplitWidth: next });
  },
  resetRmSplitWidth: () => get().setRmSplitWidth(RM_SPLIT_WIDTH.default),

  setSidebarWidth: (width) => {
    const next = clamp(width, SIDEBAR_WIDTH.min, SIDEBAR_WIDTH.max);
    writeStoredValue(SIDEBAR_WIDTH_KEY, next);
    set({ sidebarWidth: next });
  },
  resetSidebarWidth: () => get().setSidebarWidth(SIDEBAR_WIDTH.default),

  setPagesPaneHeight: (height) => {
    const next = Math.round(clamp(height, PAGES_PANE_HEIGHT.min, PAGES_PANE_HEIGHT.max));
    if (next === get().pagesPaneHeight) return;
    writeStoredValue(PAGES_PANE_HEIGHT_KEY, next);
    set({ pagesPaneHeight: next });
  },
  resetPagesPaneHeight: () => get().setPagesPaneHeight(PAGES_PANE_HEIGHT.default),

  setRightSidebarWidth: (width) => {
    const next = clamp(width, RIGHT_SIDEBAR_WIDTH.min, RIGHT_SIDEBAR_WIDTH.max);
    writeStoredValue(RIGHT_SIDEBAR_WIDTH_KEY, next);
    set({ rightSidebarWidth: next });
  },
  resetRightSidebarWidth: () => get().setRightSidebarWidth(RIGHT_SIDEBAR_WIDTH.default),


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

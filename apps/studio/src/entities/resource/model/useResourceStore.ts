import { create } from "zustand";
import type { ResourceItem, ResourceSector } from "@vibe/vdoc-schema";
import { resourceApi } from "../api/resourceApi";

interface ResourceState {
  items: ResourceItem[];
  activeResourceId: string | null;
  selectedSectorId: string | null;
  choiceOnly: boolean;
  filterKeyword: string;
  filterType: string | null;
  previewItem: ResourceItem | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadSession: (projectId: string) => Promise<void>;
  ingestDirectory: (projectId: string, directoryPath: string) => Promise<void>;
  ingestWebUrl: (projectId: string, url: string, title?: string) => Promise<void>;
  toggleItemChoice: (projectId: string, itemId: string, isChecked: boolean) => Promise<void>;
  toggleAllChoice: (projectId: string, isChecked: boolean) => Promise<void>;
  openPreview: (item: ResourceItem) => void;
  closePreview: () => void;
  addSector: (
    projectId: string,
    req: {
      resourceId: string;
      textSnippet: string;
      title?: string;
      page?: number;
      bbox?: [number, number, number, number];
      label?: string;
    }
  ) => Promise<ResourceSector | null>;
  setActiveResource: (id: string | null) => void;
  setSelectedSector: (id: string | null) => void;
  setChoiceOnly: (val: boolean) => void;
  setFilterKeyword: (kw: string) => void;
  setFilterType: (type: string | null) => void;
}

export const useResourceStore = create<ResourceState>((set, get) => ({
  items: [],
  activeResourceId: null,
  selectedSectorId: null,
  choiceOnly: false,
  filterKeyword: "",
  filterType: null,
  previewItem: null,
  isLoading: false,
  error: null,

  loadSession: async (projectId: string) => {
    set({ isLoading: true, error: null });
    try {
      const session = await resourceApi.getSession(projectId);
      set({
        items: session.items,
        activeResourceId: session.activeResourceId || session.items[0]?.id || null,
        selectedSectorId: session.selectedSectorId || null,
        isLoading: false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "리소스 세션을 불러오지 못했습니다.";
      set({ error: msg, isLoading: false });
    }
  },

  ingestDirectory: async (projectId: string, directoryPath: string) => {
    set({ isLoading: true, error: null });
    try {
      const session = await resourceApi.ingestDirectory(projectId, directoryPath);
      set({
        items: session.items,
        activeResourceId: session.items[0]?.id || null,
        isLoading: false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "디렉토리 덤핑에 실패했습니다.";
      set({ error: msg, isLoading: false });
    }
  },

  ingestWebUrl: async (projectId: string, url: string, title?: string) => {
    set({ isLoading: true, error: null });
    try {
      const session = await resourceApi.ingestWebUrl(projectId, url, title);
      set({
        items: session.items,
        activeResourceId: session.items[0]?.id || null,
        isLoading: false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "웹 URL 추가에 실패했습니다.";
      set({ error: msg, isLoading: false });
    }
  },

  toggleItemChoice: async (projectId: string, itemId: string, isChecked: boolean) => {
    // 낙관적 업데이트
    const updateRecursive = (list: ResourceItem[]): ResourceItem[] =>
      list.map((it) => {
        if (it.id === itemId) {
          const setChecked = (node: ResourceItem): ResourceItem => ({
            ...node,
            isChecked,
            children: node.children?.map(setChecked),
          });
          return setChecked(it);
        }
        if (it.children) {
          return { ...it, children: updateRecursive(it.children) };
        }
        return it;
      });

    set((state) => ({ items: updateRecursive(state.items) }));

    try {
      const session = await resourceApi.toggleChoice(projectId, itemId, isChecked, true);
      set({ items: session.items });
    } catch {
      // 롤백 필요 시 loadSession 재호출
      void get().loadSession(projectId);
    }
  },

  toggleAllChoice: async (projectId: string, isChecked: boolean) => {
    const setAll = (list: ResourceItem[]): ResourceItem[] =>
      list.map((it) => ({
        ...it,
        isChecked,
        children: it.children ? setAll(it.children) : undefined,
      }));

    set((state) => ({ items: setAll(state.items) }));

    // 최상위 아이템들에 대해 순차 또는 첫번째 아이템 cascade
    const current = get().items;
    for (const top of current) {
      try {
        await resourceApi.toggleChoice(projectId, top.id, isChecked, true);
      } catch {
        // 무시
      }
    }
  },

  addSector: async (projectId, req) => {
    try {
      const sector = await resourceApi.extractSector(projectId, req);
      // 로컬 아이템에 섹터 추가
      set((state) => {
        const appendSector = (list: ResourceItem[]): ResourceItem[] =>
          list.map((it) => {
            if (it.id === req.resourceId) {
              return { ...it, sectors: [sector, ...it.sectors] };
            }
            if (it.children) {
              return { ...it, children: appendSector(it.children) };
            }
            return it;
          });
        return { items: appendSector(state.items), selectedSectorId: sector.sectorId };
      });
      return sector;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "섹터 발라내기에 실패했습니다.";
      set({ error: msg });
      return null;
    }
  },

  setActiveResource: (id) => set({ activeResourceId: id }),
  setSelectedSector: (id) => set({ selectedSectorId: id }),
  setChoiceOnly: (val) => set({ choiceOnly: val }),
  setFilterKeyword: (kw) => set({ filterKeyword: kw }),
  setFilterType: (type) => set({ filterType: type }),
  openPreview: (item) => set({ previewItem: item }),
  closePreview: () => set({ previewItem: null }),
}));


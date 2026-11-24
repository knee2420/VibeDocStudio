import { create } from "zustand";

import { writeStoredValue } from "@/shared/lib";

const EXCLUDE_KEY = "vdoc:playground-exclude-backdata";

function readExclude(): boolean {
  try {
    return window.localStorage.getItem(EXCLUDE_KEY) !== "0";
  } catch {
    return true;
  }
}

interface PlaygroundSettingsState {
  /**
   * 플레이그라운드에서 한 대화 · 작업을 프로젝트 백데이터로 쓰지 않는다 (기본 켜짐).
   * 켜 두면 플레이그라운드 문서가 프로젝트 AI 맥락(@문서 지정)과 에셋 템플릿에 섞이지 않는다.
   * 가져간(합친 · 프로젝트에 넣은) 내용만 프로젝트 데이터가 된다.
   */
  excludeFromBackdata: boolean;
  setExcludeFromBackdata: (on: boolean) => void;
}

export const usePlaygroundSettings = create<PlaygroundSettingsState>((set) => ({
  excludeFromBackdata: typeof window === "undefined" ? true : readExclude(),
  setExcludeFromBackdata: (on) => {
    writeStoredValue(EXCLUDE_KEY, on ? "1" : "0");
    set({ excludeFromBackdata: on });
  },
}));

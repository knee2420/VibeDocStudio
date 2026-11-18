import { create } from "zustand";

/**
 * 레이아웃 · 아웃라인 실험 — 화면 구조만 맛보는 시제품 버전 고르기.
 * "current" 는 지금 앱 그대로, 나머지는 더미 데이터로 만든 시제품이다 (실제 문서 · 서버에 손대지 않는다).
 */
export type LabVersionId = "current" | "a" | "b" | "c" | "d" | "e";
export type OutlineVersionId = "current" | "o1" | "o2" | "o3" | "o4" | "o5" | "o6" | "o7";

export interface LabVersion<T extends string = string> {
  id: T;
  name: string;
  /** 한 줄 설명 — 고르기 목록에 보인다 */
  desc: string;
  /** 참고한 제품 */
  refs: string;
}

export const LAB_VERSIONS: LabVersion<LabVersionId>[] = [
  { id: "current", name: "지금 화면", desc: "실제 앱 그대로", refs: "" },
  { id: "a", name: "A · 양쪽 탭", desc: "왼쪽 구조|레퍼런스 · 오른쪽 AI|리소스, 참고는 캔버스 옆", refs: "Canva · NotebookLM" },
  { id: "b", name: "B · 양쪽 쌓기", desc: "왼쪽 위아래로 구조/레퍼런스 · 오른쪽 리소스/AI 를 한 번에", refs: "Scrivener · VS Code" },
  { id: "c", name: "C · 작업 배치", desc: "모으기 · 쓰기 · 검토마다 필요한 칸만 (Alt+1·2·3)", refs: "Cursor · Antigravity" },
  { id: "d", name: "D · 캔버스 중심", desc: "캔버스 전체, 칸은 가장자리 레일에서 떠서 열림 · AI 는 아래 입력줄", refs: "Figma UI3 · Canva" },
  { id: "e", name: "E · 대화 중심", desc: "리소스 · AI 대화 · 캔버스, 레퍼런스는 캔버스 위 띠", refs: "Claude Design · NotebookLM" },
];

export const OUTLINE_VERSIONS: LabVersion<OutlineVersionId>[] = [
  { id: "current", name: "지금 트리", desc: "Documents & Pages + Elements 그대로", refs: "" },
  { id: "o1", name: "O1 · 개요", desc: "1 / 1.1 번호 개요 — 이름 + 의도 한 줄, Enter · Tab 으로 뼈대 짜기", refs: "Workflowy · Logseq · Word 탐색 창" },
  { id: "o2", name: "O2 · 단계 렌즈", desc: "같은 트리를 1 뼈대 · 2 서식 · 3 내용 렌즈로", refs: "VS Code Outline · Scrivener 개요" },
  { id: "o3", name: "O3 · 카드", desc: "절마다 카드 — 이름 · 의도를 보며 끌어서 순서 바꾸기", refs: "Scrivener 코르크보드 · Gamma" },
  { id: "o4", name: "O4 · AI 협업", desc: "AI 제안 노드 받기/버리기 · 의도대로 채우기 · AI 가 보는 뼈대", refs: "Notion AI · Cursor" },
  { id: "o5", name: "O5 · 블록 단위 (피그마식)", desc: "노드 = 블록 한 줄, 칸은 트리에서 빼 아래 속성으로 · 이름 출처 · 자동 이름 비율", refs: "Figma 레이어 + 컴포넌트 속성" },
  { id: "o6", name: "O6 · 서식 스키마 (예스폼식)", desc: "서식 카드(분류 · 패싯 · 법정 메타) + 데이터 키 칸 · AI 권한 · AI 가 보는 JSON · HWPX/DOCX/PDF 매핑", refs: "예스폼 · 법제처 별표서식 API · 한컴 누름틀" },
  { id: "o7", name: "O7 · 뼈대 편집", desc: "실제로 짜고 옮기기 — 새 문서는 뼈대부터, 가져온 서식은 고치기 · 1 뼈대 → 2 서식 꽂기 → 3 채우기 · 캔버스가 따라 움직임", refs: "Workflowy · Relume 사이트맵 · 피그마 레이어" },
];

const KEY = "vds.layoutLab.version";
const OKEY = "vds.layoutLab.outline";

function load<T extends string>(key: string, list: LabVersion<T>[]): T {
  try {
    const v = localStorage.getItem(key);
    return list.some((x) => x.id === v) ? (v as T) : ("current" as T);
  } catch {
    return "current" as T;
  }
}

function save(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* 저장 못 해도 이번 세션은 바뀐다 */
  }
}

interface LayoutLabState {
  version: LabVersionId;
  outline: OutlineVersionId;
  setVersion: (v: LabVersionId) => void;
  setOutline: (v: OutlineVersionId) => void;
}

export const useLayoutLabStore = create<LayoutLabState>((set) => ({
  version: load(KEY, LAB_VERSIONS),
  outline: load(OKEY, OUTLINE_VERSIONS),
  setVersion: (version) => {
    save(KEY, version);
    set({ version });
  },
  setOutline: (outline) => {
    save(OKEY, outline);
    set({ outline });
  },
}));

/** 실험 화면을 띄울지 — 둘 중 하나라도 시제품을 골랐으면. */
export const selectLabActive = (s: LayoutLabState) => s.version !== "current" || s.outline !== "current";

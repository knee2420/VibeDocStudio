import { Registry } from "./registry";
import type { ContextRef } from "./types";

/**
 * 기준점 — AI 지시를 던진 대상 (다중 선택). 텍스트가 아니라 id 로 가리켜 항목이 옮겨져도 따라간다.
 * 커널은 표면(`surface`)의 뜻을 모른다: 해석은 그 표면의 어댑터(`AnchorSurface`)가 한다.
 */
export interface SessionAnchor {
  /** "outline" | "vdoc" | "explorer" | … */
  readonly surface: string;
  /** 볼트 상대 경로 (explorer 는 첫 항목의 부모 폴더) */
  readonly path: string;
  /** 노드 id · 칸/블록 id · 볼트 경로 — 표면마다 다르다 */
  readonly itemIds: readonly string[];
  /** "볼트_재편_계획 · 3개 항목" */
  readonly label: string;
}

/**
 * 다중 선택 + 인라인 AI 가 있는 화면 하나의 어댑터. 새 화면 = 어댑터 하나 등록 (다른 코드는 바꾸지 않는다).
 */
export interface AnchorSurface {
  readonly id: string;
  /** 지금 이 화면의 선택 → 기준점 (선택이 없으면 null) */
  current(): SessionAnchor | null;
  /** 기준점 항목 가운데 지금 없는 것 (지워짐) */
  missing(anchor: SessionAnchor): readonly string[];
  /** 기준점 항목이 모두 완료됐는가 (완료 개념이 없는 화면은 항상 false) */
  isCompleted(anchor: SessionAnchor): boolean;
  /** 이 기준점을 세션 첫 메시지의 첨부로 */
  toContexts(anchor: SessionAnchor): ContextRef[];
  /** 기준점 변화(완료 · 삭제 · 이동) 구독. 반환 = 해제 */
  watch(anchor: SessionAnchor, onChange: () => void): () => void;
  /** 화면에서 기준점으로 이동 (파일 열기 · 항목 선택 · 스크롤) */
  reveal?(anchor: SessionAnchor): void;
}

export class AnchorSurfaceRegistry extends Registry<AnchorSurface> {
  constructor() {
    super((surface) => surface.id);
  }
}

/** 두 기준점이 같은 항목을 하나라도 가리키는가 */
export function anchorsOverlap(a: SessionAnchor, b: SessionAnchor): boolean {
  if (a.surface !== b.surface || a.path !== b.path) return false;
  const ids = new Set(a.itemIds);
  return b.itemIds.some((id) => ids.has(id));
}

/** 기준점 라벨 — "파일 이름 · N개 항목" */
export function anchorLabel(path: string, count: number, noun = "항목"): string {
  const name = path.split("/").pop() || path || "볼트";
  const stem = name.replace(/\.[^.]+$/, "") || name;
  return count > 1 ? `${stem} · ${count}개 ${noun}` : stem;
}

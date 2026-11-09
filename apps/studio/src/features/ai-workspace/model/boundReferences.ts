import { useReferenceStore, type ReferenceKind } from "@/entities/reference-manager";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";

export interface ReferenceView {
  refId: string;
  /** 참조 번호 (1부터, 연결 순서) */
  number: number;
  title: string;
  kind: ReferenceKind;
  pageCount: number | null;
  /** 이 프로젝트에서 AI 에 쓰는지 (연결은 유지한 채 끌 수 있다) */
  enabled: boolean;
  /** 꺼 둔 층위 (D2 …) */
  layersOff: string[];
  pinCount: number;
  openInSplit: boolean;
}

/** 활성 프로젝트에 연결된 레퍼런스들 (레퍼런스 라이브러리 — 작업 문서가 아니다). */
export function boundReferences(): ReferenceView[] {
  const { bound, pins } = useReferenceStore.getState();
  const open = new Set(useWorkspaceSessionStore.getState().openReferenceIds);
  return bound.map((b, idx) => ({
    refId: b.refId,
    number: idx + 1,
    title: b.item.title,
    kind: b.item.kind,
    pageCount: b.item.pageCount || null,
    enabled: b.enabled,
    layersOff: Object.entries(b.layers)
      .filter(([, on]) => !on)
      .map(([id]) => id),
    pinCount: pins[b.refId]?.length ?? 0,
    openInSplit: open.has(b.refId),
  }));
}

/** AI 에 실제로 보내는 레퍼런스 (레퍼런스 스위치가 켜져 있고, 연결에서 사용 중인 것). */
export function activeReferences(referencesOn: boolean): ReferenceView[] {
  return referencesOn ? boundReferences().filter((r) => r.enabled) : [];
}

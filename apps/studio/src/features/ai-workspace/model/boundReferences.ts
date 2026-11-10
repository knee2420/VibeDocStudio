import { useAiScopeStore } from "@/entities/ai-scope";
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

/** AI 에 실제로 보내는 레퍼런스 (레퍼런스 스위치가 켜져 있고, 연결에서 사용 중이며 작업 패널에서 제외되지 않은 것). */
export function activeReferences(referencesOn: boolean, projectId?: string): ReferenceView[] {
  if (!referencesOn) return [];
  const excluded = new Set(
    projectId ? useAiScopeStore.getState().excludedReferenceIds[projectId] ?? [] : []
  );
  return boundReferences().filter((r) => r.enabled && !excluded.has(r.refId));
}

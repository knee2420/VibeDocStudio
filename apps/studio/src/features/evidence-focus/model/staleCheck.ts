import { useEffect } from "react";

import type { EvidenceLink, EvidenceLocator, EvidenceStatus } from "@vibe/vdoc-schema";

import { useKnowledgeDeckStore } from "@/entities/knowledge-deck";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { httpClient } from "@/shared/api";

/**
 * 근거 무효화 — 칸에 붙은 근거의 원문이 바뀌었는가.
 *
 * 근거 링크는 붙일 때의 원문 지문(`locator.sourceSha`)을 기억한다. 문서를 열 때와 덱이 다시 색인될 때
 * 서버에 지금 지문을 물어, 다르면 "변경됨(stale)", 카드가 사라졌으면 "없음(missing)" 으로 표시한다.
 * (내용은 바꾸지 않는다 — 사람이 보고 다시 채우거나 근거를 고친다.)
 */
interface StatusItem {
  kind: string;
  refId: string;
  status: EvidenceStatus;
  sourceSha: string | null;
}

const checkable = (l: EvidenceLink) => l.locator.kind === "kcard" && !!l.locator.sourceSha;

export async function checkEvidenceStatus(docId: string): Promise<number> {
  const doc = useStudioDocumentStore.getState().docs.find((d) => d.docId === docId);
  const links = (doc?.evidenceLinks ?? []).filter(checkable);
  if (!links.length) return 0;
  const seen = new Set<string>();
  const locators: EvidenceLocator[] = [];
  for (const l of links) {
    if (seen.has(l.locator.refId)) continue;
    seen.add(l.locator.refId);
    locators.push(l.locator);
  }
  let items: StatusItem[];
  try {
    items = (await httpClient.post<{ items: StatusItem[] }>("/api/assistant/evidence/status", { locators })).items ?? [];
  } catch {
    return 0;
  }
  // 같은 카드라도 링크마다 붙인 때의 지문이 다를 수 있다 — 지금 지문과 링크 지문을 직접 비교한다
  const current = new Map(items.map((i) => [i.refId, i]));
  let changed = 0;
  useStudioDocumentStore.getState().updateDoc(
    docId,
    (d) => {
      const next = (d.evidenceLinks ?? []).map((l) => {
        if (!checkable(l)) return l;
        const now = current.get(l.locator.refId);
        if (!now) return l;
        const status: EvidenceStatus =
          now.status === "missing" ? "missing" : now.sourceSha && now.sourceSha !== l.locator.sourceSha ? "stale" : "ok";
        if (status === (l.status ?? "ok")) return l;
        changed++;
        return { ...l, status };
      });
      return changed ? { ...d, evidenceLinks: next } : d;
    },
    { history: false }
  );
  return changed;
}

/** 열린 문서 · 덱 색인 시각이 바뀔 때마다 한 번. */
export function useEvidenceStaleCheck(): void {
  const docId = useStudioDocumentStore((s) => s.activeDocId);
  const builtKey = useKnowledgeDeckStore((s) => s.decks.map((d) => `${d.id}@${d.builtAt ?? ""}`).join("|"));
  useEffect(() => {
    if (!docId) return;
    const timer = window.setTimeout(() => void checkEvidenceStatus(docId), 800);
    return () => window.clearTimeout(timer);
  }, [docId, builtKey]);
}

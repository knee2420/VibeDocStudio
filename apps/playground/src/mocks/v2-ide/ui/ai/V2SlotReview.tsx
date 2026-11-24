import React, { useCallback } from "react";
import { useStore } from "zustand";

import { SlotChangeReview, useSessionList } from "@vibe/ai-react";
import type { V2AiWorkspace, V2StagedChange } from "@vibe/ai-vault";
import type { VDocSlot } from "@vibe/vdoc-schema";

/**
 * 캔버스 칸 안 변경안 검토 (studio `SlotFrame` → `SlotChangeReview` 와 같은 동작).
 * 이 문서 · 이 칸의 승인 대기 변경안이 있으면 칸 바로 아래에서 승인 · 거절 · 부분 승인한다 — 메인이든 기준점 세션이든.
 */
export function V2SlotReview({
  ai,
  path,
  slot,
  children,
}: {
  ai: V2AiWorkspace;
  path: string;
  slot: VDocSlot;
  children: React.ReactNode;
}) {
  // 이 칸의 변경안 하나 (같은 칸은 마지막 것만 남는다 — dedupe 규칙)
  const change = useStore(ai.store, (s) =>
    s.queue.find(
      (c): c is Extract<V2StagedChange, { targetKind: "slot-html" }> =>
        c.path === path && c.targetKind === "slot-html" && c.payload.slotId === slot.slotId
    )
  );
  const sessions = useSessionList(ai.sessions);
  const source = change?.sessionKey ? sessions.find((v) => v.key === change.sessionKey) ?? null : null;

  const accept = useCallback(
    (html: string) => {
      if (!change) return;
      if (html !== change.payload.html) {
        // 부분 승인: 고른 덩어리만 이어 붙인 본문으로 바꿔 승인한다
        ai.store.setState((s) => ({
          queue: s.queue.map((c) =>
            c.diffId === change.diffId && c.targetKind === "slot-html" ? ({ ...c, payload: { ...c.payload, html } } as V2StagedChange) : c
          ),
        }));
      }
      ai.approve([change.diffId]);
    },
    [ai, change]
  );
  const reject = useCallback(() => {
    if (change) ai.reject([change.diffId]);
  }, [ai, change]);

  if (!change) return <>{children}</>;
  return (
    <SlotChangeReview
      slotId={slot.slotId}
      before={slot.content}
      after={change.payload.html}
      stale={ai.isStale(change)}
      evidenceCount={change.evidence?.length ?? 0}
      sourceLabel={source?.title}
      onOpenSource={source ? () => ai.openSession(source.key) : undefined}
      onAccept={accept}
      onReject={reject}
    >
      {children}
    </SlotChangeReview>
  );
}

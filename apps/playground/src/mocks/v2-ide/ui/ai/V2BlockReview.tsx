import React, { useCallback, useState } from "react";
import { useStore } from "zustand";

import { BlockAssetDiffReview, useSessionList } from "@vibe/ai-react";
import type { V2AiWorkspace, V2StagedChange } from "@vibe/ai-vault";
import { StaticBlocksPreview } from "@vibe/slot-canvas";
import type { LayoutBlock, VDocPage } from "@vibe/vdoc-schema";

export type V2AssetBlocksChange = Extract<V2StagedChange, { targetKind: "asset-blocks" }>;

export interface BlockAssetChangeMatch {
  readonly replacePrimary: V2AssetBlocksChange | null;
  readonly replaceSecondary: V2AssetBlocksChange | null;
  readonly anchoredInserts: readonly V2AssetBlocksChange[];
}

/**
 * 특정 `.vdoc` 경로와 블록 ID에 연결된 `asset-blocks` Staged 변경안을 분류한다.
 * - `replacePrimary`: `mode === "replace"` 이고 `replaceBlockIds[0] === blockId` (Unified Diff 본체 표시)
 * - `replaceSecondary`: `mode === "replace"` 이고 `replaceBlockIds.slice(1)` 에 포함 (삭제 예정 표시)
 * - `anchoredInserts`: `mode === "insert"` 이고 `anchorBlockId === blockId` (기준 블록 아래 `+ 추가` 표시)
 */
export function matchBlockAssetChanges(
  queue: readonly V2StagedChange[],
  path: string,
  blockId: string
): BlockAssetChangeMatch {
  let replacePrimary: V2AssetBlocksChange | null = null;
  let replaceSecondary: V2AssetBlocksChange | null = null;
  const anchoredInserts: V2AssetBlocksChange[] = [];

  for (const c of queue) {
    if (c.path !== path || c.targetKind !== "asset-blocks") continue;
    if (c.payload.mode === "replace") {
      const ids = c.payload.replaceBlockIds ?? [];
      if (ids[0] === blockId) {
        replacePrimary = c;
      } else if (ids.includes(blockId)) {
        replaceSecondary = c;
      }
    } else if (c.payload.mode === "insert" && c.payload.anchorBlockId === blockId) {
      anchoredInserts.push(c);
    }
  }

  return { replacePrimary, replaceSecondary, anchoredInserts };
}

/** `anchorBlockId` 없이 문서(첫 쪽 끝)에 새로 놓는 `asset-blocks` 변경안 목록. */
export function matchPageEndAssetChanges(
  queue: readonly V2StagedChange[],
  path: string
): readonly V2AssetBlocksChange[] {
  return queue.filter(
    (c): c is V2AssetBlocksChange =>
      c.path === path &&
      c.targetKind === "asset-blocks" &&
      c.payload.mode === "insert" &&
      !c.payload.anchorBlockId
  );
}

const blockAssetMatchSignature = (
  queue: readonly V2StagedChange[],
  path: string,
  blockId: string
): string => {
  let sig = "";
  for (const c of queue) {
    if (c.path !== path || c.targetKind !== "asset-blocks") continue;
    const hit =
      (c.payload.mode === "replace" && Boolean(c.payload.replaceBlockIds?.includes(blockId))) ||
      (c.payload.mode === "insert" && c.payload.anchorBlockId === blockId);
    if (hit) {
      const token = `${c.diffId}:${c.payload.mode}:${c.createdAt}`;
      sig += sig ? `|${token}` : token;
    }
  }
  return sig;
};

const pageEndInsertSignature = (
  queue: readonly V2StagedChange[],
  path: string
): string => {
  let sig = "";
  for (const c of queue) {
    if (
      c.path === path &&
      c.targetKind === "asset-blocks" &&
      c.payload.mode === "insert" &&
      !c.payload.anchorBlockId
    ) {
      const token = `${c.diffId}:${c.createdAt}`;
      sig += sig ? `|${token}` : token;
    }
  }
  return sig;
};

const AssetDiffCardItem: React.FC<{
  readonly ai: V2AiWorkspace;
  readonly change: V2AssetBlocksChange;
  readonly page?: VDocPage;
  readonly secondaryRemoved?: boolean;
  readonly children?: React.ReactNode;
}> = ({ ai, change, page, secondaryRemoved = false, children }) => {
  const sessions = useSessionList(ai.sessions);
  const source = change.sessionKey ? sessions.find((v) => v.key === change.sessionKey) ?? null : null;
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback(() => {
    const res = ai.approve([change.diffId]);
    setError(res.failed.length ? res.failed.map((f) => f.why).join(" · ") : null);
  }, [ai, change.diffId]);

  const reject = useCallback(() => {
    setError(null);
    ai.reject([change.diffId]);
  }, [ai, change.diffId]);

  const canSwitchMode = Boolean(
    change.payload.replaceBlockIds?.length || change.payload.anchorBlockId
  );

  const switchMode = useCallback(
    (nextMode: "replace" | "insert") => {
      setError(null);
      ai.store.getState().setAssetPlacementMode(change.diffId, nextMode);
    },
    [ai, change.diffId]
  );

  return (
    <BlockAssetDiffReview
      diffId={change.diffId}
      mode={change.payload.mode}
      title={change.title}
      afterSummary={change.afterSummary}
      report={change.payload.report}
      warnings={change.warnings}
      intentNote={change.payload.intentNote}
      sourceLabel={source?.title}
      onOpenSource={source ? () => ai.openSession(source.key) : undefined}
      error={error}
      canSwitchMode={canSwitchMode}
      onSwitchMode={canSwitchMode ? switchMode : undefined}
      onAccept={accept}
      onReject={reject}
      secondaryRemoved={secondaryRemoved}
      proposedPreview={
        <StaticBlocksPreview
          blocks={change.payload.blocks}
          slots={change.payload.slots}
          page={page}
        />
      }
    >
      {children}
    </BlockAssetDiffReview>
  );
};

/**
 * 2D 캔버스 블록 단위 에셋 제안 Unified Diff 래퍼 (`V2SlotReview` 의 블록 버전).
 * - 이 블록과 무관한 큐 변화에는 리렌더되지 않는다 (`findRelatedAssetChange` 참조 비교).
 */
export const V2BlockReview: React.FC<{
  readonly ai: V2AiWorkspace;
  readonly path: string;
  readonly block: LayoutBlock;
  readonly page?: VDocPage;
  readonly children: React.ReactNode;
}> = ({ ai, path, block, page, children }) => {
  // Fast path: 이 블록과 관계있는 asset-blocks 변경안이 없으면 "" === "" 로 리렌더 0
  const matchSig = useStore(ai.store, (s) => blockAssetMatchSignature(s.queue, path, block.blockId));
  if (!matchSig) return <>{children}</>;

  const queue = ai.store.getState().queue;
  const { replacePrimary, replaceSecondary, anchoredInserts } = matchBlockAssetChanges(
    queue,
    path,
    block.blockId
  );

  let node: React.ReactNode = children;
  if (replacePrimary) {
    node = (
      <AssetDiffCardItem ai={ai} change={replacePrimary} page={page}>
        {children}
      </AssetDiffCardItem>
    );
  } else if (replaceSecondary) {
    node = (
      <AssetDiffCardItem ai={ai} change={replaceSecondary} page={page} secondaryRemoved>
        {children}
      </AssetDiffCardItem>
    );
  }

  if (anchoredInserts.length === 0) return <>{node}</>;

  return (
    <div className="relative">
      {node}
      {anchoredInserts.map((ins) => (
        <AssetDiffCardItem key={ins.diffId} ai={ai} change={ins} page={page} />
      ))}
    </div>
  );
};

/**
 * 기준 블록(`anchorBlockId`) 없이 페이지 끝에 삽입되는 에셋 블록 제안을 첫 쪽 하단에 Unified Diff로 표시한다.
 */
export const V2PageAssetInsertReview: React.FC<{
  readonly ai: V2AiWorkspace;
  readonly path: string;
  readonly page: VDocPage;
  readonly isFirstPage: boolean;
}> = ({ ai, path, page, isFirstPage }) => {
  const insertSig = useStore(ai.store, (s) =>
    isFirstPage ? pageEndInsertSignature(s.queue, path) : ""
  );
  if (!isFirstPage || !insertSig) return null;

  const inserts = matchPageEndAssetChanges(ai.store.getState().queue, path);
  if (inserts.length === 0) return null;

  return (
    <div data-testid="v2-page-end-asset-diffs" className="space-y-2.5">
      {inserts.map((ins) => (
        <AssetDiffCardItem key={ins.diffId} ai={ai} change={ins} page={page} />
      ))}
    </div>
  );
};

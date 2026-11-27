import React, { useCallback, useState } from "react";
import { useStore } from "zustand";

import { BlockAssetDiffReview, useSessionList } from "@vibe/ai-react";
import type { V2AiWorkspace, V2StagedChange } from "@vibe/ai-vault";
import { StaticBlocksPreview, VDocStyleProvider } from "@vibe/slot-canvas";
import type { LayoutBlock, VDocPage, VDocSlot } from "@vibe/vdoc-schema";

export type V2AssetBlocksChange = Extract<V2StagedChange, { targetKind: "asset-blocks" }>;
export type V2StyleChange = Extract<V2StagedChange, { targetKind: "style-change" }>;

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

/** 특정 `.vdoc` 경로와 블록 ID에 연결된 `style-change` Staged 변경안을 찾는다. */
export function matchBlockStyleChange(
  queue: readonly V2StagedChange[],
  path: string,
  blockId: string
): { readonly change: V2StyleChange; readonly proposedBlock: LayoutBlock } | null {
  for (let i = queue.length - 1; i >= 0; i--) {
    const c = queue[i];
    if (c.path !== path || c.targetKind !== "style-change") continue;
    const hit = c.payload.blockPatches.find((p) => p.blockId === blockId);
    if (hit) return { change: c, proposedBlock: hit.block };
  }
  return null;
}

/** 특정 블록 대상 없이 문서 전체 스타일을 바꾸는 `style-change` 목록 (첫 쪽 하단 Unified Diff 용). */
export function matchDocumentStyleChanges(
  queue: readonly V2StagedChange[],
  path: string
): readonly V2StyleChange[] {
  return queue.filter(
    (c): c is V2StyleChange =>
      c.path === path && c.targetKind === "style-change" && c.payload.blockPatches.length === 0
  );
}

const blockAssetMatchSignature = (
  queue: readonly V2StagedChange[],
  path: string,
  blockId: string
): string => {
  let sig = "";
  for (const c of queue) {
    if (c.path !== path) continue;
    if (c.targetKind === "asset-blocks") {
      const hit =
        (c.payload.mode === "replace" && Boolean(c.payload.replaceBlockIds?.includes(blockId))) ||
        (c.payload.mode === "insert" && c.payload.anchorBlockId === blockId);
      if (hit) {
        const token = `${c.diffId}:${c.payload.mode}:${c.createdAt}`;
        sig += sig ? `|${token}` : token;
      }
    } else if (c.targetKind === "style-change") {
      if (c.payload.blockPatches.some((p) => p.blockId === blockId)) {
        const token = `${c.diffId}:style:${c.createdAt}`;
        sig += sig ? `|${token}` : token;
      }
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
    if (c.path !== path) continue;
    if (
      c.targetKind === "asset-blocks" &&
      c.payload.mode === "insert" &&
      !c.payload.anchorBlockId
    ) {
      const token = `${c.diffId}:${c.createdAt}`;
      sig += sig ? `|${token}` : token;
    } else if (c.targetKind === "style-change" && c.payload.blockPatches.length === 0) {
      const token = `${c.diffId}:doc-style:${c.createdAt}`;
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

const StyleDiffCardItem: React.FC<{
  readonly ai: V2AiWorkspace;
  readonly change: V2StyleChange;
  readonly proposedBlocks: readonly LayoutBlock[];
  readonly slots: Readonly<Record<string, VDocSlot>>;
  readonly page?: VDocPage;
  readonly mode: "replace" | "insert";
  readonly children?: React.ReactNode;
}> = ({ ai, change, proposedBlocks, slots, page, mode, children }) => {
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

  return (
    <BlockAssetDiffReview
      diffId={change.diffId}
      mode={mode}
      badgeLabel={mode === "replace" ? "스타일 변경 제안" : "문서 스타일 제안"}
      beforeLabel="기존 스타일"
      afterLabel="제안 스타일 미리보기"
      title={change.title}
      afterSummary={change.afterSummary}
      warnings={change.warnings}
      intentNote={change.payload.intentNote}
      sourceLabel={source?.title}
      onOpenSource={source ? () => ai.openSession(source.key) : undefined}
      error={error}
      onAccept={accept}
      onReject={reject}
      proposedPreview={
        <VDocStyleProvider
          pack={change.payload.stylePack ?? null}
          mode={change.payload.styleRef?.mode}
        >
          <StaticBlocksPreview
            blocks={proposedBlocks}
            slots={slots}
            page={page}
          />
        </VDocStyleProvider>
      }
    >
      {children}
    </BlockAssetDiffReview>
  );
};

/**
 * 2D 캔버스 블록 단위 에셋·스타일 제안 Unified Diff 래퍼 (`V2SlotReview` 의 블록 버전).
 * - 이 블록과 무관한 큐 변화에는 리렌더되지 않는다.
 */
export const V2BlockReview: React.FC<{
  readonly ai: V2AiWorkspace;
  readonly path: string;
  readonly block: LayoutBlock;
  readonly slots?: Readonly<Record<string, VDocSlot>>;
  readonly page?: VDocPage;
  readonly children: React.ReactNode;
}> = ({ ai, path, block, slots = {}, page, children }) => {
  // Fast path: 이 블록과 관계있는 asset-blocks / style-change 변경안이 없으면 "" === "" 로 리렌더 0
  const matchSig = useStore(ai.store, (s) => blockAssetMatchSignature(s.queue, path, block.blockId));
  if (!matchSig) return <>{children}</>;

  const queue = ai.store.getState().queue;
  const { replacePrimary, replaceSecondary, anchoredInserts } = matchBlockAssetChanges(
    queue,
    path,
    block.blockId
  );
  const styleMatch = matchBlockStyleChange(queue, path, block.blockId);

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
  } else if (styleMatch) {
    node = (
      <StyleDiffCardItem
        ai={ai}
        change={styleMatch.change}
        proposedBlocks={[styleMatch.proposedBlock]}
        slots={slots}
        page={page}
        mode="replace"
      >
        {children}
      </StyleDiffCardItem>
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
 * 기준 블록(`anchorBlockId`) 없이 페이지 끝에 삽입되는 에셋 블록 제안과
 * 특정 블록 지정 없는 문서 전체 스타일 제안을 첫 쪽 하단에 Unified Diff로 표시한다.
 */
export const V2PageAssetInsertReview: React.FC<{
  readonly ai: V2AiWorkspace;
  readonly path: string;
  readonly page: VDocPage;
  readonly slots?: Readonly<Record<string, VDocSlot>>;
  readonly isFirstPage: boolean;
}> = ({ ai, path, page, slots = {}, isFirstPage }) => {
  const insertSig = useStore(ai.store, (s) =>
    isFirstPage ? pageEndInsertSignature(s.queue, path) : ""
  );
  if (!isFirstPage || !insertSig) return null;

  const queue = ai.store.getState().queue;
  const inserts = matchPageEndAssetChanges(queue, path);
  const docStyles = matchDocumentStyleChanges(queue, path);
  if (inserts.length === 0 && docStyles.length === 0) return null;

  const sampleBlocks = page.blocks.slice(0, 2);

  return (
    <div data-testid="v2-page-end-asset-diffs" className="space-y-2.5">
      {docStyles.map((sc) => (
        <StyleDiffCardItem
          key={sc.diffId}
          ai={ai}
          change={sc}
          proposedBlocks={sampleBlocks}
          slots={slots}
          page={page}
          mode="insert"
        />
      ))}
      {inserts.map((ins) => (
        <AssetDiffCardItem key={ins.diffId} ai={ai} change={ins} page={page} />
      ))}
    </div>
  );
};

import { applyPatch, flatToTree, importTree, type OutlineNode, type TreePatchRequest } from "@vibe/outliner/core";

export type OutlineNodeDiffKind = "added" | "modified" | "deleted" | "moved" | "file-changed";

export interface OutlineNodeDiffEntry {
  readonly nodeId: string;
  readonly kind: OutlineNodeDiffKind;
  readonly beforeText?: string;
  readonly afterText?: string;
  readonly detail?: string;
}

export interface OutlinePatchPreviewResult {
  readonly afterRoots: OutlineNode[];
  readonly entries: readonly OutlineNodeDiffEntry[];
  readonly failedOps: readonly { readonly index: number; readonly error: string }[];
  readonly beforeSummary: string;
  readonly afterSummary: string;
}

export type OutlineUnifiedDiffLineKind = "context" | "removed" | "added" | "modified-old" | "modified-new";

export interface OutlineUnifiedDiffLine {
  readonly key: string;
  readonly nodeId: string;
  readonly kind: OutlineUnifiedDiffLineKind;
  readonly depth: number;
  readonly text: string;
  readonly note?: string;
  readonly fileTarget?: string;
  readonly detail?: string;
}

export interface OutlineUnifiedDiffStats {
  readonly added: number;
  readonly modified: number;
  readonly deleted: number;
  readonly moved: number;
  readonly unchanged: number;
}

export interface OutlineUnifiedDiffResult {
  readonly lines: readonly OutlineUnifiedDiffLine[];
  readonly stats: OutlineUnifiedDiffStats;
  readonly failedOps: readonly { readonly index: number; readonly error: string }[];
  readonly afterRoots: OutlineNode[];
  readonly beforeSummary: string;
  readonly afterSummary: string;
}

interface FlatNodeInfo {
  readonly id: string;
  readonly text: string;
  readonly note: string;
  readonly parentId: string | null;
  readonly index: number;
  readonly fileTarget: string;
}

function indexTree(roots: readonly OutlineNode[]): Map<string, FlatNodeInfo> {
  const map = new Map<string, FlatNodeInfo>();
  const walk = (nodes: readonly OutlineNode[], parentId: string | null) => {
    nodes.forEach((n, index) => {
      map.set(n.id, {
        id: n.id,
        text: n.text,
        note: n.note ?? "",
        parentId,
        index,
        fileTarget: n.file?.target ?? "",
      });
      if (n.children.length > 0) walk(n.children, n.id);
    });
  };
  walk(roots, null);
  return map;
}

/**
 * `@vibe/outliner` 의 실제 `applyPatch` 엔진으로 `TreePatchRequest[]` 를 가상 적용해
 * 인라인 Diff 미리보기와 Staged 카드 요약을 생성한다 (별도 패치 엔진 중복 없음).
 */
export function previewOutlinePatch(
  beforeRoots: readonly OutlineNode[],
  requests: readonly TreePatchRequest[]
): OutlinePatchPreviewResult {
  let seq = 0;
  const imported = importTree([...beforeRoots]);
  const outcome = applyPatch(imported.tree, [...requests], {
    now: Date.now(),
    generateId: () => `ai-node-${Date.now().toString(36)}-${++seq}`,
  });
  const afterRoots = flatToTree(outcome.tree);
  const failedOps: Array<{ index: number; error: string }> = [];
  outcome.results.forEach((r, index) => {
    if (!r.ok) failedOps.push({ index, error: r.error });
  });

  const beforeMap = indexTree(beforeRoots);
  const afterMap = indexTree(afterRoots);
  const entries: OutlineNodeDiffEntry[] = [];

  for (const [id, after] of afterMap) {
    const before = beforeMap.get(id);
    if (!before) {
      entries.push({ nodeId: id, kind: "added", afterText: after.text || after.fileTarget || "(빈 불릿)" });
      continue;
    }
    if (before.text !== after.text || before.note !== after.note) {
      entries.push({
        nodeId: id,
        kind: "modified",
        beforeText: before.text,
        afterText: after.text,
        detail: before.note !== after.note ? "노트 변경" : undefined,
      });
    }
    if (before.fileTarget !== after.fileTarget) {
      entries.push({
        nodeId: id,
        kind: "file-changed",
        beforeText: before.fileTarget || "(첨부 없음)",
        afterText: after.fileTarget || "(첨부 해제)",
      });
    }
    if (before.parentId !== after.parentId || before.index !== after.index) {
      entries.push({ nodeId: id, kind: "moved", beforeText: before.text, afterText: after.text });
    }
  }
  for (const [id, before] of beforeMap) {
    if (!afterMap.has(id)) {
      entries.push({ nodeId: id, kind: "deleted", beforeText: before.text });
    }
  }

  const count = (k: OutlineNodeDiffKind) => entries.filter((e) => e.kind === k).length;
  const summaryParts: string[] = [];
  if (count("added")) summaryParts.push(`추가 ${count("added")}`);
  if (count("modified")) summaryParts.push(`수정 ${count("modified")}`);
  if (count("moved")) summaryParts.push(`이동 ${count("moved")}`);
  if (count("file-changed")) summaryParts.push(`리소스 ${count("file-changed")}`);
  if (count("deleted")) summaryParts.push(`삭제 ${count("deleted")}`);

  const beforeSample = entries
    .map((e) => e.beforeText)
    .filter((t): t is string => Boolean(t))
    .slice(0, 2)
    .join(" / ");
  const afterSample = entries
    .map((e) => e.afterText)
    .filter((t): t is string => Boolean(t))
    .slice(0, 2)
    .join(" / ");

  return {
    afterRoots,
    entries,
    failedOps,
    beforeSummary: beforeSample || `노드 ${beforeMap.size}개`,
    afterSummary: (summaryParts.join(" · ") || "변경 없음") + (afterSample ? ` — ${afterSample.slice(0, 80)}` : ""),
  };
}

/**
 * 코드 에디터의 Unified Diff 와 동일한 형태로 `.outline` 트리 변경안을 줄 단위 배열로 생성한다.
 * - 삭제 노드/서브트리: `removed` (`-` 빨간 줄)
 * - 수정 노드: `modified-old` (`-`) 직후 `modified-new` (`+`)
 * - 추가 노드/서브트리: `added` (`+` 초록 줄)
 * - 변경 없는 노드: `context` (기존 위치·들여쓰기 보존)
 */
export function buildOutlineUnifiedDiff(
  beforeRoots: readonly OutlineNode[],
  requests: readonly TreePatchRequest[]
): OutlineUnifiedDiffResult {
  const preview = previewOutlinePatch(beforeRoots, requests);
  const beforeMap = indexTree(beforeRoots);
  const afterMap = indexTree(preview.afterRoots);
  const entryKinds = new Map<string, Set<OutlineNodeDiffKind>>();
  for (const e of preview.entries) {
    let set = entryKinds.get(e.nodeId);
    if (!set) {
      set = new Set();
      entryKinds.set(e.nodeId, set);
    }
    set.add(e.kind);
  }

  const lines: OutlineUnifiedDiffLine[] = [];
  let seq = 0;
  let added = 0;
  let modified = 0;
  let deleted = 0;
  let moved = 0;
  let unchanged = 0;

  const pushRemovedSubtree = (node: OutlineNode, depth: number, reason?: string) => {
    deleted += 1;
    lines.push({
      key: `rm-${node.id}-${++seq}`,
      nodeId: node.id,
      kind: "removed",
      depth,
      text: node.text || node.file?.target || "(빈 불릿)",
      note: node.note,
      fileTarget: node.file?.target,
      detail: reason,
    });
    for (const child of node.children) {
      if (!afterMap.has(child.id)) {
        pushRemovedSubtree(child, depth + 1);
      }
    }
  };

  const pushAddedSubtree = (node: OutlineNode, depth: number, reason?: string) => {
    added += 1;
    lines.push({
      key: `add-${node.id}-${++seq}`,
      nodeId: node.id,
      kind: "added",
      depth,
      text: node.text || node.file?.target || "(빈 불릿)",
      note: node.note,
      fileTarget: node.file?.target,
      detail: reason,
    });
    for (const child of node.children) {
      if (!beforeMap.has(child.id)) {
        pushAddedSubtree(child, depth + 1);
      }
    }
  };

  const diffChildren = (
    beforeList: readonly OutlineNode[],
    afterList: readonly OutlineNode[],
    depth: number
  ) => {
    const beforeById = new Map(beforeList.map((n) => [n.id, n]));
    const afterById = new Map(afterList.map((n) => [n.id, n]));
    const emittedBefore = new Set<string>();

    // 1. 먼저 삭제되거나 다른 부모로 이동해 나간 이전 자식들 중, 현재 위치에 남아있지 않은 항목을 순서에 맞춰 배출
    let bi = 0;
    const flushDeletedBeforeNextCommon = (nextAfterId: string | null) => {
      while (bi < beforeList.length) {
        const b = beforeList[bi];
        if (nextAfterId && b.id === nextAfterId) break;
        if (afterById.has(b.id)) break;
        bi += 1;
        if (emittedBefore.has(b.id)) continue;
        emittedBefore.add(b.id);
        if (!afterMap.has(b.id)) {
          pushRemovedSubtree(b, depth);
        } else {
          // 다른 부모 아래로 이동한 경우 기존 자리에 이동 표시
          lines.push({
            key: `mv-out-${b.id}-${++seq}`,
            nodeId: b.id,
            kind: "removed",
            depth,
            text: b.text || b.file?.target || "(빈 불릿)",
            detail: "다른 위치로 이동",
          });
        }
      }
    };

    for (const a of afterList) {
      flushDeletedBeforeNextCommon(a.id);
      if (bi < beforeList.length && beforeList[bi].id === a.id) bi += 1;

      const sameParentBefore = beforeById.get(a.id);
      const anyBefore = beforeMap.get(a.id);
      const kinds = entryKinds.get(a.id);

      if (!anyBefore) {
        pushAddedSubtree(a, depth);
        continue;
      }

      emittedBefore.add(a.id);
      const isModified = Boolean(kinds?.has("modified") || kinds?.has("file-changed"));
      const isMoved = Boolean(kinds?.has("moved"));
      if (isMoved) moved += 1;

      const detailParts: string[] = [];
      if (isMoved) detailParts.push("이동");
      if (kinds?.has("file-changed")) detailParts.push("리소스 변경");
      const detail = detailParts.length ? detailParts.join(" · ") : undefined;

      if (isModified) {
        modified += 1;
        lines.push({
          key: `mod-old-${a.id}-${++seq}`,
          nodeId: a.id,
          kind: "modified-old",
          depth,
          text: anyBefore.text || anyBefore.fileTarget || "(빈 불릿)",
          note: anyBefore.note || undefined,
          fileTarget: anyBefore.fileTarget || undefined,
        });
        lines.push({
          key: `mod-new-${a.id}-${++seq}`,
          nodeId: a.id,
          kind: "modified-new",
          depth,
          text: a.text || a.file?.target || "(빈 불릿)",
          note: a.note,
          fileTarget: a.file?.target,
          detail,
        });
      } else if (!sameParentBefore && isMoved) {
        lines.push({
          key: `mv-in-${a.id}-${++seq}`,
          nodeId: a.id,
          kind: "added",
          depth,
          text: a.text || a.file?.target || "(빈 불릿)",
          note: a.note,
          fileTarget: a.file?.target,
          detail: "이동됨",
        });
      } else {
        unchanged += 1;
        lines.push({
          key: `ctx-${a.id}-${++seq}`,
          nodeId: a.id,
          kind: "context",
          depth,
          text: a.text || a.file?.target || "(빈 불릿)",
          note: a.note,
          fileTarget: a.file?.target,
          detail,
        });
      }

      const prevChildren = sameParentBefore?.children ?? [];
      if (prevChildren.length > 0 || a.children.length > 0) {
        diffChildren(prevChildren, a.children, depth + 1);
      }
    }

    flushDeletedBeforeNextCommon(null);
    // 뒤쪽에 남은 삭제 항목 정리
    for (const b of beforeList) {
      if (emittedBefore.has(b.id) || afterById.has(b.id)) continue;
      emittedBefore.add(b.id);
      if (!afterMap.has(b.id)) {
        pushRemovedSubtree(b, depth);
      }
    }
  };

  diffChildren(beforeRoots, preview.afterRoots, 0);

  return {
    lines,
    stats: { added, modified, deleted, moved, unchanged },
    failedOps: preview.failedOps,
    afterRoots: preview.afterRoots,
    beforeSummary: preview.beforeSummary,
    afterSummary: preview.afterSummary,
  };
}

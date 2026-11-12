import type { OutlinerNode } from "@vibe/vdoc-schema";

/**
 * 엘리먼트(블록 · 구역 · 슬롯) 줌의 캔버스 초점: 줌한 엘리먼트가 들어 있는 페이지 최상위 블록만 또렷하게 두고,
 * 같은 페이지의 나머지 최상위 블록을 흐리게 할 대상 블록 id 를 돌려준다. 문서 · 페이지 · 프로젝트 줌이면 빈 배열.
 *
 * 최상위 블록 = 블록을 가리키는 노드 중 부모가 블록을 가리키지 않는 노드 (페이지 바로 아래).
 * 슬롯이 하나뿐인 블록은 투영에서 블록 행 없이 페이지 바로 아래 슬롯 행으로 나오므로, 그런 슬롯 행도
 * 자기 블록(`targetBlockId`)을 대표한다.
 */
export function zoomFocusDimBlockIds(allNodes: readonly OutlinerNode[], rootNodeId: string): string[] {
  const byId = new Map(allNodes.map((n) => [n.nodeId, n]));
  const root = byId.get(rootNodeId);
  if (!root || !(root.targetBlockId || root.targetSlotId) || !root.targetPageId) return [];

  const isTopBlock = (n: OutlinerNode): boolean => {
    if (!n.targetBlockId) return false;
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    return !parent || !parent.targetBlockId;
  };

  // 줌 대상에서 위로 올라가며 페이지 바로 아래 블록을 찾는다.
  let focus: OutlinerNode | undefined = root;
  const seen = new Set<string>();
  while (focus && !isTopBlock(focus) && !seen.has(focus.nodeId)) {
    seen.add(focus.nodeId);
    focus = focus.parentId ? byId.get(focus.parentId) : undefined;
  }
  const focusBlockId = focus && isTopBlock(focus) ? focus.targetBlockId : root.targetBlockId;
  if (!focusBlockId) return [];

  const out: string[] = [];
  const added = new Set<string>();
  for (const n of allNodes) {
    if (n.targetPageId !== root.targetPageId || n.targetDocId !== root.targetDocId || !isTopBlock(n)) continue;
    const id = n.targetBlockId!;
    if (id === focusBlockId || added.has(id)) continue;
    added.add(id);
    out.push(id);
  }
  return out;
}

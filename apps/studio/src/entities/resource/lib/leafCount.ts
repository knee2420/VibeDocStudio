import type { ResourceItem } from "@vibe/vdoc-schema";

export interface NodeCountInfo {
  totalLeafCount: number;
  checkedLeafCount: number;
}

/**
 * 트리 내 모든 노드(폴더 및 파일)의 잎(Leaf) 개수와 체크된 잎 개수를 후위 순회로 일괄 집계합니다.
 * RM 트리 및 Composer 리소스 메뉴에서 동일한 숫자를 보장하기 위한 공용 순수 함수입니다.
 */
export const computeAllNodeCounts = (items: ResourceItem[]): Map<string, NodeCountInfo> => {
  const map = new Map<string, NodeCountInfo>();

  const traverse = (node: ResourceItem): NodeCountInfo => {
    if (!node.children || node.children.length === 0) {
      const info: NodeCountInfo = {
        totalLeafCount: 1,
        checkedLeafCount: node.isChecked ? 1 : 0,
      };
      map.set(node.id, info);
      return info;
    }

    let total = 0;
    let checked = 0;
    for (const child of node.children) {
      const cInfo = traverse(child);
      total += cInfo.totalLeafCount;
      checked += cInfo.checkedLeafCount;
    }
    const info: NodeCountInfo = { totalLeafCount: total, checkedLeafCount: checked };
    map.set(node.id, info);
    return info;
  };

  for (const item of items) {
    traverse(item);
  }
  return map;
};

/**
 * 최상위 루트 노드들의 잎 카운트 합계를 계산합니다.
 */
export const computeRootLeafCounts = (
  items: ResourceItem[],
  counts?: Map<string, NodeCountInfo>
): NodeCountInfo => {
  const map = counts ?? computeAllNodeCounts(items);
  let total = 0;
  let checked = 0;
  for (const item of items) {
    const info = map.get(item.id);
    if (info) {
      total += info.totalLeafCount;
      checked += info.checkedLeafCount;
    }
  }
  return { totalLeafCount: total, checkedLeafCount: checked };
};


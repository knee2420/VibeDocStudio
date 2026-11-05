import { genericBlockKind } from "@vibe/vdoc-schema";

import type { BlockViewProps } from "../contract";

/** 뷰가 등록되지 않은 종류: 슬롯들을 차례로 그린다 (이전 버전 문서 · 아직 뷰가 없는 새 종류). */
export const GenericBlockView = ({ block, ctx }: BlockViewProps) => {
  const ids = genericBlockKind.slotIds(block);
  if (ids.length === 0) return null;
  return <div className="space-y-2">{ids.map((id) => ctx.renderSlot(id))}</div>;
};

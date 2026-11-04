import {
  setSlotContent,
  type StagedAiChange,
  type StagedOutlineNodeChange,
  type StagedSlotHtmlChange,
  type StagedTargetKind,
  type StagedTemplateBlockChange,
} from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useProjectStore } from "@/entities/vdoc-project";

/**
 * Staged 변경안 종류마다 "승인하면 무엇을 하는가"를 하나씩 둔다 (전략 표).
 * 새 종류가 생기면 `StagedAiChange` 합 타입에 추가하고 여기 한 줄을 더하면 된다 —
 * 빠뜨리면 타입 검사가 잡는다.
 */
type Applier<T extends StagedAiChange> = (change: T) => Promise<void>;

const applyOutlineNode: Applier<StagedOutlineNodeChange> = async ({ payload }) => {
  const { node } = payload;
  await useProjectStore.getState().insertStorylineNode(
    node.parentId ?? null,
    {
      title: node.title,
      summary: node.summary,
      zoomLevel: node.zoomLevel,
      targetDocId: node.targetDocId,
      recommendedTemplateId: node.recommendedTemplateId,
      aiStatus: "applied",
    },
    node.provenanceSourceProjectId && node.provenanceSourceNodeId
      ? { sourceProjectId: node.provenanceSourceProjectId, sourceNodeId: node.provenanceSourceNodeId }
      : undefined
  );
};

const applyTemplateBlock: Applier<StagedTemplateBlockChange> = ({ payload }) =>
  useProjectStore.getState().assignTemplateToNode(payload.nodeId, payload.templateKind);

const applySlotHtml: Applier<StagedSlotHtmlChange> = async ({ payload }) => {
  useStudioDocumentStore
    .getState()
    .updateCurrentDoc((doc) => setSlotContent(doc, payload.slotId, payload.html), {
      history: true,
      label: "AI 슬롯 초안 적용",
    });
};

const APPLIERS: { [K in StagedTargetKind]: Applier<Extract<StagedAiChange, { targetKind: K }>> } = {
  "outline-node": applyOutlineNode,
  "template-block": applyTemplateBlock,
  "slot-html": applySlotHtml,
};

export function applyStagedChange(change: StagedAiChange): Promise<void> {
  const apply = APPLIERS[change.targetKind] as Applier<StagedAiChange>;
  return apply(change);
}

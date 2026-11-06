import {
  addEvidenceLinks,
  newEvidenceLinkId,
  patchBlockProps,
  setSlotContent,
  withSlotFill,
  type EvidenceLink,
  type StagedAiChange,
  type StagedBlockPropsChange,
  type StagedOutlineNodeChange,
  type StagedSlotHtmlChange,
  type StagedTargetKind,
  type StagedTemplateBlockChange,
  type StagedVariablesChange,
  type VDocDocument,
} from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useProjectStore } from "@/entities/vdoc-project";

/**
 * Staged 변경안 종류마다 "승인하면 무엇을 하는가"를 하나씩 둔다 (전략 표).
 * 새 종류가 생기면 `StagedAiChange` 합 타입에 추가하고 여기 한 줄을 더하면 된다 —
 * 빠뜨리면 타입 검사가 잡는다.
 *
 * 문서 변경안은 **자기 문서**(`docId`)에 적용된다 (활성 문서가 아니어도). 적용하면 함께:
 * - 슬롯 채움 메타(작성자 = 그 하네스 · 실행)를 남기고
 * - 변경안이 실어 온 근거를 슬롯 근거 링크로 기록하고
 * - 서버 개정 이력에 작성자로 남을 변경 출처(ChangeNote)를 붙인다.
 */
type Applier<T extends StagedAiChange> = (change: T) => Promise<void>;

const targetDocId = (change: StagedAiChange): string => change.docId ?? useStudioDocumentStore.getState().activeDocId;

function updateTargetDoc(change: StagedAiChange, updater: (doc: VDocDocument) => VDocDocument, slotIds: string[], variables: string[] = []) {
  const ok = useStudioDocumentStore.getState().updateDoc(targetDocId(change), updater, {
    history: true,
    label: change.title.replace(/^\[[^\]]+\]\s*/, "AI 적용: "),
    change: { slotIds, variables, author: "ai", harnessId: change.harnessId, runId: change.runId, label: change.title },
  });
  if (!ok) throw new Error(`변경안의 대상 문서가 열려 있지 않습니다: ${targetDocId(change)}`);
}

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

const applySlotHtml: Applier<StagedSlotHtmlChange> = async (change) => {
  const { slotId, html } = change.payload;
  const now = new Date().toISOString();
  const links: EvidenceLink[] = (change.evidence ?? []).map((e) => ({
    linkId: newEvidenceLinkId(),
    slotId,
    locator: e.locator,
    origin: "ai",
    harnessId: change.harnessId,
    runId: change.runId,
    createdAt: now,
    status: "ok",
    citationIds: e.citationId ? [e.citationId] : [],
  }));
  updateTargetDoc(
    change,
    (doc) =>
      addEvidenceLinks(
        withSlotFill(setSlotContent(doc, slotId, html), slotId, { author: "ai", harnessId: change.harnessId, runId: change.runId, at: now }),
        links
      ),
    [slotId]
  );
};

const applyBlockProps: Applier<StagedBlockPropsChange> = async (change) => {
  updateTargetDoc(change, (doc) => patchBlockProps(doc, change.payload.blockId, change.payload.props), []);
};

const applyVariables: Applier<StagedVariablesChange> = async (change) => {
  const keys = Object.keys(change.payload.variables);
  updateTargetDoc(change, (doc) => ({ ...doc, variables: { ...doc.variables, ...change.payload.variables } }), [], keys);
};

const APPLIERS: { [K in StagedTargetKind]: Applier<Extract<StagedAiChange, { targetKind: K }>> } = {
  "outline-node": applyOutlineNode,
  "template-block": applyTemplateBlock,
  "slot-html": applySlotHtml,
  "block-props": applyBlockProps,
  variables: applyVariables,
};

export function applyStagedChange(change: StagedAiChange): Promise<void> {
  const apply = APPLIERS[change.targetKind] as Applier<StagedAiChange>;
  return apply(change);
}

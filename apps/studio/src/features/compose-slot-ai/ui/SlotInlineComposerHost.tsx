import React from "react";

import { ComponentAttachedComposer } from "@vibe/ai-composer";
import type { BackdataChunk, VDocSlot } from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";

import { synthesizeSlotContent } from "../model/synthesizeSlotContent";

export interface SlotInlineComposerHostProps {
  targetSlot: VDocSlot;
  boundChunks: BackdataChunk[];
  onApplySlotContent: (slotId: string, newHtml: string) => void;
}

/**
 * 슬롯에 붙는 인라인 AI 작성기. 선택 영역 AI 바가 넣어 둔 프롬프트(`composerPrompt`)를
 * 스스로 구독하므로, 프롬프트가 바뀌어도 캔버스 페이지 전체를 다시 그리지 않는다.
 */
export const SlotInlineComposerHost: React.FC<SlotInlineComposerHostProps> = ({
  targetSlot,
  boundChunks,
  onApplySlotContent,
}) => {
  const composerPrompt = useSlotSelectionStore((s) => s.composerPrompt);
  const setComposerOpenSlotId = useSlotSelectionStore((s) => s.setComposerOpenSlotId);
  const setRightSidebarOpen = useWorkspaceLayoutStore((s) => s.setRightSidebarOpen);

  return (
    <ComponentAttachedComposer
      targetSlot={targetSlot}
      boundChunks={boundChunks}
      onApplySlotContent={onApplySlotContent}
      onSynthesizeSlotContent={synthesizeSlotContent}
      onOpenBackdataDrawer={() => setRightSidebarOpen(true)}
      onClose={() => setComposerOpenSlotId(null)}
      initialPrompt={composerPrompt ?? undefined}
    />
  );
};

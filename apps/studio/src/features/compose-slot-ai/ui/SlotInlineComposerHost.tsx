import React from "react";

import { ComponentAttachedComposer } from "@vibe/ai-composer";
import type { BackdataChunk, VDocSlot } from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";

import { useComposeSlotAi } from "../model/useComposeSlotAi";

export interface SlotInlineComposerHostProps {
  targetSlot: VDocSlot;
  boundChunks: BackdataChunk[];
  onApplySlotContent: (slotId: string, newHtml: string) => void;
  initialPrompt?: string;
}

export const SlotInlineComposerHost: React.FC<SlotInlineComposerHostProps> = ({
  targetSlot,
  boundChunks,
  onApplySlotContent,
  initialPrompt,
}) => {
  const setRightSidebarOpen = useSlotSelectionStore(
    (s) => s.setRightSidebarOpen
  );
  const setComposerOpenSlotId = useSlotSelectionStore(
    (s) => s.setComposerOpenSlotId
  );
  const { synthesizeSlotContent } = useComposeSlotAi();

  return (
    <ComponentAttachedComposer
      targetSlot={targetSlot}
      boundChunks={boundChunks}
      onApplySlotContent={onApplySlotContent}
      onSynthesizeSlotContent={synthesizeSlotContent}
      onOpenBackdataDrawer={() => setRightSidebarOpen(true)}
      onClose={() => setComposerOpenSlotId(null)}
      initialPrompt={initialPrompt}
    />
  );
};


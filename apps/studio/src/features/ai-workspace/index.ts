import { BLOCK_DRAG_MIME } from "@vibe/slot-canvas";

import { aiRuntime } from "@/shared/ai";

import { SLOT_RANGE_ACTIONS } from "./model/rangeAi";
import { WORKSPACE_CONTEXT_PROVIDERS } from "./model/workspaceContexts";
import { WORKSPACE_ENTITY_RESOLVERS } from "./model/workspaceEntities";
import { WORKSPACE_TOOLS } from "./model/workspaceTools";

/** 워크스페이스 기본 도구 · 컨텍스트 · 화면 요소 해석기 · 드래그 번역기를 AI 런타임에 등록한다. */
export function registerWorkspaceAi(): () => void {
  const offs = [
    aiRuntime.tools.registerAll(WORKSPACE_TOOLS),
    aiRuntime.contexts.registerAll(WORKSPACE_CONTEXT_PROVIDERS),
    aiRuntime.entities.registerAll(WORKSPACE_ENTITY_RESOLVERS),
    aiRuntime.actions.registerAll(SLOT_RANGE_ACTIONS),
    // 캔버스 블록의 ⋮⋮ 핸들은 이미 재배치용 드래그 데이터를 싣는다 — Composer 에 놓으면 블록 첨부로 바꾼다.
    aiRuntime.drops.register({
      mime: BLOCK_DRAG_MIME,
      translate: (data) => {
        const { blockId } = JSON.parse(data) as { pageId: string; blockId: string };
        const ref = aiRuntime.entities.lookup(blockId, "block")?.toContext?.();
        return ref ? [ref] : [];
      },
    }),
  ];
  return () => offs.forEach((off) => off());
}

export { AiAttachLayer } from "./ui/AiAttachLayer";
export { attachable, type AttachableProps } from "./lib/useAttachable";
export { extractPdfRegionText } from "./lib/pdfRegionText";
export {
  attachToComposer,
  selectPickedIds,
  useAttachPickStore,
  useReferenceRegionStore,
  withPicked,
  type AttachOptions,
} from "./model/attach";
export {
  backdataRef,
  blockRef,
  outlineNodeRef,
  pageRef,
  referenceRef,
  referenceRegionRef,
  referenceTextRef,
  slotRangeRef,
  slotRef,
  stagedRef,
  variableRef,
} from "./model/contextBuilders";
export { applySlotMap, parseSlotMap, SLOT_RANGE_SURFACE, stageSlotMap } from "./model/rangeAi";

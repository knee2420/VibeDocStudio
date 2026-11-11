import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { composerController } from "@/shared/ai";

import { documentLifecycle } from "./documentLifecycle";

/** 에이전트 문서 짓기 도구(`dc_*`, MCP 이름은 `mcp_vibefs_dc_new` 처럼 붙는다). */
const DC_TOOL = /(^|_)dc_(new|build)$/;
const DOC_ID = /(vdoc[-_][\w-]+)/;

/**
 * Composer 대화에서 에이전트가 초안 문서를 만들거나(`dc_new`) 고치면(`dc_build`) 캔버스를 맞춘다.
 * 에이전트는 서버에 바로 저장하므로, 만든 문서는 열고 · 고친 문서는 서버 판으로 다시 불러온다.
 */
export function registerAgentDraftSync(): () => void {
  const seen = new Set<string>();
  const { openDocument } = documentLifecycle();
  return composerController.subscribe(() => {
    for (const item of composerController.getState().items) {
      if (item.kind !== "agent_tool" || item.state !== "done" || seen.has(item.id)) continue;
      const match = DC_TOOL.exec(String(item.name || ""));
      if (!match) continue;
      seen.add(item.id);
      const docId = DOC_ID.exec(String(item.output ?? ""))?.[1];
      if (!docId) continue;
      const docs = useStudioDocumentStore.getState();
      if (match[2] === "new" || !docs.docs.some((d) => d.docId === docId)) {
        void openDocument(docId).then(() => useStudioDocumentStore.getState().setActiveDocId(docId));
      } else {
        void docs.reloadDoc(docId);
      }
    }
  });
}

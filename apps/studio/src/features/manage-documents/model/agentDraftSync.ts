import type { ComposerItem } from "@vibe/ai-kernel";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useProjectStore } from "@/entities/vdoc-project";
import { composerController } from "@/shared/ai";

import { documentLifecycle } from "./documentLifecycle";

/** 에이전트 문서 짓기 도구(`dc_*`, MCP 이름은 `mcp_vibefs_dc_new` 처럼 붙는다). */
const DC_TOOL = /(^|_)dc_(new|use|build)$/;
const DOC_ID = /(vdoc[-_][\w-]+)/;

function extractDocId(item: Extract<ComposerItem, { kind: "agent_tool" }>): string | null {
  const fromOutput = DOC_ID.exec(String(item.output ?? ""))?.[1];
  if (fromOutput) return fromOutput;
  const paramDoc = item.params && typeof item.params === "object" ? (item.params as Record<string, unknown>).doc : undefined;
  if (typeof paramDoc === "string") {
    const fromParam = DOC_ID.exec(paramDoc)?.[1];
    if (fromParam) return fromParam;
  }
  return null;
}

/**
 * Composer 대화에서 에이전트가 초안 문서를 만들거나(`dc_new`) · 지정 문서를 전환(`dc_use`) ·
 * 고치면(`dc_build`) 프로젝트/아웃라이너/캔버스를 즉시 맞추고 진행 중인 대화를 그 문서 키로 잇는다.
 */
export function registerAgentDraftSync(): () => void {
  const seen = new Set<string>();
  const { openDocument } = documentLifecycle();
  let syncQueue: Promise<void> = Promise.resolve();
  let lastComposedDocId: string | null = null;

  return composerController.subscribe(() => {
    for (const item of composerController.getState().items) {
      if (item.kind !== "agent_tool" || item.state !== "done" || seen.has(item.id)) continue;
      const match = DC_TOOL.exec(String(item.name || ""));
      if (!match) continue;
      seen.add(item.id);

      const action = match[2] as "new" | "use" | "build";
      const docId = extractDocId(item) ?? (action === "build" ? (lastComposedDocId || useStudioDocumentStore.getState().activeDocId || null) : null);
      if (!docId) continue;
      lastComposedDocId = docId;

      const projectId = useProjectStore.getState().activeProjectId;
      const docState = useStudioDocumentStore.getState();
      // 새 문서 / 다른 문서로 초점이 바뀔 때는 전환 전에 대화 키를 옮겨 진행 중 답변이 지워지지 않게 한다
      if ((action === "new" || action === "use" || docState.activeDocId !== docId) && projectId) {
        composerController.transferConversation(`${projectId}:${docId}`);
      }

      syncQueue = syncQueue
        .then(async () => {
          const docs = useStudioDocumentStore.getState();
          const alreadyLoaded = docs.docs.some((d) => d.docId === docId);
          if (action === "new" || !alreadyLoaded) {
            await openDocument(docId);
            if (useStudioDocumentStore.getState().activeDocId !== docId) {
              useStudioDocumentStore.getState().setActiveDocId(docId);
            }
            return;
          }
          if (action === "build") {
            await docs.reloadDoc(docId);
          }
          if (useStudioDocumentStore.getState().activeDocId !== docId) {
            useStudioDocumentStore.getState().setActiveDocId(docId);
          }
        })
        .catch(() => {
          /* 개별 동기화 실패는 다음 도구 호출·수동 새로고침에서 복구 가능 */
        });
    }
  });
}

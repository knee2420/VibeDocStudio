import type { WorkspaceTool } from "@vibe/ai-kernel";
import {
  getBlockSlotIds,
  getSlotBackdata,
  htmlToSummary,
  type StagedAiChange,
  type VDocDocument,
} from "@vibe/vdoc-schema";

import { useAiStagingStore } from "@/entities/ai-staging";
import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceLayoutStore, type RightPanelTab } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { htmlToPlain, newId, revealCanvasElement, scrollToCanvasPage } from "@/shared/lib";

import { referenceDocs } from "./referenceDocs";

function activeDoc(): VDocDocument {
  const doc = selectActiveDocument(useStudioDocumentStore.getState());
  if (!doc) throw new Error("열린 문서가 없습니다.");
  return doc;
}

function requireSlot(doc: VDocDocument, slotId: unknown) {
  if (typeof slotId !== "string" || !slotId) throw new Error("slotId 가 필요합니다.");
  const slot = doc.slots[slotId];
  if (!slot) throw new Error(`슬롯을 찾을 수 없습니다: ${slotId}`);
  return slot;
}

const slotIdSchema = {
  type: "object",
  properties: { slotId: { type: "string", description: "슬롯 id (document.getOutline 에서 확인)" } },
  required: ["slotId"],
};

/**
 * 워크스페이스 기본 도구 묶음. 새 위젯 · 기능은 같은 모양의 도구를 자기 feature 에서 등록하면 된다.
 * risk: read(읽기) · ui(화면 이동/선택) · stage(Staged 변경안 제출) · write(직접 변경 — 항상 확인)
 */
export const WORKSPACE_TOOLS: WorkspaceTool<any>[] = [
  {
    name: "workspace.getState",
    description: "현재 워크스페이스 상태: 프로젝트, 열린 문서/페이지, 작업 단계(phase), 선택한 슬롯/블록, 열린 참조 문서, Staged 대기 건수",
    risk: "read",
    inputSchema: { type: "object", properties: {} },
    describe: () => "워크스페이스 상태 읽기",
    run: () => {
      const docState = useStudioDocumentStore.getState();
      const doc = selectActiveDocument(docState);
      const selection = useSlotSelectionStore.getState();
      const session = useWorkspaceSessionStore.getState();
      const project = selectActiveProject(useProjectStore.getState());
      return {
        project: project ? { projectId: project.projectId, title: project.title } : null,
        document: doc ? { docId: doc.docId, title: doc.title, status: doc.status, pageCount: doc.pages.length } : null,
        activePageId: docState.activePageId,
        phase: session.currentPhase,
        selectedSlot: selection.selectedSlotId
          ? { slotId: selection.selectedSlotId, label: doc?.slots[selection.selectedSlotId]?.label ?? null }
          : null,
        selectedBlockId: selection.selectedBlockId,
        openReferenceDocIds: session.openReferenceDocIds,
        stagedCount: useAiStagingStore.getState().queue.length,
      };
    },
  },
  {
    name: "document.getOutline",
    description:
      "열린 문서의 구조를 한 줄씩: `pageId > blockId(kind) > slotId [역할/잠금] 라벨 — 본문 앞부분`. 기본은 편집 가능한 슬롯만 (고정 문구 제외). 슬롯 id 를 찾을 때 먼저 부른다",
    risk: "read",
    inputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "특정 페이지만 (생략 시 전체)" },
        includeBoilerplate: { type: "boolean", description: "고정 문구 · 잠긴 슬롯도 포함" },
      },
    },
    describe: (args: { pageId?: string }) => (args.pageId ? `페이지 ${args.pageId} 구조 읽기` : "문서 구조 읽기"),
    run: (args: { pageId?: string; includeBoilerplate?: boolean }) => {
      const doc = activeDoc();
      const pages = args.pageId ? doc.pages.filter((p) => p.pageId === args.pageId) : doc.pages;
      const lines: string[] = [`${doc.title} (docId=${doc.docId}, ${doc.pages.length}p)`];
      let hidden = 0;
      for (const page of pages) {
        lines.push(`# ${page.pageId} ${page.pageLabel}`);
        for (const block of page.blocks) {
          const slots = getBlockSlotIds(block).map((id) => doc.slots[id]).filter(Boolean);
          const shown = slots.filter((slot) => args.includeBoilerplate || (slot.role !== "boilerplate" && !slot.constraints?.locked));
          hidden += slots.length - shown.length;
          if (shown.length === 0) continue;
          lines.push(`- ${block.blockId} (${block.kind})`);
          for (const slot of shown) {
            const flags = [slot.role !== "editable-slot" ? slot.role : "", slot.constraints?.locked ? "locked" : ""].filter(Boolean).join(",");
            lines.push(`  - ${slot.slotId}${flags ? ` [${flags}]` : ""} ${slot.label} — ${htmlToPlain(slot.content, 50)}`);
          }
        }
      }
      if (hidden) lines.push(`(고정 문구 · 잠긴 슬롯 ${hidden}개 생략 — includeBoilerplate=true 로 포함)`);
      return lines.join("\n");
    },
  },
  {
    name: "slot.read",
    description: "슬롯 하나의 전체 본문(HTML · 평문), 제약(줄 수 · 톤 · 잠금), 연결된 백데이터 원문",
    risk: "read",
    inputSchema: slotIdSchema,
    describe: (args: { slotId?: string }) => {
      const label = selectActiveDocument(useStudioDocumentStore.getState())?.slots[args.slotId ?? ""]?.label;
      return `슬롯 '${label ?? args.slotId}' 읽기`;
    },
    run: (args: { slotId: string }) => {
      const doc = activeDoc();
      const slot = requireSlot(doc, args.slotId);
      return {
        slotId: slot.slotId,
        label: slot.label,
        role: slot.role,
        html: slot.content,
        text: htmlToPlain(slot.content),
        constraints: slot.constraints ?? {},
        backdata: getSlotBackdata(doc, slot).map((c) => ({ chunkId: c.chunkId, sourceTitle: c.sourceTitle, excerpt: c.excerpt })),
      };
    },
  },
  {
    name: "slot.proposeContent",
    description:
      "슬롯의 새 본문을 변경안으로 제출한다 (바로 반영되지 않고 Staged 대기열에 올라가 사용자가 승인). html 은 <p>, <ul>, <li>, <strong>, <em> 만 사용",
    risk: "stage",
    inputSchema: {
      type: "object",
      properties: {
        slotId: { type: "string" },
        html: { type: "string", description: "새 본문 HTML 조각" },
        reason: { type: "string", description: "변경 이유 한 줄" },
      },
      required: ["slotId", "html"],
    },
    describe: (args: { slotId?: string; reason?: string }) => {
      const label = selectActiveDocument(useStudioDocumentStore.getState())?.slots[args.slotId ?? ""]?.label;
      return `슬롯 '${label ?? args.slotId}' 변경안 제출${args.reason ? ` — ${args.reason}` : ""}`;
    },
    run: (args: { slotId: string; html: string; reason?: string }) => {
      const doc = activeDoc();
      const slot = requireSlot(doc, args.slotId);
      if (slot.constraints?.locked) throw new Error(`잠긴 슬롯입니다: ${slot.label}`);
      if (slot.role === "boilerplate") throw new Error(`고정 문구 슬롯은 바꿀 수 없습니다: ${slot.label}`);
      if (typeof args.html !== "string" || !args.html.trim()) throw new Error("html 이 비어 있습니다.");
      const change: StagedAiChange = {
        diffId: newId("stg-composer"),
        phase: "drafting",
        targetKind: "slot-html",
        targetId: slot.slotId,
        title: `[AI Composer] ${slot.label}${args.reason ? ` — ${args.reason}` : ""}`,
        beforeSummary: htmlToSummary(slot.content, 80) || "(빈 슬롯)",
        afterSummary: htmlToSummary(args.html, 110),
        payload: { slotId: slot.slotId, html: args.html },
        sourceReferenceIds: slot.backDataRefs,
      };
      useAiStagingStore.getState().enqueue([change]);
      return { staged: true, diffId: change.diffId, note: "Staged 대기열에 올렸습니다. 사용자가 승인하면 반영됩니다." };
    },
  },
  {
    name: "canvas.selectSlot",
    description: "캔버스에서 슬롯을 선택하고 화면을 그 위치로 스크롤해 강조한다 (사용자에게 위치를 보여줄 때)",
    risk: "ui",
    inputSchema: slotIdSchema,
    describe: (args: { slotId?: string }) => `슬롯 ${args.slotId} 로 이동`,
    run: (args: { slotId: string }) => {
      const doc = activeDoc();
      const slot = requireSlot(doc, args.slotId);
      const page = doc.pages.find((p) => p.blocks.some((b) => getBlockSlotIds(b).includes(slot.slotId)));
      if (page && page.pageId !== useStudioDocumentStore.getState().activePageId) {
        useStudioDocumentStore.getState().setActivePageId(page.pageId);
        scrollToCanvasPage(page.pageId);
      }
      useSlotSelectionStore.getState().setSelectedSlotId(slot.slotId);
      revealCanvasElement({ slotId: slot.slotId });
      return { selected: slot.slotId, pageId: page?.pageId ?? null };
    },
  },
  {
    name: "backdata.list",
    description: "문서에 등록된 백데이터 조각 목록 (chunkId, 출처, 요약). slotId 를 주면 그 슬롯에 연결된 것만",
    risk: "read",
    inputSchema: { type: "object", properties: { slotId: { type: "string" } } },
    describe: () => "백데이터 목록",
    run: (args: { slotId?: string }) => {
      const doc = activeDoc();
      const chunks = args.slotId ? getSlotBackdata(doc, requireSlot(doc, args.slotId)) : Object.values(doc.backdata);
      return chunks.map((c) => ({ chunkId: c.chunkId, sourceTitle: c.sourceTitle, sourceType: c.sourceType, excerpt: c.excerpt.slice(0, 400) }));
    },
  },
  {
    name: "references.list",
    description: "참조 레이어의 참조 문서들 (docId, 제목, 페이지 수, 분할보기로 열려 있는지)",
    risk: "read",
    inputSchema: { type: "object", properties: {} },
    describe: () => "참조 문서 목록",
    run: () => referenceDocs(),
  },
  {
    name: "references.read",
    description: "참조 문서의 본문 텍스트 (슬롯별 '[라벨] 내용'). 긴 문서는 maxChars 까지만",
    risk: "read",
    inputSchema: {
      type: "object",
      properties: { docId: { type: "string" }, maxChars: { type: "number", description: "기본 8000" } },
      required: ["docId"],
    },
    describe: (args: { docId?: string }) => `참조 문서 ${args.docId} 읽기`,
    run: (args: { docId: string; maxChars?: number }) => {
      const d = useStudioDocumentStore.getState().docs.find((x) => x.docId === args.docId);
      if (!d) throw new Error(`불러온 참조 문서가 아닙니다: ${args.docId}`);
      const text = Object.values(d.slots)
        .map((slot) => `[${slot.label}] ${htmlToPlain(slot.content)}`)
        .filter((line) => line.length > 4)
        .join("\n");
      const limit = Math.max(500, Math.min(args.maxChars ?? 8000, 30000));
      return { docId: d.docId, title: d.title, text: text.slice(0, limit), truncated: text.length > limit };
    },
  },
  {
    name: "references.open",
    description: "참조 문서를 캔버스 옆 분할보기(Split View)로 연다 — 사용자에게 근거 문서를 나란히 보여줄 때",
    risk: "ui",
    inputSchema: { type: "object", properties: { docId: { type: "string" } }, required: ["docId"] },
    describe: (args: { docId?: string }) => `참조 ${args.docId} 분할보기로 열기`,
    run: (args: { docId: string }) => {
      if (!referenceDocs().some((r) => r.docId === args.docId)) throw new Error(`참조 레이어에 없는 문서입니다: ${args.docId}`);
      useWorkspaceSessionStore.getState().openReferenceDoc(args.docId);
      return { opened: args.docId };
    },
  },
  {
    name: "staging.list",
    description: "Staged 대기열에 쌓인 AI 변경안 목록 (아직 승인 전)",
    risk: "read",
    inputSchema: { type: "object", properties: {} },
    describe: () => "Staged 변경안 목록",
    run: () =>
      useAiStagingStore.getState().queue.map((c) => ({
        diffId: c.diffId,
        targetKind: c.targetKind,
        targetId: c.targetId,
        title: c.title,
        after: c.afterSummary,
      })),
  },
  {
    name: "layout.openPanel",
    description: "화면 패널을 연다: explorer(아웃라이너), source-control(Staged 검토), inspector(슬롯 속성), blockbox(블록 추가)",
    risk: "ui",
    inputSchema: {
      type: "object",
      properties: { panel: { type: "string", enum: ["explorer", "source-control", "inspector", "blockbox"] } },
      required: ["panel"],
    },
    describe: (args: { panel?: string }) => `${args.panel} 패널 열기`,
    run: (args: { panel: string }) => {
      const layout = useWorkspaceLayoutStore.getState();
      if (args.panel === "explorer" || args.panel === "source-control") layout.setActiveActivityTab(args.panel);
      else if (args.panel === "inspector" || args.panel === "blockbox") {
        // Composer 가 자기 패널을 가리지 않도록, 왼쪽 패널 요청만 즉시 따르고 오른쪽 탭은 사용자가 고른다.
        return { opened: false, note: `오른쪽 '${args.panel as RightPanelTab}' 탭은 Composer 와 같은 자리라 사용자에게 안내만 한다.` };
      } else throw new Error(`알 수 없는 패널: ${args.panel}`);
      return { opened: args.panel };
    },
  },
];

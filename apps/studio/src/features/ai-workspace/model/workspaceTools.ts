import type { ToolRunContext, WorkspaceTool } from "@vibe/ai-kernel";
import {
  findBlock,
  getBlockKind,
  getBlockSlotIds,
  fillProgress,
  flattenResourceItems,
  getCheckedResourceItems,
  getSlotBackdata,
  htmlToSummary,
  slotFillState,
  type EvidenceLocator,
  type SlotFillState,
  type StagedAiChange,
  type StagedEvidence,
  type VDocDocument,
  validateBlockProps,
} from "@vibe/vdoc-schema";

import { scopeAllowsPage, scopeAllowsSlot, toolScope } from "@/entities/ai-scope";
import { buildSlotHtmlChange, stagedSlotIds, useAiStagingStore } from "@/entities/ai-staging";
import { resolveSlotEvidence } from "@/entities/evidence";
import { useResourceStore } from "@/entities/resource";
import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceLayoutStore, type RightPanelTab } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { env } from "@/shared/config";
import { htmlToPlain, newId, revealCanvasElement, scrollToCanvasPage } from "@/shared/lib";


import { referenceDocs } from "./referenceDocs";

/** RM 에서 체크한 자료의 발췌 섹터 → 근거 위치 (inherited). */
function rmPinnedSectors(limit = 6): EvidenceLocator[] {
  const out: EvidenceLocator[] = [];
  for (const it of getCheckedResourceItems(useResourceStore.getState().items)) {
    for (const s of it.sectors ?? []) {
      if (!s.textSnippet?.trim()) continue;
      out.push({ kind: "sector", refId: s.sectorId, label: s.title || s.label || it.title, resourceId: it.id, sourcePath: it.pathOrUrl, page: s.page ?? null, bbox: s.bbox ?? null, excerpt: s.textSnippet });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

const EVIDENCE_KINDS = new Set(["backdata", "resource", "sector", "ref-region", "kcard"]);

/**
 * 모델이 변경안과 함께 넘긴 근거 → 변경안 근거 (승인하면 슬롯 근거 링크가 된다).
 * 형식: [{ citationId?: "1", kind: "kcard", deckId, cardId, label?, lines?, page? } | { kind: "backdata", chunkId } …]
 */
function evidenceArg(raw: unknown): StagedEvidence[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: StagedEvidence[] = [];
  for (const item of raw as Record<string, unknown>[]) {
    if (!item || typeof item !== "object") continue;
    const kind = String(item.kind ?? (item.cardId ? "kcard" : item.chunkId ? "backdata" : ""));
    if (!EVIDENCE_KINDS.has(kind)) continue;
    const refId = String(
      item.refId ?? (item.deckId && item.cardId ? `${item.deckId}:${item.cardId}` : item.chunkId ?? item.resourceId ?? item.id ?? "")
    );
    if (!refId) continue;
    const lines = Array.isArray(item.lines) && item.lines.length === 2 ? (item.lines.map(Number) as [number, number]) : undefined;
    out.push({
      citationId: item.citationId != null ? String(item.citationId) : undefined,
      locator: {
        kind: kind as StagedEvidence["locator"]["kind"],
        refId,
        label: String(item.label ?? refId),
        deckId: item.deckId ? String(item.deckId) : undefined,
        cardId: item.cardId ? String(item.cardId) : undefined,
        resourceId: item.resourceId ? String(item.resourceId) : undefined,
        sourcePath: item.source ? String(item.source) : undefined,
        page: item.page != null ? Number(item.page) : undefined,
        lines,
      },
    });
  }
  return out.length ? out : undefined;
}

const EVIDENCE_SCHEMA = {
  type: "array",
  description:
    "이 내용의 근거 [{citationId, kind: kcard|backdata|resource|sector|ref-region, deckId, cardId, chunkId, label, lines}] — 본문 인용 표식 <sup data-cite=\"citationId\"></sup> 과 짝을 맞춘다",
};

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
    run: (_args: unknown, ctx?: ToolRunContext) => {
      const docState = useStudioDocumentStore.getState();
      const doc = selectActiveDocument(docState);
      const scope = doc ? toolScope(doc, ctx) : null;
      const selection = useSlotSelectionStore.getState();
      const session = useWorkspaceSessionStore.getState();
      const project = selectActiveProject(useProjectStore.getState());
      return {
        project: project ? { projectId: project.projectId, title: project.title } : null,
        // 범위가 좁으면 문서 제목(다른 페이지 이름이 섞여 있을 수 있다) 대신 범위만 알린다
        document: doc
          ? scope
            ? { docId: doc.docId, scope: scope.label, pageIds: [...(scope.pageIds ?? [])] }
            : { docId: doc.docId, title: doc.title, status: doc.status, pageCount: doc.pages.length }
          : null,
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
    run: (args: { pageId?: string; includeBoilerplate?: boolean }, ctx?: ToolRunContext) => {
      const doc = activeDoc();
      const scope = toolScope(doc, ctx);
      if (scope && args.pageId && !scopeAllowsPage(doc, scope, args.pageId)) {
        throw new Error(`범위 밖 페이지입니다: ${args.pageId} — 지금 범위는 "${scope.label}"`);
      }
      const pages = (args.pageId ? doc.pages.filter((p) => p.pageId === args.pageId) : doc.pages).filter((p) => scopeAllowsPage(doc, scope, p.pageId));
      const lines: string[] = [
        scope ? `범위: ${scope.label} (docId=${doc.docId}) — 범위 밖 페이지 · 칸은 보이지 않는다` : `${doc.title} (docId=${doc.docId}, ${doc.pages.length}p)`,
      ];
      let hidden = 0;
      for (const page of pages) {
        lines.push(`# ${page.pageId} ${page.pageLabel}`);
        for (const block of page.blocks) {
          const slots = getBlockSlotIds(block)
            .map((id) => doc.slots[id])
            .filter((slot) => Boolean(slot) && scopeAllowsSlot(doc, scope, slot.slotId));
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
        html: { type: "string", description: "새 본문 HTML 조각 (근거가 있는 문장 끝에 <sup data-cite=\"1\"></sup>)" },
        reason: { type: "string", description: "변경 이유 한 줄" },
        evidence: EVIDENCE_SCHEMA,
      },
      required: ["slotId", "html"],
    },
    describe: (args: { slotId?: string; reason?: string }) => {
      const label = selectActiveDocument(useStudioDocumentStore.getState())?.slots[args.slotId ?? ""]?.label;
      return `슬롯 '${label ?? args.slotId}' 변경안 제출${args.reason ? ` — ${args.reason}` : ""}`;
    },
    run: (args: { slotId: string; html: string; reason?: string; evidence?: unknown }) => {
      const doc = activeDoc();
      const slot = requireSlot(doc, args.slotId);
      if (slot.constraints?.locked) throw new Error(`잠긴 슬롯입니다: ${slot.label}`);
      if (slot.role === "boilerplate") throw new Error(`고정 문구 슬롯은 바꿀 수 없습니다: ${slot.label}`);
      if (typeof args.html !== "string" || !args.html.trim()) throw new Error("html 이 비어 있습니다.");
      const change: StagedAiChange = buildSlotHtmlChange(doc, slot, args.html, {
        source: "AI Composer",
        reason: args.reason,
        idPrefix: "stg-composer",
        harnessId: "composer",
        evidence: evidenceArg(args.evidence),
      });
      useAiStagingStore.getState().enqueue([change]);
      return { staged: true, diffId: change.diffId, note: "Staged 대기열에 올렸습니다. 사용자가 승인하면 반영됩니다." };
    },
  },
  {
    name: "slots.proposeBatch",
    description:
      "여러 슬롯(표 셀 · 그리드 칸 · 섹션)의 새 본문을 한 번에 변경안으로 제출한다. 블록 하나를 채우거나 고칠 때 slot.proposeContent 를 여러 번 부르지 말고 이것을 쓴다. 잠긴 · 고정 문구 슬롯은 건너뛴다",
    risk: "stage",
    inputSchema: {
      type: "object",
      properties: {
        changes: { type: "array", description: "[{slotId, html, evidence?}] — html 은 <p>, <ul>, <li>, <strong>, <em>, 인용 <sup data-cite> 만" },
        reason: { type: "string", description: "변경 이유 한 줄" },
      },
      required: ["changes"],
    },
    describe: (args: { changes?: unknown[]; reason?: string }) =>
      `슬롯 ${Array.isArray(args.changes) ? args.changes.length : 0}개 변경안 제출${args.reason ? ` — ${args.reason}` : ""}`,
    run: (args: { changes: { slotId: string; html: string; evidence?: unknown }[]; reason?: string }) => {
      const doc = activeDoc();
      if (!Array.isArray(args.changes) || args.changes.length === 0) throw new Error("changes 가 비어 있습니다.");
      const staged: StagedAiChange[] = [];
      const skipped: { slotId: string; why: string }[] = [];
      for (const change of args.changes) {
        const slot = doc.slots[change?.slotId];
        if (!slot) skipped.push({ slotId: String(change?.slotId), why: "없는 슬롯" });
        else if (slot.constraints?.locked) skipped.push({ slotId: slot.slotId, why: "잠김" });
        else if (slot.role === "boilerplate") skipped.push({ slotId: slot.slotId, why: "고정 문구" });
        else if (typeof change.html !== "string" || !change.html.trim()) skipped.push({ slotId: slot.slotId, why: "빈 html" });
        else if (change.html.trim() === slot.content.trim()) skipped.push({ slotId: slot.slotId, why: "변경 없음" });
        else
          staged.push(
            buildSlotHtmlChange(doc, slot, change.html, {
              source: "AI Composer",
              reason: args.reason,
              idPrefix: "stg-composer",
              harnessId: "composer",
              evidence: evidenceArg(change.evidence),
            })
          );
      }
      if (staged.length) useAiStagingStore.getState().enqueue(staged);
      return {
        staged: staged.length,
        diffIds: staged.map((c) => c.diffId),
        skipped,
        note: staged.length ? `${staged.length}건을 Staged 대기열에 올렸습니다. 사용자가 한꺼번에 승인 · 거절할 수 있습니다.` : "올린 변경안이 없습니다.",
      };
    },
  },
  {
    name: "blocks.proposeProps",
    description:
      "슬롯 밖 블록 속성(이미지 대체 텍스트 · 정렬 · 너비, 담당자 등)의 변경안을 제출한다. 바꿀 수 있는 속성은 블록 종류마다 다르며 블록 첨부 내용의 '바꿀 수 있는 블록 속성' 에 나온다",
    risk: "stage",
    inputSchema: {
      type: "object",
      properties: {
        blockId: { type: "string" },
        props: { type: "object", description: "{속성: 새 값}" },
        reason: { type: "string", description: "변경 이유 한 줄" },
      },
      required: ["blockId", "props"],
    },
    describe: (args: { blockId?: string; props?: Record<string, unknown> }) =>
      `블록 ${args.blockId} 속성 변경안 (${Object.keys(args.props ?? {}).join(", ")})`,
    run: (args: { blockId: string; props: Record<string, unknown>; reason?: string }) => {
      const doc = activeDoc();
      const loc = findBlock(doc, args.blockId);
      if (!loc) throw new Error(`블록을 찾을 수 없습니다: ${args.blockId}`);
      if (loc.block.locked) throw new Error(`잠긴 블록입니다: ${loc.block.title}`);
      const { ok, rejected } = validateBlockProps(loc.block, args.props);
      const allowed = Object.keys(getBlockKind(loc.block.kind).ai?.editableProps ?? {});
      if (Object.keys(ok).length === 0) {
        throw new Error(`바꿀 수 있는 속성이 없습니다. 이 블록에서 허용: ${allowed.join(", ") || "(없음)"} · 거부: ${rejected.map((r) => `${r.key}(${r.why})`).join(", ")}`);
      }
      const before = Object.keys(ok)
        .map((k) => `${k}=${String((loc.block as unknown as Record<string, unknown>)[k] ?? "-")}`)
        .join(", ");
      const change: StagedAiChange = {
        diffId: newId("stg-composer"),
        phase: "drafting",
        targetKind: "block-props",
        targetId: loc.block.blockId,
        title: `[AI Composer] ${loc.block.title || getBlockKind(loc.block.kind).label} 속성${args.reason ? ` — ${args.reason}` : ""}`,
        beforeSummary: before,
        afterSummary: Object.entries(ok).map(([k, v]) => `${k}=${String(v)}`).join(", "),
        payload: { blockId: loc.block.blockId, props: ok },
        sourceReferenceIds: [],
        docId: doc.docId,
        harnessId: "composer",
        createdAt: new Date().toISOString(),
      };
      useAiStagingStore.getState().enqueue([change]);
      return { staged: true, diffId: change.diffId, applied: ok, rejected };
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
    name: "slots.listByState",
    description:
      "범위 안 칸들의 채움 상태 목록 (빈 칸 지도). scope: slot|block|page|document, state: empty|ai-draft|staged|filled|verified (생략하면 채울 대상 전부). 일괄 채우기 · 진행 확인에 쓴다",
    risk: "read",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["block", "page", "document"] },
        id: { type: "string", description: "scope 가 block · page 일 때 그 id (생략하면 현재 선택 · 현재 페이지)" },
        state: { type: "string", enum: ["empty", "ai-draft", "staged", "filled", "verified"] },
      },
    },
    describe: (args: { scope?: string; state?: string }) => `칸 상태 목록 (${args.scope ?? "page"}${args.state ? ` · ${args.state}` : ""})`,
    run: (args: { scope?: "block" | "page" | "document"; id?: string; state?: SlotFillState }, ctx?: ToolRunContext) => {
      const doc = activeDoc();
      const range = toolScope(doc, ctx);
      const scope = args.scope ?? "page";
      const staged = stagedSlotIds(useAiStagingStore.getState().queue, doc.docId);
      let ids: string[];
      if (scope === "document") ids = Object.keys(doc.slots);
      else if (scope === "block") {
        const blockId = args.id ?? useSlotSelectionStore.getState().selectedBlockId ?? "";
        const loc = findBlock(doc, blockId);
        if (!loc) throw new Error(`블록을 찾을 수 없습니다: ${blockId}`);
        ids = getBlockSlotIds(loc.block);
      } else {
        const pageId = args.id ?? useStudioDocumentStore.getState().activePageId;
        const page = doc.pages.find((p) => p.pageId === pageId) ?? doc.pages[0];
        ids = (page?.blocks ?? []).flatMap((b) => getBlockSlotIds(b));
      }
      ids = ids.filter((id) => scopeAllowsSlot(doc, range, id));
      const rows = ids
        .map((id) => doc.slots[id])
        .filter(Boolean)
        .map((slot) => ({ slotId: slot.slotId, label: slot.label, state: slotFillState(slot, staged), maxLines: slot.constraints?.maxLines }))
        .filter((r) => r.state !== "fixed" && r.state !== "locked" && (!args.state || r.state === args.state));
      return { scope, count: rows.length, progress: fillProgress(ids.map((id) => doc.slots[id]).filter(Boolean), staged), slots: rows.slice(0, 120) };
    },
  },
  {
    name: "evidence.forSlot",
    description: "칸 하나의 근거 후보 (direct: 이미 연결 · inherited: 이웃 칸 근거 · RM 고정 자료 · 열린 참조 문서). 채우기 전에 무엇을 근거로 쓸지 확인한다",
    risk: "read",
    inputSchema: { type: "object", properties: { slotId: { type: "string" } }, required: ["slotId"] },
    describe: (args: { slotId?: string }) => `칸 ${args.slotId} 근거 후보`,
    run: (args: { slotId: string }) => {
      const doc = activeDoc();
      requireSlot(doc, args.slotId);
      return resolveSlotEvidence(doc, args.slotId, { pinned: rmPinnedSectors() }).map((c) => ({
        tier: c.tier,
        kind: c.locator.kind,
        refId: c.locator.refId,
        label: c.locator.label,
        source: c.locator.sourcePath,
        excerpt: (c.locator.excerpt ?? "").slice(0, 300),
      }));
    },
  },
  {
    name: "resources.list",
    description: "Resource Manager 의 고정(체크)된 원본 자료와 발췌 섹터 목록 (id · 제목 · 경로 · 섹터)",
    risk: "read",
    inputSchema: { type: "object", properties: {} },
    describe: () => "RM 자료 목록",
    run: () =>
      getCheckedResourceItems(useResourceStore.getState().items)
        .slice(0, 80)
        .map((it) => ({
          resourceId: it.id,
          title: it.title,
          path: it.pathOrUrl,
          type: it.type,
          sectors: (it.sectors ?? []).map((s) => ({ sectorId: s.sectorId, title: s.title || s.label, page: s.page, chars: s.textSnippet?.length ?? 0 })),
        })),
  },
  {
    name: "resources.read",
    description: "RM 자료 본문 읽기 — sectorId 면 그 발췌, resourceId 면 텍스트 원본(마크다운 · 텍스트)을 maxChars 까지",
    risk: "read",
    inputSchema: {
      type: "object",
      properties: { resourceId: { type: "string" }, sectorId: { type: "string" }, maxChars: { type: "number", description: "기본 6000" } },
    },
    describe: (args: { resourceId?: string; sectorId?: string }) => `RM 자료 읽기 ${args.sectorId ?? args.resourceId ?? ""}`,
    run: async (args: { resourceId?: string; sectorId?: string; maxChars?: number }) => {
      const items = flattenResourceItems(useResourceStore.getState().items);
      const limit = Math.max(500, Math.min(args.maxChars ?? 6000, 20000));
      if (args.sectorId) {
        for (const it of items) {
          const sector = (it.sectors ?? []).find((s) => s.sectorId === args.sectorId);
          if (sector) return { resourceId: it.id, sectorId: sector.sectorId, page: sector.page, text: sector.textSnippet.slice(0, limit) };
        }
        throw new Error(`섹터를 찾을 수 없습니다: ${args.sectorId}`);
      }
      const item = items.find((it) => it.id === args.resourceId);
      if (!item?.pathOrUrl) throw new Error(`자료를 찾을 수 없습니다: ${args.resourceId}`);
      if (!/\.(md|markdown|txt|mdx|csv|json|ya?ml)$/i.test(item.pathOrUrl)) {
        throw new Error("텍스트 원본만 읽을 수 있습니다 (PDF · 이미지는 섹터를 만들어 읽거나 지식 덱으로 색인하세요).");
      }
      const res = await fetch(`${env.apiBaseUrl}/api/resources/raw-file?path=${encodeURIComponent(item.pathOrUrl)}`);
      if (!res.ok) throw new Error(`원본을 읽지 못했습니다 (${res.status})`);
      const text = await res.text();
      return { resourceId: item.id, title: item.title, text: text.slice(0, limit), truncated: text.length > limit };
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

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

import { scopeAllowsPage, scopeAllowsSlot, scopeHidesPage, scopeHidesSlot, toolScope } from "@/entities/ai-scope";
import { buildSlotHtmlChange, stagedSlotIds, useAiStagingStore } from "@/entities/ai-staging";
import { resolveSlotEvidence } from "@/entities/evidence";
import { referenceApi, useReferenceStore } from "@/entities/reference-manager";
import { useResourceStore } from "@/entities/resource";
import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceLayoutStore, type RightPanelTab } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { clipText, htmlToPlain, newId, revealCanvasElement, scrollToCanvasPage } from "@/shared/lib";


import { boundReferences } from "./boundReferences";
import { clientTool } from "./clientToolSpecs";
import { revealReferenceViewer } from "./workspaceEntities";

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


/**
 * 워크스페이스 기본 도구 묶음. 새 위젯 · 기능은 같은 모양의 도구를 자기 feature 에서 등록하면 된다.
 * risk: read(읽기) · ui(화면 이동/선택) · stage(Staged 변경안 제출) · write(직접 변경 — 항상 확인)
 */
export const WORKSPACE_TOOLS: WorkspaceTool<any>[] = [
  {
    ...clientTool("workspace.getState"),
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
        openReferenceIds: session.openReferenceIds,
        stagedCount: useAiStagingStore.getState().queue.length,
      };
    },
  },
  {
    ...clientTool("document.getOutline"),
    describe: (args: { pageId?: string }) => (args.pageId ? `페이지 ${args.pageId} 구조 읽기` : "문서 구조 읽기"),
    run: (args: { pageId?: string; includeBoilerplate?: boolean }, ctx?: ToolRunContext) => {
      const doc = activeDoc();
      const scope = toolScope(doc, ctx);
      if (scope && args.pageId && scopeHidesPage(doc, scope, args.pageId)) {
        throw new Error(`사용자가 뺀 페이지입니다: ${args.pageId} — 읽지도 고치지도 않는다`);
      }
      // 고칠 범위 밖도 읽을 수 있게 보여 주고 [범위밖] 으로 표시한다 (사용자가 뺀 페이지만 숨김)
      const pages = (args.pageId ? doc.pages.filter((p) => p.pageId === args.pageId) : doc.pages).filter((p) => !scopeHidesPage(doc, scope, p.pageId));
      const lines: string[] = [
        scope
          ? `${doc.title} (docId=${doc.docId}) · 고칠 범위: ${scope.label} — 범위 밖은 [범위밖] (읽기만)`
          : `${doc.title} (docId=${doc.docId}, ${doc.pages.length}p)`,
      ];
      let hidden = 0;
      for (const page of pages) {
        lines.push(`# ${page.pageId} ${page.pageLabel}${scope && !scopeAllowsPage(doc, scope, page.pageId) ? " [범위밖]" : ""}`);
        for (const block of page.blocks) {
          const slots = getBlockSlotIds(block)
            .map((id) => doc.slots[id])
            .filter((slot) => Boolean(slot) && !scopeHidesSlot(doc, scope, slot.slotId));
          const shown = slots.filter((slot) => args.includeBoilerplate || (slot.role !== "boilerplate" && !slot.constraints?.locked));
          hidden += slots.length - shown.length;
          if (shown.length === 0) continue;
          lines.push(`- ${block.blockId} (${block.kind})`);
          for (const slot of shown) {
            const flags = [slot.role !== "editable-slot" ? slot.role : "", slot.constraints?.locked ? "locked" : ""].filter(Boolean).join(",");
            const outside = scope && !scopeAllowsSlot(doc, scope, slot.slotId) ? " [범위밖]" : "";
            lines.push(`  - ${slot.slotId}${flags ? ` [${flags}]` : ""}${outside} ${slot.label} — ${htmlToPlain(slot.content, 50)}`);
          }
        }
      }
      if (hidden) lines.push(`(고정 문구 · 잠긴 슬롯 ${hidden}개 생략 — includeBoilerplate=true 로 포함)`);
      return lines.join("\n");
    },
  },
  {
    ...clientTool("slot.read"),
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
    ...clientTool("slot.proposeContent"),
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
    ...clientTool("slots.proposeBatch"),
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
    ...clientTool("blocks.proposeProps"),
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
    ...clientTool("canvas.selectSlot"),
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
    ...clientTool("backdata.list"),
    describe: () => "백데이터 목록",
    run: (args: { slotId?: string }) => {
      const doc = activeDoc();
      const chunks = args.slotId ? getSlotBackdata(doc, requireSlot(doc, args.slotId)) : Object.values(doc.backdata);
      return chunks.map((c) => ({ chunkId: c.chunkId, sourceTitle: c.sourceTitle, sourceType: c.sourceType, excerpt: clipText(c.excerpt, 400) }));
    },
  },
  {
    ...clientTool("references.list"),
    describe: () => "레퍼런스 목록",
    run: () => boundReferences(),
  },
  {
    ...clientTool("references.read"),
    describe: (args: { refId?: string }) => `레퍼런스 ${args.refId} 읽기`,
    run: async (args: { refId: string; maxChars?: number }) => {
      if (!boundReferences().some((r) => r.refId === args.refId)) throw new Error(`이 프로젝트에 연결된 레퍼런스가 아닙니다: ${args.refId}`);
      const extraction = useReferenceStore.getState().extraction[args.refId] ?? (await referenceApi.extraction(args.refId));
      const text = extraction.blocks
        .map((b) => `[ref:${args.refId}#blk:${b.id} · ${b.kind} · p${b.page}] ${b.text}`)
        .join("\n");
      const limit = Math.max(500, Math.min(args.maxChars ?? 8000, 30000));
      return { refId: args.refId, text: clipText(text, limit), truncated: text.length > limit };
    },
  },
  {
    ...clientTool("references.open"),
    describe: (args: { refId?: string }) => `레퍼런스 ${args.refId} 분할보기로 열기`,
    run: (args: { refId: string }) => {
      if (!boundReferences().some((r) => r.refId === args.refId)) throw new Error(`이 프로젝트에 연결된 레퍼런스가 아닙니다: ${args.refId}`);
      revealReferenceViewer(args.refId);
      return { opened: args.refId };
    },
  },
  {
    ...clientTool("slots.listByState"),
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
    ...clientTool("evidence.forSlot"),
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
        excerpt: clipText(c.locator.excerpt ?? "", 300),
      }));
    },
  },
  {
    // 텍스트 원본은 리소스 작업 공간(agy read_file · vibefs)이 직접 읽는다. 이 도구는 사람이 RM 에서 만든
    // 발췌 섹터(PDF 쪽 영역 등 — 원본 파일로는 못 읽는 것)만 돌려준다.
    ...clientTool("resources.read"),
    describe: (args: { sectorId?: string }) => `RM 발췌 읽기 ${args.sectorId ?? ""}`,
    run: async (args: { sectorId?: string; maxChars?: number; resourceId?: string }) => {
      if (!args.sectorId) {
        throw new Error("sectorId 가 필요합니다. 텍스트 파일 원문은 read_file(Path, StartLine, EndLine) 로 읽으세요.");
      }
      const items = flattenResourceItems(useResourceStore.getState().items);
      const limit = Math.max(500, Math.min(args.maxChars ?? 6000, 20000));
      for (const it of items) {
        const sector = (it.sectors ?? []).find((s) => s.sectorId === args.sectorId);
        if (sector) return { resourceId: it.id, sectorId: sector.sectorId, page: sector.page, text: clipText(sector.textSnippet, limit) };
      }
      throw new Error(`섹터를 찾을 수 없습니다: ${args.sectorId}`);
    },
  },
  {
    ...clientTool("staging.list"),
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
    ...clientTool("layout.openPanel"),
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
  {
    ...clientTool("resource.cite"),
    describe: (args: { citations?: Array<{ label?: string; resourceId?: string; lines?: [number, number] }> }) =>
      `원천 근거 ${args?.citations?.length ?? 0}건 인용 (화면 하이라이트)`,
    run: (args: {
      citations?: Array<{
        resourceId: string;
        label?: string;
        lines: [number, number];
        snippet?: string;
      }>;
    }) => {
      const list = args.citations ?? [];
      const resourceStore = useResourceStore.getState();
      const allItems = flattenResourceItems(resourceStore.items);

      const resolved = list.map((c) => {
        const item = allItems.find(
          (it) =>
            it.id === c.resourceId ||
            it.title === c.resourceId ||
            (it.pathOrUrl && it.pathOrUrl.toLowerCase().includes(c.resourceId.toLowerCase()))
        );
        return {
          resourceId: item?.id ?? c.resourceId,
          title: c.label || item?.title || c.resourceId,
          pathOrUrl: item?.pathOrUrl ?? "",
          lines: c.lines,
          snippet: c.snippet ?? "",
        };
      });

      return {
        ok: true,
        count: resolved.length,
        citations: resolved,
      };
    },
  },
];

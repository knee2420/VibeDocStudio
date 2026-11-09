import type { AssistantEvent, HarnessRunPayload } from "@vibe/ai-kernel";
import {
  contentHash,
  getCheckedResourceItems,
  slotPlainText,
  type EvidenceLocator,
  type StagedAiChange,
  type StagedEvidence,
  type VDocDocument,
} from "@vibe/vdoc-schema";

import { buildSlotHtmlChange, useAiStagingStore } from "@/entities/ai-staging";
import { resolveSlotEvidence, slotTarget, type EvidenceCandidate } from "@/entities/evidence";
import { deckScopeRef, isDeckUsable, useKnowledgeDeckStore } from "@/entities/knowledge-deck";
import { useResourceStore } from "@/entities/resource";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { aiRuntime } from "@/shared/ai";
import { newId } from "@/shared/lib";

/** RM 에서 사람이 고정(체크)한 자료 중 근거로 쓸 수 있는 것 — 발췌 섹터 (본문이 있는 것만). */
export function pinnedEvidence(limit = 6): EvidenceLocator[] {
  const items = getCheckedResourceItems(useResourceStore.getState().items);
  const out: EvidenceLocator[] = [];
  for (const item of items) {
    for (const sector of item.sectors ?? []) {
      if (!sector.textSnippet?.trim()) continue;
      out.push({
        kind: "sector",
        refId: sector.sectorId,
        label: sector.title || sector.label || item.title,
        resourceId: item.id,
        sourcePath: item.pathOrUrl,
        page: sector.page ?? null,
        bbox: sector.bbox ?? null,
        excerpt: sector.textSnippet,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** 열어 둔 참조 문서(분할보기)의 본문 — inherited 근거. */
function openReferences(): { docId: string; label: string; text: string }[] {
  const ids = useWorkspaceSessionStore.getState().openReferenceIds;
  const docs = useStudioDocumentStore.getState().docs;
  return ids.flatMap((id) => {
    const d = docs.find((x) => x.docId === id);
    if (!d) return [];
    const text = Object.values(d.slots)
      .map((s) => `[${s.label}] ${slotPlainText(s.content)}`)
      .filter((t) => t.length > 6)
      .join("\n");
    return [{ docId: d.docId, label: d.title, text }];
  });
}

/** 하네스가 근거를 찾을 덱들 — 섹션을 골랐으면 그 섹션만 (`덱id#SEC-…`). */
export const usableDeckIds = () => useKnowledgeDeckStore.getState().decks.filter(isDeckUsable).map(deckScopeRef);

/** 화면에 그려진 칸의 너비 · 글꼴 크기 (줄 수 제약 → 글자 수 어림). */
export function measureSlot(slotId: string): { widthPx?: number; fontSizePx?: number } {
  if (typeof document === "undefined") return {};
  const el = document.querySelector<HTMLElement>(`[data-slot-id="${CSS.escape(slotId)}"]`);
  if (!el) return {};
  const width = el.getBoundingClientRect().width;
  const font = parseFloat(getComputedStyle(el.querySelector(".ProseMirror") ?? el).fontSize);
  return { widthPx: width || undefined, fontSizePx: Number.isFinite(font) ? font : undefined };
}

export function evidencePayload(cands: EvidenceCandidate[]): Record<string, unknown>[] {
  return cands.map((c) => ({ ...c.locator, tier: c.tier }));
}

interface HarnessOutcome {
  result: Extract<AssistantEvent, { type: "result" }> | null;
  error: string | null;
}

/** 하네스 한 번을 스트림으로 돌려 결과 이벤트를 모은다. */
export async function runHarnessOnce(payload: HarnessRunPayload, signal?: AbortSignal): Promise<HarnessOutcome> {
  let result: HarnessOutcome["result"] = null;
  let error: string | null = null;
  await aiRuntime.client.runHarness(
    payload,
    (event) => {
      if (event.type === "result") result = event;
      else if (event.type === "error") error = event.message;
    },
    signal
  );
  return { result, error };
}

function toStagedEvidence(raw: { citationId?: string; locator: Record<string, unknown> }[] | undefined): StagedEvidence[] {
  return (raw ?? []).map((e) => ({ citationId: e.citationId, locator: e.locator as unknown as EvidenceLocator }));
}

export interface FillSlotOptions {
  instruction?: string;
  /** 사용자가 집은 1순위 근거 ("이 자료로") */
  primary?: EvidenceLocator[];
  harnessId?: "fill.slot" | "ground.cite";
  docId?: string;
}

/** 대기열 실행 래퍼 — 리본 · Esc 중단이 같은 경로로 동작한다. */
async function asRun<T>(work: (runId: string, signal: AbortSignal) => Promise<T>): Promise<T | null> {
  const staging = useAiStagingStore.getState();
  if (staging.isRunning) return null;
  const runId = newId("run");
  const controller = new AbortController();
  staging.startRun(runId, () => controller.abort());
  try {
    return await work(runId, controller.signal);
  } catch (err) {
    if (!controller.signal.aborted) useAiStagingStore.getState().failRun(err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    useAiStagingStore.getState().finishRun(runId);
  }
}

function docFor(docId?: string): VDocDocument | undefined {
  const s = useStudioDocumentStore.getState();
  return docId ? s.docs.find((d) => d.docId === docId) : selectActiveDocument(s);
}

/**
 * `fill.slot` · `ground.cite` — 칸 하나: 근거 묶음(direct · inherited, 약하면 서버가 덱에서 suggested 추가) →
 * 단발 실행 → 인용 · 게이트 → Staged 변경안 (근거 · 경고를 싣고 대기열로, 캔버스 자리에서 diff 검토).
 */
export async function runFillSlot(slotId: string, opts: FillSlotOptions = {}): Promise<StagedAiChange | null> {
  return asRun(async (runId, signal) => {
    const doc = docFor(opts.docId);
    const slot = doc?.slots[slotId];
    if (!doc || !slot) throw new Error("채울 칸을 찾을 수 없습니다.");
    const harnessId = opts.harnessId ?? "fill.slot";
    const cands = resolveSlotEvidence(doc, slotId, { pinned: pinnedEvidence(), references: openReferences(), primary: opts.primary });
    const { result, error } = await runHarnessOnce(
      {
        harnessId,
        runId,
        instruction: opts.instruction,
        target: slotTarget(doc, slotId, measureSlot(slotId)),
        evidence: evidencePayload(cands),
        deckIds: usableDeckIds(),
      },
      signal
    );
    if (signal.aborted) return null;
    if (!result?.html) throw new Error(error ?? "하네스가 결과를 돌려주지 않았습니다.");
    const fresh = docFor(doc.docId)?.slots[slotId] ?? slot;
    const change = buildSlotHtmlChange(doc, { ...fresh, content: slot.content }, result.html, {
      source: harnessId === "ground.cite" ? "출처 달기" : "빈 칸 채우기",
      harnessId,
      runId,
      evidence: toStagedEvidence(result.evidence),
      warnings: result.warnings,
      idPrefix: "stg-fill",
    });
    useAiStagingStore.getState().enqueue([change]);
    return change;
  });
}

/** `fill.variable` — 문서 변수(`[회의.일자]` 칩) 값을 근거에서 찾아 변경안으로. */
export async function runFillVariables(docId?: string): Promise<StagedAiChange | null> {
  return asRun(async (runId, signal) => {
    const doc = docFor(docId);
    if (!doc) throw new Error("문서가 없습니다.");
    const empty = Object.entries(doc.variables ?? {}).filter(([, v]) => !String(v ?? "").trim());
    if (empty.length === 0) throw new Error("비어 있는 변수가 없습니다.");
    const evidence: EvidenceCandidate[] = [];
    const seen = new Set<string>();
    for (const slotId of Object.keys(doc.slots)) {
      for (const c of resolveSlotEvidence(doc, slotId, {})) {
        const key = `${c.locator.kind}:${c.locator.refId}`;
        if (!seen.has(key) && c.tier === "direct") {
          seen.add(key);
          evidence.push(c);
        }
      }
    }
    for (const loc of pinnedEvidence()) evidence.push({ locator: loc, tier: "inherited" });
    const { result, error } = await runHarnessOnce(
      {
        harnessId: "fill.variable",
        runId,
        target: { label: doc.title, variables: Object.fromEntries(empty) },
        evidence: evidencePayload(evidence.slice(0, 10)),
        deckIds: usableDeckIds(),
      },
      signal
    );
    if (signal.aborted) return null;
    const map = Object.fromEntries(
      Object.entries((result?.map ?? {}) as Record<string, unknown>).filter(([k, v]) => k in (doc.variables ?? {}) && typeof v === "string" && v.trim())
    ) as Record<string, string>;
    if (Object.keys(map).length === 0) throw new Error(error ?? "근거에서 변수 값을 찾지 못했습니다.");
    const change: StagedAiChange = {
      diffId: newId("stg-vars"),
      phase: "drafting",
      targetKind: "variables",
      targetId: doc.docId,
      title: `[변수 채우기] ${Object.keys(map).join(", ")}`,
      beforeSummary: Object.keys(map).map((k) => `${k}=${doc.variables[k] || "(빈 값)"}`).join(", "),
      afterSummary: Object.entries(map).map(([k, v]) => `${k}=${v}`).join(", "),
      payload: { variables: map },
      sourceReferenceIds: [],
      docId: doc.docId,
      baseHash: contentHash(JSON.stringify(doc.variables ?? {})),
      runId,
      harnessId: "fill.variable",
      createdAt: new Date().toISOString(),
      evidence: toStagedEvidence(result?.evidence),
      warnings: result?.warnings,
    };
    useAiStagingStore.getState().enqueue([change]);
    return change;
  });
}

/** `verify.slot` — 칸의 주장이 근거와 맞는지 확인한 결과 (텍스트 목록). 문서는 바꾸지 않는다. */
export async function runVerifySlot(slotId: string): Promise<{ text: string; evidence: number } | null> {
  return asRun(async (runId, signal) => {
    const doc = docFor();
    const slot = doc?.slots[slotId];
    if (!doc || !slot) throw new Error("확인할 칸을 찾을 수 없습니다.");
    const cands = resolveSlotEvidence(doc, slotId, { pinned: pinnedEvidence(), references: openReferences() });
    const { result, error } = await runHarnessOnce(
      { harnessId: "verify.slot", runId, target: slotTarget(doc, slotId), evidence: evidencePayload(cands), deckIds: usableDeckIds() },
      signal
    );
    if (signal.aborted) return null;
    if (!result) throw new Error(error ?? "확인 결과가 없습니다.");
    return { text: result.text ?? "", evidence: cands.length };
  });
}

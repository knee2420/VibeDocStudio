import {
  importPagesFromDocument,
  iterPageSlotIds,
  removePage,
  replacePageContent,
  type VDocDocument,
  type VDocSlot,
  type VProjectManifest,
} from "@vibe/vdoc-schema";

import { documentApi, useStudioDocumentStore } from "@/entities/vdoc-document";
import {
  PLAYGROUND_PROJECT_ID,
  projectApi,
  selectActiveProject,
  selectPlaygroundProject,
  useProjectStore,
} from "@/entities/vdoc-project";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useActiveDiffStore } from "@/features/document-diff";

const idSuffix = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 플레이그라운드 프로젝트가 없으면 만든다 (처음 쓸 때 한 번). */
async function ensurePlaygroundProject(): Promise<void> {
  if (selectPlaygroundProject(useProjectStore.getState())) return;
  const manifest: VProjectManifest = {
    projectId: PLAYGROUND_PROJECT_ID,
    title: "플레이그라운드",
    description: "프로젝트를 건드리지 않고 끄적이는 개인 안전지대",
    activePhase: "drafting",
    docIds: [],
    storylineNodes: [],
    provenanceLineage: [],
    updatedAt: new Date().toISOString(),
  };
  await projectApi.replace(manifest);
  await useProjectStore.getState().hydrate();
}

/** 왼쪽 패널이 열려 있으면 그 탭으로 (닫혀 있으면 굳이 열지 않는다). */
function showLeftTab(tab: "playground" | "explorer") {
  const layout = useWorkspaceLayoutStore.getState();
  if (layout.leftSidebarOpen && layout.activeActivityTab !== tab) layout.setActiveActivityTab(tab);
}

/** 서버 판으로 들이고 연다 (들이기가 활성 문서로 바꾼다). 초안의 트리는 플레이그라운드 탭에서 본다. */
async function adoptAndOpen(doc: VDocDocument): Promise<VDocDocument> {
  useStudioDocumentStore.getState().adoptDocument(doc);
  await useProjectStore.getState().hydrate();
  useStudioDocumentStore.getState().setActiveDocId(doc.docId);
  showLeftTab("playground");
  return doc;
}

const today = () => {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * 원본 기록을 남기고, 바뀐 곳 표시의 기준을 "복사한 순간"으로 맞춘다
 * (원본에 남아 있던 수정됨 표시가 사본 전체를 주황색으로 칠하지 않게).
 */
const withCopiedFrom = (doc: VDocDocument, source: VDocDocument, pageIds?: string[]): VDocDocument => {
  const slots: Record<string, VDocSlot> = {};
  for (const [id, slot] of Object.entries(doc.slots)) slots[id] = { ...slot, isEdited: false, originalContent: slot.content };
  return {
    ...doc,
    slots,
    origin: {
      ...(doc.origin ?? { createdBy: "user" }),
      copiedFrom: { docId: source.docId, title: source.title, pageIds, copiedAt: new Date().toISOString() },
    },
  };
};

/**
 * 플레이그라운드 작업 — 빈 초안 · 메모 만들기, 프로젝트 문서(또는 한 쪽)를 복사해 오기, 지우기.
 * 문서는 서버의 플레이그라운드 프로젝트에 들어가므로 작업 프로젝트의 아웃라인 · AI 맥락과 섞이지 않는다.
 */
export const playgroundActions = {
  /** 빈 초안 (A4 문서) 또는 메모 (높이가 늘어나는 한 단). */
  createDraft: async (kind: "draft" | "memo"): Promise<VDocDocument> => {
    await ensurePlaygroundProject();
    const doc = await documentApi.create({
      projectId: PLAYGROUND_PROJECT_ID,
      title: kind === "memo" ? `메모 ${today()}` : `새 초안 ${today()}`,
      surface: kind === "memo" ? "scroll" : "paged",
      genre: "document",
    });
    return adoptAndOpen(doc);
  },

  /** 프로젝트 문서 전체를 복사해 온다 (원본은 그대로). */
  copyDocument: async (sourceDocId: string, opts: { title?: string } = {}): Promise<VDocDocument | null> => {
    const store = useStudioDocumentStore.getState();
    const source = store.docs.find((d) => d.docId === sourceDocId);
    if (!source) return null;
    await ensurePlaygroundProject();
    await store.flushSave(sourceDocId); // 지금 보이는 판을 복사하도록 기다리던 저장을 먼저 보낸다
    const dup = await documentApi.duplicate(sourceDocId, { projectId: PLAYGROUND_PROJECT_ID, title: opts.title ?? `${source.title} · 실험` });
    const saved = await documentApi.save(withCopiedFrom(dup, source), { baseRevision: dup.revision });
    return adoptAndOpen(saved);
  },

  /** 프로젝트 문서의 한 쪽만 복사해 와서 새 초안으로 만든다. */
  copyPage: async (sourceDocId: string, pageId: string, opts: { title?: string } = {}): Promise<VDocDocument | null> => {
    const source = useStudioDocumentStore.getState().docs.find((d) => d.docId === sourceDocId);
    const page = source?.pages.find((p) => p.pageId === pageId);
    if (!source || !page) return null;
    await ensurePlaygroundProject();
    const blank = await documentApi.create({
      projectId: PLAYGROUND_PROJECT_ID,
      title: opts.title ?? `${page.pageLabel} · 실험`,
      surface: source.surface?.kind ?? "paged",
      genre: source.genre ?? "document",
    });
    // 쪽 · 블록 · 칸 id 를 원본 그대로 둔다 — 채택할 때 같은 자리를 그대로 바꿔, 변경 기록에 진짜 고친 곳만 남게.
    const slotIds = [...iterPageSlotIds(page), page.headerSlotId, page.footerSlotId].filter((id): id is string => Boolean(id));
    const slots = Object.fromEntries(slotIds.flatMap((id) => (source.slots[id] ? [[id, source.slots[id]]] : [])));
    const next: VDocDocument = { ...blank, pages: [{ ...page, pageNumber: 1 }], slots, variables: { ...source.variables } };
    const saved = await documentApi.save(withCopiedFrom(next, source, [pageId]), { baseRevision: blank.revision });
    return adoptAndOpen(saved);
  },

  /** 문서 열기 — 플레이그라운드 초안이면 플레이그라운드 탭, 프로젝트 문서(원본)면 파일 트리로. */
  open: (docId: string) => {
    useStudioDocumentStore.getState().setActiveDocId(docId);
    const isDraft = Boolean(selectPlaygroundProject(useProjectStore.getState())?.docIds.includes(docId));
    showLeftTab(isDraft ? "playground" : "explorer");
  },

  rename: async (docId: string, title: string) => {
    if (!title.trim()) return;
    useStudioDocumentStore.getState().adoptDocument(await documentApi.rename(docId, title.trim()));
  },

  /** 지우기 — 플레이그라운드 문서만 (프로젝트 원본은 건드리지 않는다). */
  remove: async (docId: string) => {
    const before = useStudioDocumentStore.getState().activeDocId;
    await documentApi.remove(docId);
    useStudioDocumentStore.getState().forgetDocument(docId);
    await useProjectStore.getState().hydrate();
    if (before !== docId) return;
    // 보던 초안을 지웠으면 작업 프로젝트의 첫 문서로 돌아간다 (다른 초안으로 넘어가지 않게)
    const loaded = new Set(useStudioDocumentStore.getState().docs.map((d) => d.docId));
    const first = selectActiveProject(useProjectStore.getState())?.docIds.find((id) => loaded.has(id));
    if (first) useStudioDocumentStore.getState().setActiveDocId(first);
  },

  /**
   * 채택 — 이 버전(플레이그라운드 사본)의 내용으로 원본을 바꾼다.
   * 쪽 버전은 그 쪽 자리에, 문서 버전은 쪽 순서대로 자리를 지키며 바꾼다 (쪽 id 를 유지해 아웃라인 연결이 끊기지 않게).
   * 바꾸기 직전 원본은 자동 보관 버전으로 남기고, 실행 취소(Ctrl+Z)로도 돌아올 수 있다.
   */
  adoptVariant: async (variantDocId: string, label: string): Promise<boolean> => {
    const store = useStudioDocumentStore.getState();
    const variant = store.docs.find((d) => d.docId === variantDocId);
    const from = variant?.origin?.copiedFrom;
    if (!variant || !from) return false;
    const target = store.docs.find((d) => d.docId === from.docId);
    if (!target) throw new Error("원본 문서를 찾을 수 없어요.");
    await store.flushSave(variantDocId);
    await store.flushSave(target.docId);
    await documentApi.createVersion(target.docId, { kind: "auto", reason: "버전 채택 전", name: `${label} 채택 전` });

    const ok = store.updateDoc(
      target.docId,
      (prev) => {
        // 버전은 원본과 같은 id 를 갖고 있어 (복사할 때 그대로 둔다) 같은 자리를 그대로 바꾼다.
        if (from.pageIds?.length) {
          // 쪽 버전: 원본 쪽 자리에 첫 쪽, 버전에서 늘린 쪽은 바로 뒤에 (새 id)
          const targetPageId = from.pageIds[0];
          const [first, ...rest] = variant.pages;
          if (!first || !prev.pages.some((p) => p.pageId === targetPageId)) return prev;
          let next = replacePageContent(prev, targetPageId, first, variant.slots, { sourceVariables: variant.variables });
          if (rest.length) {
            const at = next.pages.findIndex((p) => p.pageId === targetPageId) + 1;
            next = importPagesFromDocument(next, variant, rest.map((p) => p.pageId), idSuffix, at);
          }
          return next;
        }
        // 문서 버전: 쪽 · 칸을 통째로 이 버전으로 (문서 id · 제목 · 소속은 원본 그대로)
        return {
          ...prev,
          pages: variant.pages,
          slots: variant.slots,
          variables: { ...prev.variables, ...variant.variables },
          backdata: { ...prev.backdata, ...variant.backdata },
        };
      },
      { history: true, label: `${label} 채택` },
    );
    if (!ok) return false;
    await store.flushSave(target.docId);
    // 저장이 끝난 뒤 원본을 연다 (바꾼 쪽으로)
    const docs = useStudioDocumentStore.getState();
    docs.setActiveDocId(target.docId);
    if (from.pageIds?.[0]) docs.setActivePageId(from.pageIds[0]);
    showLeftTab("explorer");
    return true;
  },

  /**
   * 부분 채택 — 실험실 버전(문서 버전이든 쪽 버전이든)에서 **특정 1페이지만** 골라 원본 문서의 같은 자리에 적용한다.
   * 나머지 페이지는 전혀 건드리지 않고, 직전 원본은 자동 버전으로 보관하며 Ctrl+Z 로도 되돌릴 수 있다.
   */
  adoptPageFromVariant: async (variantDocId: string, targetPageId: string, label: string): Promise<boolean> => {
    const store = useStudioDocumentStore.getState();
    const variant = store.docs.find((d) => d.docId === variantDocId);
    const from = variant?.origin?.copiedFrom;
    if (!variant || !from) return false;
    const target = store.docs.find((d) => d.docId === from.docId);
    if (!target) throw new Error("원본 문서를 찾을 수 없어요.");
    if (!target.pages.some((p) => p.pageId === targetPageId)) return false;

    const variantPage =
      variant.pages.find((p) => p.pageId === targetPageId) ??
      (from.pageIds?.length === 1 && from.pageIds[0] === targetPageId ? variant.pages[0] : undefined);
    if (!variantPage) return false;

    await store.flushSave(variantDocId);
    await store.flushSave(target.docId);
    await documentApi.createVersion(target.docId, {
      kind: "auto",
      reason: "특정 페이지 부분 채택 전",
      name: `${label} 적용 전`,
    });

    const ok = store.updateDoc(
      target.docId,
      (prev) => replacePageContent(prev, targetPageId, variantPage, variant.slots, { sourceVariables: variant.variables }),
      { history: true, label: `${label} 적용` },
    );
    if (!ok) return false;
    await store.flushSave(target.docId);
    return true;
  },

  /** 플레이그라운드 목록 열기. */
  showList: () => useWorkspaceLayoutStore.getState().setActiveActivityTab("playground"),

  /**
   * 실험실 버전 ↔ 원본 비교 열기 (Figma Dev Mode Compare changes 방식).
   * 사본 문서를 연 상태에서 왼쪽(원본) · 오른쪽(실험본)을 좌우 비교 또는 겹쳐 비교로 띄운다.
   */
  compareWithSource: (
    variantDocId: string,
    opts: { label?: string; targetName?: string; initialView?: "review" | "side-by-side" | "overlay" } = {},
  ): boolean => {
    const store = useStudioDocumentStore.getState();
    const variant = store.docs.find((d) => d.docId === variantDocId);
    const from = variant?.origin?.copiedFrom;
    if (!variant || !from) return false;
    const source = store.docs.find((d) => d.docId === from.docId);
    if (!source) return false;

    // 오른쪽(AFTER)이 이 실험 버전이 되도록 먼저 활성화
    if (store.activeDocId !== variant.docId) {
      store.setActiveDocId(variant.docId);
      showLeftTab("playground");
    }

    // 쪽 버전이면 원본 문서에서 해당 쪽만 추린 뷰를 beforeDoc 로 만들어 1:1 매칭한다
    const beforeDoc: VDocDocument = from.pageIds?.length
      ? { ...source, pages: source.pages.filter((p) => from.pageIds!.includes(p.pageId)) }
      : source;

    const beforeLive = new Set(beforeDoc.pages.flatMap((p) => [...iterPageSlotIds(p)]));
    const afterLive = new Set(variant.pages.flatMap((p) => [...iterPageSlotIds(p)]));
    const allSlotIds = new Set([...beforeLive, ...afterLive]);

    const visible = (d: VDocDocument, live: Set<string>, id: string) => (live.has(id) ? (d.slots[id]?.content ?? "") : "");
    const changedSlotIds = [...allSlotIds].filter((id) => visible(beforeDoc, beforeLive, id) !== visible(variant, afterLive, id));

    const targetName =
      opts.targetName ??
      (from.pageIds?.[0]
        ? (source.pages.find((p) => p.pageId === from.pageIds![0])?.pageLabel ?? source.title)
        : source.title);
    const versionLabel = opts.label ?? variant.title;

    useActiveDiffStore.getState().openDiff({
      type: "version",
      diffId: `playground-compare-${variant.docId}`,
      label: `원본 vs ${versionLabel}`,
      beforeDoc,
      beforeLabel: `원본 · ${targetName}`,
      afterLabel: `${versionLabel} (실험실)`,
      beforeSlots: Object.fromEntries(changedSlotIds.map((id) => [id, visible(beforeDoc, beforeLive, id)])),
      afterSlots: Object.fromEntries(changedSlotIds.map((id) => [id, visible(variant, afterLive, id)])),
      changedSlotIds,
      slotLabels: Object.fromEntries(
        changedSlotIds.map((id) => [id, variant.slots[id]?.label ?? beforeDoc.slots[id]?.label ?? "칸"]),
      ),
      revertible: false,
      variant: { docId: variant.docId, label: versionLabel, targetName },
      initialView: opts.initialView ?? "side-by-side",
    });
    return true;
  },
};

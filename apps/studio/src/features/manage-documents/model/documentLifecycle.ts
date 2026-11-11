import { documentApi, selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";

/**
 * 문서 한 편의 생애 (새로 만들기 · 불러오기 · 이름 바꾸기 · 복제 · 삭제 · 새로고침).
 *
 * 서버가 문서와 프로젝트 `docIds` 를 함께 바꾸므로, 끝나면 프로젝트 목록을 다시 받아 맞춘다
 * (고아 문서가 생기지 않는다). 문서 작업 사본은 서버가 돌려준 판으로 들인다.
 * 아웃라이너 문서 행 아이콘(docId 지정)과 파일 메뉴(활성 문서)가 같은 함수를 쓴다.
 */
export function documentLifecycle() {
  const refreshProjects = () => useProjectStore.getState().hydrate();
  const activeId = () => selectActiveDocument(useStudioDocumentStore.getState())?.docId ?? "";
  const activeProjectId = () => {
    const project = selectActiveProject(useProjectStore.getState());
    if (!project) throw new Error("열린 프로젝트가 없습니다.");
    return project.projectId;
  };

  const createDocument = async (input: { title: string; surface: "paged" | "scroll"; genre?: string }) => {
    const doc = await documentApi.create({
      projectId: activeProjectId(),
      title: input.title,
      surface: input.surface,
      genre: input.genre ?? (input.surface === "scroll" ? "blog" : "document"),
    });
    useStudioDocumentStore.getState().adoptDocument(doc);
    await refreshProjects();
    return doc;
  };

  const renameDocument = async (docId: string, title: string) => {
    if (!docId || !title.trim()) return;
    const doc = await documentApi.rename(docId, title);
    useStudioDocumentStore.getState().adoptDocument(doc);
  };

  const duplicateDocument = async (docId: string) => {
    if (!docId) return;
    const source = useStudioDocumentStore.getState().docs.find((d) => d.docId === docId);
    const doc = await documentApi.duplicate(docId, { projectId: source?.projectId ?? activeProjectId() });
    useStudioDocumentStore.getState().adoptDocument(doc);
    await refreshProjects();
  };

  const deleteDocument = async (docId: string) => {
    if (!docId) return;
    await documentApi.remove(docId);
    useStudioDocumentStore.getState().forgetDocument(docId);
    await refreshProjects();
  };

  /** 서버에 있는 문서를 열어 작업 사본으로 들이고, 이 프로젝트에 없으면 연결한다 (불러오기). */
  const importDocument = async (docId: string) => {
    const projectId = activeProjectId();
    const project = selectActiveProject(useProjectStore.getState());
    const doc = project?.docIds.includes(docId) ? await documentApi.get(docId) : await documentApi.link(docId, projectId);
    useStudioDocumentStore.getState().adoptDocument(doc);
    useStudioDocumentStore.getState().setActiveDocId(docId);
    await refreshProjects();
    return doc;
  };

  /** 에이전트 초안처럼 서버에서 생긴 문서를 열어 들인다 (Composer 동기화). */
  const openDocument = async (docId: string) => {
    const doc = await documentApi.get(docId);
    useStudioDocumentStore.getState().adoptDocument(doc);
    await refreshProjects();
  };

  /** 프로젝트 문서 목록을 서버 판으로 다시 맞춘다 (다른 곳 · 에이전트가 만든 문서가 보이게). */
  const refreshDocuments = async () => {
    await refreshProjects();
    const project = selectActiveProject(useProjectStore.getState());
    if (!project) return;
    // 열려 있는 문서는 건드리지 않는다 (저장 전 편집을 덮지 않게) — 아직 안 들인 문서만 받아 온다
    const loaded = new Set(useStudioDocumentStore.getState().docs.map((d) => d.docId));
    const missing = project.docIds.filter((id) => !loaded.has(id));
    const keepActive = activeId(); // 들이기(adopt)는 그 문서를 활성으로 바꾸므로 지금 보던 문서로 되돌린다
    const docs = await Promise.allSettled(missing.map((id) => documentApi.get(id)));
    for (const r of docs) if (r.status === "fulfilled") useStudioDocumentStore.getState().adoptDocument(r.value);
    if (keepActive && missing.length) useStudioDocumentStore.getState().setActiveDocId(keepActive);
  };

  return {
    createDocument,
    renameDocument,
    duplicateDocument,
    deleteDocument,
    importDocument,
    openDocument,
    refreshDocuments,
    renameActiveDocument: (title: string) => renameDocument(activeId(), title),
    duplicateActiveDocument: () => duplicateDocument(activeId()),
    deleteActiveDocument: () => deleteDocument(activeId()),
  };
}

/**
 * Reference Manager ↔ AI Composer 연동 검증 (레퍼런스 = 라이브러리 항목, 작업 문서가 아니다)
 *
 * 1. 레퍼런스 컨텍스트는 연결 + 사용(enabled) 중인 레퍼런스만, 꺼 둔 층위와 핀(체크한 것만 또는 전부)을 담는다
 * 2. 작업대 페이로드는 refId · pinIds(null = 전부) · 꺼 둔 층위만 보낸다 (원문 · vdoc 경로 없음)
 * 3. 레퍼런스를 열어도 에디터의 활성 문서 · 문서 목록은 바뀌지 않는다
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { useAiScopeStore } from "../src/entities/ai-scope/model/useAiScopeStore";
import type { BoundReference, ReferencePin } from "../src/entities/reference-manager/model/types";
import { useReferenceStore } from "../src/entities/reference-manager/model/useReferenceStore";
import { useStudioDocumentStore } from "../src/entities/vdoc-document/model/useStudioDocumentStore";
import { useWorkspaceLayoutStore } from "../src/entities/workspace-layout/model/useWorkspaceLayoutStore";
import { REFERENCES_CONTEXT_PROVIDER, WORKBENCH_CONTEXT_PROVIDER } from "../src/features/ai-workspace/model/workspaceContexts";
import { revealReferenceViewer } from "../src/features/ai-workspace/model/workspaceEntities";

for (const key of ["localStorage", "sessionStorage"] as const) {
  if (typeof (globalThis as Record<string, unknown>)[key] === "undefined") {
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>)[key] = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    };
  }
}

const item = (refId: string, title: string) => ({
  refId,
  kind: "pdf" as const,
  title,
  sourceName: `${title}.pdf`,
  sourceUrl: "",
  mimeType: "application/pdf",
  sizeBytes: 1,
  pageCount: 3,
  layerSet: "document",
  status: "ready" as const,
  error: "",
  createdAt: 1,
  updatedAt: 1,
});

const pin = (refId: string, pinId: string): ReferencePin => ({
  pinId,
  refId,
  kind: "text",
  page: 1,
  bbox: null,
  text: "결론부터 말한다",
  label: `1p: ${pinId}`,
  note: "",
  layer: "D4",
  anchor: `ref:${refId}#pin:${pinId}`,
  createdAt: 1,
});

const bound: BoundReference[] = [
  { refId: "ref-a", enabled: true, layers: { D2: false }, item: item("ref-a", "제안서 A") },
  { refId: "ref-b", enabled: false, layers: {}, item: item("ref-b", "보고서 B") },
];

describe("Reference Manager - AI Composer Integration", () => {
  beforeEach(() => {
    useAiScopeStore.setState({ referencesOn: true, sourcesOn: true, scopeOn: false });
    useReferenceStore.setState({
      projectId: "proj",
      bound,
      library: bound.map((b) => b.item),
      pins: { "ref-a": [pin("ref-a", "p1"), pin("ref-a", "p2")], "ref-b": [pin("ref-b", "p3")] },
      checkedPinIds: [],
      activeRefId: null,
    });
  });

  it("사용 중인 레퍼런스만, 꺼 둔 층위와 핀을 담아 보낸다", () => {
    const refs = REFERENCES_CONTEXT_PROVIDER.current!();
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0].id, "ref:ref-a");
    assert.ok(refs[0].content?.includes("따르지 않을 층위: D2"));
    assert.ok(refs[0].content?.includes("ref:ref-a#pin:p1") && refs[0].content?.includes("ref:ref-a#pin:p2"));
  });

  it("체크한 핀이 있으면 그 핀만 보낸다", () => {
    useReferenceStore.setState({ checkedPinIds: ["p2"] });
    const content = REFERENCES_CONTEXT_PROVIDER.current!()[0].content ?? "";
    assert.ok(content.includes("#pin:p2") && !content.includes("#pin:p1"));
  });

  it("레퍼런스 스위치를 끄면 아무것도 보내지 않는다", () => {
    useAiScopeStore.getState().setReferencesOn(false);
    assert.deepStrictEqual(REFERENCES_CONTEXT_PROVIDER.current!(), []);
  });

  it("작업대에는 refId · pinIds · 꺼 둔 층위만 싣는다 (vdoc 경로 없음)", () => {
    const [wb] = WORKBENCH_CONTEXT_PROVIDER.current!();
    const payload = JSON.parse(wb.content ?? "{}");
    assert.deepStrictEqual(payload.references, [{ refId: "ref-a", title: "제안서 A", pinIds: null, layers: { D2: false } }]);
    useReferenceStore.setState({ checkedPinIds: ["p3"] });
    const filtered = JSON.parse(WORKBENCH_CONTEXT_PROVIDER.current!()[0].content ?? "{}");
    assert.deepStrictEqual(filtered.references[0].pinIds, []); // 다른 레퍼런스의 핀만 골랐다 → 이 레퍼런스의 핀은 없음
  });

  it("레퍼런스를 열어도 에디터의 활성 문서 · 문서 목록은 바뀌지 않는다", () => {
    useStudioDocumentStore.setState({ docs: [], activeDocId: "my-doc" });
    useWorkspaceLayoutStore.getState().setRefViewerOpen(false);
    revealReferenceViewer("ref-a");
    assert.strictEqual(useReferenceStore.getState().activeRefId, "ref-a");
    assert.strictEqual(useWorkspaceLayoutStore.getState().refViewerOpen, true);
    assert.strictEqual(useWorkspaceLayoutStore.getState().leftPanelTab, "reference-manager");
    assert.strictEqual(useStudioDocumentStore.getState().activeDocId, "my-doc");
    assert.strictEqual(useStudioDocumentStore.getState().docs.length, 0);
  });
});

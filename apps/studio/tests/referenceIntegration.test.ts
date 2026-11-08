/**
 * Reference Manager & AI Composer 연동 검증 테스트
 * 
 * 1. useAiScopeStore 의 referencesOn 토글, 영속화, 제외 목록 제어
 * 2. REFERENCES_CONTEXT_PROVIDER 의 current() 평가 동작
 *    - referencesOn=false 일 때 빈 배열 반환
 *    - referencesOn=true 일 때 활성 참조 문서 및 핀 정보를 role="reference" 로 정상 반환
 *    - excludedRefDocIds 에 포함된 문서는 자동 제외
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import { useAiScopeStore } from "../src/entities/ai-scope/model/useAiScopeStore";
import { useReferencePinStore } from "../src/entities/reference-manager/model/useReferencePinStore";
import { useStudioDocumentStore } from "../src/entities/vdoc-document/model/useStudioDocumentStore";
import { useProjectStore } from "../src/entities/vdoc-project/model/useProjectStore";
import { REFERENCES_CONTEXT_PROVIDER } from "../src/features/ai-workspace/model/workspaceContexts";

// localStorage 모킹
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe("Reference Manager - AI Composer Integration", () => {
  beforeEach(() => {
    localStorage.clear();
    useAiScopeStore.setState({
      referencesOn: true,
      sourcesOn: true,
      scopeOn: true,
      excludedRefDocIds: [],
    });
  });

  describe("AiScopeStore Reference Controls", () => {
    it("referencesOn 의 기본값은 true 이다", () => {
      const state = useAiScopeStore.getState();
      assert.strictEqual(state.referencesOn, true);
    });

    it("setReferencesOn(false) 로 레퍼런스를 전체 끌 수 있다", () => {
      useAiScopeStore.getState().setReferencesOn(false);
      assert.strictEqual(useAiScopeStore.getState().referencesOn, false);

      // 로컬 스토리지에 switches 상태가 저장된다
      const saved = JSON.parse(localStorage.getItem("vdoc.aiScope.switches") ?? "{}");
      assert.strictEqual(saved.referencesOn, false);
    });

    it("toggleRefDocExcluded 로 개별 참조 문서를 제외 및 복원할 수 있다", () => {
      const { toggleRefDocExcluded } = useAiScopeStore.getState();
      toggleRefDocExcluded("doc_trade_rule_01");
      assert.deepStrictEqual(useAiScopeStore.getState().excludedRefDocIds, ["doc_trade_rule_01"]);

      toggleRefDocExcluded("doc_trade_rule_01");
      assert.deepStrictEqual(useAiScopeStore.getState().excludedRefDocIds, []);
    });

    it("setAllRefDocsExcluded 로 참조 문서 일괄 제외 및 일괄 복원이 가능하다", () => {
      const { setAllRefDocsExcluded } = useAiScopeStore.getState();
      setAllRefDocsExcluded(["doc_1", "doc_2"], true);
      assert.ok(useAiScopeStore.getState().excludedRefDocIds.includes("doc_1"));
      assert.ok(useAiScopeStore.getState().excludedRefDocIds.includes("doc_2"));

      setAllRefDocsExcluded(["doc_1"], false);
      assert.deepStrictEqual(useAiScopeStore.getState().excludedRefDocIds, ["doc_2"]);
    });
  });

  describe("REFERENCES_CONTEXT_PROVIDER Specification", () => {
    it("id 는 references 이고 auto 가 true 로 활성화되어 있다", () => {
      assert.strictEqual(REFERENCES_CONTEXT_PROVIDER.id, "references");
      assert.strictEqual(REFERENCES_CONTEXT_PROVIDER.auto, true);
      assert.strictEqual(typeof REFERENCES_CONTEXT_PROVIDER.current, "function");
    });

    it("referencesOn 이 false 이면 current() 는 빈 배열을 반환한다", () => {
      useAiScopeStore.getState().setReferencesOn(false);
      const refs = REFERENCES_CONTEXT_PROVIDER.current?.() ?? [];
      assert.strictEqual(refs.length, 0);
    });

    it("활성 참조 문서 및 핀이 존재할 때 role='reference' 및 표준 가이드 텍스트가 조립된다", () => {
      // 1. 활성 프로젝트 및 참조 프로젝트 모킹
      useProjectStore.setState({
        activeProjectId: "p_main",
        projects: [
          {
            projectId: "p_main",
            title: "메인 계약서 프로젝트",
            docIds: ["doc_main"],
            referenceProjectIds: ["ref_proj_1"],
            isReferenceOnly: false,
          } as any,
          {
            projectId: "ref_proj_1",
            title: "국제제휴위원회 운영세칙",
            docIds: ["ref_doc_101"],
            referenceProjectIds: [],
            isReferenceOnly: true,
          } as any,
        ],
      });

      // 2. 문서 모킹
      useStudioDocumentStore.setState({
        docs: [
          {
            docId: "ref_doc_101",
            title: "예스폼_무역국제제휴위원회규정및운영세칙안내",
            pages: [{ pageId: "p1" }, { pageId: "p2" }],
          } as any,
        ],
      });

      // 3. 핀 모킹
      useReferencePinStore.setState({
        snippetsByDoc: {
          ref_doc_101: [
            {
              id: "pin_01",
              docId: "ref_doc_101",
              label: "제3조 [의결정족수]",
              kind: "region",
              page: 1,
              bbox: [100, 100, 300, 400],
              excerpt: "재적위원 과반수의 출석으로 개의한다.",
              createdAt: "2026-11-08T00:00:00Z",
            },
          ],
        },
        checkedSnippetIds: ["pin_01"],
      });

      // 4. current() 호출 검증
      const refs = REFERENCES_CONTEXT_PROVIDER.current?.() ?? [];
      assert.strictEqual(refs.length, 1);
      const ref = refs[0];
      assert.strictEqual(ref.id, "ref_doc_ref_doc_101");
      assert.strictEqual(ref.kind, "reference");
      assert.strictEqual(ref.role, "reference");
      assert.ok(ref.content?.includes("[참조 문서 표준·서식 가이드]"));
      assert.ok(ref.content?.includes("예스폼_무역국제제휴위원회규정및운영세칙안내"));
      assert.ok(ref.content?.includes("제3조 [의결정족수]"));
      assert.ok(ref.content?.includes("재적위원 과반수의 출석으로 개의한다."));

      // 5. excludedRefDocIds 에 넣으면 제외되는지 검증
      useAiScopeStore.getState().toggleRefDocExcluded("ref_doc_101");
      const excludedRefs = REFERENCES_CONTEXT_PROVIDER.current?.() ?? [];
      assert.strictEqual(excludedRefs.length, 0);
    });
  });
});

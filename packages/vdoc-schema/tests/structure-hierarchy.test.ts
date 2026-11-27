import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  STRUCTURE_LAYERS,
  compileDirectiveSubtreeToVDoc,
  createDefaultRegistrySnapshot,
  createElementSyntaxRegistry,
  measureOutlineVDocIsomorphism,
  validateOutlineHierarchy,
  validateVDocHierarchy,
  type OutlineSyntaxNode,
  type VDocDocument,
} from "../src/index";

const n = (id: string, text: string, children: OutlineSyntaxNode[] = [], file?: string): OutlineSyntaxNode => ({
  id,
  text,
  children,
  ...(file ? { file: { target: file } } : {}),
});

/** 좋은 예: 섹션 → 블록(한 단 흐름), 사용자가 원한 자리만 다단 섹션(자식 불릿 하나 = 한 단). 인용은 블록 아래. */
const goodOutline = (profile: "a4" | "blog"): OutlineSyntaxNode[] => [
  n("u1", "핸드드립 입문 정리 (사용자 1차 구체화)", [
    n("u1a", "도구 고르기"),
    n("doc", `<<doc:${profile}>> 핸드드립 입문 가이드`, [
      n("s1", "<<view:section:opening>> 시작하며", [
        n("s1t", "<<view:title:h1>> 핸드드립 입문 가이드"),
        n("s1p", "집에서 한 잔을 내리는 데 필요한 것만 추립니다.", [
          n("s1c", "<<resource: 홈카페/핸드드립/레퍼런스/초보자를 위한 핸드드립 커피 입문 가이드.ref | 도구는 네 가지면 충분하다>>"),
        ]),
      ]),
      n("s2", "<<view:section:column>> 드리퍼 비교", [
        n("s2c1", "드리퍼는 추출 속도를 정한다."),
        n("s2c2", "드리퍼 사진", [], "홈카페/핸드드립/사진/드리퍼.jpg"),
      ]),
      n("s3", "<<view:section:steps>> 추출 순서", [n("s3p", "뜸 들이기 30초.")]),
    ]),
  ]),
];

describe("계층 문법 레지스트리", () => {
  it("기본 레지스트리의 모든 요소 · 기호에 층이 있고 프로필은 섹션 구조 단위를 가진다", () => {
    const snap = createDefaultRegistrySnapshot();
    for (const el of snap.elements) {
      assert.ok(el.layer && STRUCTURE_LAYERS.includes(el.layer), `element ${el.id} layer`);
      for (const r of el.rules) assert.ok(r.layer && STRUCTURE_LAYERS.includes(r.layer), `rule ${el.id}.${r.id} layer`);
    }
    for (const p of snap.profiles) assert.equal(p.structureUnit, "section");
    assert.equal(snap.profiles.find((p) => p.id === "a4")?.outputUnit, "page");
    assert.equal(snap.profiles.find((p) => p.id === "blog")?.outputUnit, "scroll");
  });

  it("층 필드가 없는 옛 볼트 .vsyntax 를 읽으면 기본 문법으로 보충하고, 사용자가 바꾼 값은 지킨다", () => {
    const old = createDefaultRegistrySnapshot();
    const stripped = {
      ...old,
      profiles: old.profiles.map(({ structureUnit: _s, outputUnit: _o, ...p }) => p),
      elements: old.elements.map(({ layer: _l, parents: _p, ...el }) => ({
        ...el,
        rules: el.rules
          .filter((r) => r.id !== "column-section")
          .map(({ layer: _rl, parents: _rp, children: _rc, ...r }) =>
            r.id === "kv-meta" ? { ...r, parents: ["frame-box"] } : r.id === "tree-group" ? { ...r, layer: "container" as never } : r
          ),
      })),
    };
    const reg = createElementSyntaxRegistry(JSON.stringify(stripped));
    const section = reg.getElement("section");
    assert.equal(section?.layer, "section");
    assert.deepEqual(section?.parents, ["layer:document"]);
    // 볼트에 없던 다단 섹션 규칙은 덧붙고, 사라진 'container' 층은 기본 문법으로 돌아간다. 사용자가 바꾼 담기 규칙은 지킨다.
    assert.equal(section?.rules.find((r) => r.id === "column-section")?.symbol, "<<view:section:column>>");
    assert.equal(section?.rules.find((r) => r.id === "tree-group")?.layer, "block");
    assert.deepEqual(section?.rules.find((r) => r.id === "kv-meta")?.parents, ["frame-box"]);
    assert.equal(reg.getProfile("a4")?.outputUnit, "page");
  });
});

describe("outline 계층 검사", () => {
  it("좋은 예는 오류 0 · 섹션 3 (다단 섹션 1 · 단 2)", () => {
    const r = validateOutlineHierarchy(goodOutline("a4"), "doc");
    assert.deepEqual(r.issues.filter((i) => i.severity === "error"), []);
    assert.ok(r.ok);
    assert.deepEqual(r.sectionNodeIds, ["s1", "s2", "s3"]);
    assert.deepEqual(r.columnSectionNodeIds, ["s2"]);
    assert.deepEqual(r.columnNodeIds, ["s2c1", "s2c2"]);
    assert.equal(r.citationCount, 1);
  });

  it("장(章)을 일반 불릿으로 둔 <<doc>> — 섹션 밖 내용 · 섹션 없음", () => {
    const roots = [
      n("doc", "<<doc:blog>> 부상 타임라인", [
        n("c1", "1. 개요", [n("c1a", "현재 상황")]),
        n("c2", "2. 타임라인", [n("c2a", "11-22 부상")]),
      ]),
    ];
    const r = validateOutlineHierarchy(roots, "doc");
    assert.equal(r.ok, false);
    assert.deepEqual(
      r.issues.filter((i) => i.code === "CONTENT_OUTSIDE_SECTION").map((i) => i.nodeId),
      ["c1", "c2"]
    );
    assert.ok(r.issues.some((i) => i.code === "DOC_WITHOUT_SECTION"));
  });

  it("담기 위반: 폐기된 <<view:columns>> · <<col>> · 섹션 안의 섹션 · 단 하나짜리 다단 · 문서 안의 문서", () => {
    const roots = [
      n("doc", "<<doc:a4>> 보고서", [
        n("s1", "<<view:section>> 1장", [
          n("x1", "<<col>> 떠도는 열"),
          n("cols", "<<view:columns>>", [n("cc1", "<<col>>", [n("cc1p", "글")])]),
          n("in", "<<view:section:column>> 섹션 안의 다단 섹션", [n("in1", "가"), n("in2", "나")]),
          n("d2", "<<doc:blog>> 안쪽 문서", [n("d2s", "<<view:section>> x", [n("d2p", "y")])]),
        ]),
        n("s2", "<<view:section:column>> 단 하나", [n("s2a", "혼자"), n("s2c", "<<resource: a.md #L1-L1 | 문장>>")]),
      ]),
    ];
    const r = validateOutlineHierarchy(roots, "doc");
    const codes = (id: string) => r.issues.filter((i) => i.nodeId === id).map((i) => i.code);
    assert.deepEqual(codes("x1"), ["LEGACY_COLUMNS"]);
    assert.deepEqual(codes("cols"), ["LEGACY_COLUMNS"]);
    assert.deepEqual(codes("in"), ["PARENT_NOT_ALLOWED"]);
    assert.deepEqual(codes("d2"), ["NESTED_DOCUMENT"]);
    assert.deepEqual(codes("s2"), ["COLUMNS_NEED_TWO"]);
  });

  it("닫는 >> 가 없는 근거 태그는 오류 (컴파일에서 인용이 사라진다)", () => {
    const roots = [
      n("doc", "<<doc:blog>> 글", [
        n("s1", "<<view:section>> 1", [
          n("p", "본문", [n("c-ok", "<<resource: a.md #L1-L1 | 문장>>"), n("c-bad", "<<resource: a.md #L2-L2 | 닫히지 않은 문장")]),
        ]),
      ]),
    ];
    const r = validateOutlineHierarchy(roots, "doc");
    assert.equal(r.ok, false);
    assert.deepEqual(r.issues.filter((i) => i.severity === "error").map((i) => `${i.code}@${i.nodeId}`), ["UNTERMINATED_EVIDENCE_TAG@c-bad"]);
  });

  it("한 불릿에 여러 줄을 넣은 표 — 여러 줄 불릿 · 행 없는 표 오류, 행을 하위 불릿으로 쓰면 통과", () => {
    const bad = [
      n("doc", "<<doc:blog>> 글", [
        n("s1", "<<view:section>> 교통", [
          n("t", "<<view:table>> 패스 비교\\n  구분 | A | B\\n  1일권 | 3,500엔 | 2,400엔", [n("tc", "<<resource: a.md #L1-L1 | 가격>>")]),
        ]),
      ]),
    ];
    const r = validateOutlineHierarchy(bad, "doc");
    assert.deepEqual(r.issues.filter((i) => i.severity === "error").map((i) => i.code).sort(), ["MULTILINE_BULLET", "TABLE_WITHOUT_ROWS"]);
    const good = [
      n("doc", "<<doc:blog>> 글", [
        n("s1", "<<view:section>> 교통", [
          n("t", "<<view:table>> 패스 비교", [n("h", "구분 | A | B"), n("r1", "1일권 | 3,500엔 | 2,400엔"), n("tc", "<<resource: a.md #L1-L1 | 가격>>")]),
        ]),
      ]),
    ];
    assert.ok(validateOutlineHierarchy(good, "doc").ok);
  });

  it("레지스트리에 없는 view 는 경고, <<doc>> 가 아닌 노드는 오류", () => {
    const roots = [n("doc", "<<doc:a4>> 문서", [n("s1", "<<view:section>> 1", [n("w", "<<view:timeline>> 연표")])])];
    const r = validateOutlineHierarchy(roots, "doc");
    assert.ok(r.ok);
    assert.equal(r.issues.find((i) => i.nodeId === "w")?.code, "UNKNOWN_VIEW");
    assert.equal(validateOutlineHierarchy(roots, "s1").issues[0]?.code, "NOT_A_DOC_NODE");
  });
});

describe(".vdoc 계층 검사 · 동형", () => {
  const page = (id: string, extra: Partial<VDocDocument["pages"][number]>, blocks: VDocDocument["pages"][number]["blocks"]) => ({
    pageId: id,
    pageNumber: 1,
    pageLabel: id,
    headerSlotId: `${id}_h`,
    footerSlotId: `${id}_f`,
    blocks,
    ...extra,
  });
  const heading = (id: string, level: 1 | 2 | 3 = 2) => ({ blockId: id, kind: "heading" as const, title: id, slotId: `s_${id}`, level });
  const text = (id: string) => ({ blockId: id, kind: "text" as const, title: id, slotId: `s_${id}` });

  it("납작한 1쪽 + 제목 블록으로 흉내 낸 섹션(도쿄형)을 잡는다", () => {
    const flat = {
      version: 1,
      docId: "tokyo",
      title: "도쿄",
      pages: [page("p1", {}, [heading("h1"), text("t1"), heading("h2"), text("t2"), heading("h3")])],
      slots: {},
      origin: { createdBy: "agent" },
    } as unknown as VDocDocument;
    const r = validateVDocHierarchy(flat);
    assert.equal(r.ok, false);
    assert.deepEqual(r.issues.map((i) => i.code).sort(), ["SECTION_COLLAPSED", "UNIT_NOT_SECTION"]);
  });

  it("서식 원문 가져오기 문서는 쪽 단위를 허용한다", () => {
    const imported = {
      version: 1,
      docId: "form",
      title: "서식",
      pages: [page("p1", { unitKind: "page" }, [text("t1")])],
      slots: {},
      origin: { createdBy: "agent", imports: [{ path: "x.hwpx" }] },
    } as unknown as VDocDocument;
    assert.ok(validateVDocHierarchy(imported).ok);
  });

  it("좋은 outline 을 컴파일하면 섹션 단위 · 원본 불릿 바인딩 · 다단 섹션의 단까지 동형 100%", () => {
    for (const profile of ["a4", "blog"] as const) {
      const roots = goodOutline(profile);
      const doc = compileDirectiveSubtreeToVDoc(roots, "doc", { profileId: profile });
      assert.ok(doc, profile);
      const withRef = { ...doc!, outlineRef: { outlinePath: "vault://x.outline", rootNodeId: "doc" } } as VDocDocument;
      const vr = validateVDocHierarchy(withRef);
      assert.deepEqual(vr.issues.filter((i) => i.severity === "error"), [], `${profile} vdoc errors`);
      assert.equal(vr.sectionUnitCount, 3, `${profile} sections`);
      assert.equal(vr.columnsGridCount, 1);
      assert.equal(vr.nestedColumnBlockCount, 2);
      const colPage = withRef.pages.find((p) => p.sourceNodeId === "s2");
      assert.equal(colPage?.sectionRole, "column");
      assert.equal(colPage?.blocks.length, 1, "다단 섹션 = 다단 블록 하나");
      const iso = measureOutlineVDocIsomorphism(validateOutlineHierarchy(roots, "doc"), withRef);
      assert.equal(iso.ratio, 1, `${profile} missing ${iso.missingNodeIds.join(",")}`);
    }
  });
});

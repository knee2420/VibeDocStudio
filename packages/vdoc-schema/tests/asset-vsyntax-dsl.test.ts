import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUILTIN_VDOC_ASSETS,
  compileVsyntaxDslToAssetV3,
  createElementSyntaxRegistry,
  getTableCellPlacements,
  instantiateAssetV3,
  renderAssetV3ToVsyntaxDsl,
  scoreSkeleton,
  v3ToVDocAsset,
  vDocAssetToV3,
  type LayoutBlock,
} from "../src";

describe(".vsyntax DSL <-> AssetV3 compiler, dynamic mergeSame, and v3 <-> VDocAsset bridge", () => {
  it("compiles a 3-line .vsyntax table DSL with repeat(*) + mergeSame(^) into valid AssetV3 and instantiates 10 rows with dynamic vertical merges", () => {
    const dsl = [
      "<<view:table>> 요구사항 목록표",
      "  순번 | 구분 | 요구사항 고유번호 | 요구사항 명",
      "  * {{seq:number|순번}} | {{category:text^|구분}} | {{req_id:text|요구사항 고유번호}} | {{req_name:text|요구사항 명}}",
    ];
    const { asset, validation } = compileVsyntaxDslToAssetV3(dsl, {
      title: "요구사항 목록표",
      scope: "element",
      assetId: "req-list-vsyntax",
      style: {
        selectors: ["table.column-header", "table.value"],
        tokens: {
          "table.column-header": { backgroundColor: "#e6ecf5", fontWeight: "bold", hAlign: "center" },
          "table.value": { backgroundColor: "#ffffff" },
        },
      },
    });

    assert.equal(validation.ok, true, JSON.stringify(validation.errors));
    assert.deepEqual(asset.dsl, dsl);

    const inst = instantiateAssetV3(asset, {
      rows: [
        { seq: "1", category: "시스템 구성(ECR)", req_id: "ECR-001", req_name: "도메인 중립 엔진" },
        { seq: "2", category: "시스템 구성(ECR)", req_id: "ECR-002", req_name: "확장 아키텍처" },
        { seq: "3", category: "기능 요구사항(SFR)", req_id: "SFR-001", req_name: "딥리딩 엔진" },
        { seq: "4", category: "기능 요구사항(SFR)", req_id: "SFR-002", req_name: "팩트 앵커링" },
        { seq: "5", category: "기능 요구사항(SFR)", req_id: "SFR-003", req_name: "근거 추적" },
        { seq: "6", category: "기능 요구사항(SFR)", req_id: "SFR-004", req_name: "스타일 팩" },
        { seq: "7", category: "성능 요구사항(PER)", req_id: "PER-001", req_name: "인덱싱 지연" },
        { seq: "8", category: "성능 요구사항(PER)", req_id: "PER-002", req_name: "렌더 응답" },
        { seq: "9", category: "품질 요구사항(QUR)", req_id: "QUR-001", req_name: "무결성 검증" },
        { seq: "10", category: "품질 요구사항(QUR)", req_id: "QUR-002", req_name: "감사 로그" },
      ],
    });

    assert.equal(inst.blocks.length, 1);
    const tbl = inst.blocks[0] as Extract<LayoutBlock, { kind: "structured-table" }>;
    assert.equal(tbl.kind, "structured-table");
    assert.equal(tbl.rows.length, 11, "1 header row + 10 data rows");

    // Verify dynamic rowSpan merges on col 1 (구분): ECR=2, SFR=4, PER=2, QUR=2
    const placements = getTableCellPlacements(tbl);
    const col1DataCells = placements.filter((p) => p.col === 1 && p.row >= 1);
    assert.equal(col1DataCells.length, 4, "10 rows must collapse into 4 merged category cells");
    assert.deepEqual(
      col1DataCells.map((p) => ({ row: p.row, rowSpan: p.rowSpan })),
      [
        { row: 1, rowSpan: 2 },
        { row: 3, rowSpan: 4 },
        { row: 7, rowSpan: 2 },
        { row: 9, rowSpan: 2 },
      ]
    );
  });

  it("compiles ECR complex merged form via [<] and [^] and round-trips through renderAssetV3ToVsyntaxDsl", () => {
    const dsl = [
      "<<view:table>> 요구사항 명세서 양식 (ECR)",
      "  요구사항 분류 | [<] | {{category|요구사항 분류}}",
      "  요구사항 고유번호 | [<] | {{reqId|요구사항 고유번호}}",
      "  요구사항 명칭 | [<] | {{reqName|요구사항 명칭}}",
      "  요구사항 세부내용 | 정의 | {{definition|정의}}",
      "  [^] | 세부내용 | {{details:rich|세부내용}}",
      "  산출정보 | [<] | {{deliverables|산출정보}}",
    ];

    const first = compileVsyntaxDslToAssetV3(dsl, { title: "요구사항 명세서 양식 (ECR)", scope: "element" });
    assert.equal(first.validation.ok, true, JSON.stringify(first.validation.errors));

    const rendered = renderAssetV3ToVsyntaxDsl({ ...first.asset, dsl: undefined });
    assert.ok(rendered.some((l) => l.includes("[<]")));
    assert.ok(rendered.some((l) => l.includes("[^]")));

    const second = compileVsyntaxDslToAssetV3(rendered, { title: "요구사항 명세서 양식 (ECR)", scope: "element" });
    assert.equal(second.validation.ok, true, JSON.stringify(second.validation.errors));

    const score = scoreSkeleton(first.asset, second.asset);
    for (const k of ["gridShape", "cellKind", "span", "role", "labels"] as const) {
      assert.equal(score.metrics[k], 1, `round-trip metric ${k} must be 1.0`);
    }
  });

  it("honors custom symbols from a vault ElementRegistrySnapshot (.vsyntax)", () => {
    const base = createElementSyntaxRegistry().exportSnapshot();
    const customSnapshot = {
      ...base,
      elements: base.elements.map((el) =>
        el.id === "table"
          ? {
              ...el,
              rules: el.rules.map((r) => (r.id === "col-split" ? { ...r, symbol: "||" } : r)),
            }
          : el
      ),
    };
    const { asset, validation } = compileVsyntaxDslToAssetV3(
      ["<<view:table>> 커스텀 구분자 표", "  항목 || 값", "  이름 || {{name|이름}}"],
      { title: "커스텀 구분자 표", registry: customSnapshot }
    );
    assert.equal(validation.ok, true, JSON.stringify(validation.errors));
    const grid = asset.nodes[0];
    assert.equal(grid.t, "grid");
    assert.equal(grid.rows[0].cells.length, 2);
  });

  it("bridges AssetV3 <-> VDocAsset cleanly for unified Asset Hub & AI Composer catalog", () => {
    const { asset: v3 } = compileVsyntaxDslToAssetV3(
      [
        "<<view:table>> 일정 요약표",
        "  단계 | 기간 | 담당",
        "  * {{phase|단계}} | {{period|기간}} | {{owner|담당}}",
      ],
      { title: "일정 요약표", assetId: "sched-v3" }
    );
    const hubView = v3ToVDocAsset(v3, { lifecycle: "session" });
    assert.equal(hubView.assetId, "sched-v3");
    assert.ok(hubView.structure.blocks.length >= 1);
    assert.ok(hubView.structure.outlineDsl.length >= 3);
    assert.ok(hubView.tags.includes("v3"));

    const builtinV1 = BUILTIN_VDOC_ASSETS[0];
    const promotedV3 = vDocAssetToV3(builtinV1);
    assert.equal(promotedV3.schema, "vibe-asset/3");
    assert.equal(promotedV3.assetId, builtinV1.assetId);
    assert.ok(promotedV3.nodes.length >= 1);
    assert.ok((promotedV3.dsl?.length ?? 0) >= 1);
  });

  it("compiles .vsyntax variant & dotted open cell roles into live styleKey/cellRole pointers without baking inline hex", () => {
    const { asset, validation } = compileVsyntaxDslToAssetV3(
      [
        "<<view:title:list-heading>> 요구사항 목록표",
        "<<view:table:open-list>> 요구사항 목록표",
        "  순번 | 구분 | 요구사항 고유번호 | 요구사항 명",
        "  * {value.seq}{{seq:number|순번}} | {value.category}{{category:text^|구분}} | {value.code}{{code:code|고유번호}} | {{title:text|요구사항 명}}",
      ],
      { title: "요구사항 목록표 (라이브 스타일)", scope: "section" }
    );
    assert.equal(validation.ok, true, JSON.stringify(validation.errors));
    assert.equal(validation.warnings.length, 0, JSON.stringify(validation.warnings));

    const inst = instantiateAssetV3(asset, {
      rows: [
        { seq: "1", category: "시스템 구성", code: "ECR-001", title: "하드웨어 구성" },
        { seq: "2", category: "시스템 구성", code: "ECR-002", title: "소프트웨어 구성" },
        { seq: "3", category: "보안", code: "SER-001", title: "접근 통제" },
      ],
    });
    assert.equal(inst.blocks.length, 2);

    const heading = inst.blocks[0];
    assert.equal(heading.kind, "heading");
    assert.equal(heading.styleKey, "list-heading");

    const table = inst.blocks[1];
    assert.equal(table.kind, "structured-table");
    if (table.kind === "structured-table") {
      assert.equal(table.styleKey, "open-list");
      assert.equal(table.borderRules, undefined, "no inline borderRules baked when relying on live .vstyle");
      // Header row carries column-header role, zero inline backgroundColor
      assert.equal(table.rows[0].cells[0].cellRole, "column-header");
      assert.equal(table.rows[0].cells[0].backgroundColor, undefined);
      // Data rows carry dotted open cellRoles + dynamic vertical merge on category
      assert.equal(table.rows[1].cells[0].cellRole, "value.seq");
      assert.equal(table.rows[1].cells[1].cellRole, "value.category");
      assert.equal(table.rows[1].cells[1].rowSpan, 2);
      assert.equal(table.rows[1].cells[2].cellRole, "value.code");
      assert.equal(table.rows[1].cells[3].cellRole, "value");
      assert.equal(table.rows[1].cells[0].hAlign, undefined, "alignment resolved live from .vstyle");
    }
  });

  it("preserves explicit summary roles ({total.subtotal}, {total}) on fixed labels and {group-label}/{label} on fill cells", () => {
    const { asset, validation } = compileVsyntaxDslToAssetV3(
      [
        "<<view:table:eval-rubric>> 평가항목 및 배점 기준표",
        "  평가부문 | [<] | 평가항목 | 평가기준 | 배점",
        "  {group-label}{{major|대분류}} | {label}{{sub|세부부문}} | {label}{{item|평가항목}} | {{criteria:rich|평가기준}} | {value.score}{{score:number|배점}}",
        "  [^] | [^] | {total.subtotal}소계 | [<] | {total.subtotal}{{sub_total:number|소계}}",
        "  {total.tech}기술평가 소계 | [<] | [<] | [<] | {total.tech}{{tech_total:number|기술평가 소계}}",
        "  {total}합계 | [<] | [<] | [<] | {total}{{grand_total:number|합계}}",
      ],
      { title: "평가항목 및 배점 기준표", scope: "element" }
    );
    assert.equal(validation.ok, true, JSON.stringify(validation.errors));
    const inst = instantiateAssetV3(asset, {
      major: "정성평가",
      sub: "기술",
      item: "아키텍처",
      criteria: "구조 타당성",
      score: "30",
      sub_total: "30",
      tech_total: "90",
      grand_total: "100",
    });
    const tbl = inst.blocks[0];
    assert.equal(tbl.kind, "structured-table");
    if (tbl.kind === "structured-table") {
      assert.equal(tbl.styleKey, "eval-rubric");
      // Fill cells preserve explicit group-label / label roles
      assert.equal(tbl.rows[1].cells[0].cellRole, "group-label");
      assert.equal(tbl.rows[1].cells[1].cellRole, "label");
      assert.equal(tbl.rows[1].cells[4].cellRole, "value.score");
      // Fixed summary label cells preserve total.subtotal / total.tech / total roles (NOT wiped to 'label'!)
      assert.equal(tbl.rows[2].cells[0].cellRole, "total.subtotal");
      assert.equal(tbl.rows[2].cells[1].cellRole, "total.subtotal");
      assert.equal(tbl.rows[3].cells[0].cellRole, "total.tech");
      assert.equal(tbl.rows[4].cells[0].cellRole, "total");
    }
  });
});

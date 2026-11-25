import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  applyAssetToBlocks,
  canonicalComponentId,
  collectFields,
  decomposeBlocks,
  gridGeometry,
  instantiateAssetV3,
  labelSimilarity,
  mapItemsToAsset,
  scoreSkeleton,
  skeletonFingerprint,
  validateAssetV3,
  type AssetV3,
  type LayoutBlock,
  type SkelNode,
  type VDocSlot,
} from "../src";

const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(here, "fixtures", "asset-core-blocks.json"), "utf8")) as {
  rfp: { req: LayoutBlock[]; eval: LayoutBlock[]; basic: LayoutBlock[] };
  blog: LayoutBlock[];
  slots: Record<string, VDocSlot>;
};
const slots = fx.slots;
const asAsset = (nodes: SkelNode[], extra: Partial<AssetV3> = {}): AssetV3 => ({
  schema: "vibe-asset/3",
  assetId: "t",
  title: "t",
  scope: "element",
  nodes,
  ...extra,
});
const plain = (s: string) => s.replace(/<[^>]*>/g, "").trim();

/** 붙여 넣은 ECR-05 서식 그림의 정답 골격 (3열 · 묶음 머리칸 세로 병합 · 머리칸 가로 병합). */
const ECR_TRUTH: AssetV3 = asAsset([
  {
    t: "grid",
    component: "table",
    rows: [
      { cells: [{ role: "label", cs: 2, text: "요구사항 분류" }, { role: "value", field: { id: "category", type: "text", hint: "요구사항 분류" } }] },
      { cells: [{ role: "label", cs: 2, text: "요구사항 고유번호" }, { role: "value", field: { id: "req_id", type: "code", hint: "요구사항 고유번호" } }] },
      { cells: [{ role: "label", cs: 2, text: "요구사항 명칭" }, { role: "value", field: { id: "name", type: "text", hint: "요구사항 명칭" } }] },
      {
        cells: [
          { role: "group-label", rs: 2, text: "요구사항 세부내용" },
          { role: "sub-label", text: "정의" },
          { role: "value", field: { id: "definition", type: "text", hint: "정의" } },
        ],
      },
      { cells: [{ role: "sub-label", text: "세부내용" }, { role: "value", field: { id: "details", type: "list", hint: "세부내용" } }] },
      { cells: [{ role: "label", cs: 2, text: "산출정보" }, { role: "value", field: { id: "outputs", type: "text", hint: "산출정보" } }] },
    ],
  },
]);

describe("asset-core registry", () => {
  it("maps old block / builder names to one component", () => {
    assert.equal(canonicalComponentId("structured-table"), "table");
    assert.equal(canonicalComponentId("callout-box"), "frame");
    assert.equal(canonicalComponentId("gallery"), "columns");
    assert.equal(canonicalComponentId("paragraph"), "text");
  });
});

describe("decompose existing blocks", () => {
  const [ecr, sfr1, sfr2, per] = fx.rfp.req;

  it("decomposes a requirement table into labels + fields with hints, style split out", () => {
    const d = decomposeBlocks({ blocks: [sfr1], slots });
    const asset = asAsset(d.nodes, { style: d.style });
    const v = validateAssetV3(asset);
    assert.ok(v.ok, JSON.stringify(v.errors));
    const fields = collectFields(d.nodes);
    assert.equal(fields.length, 6);
    assert.deepEqual(
      fields.map((f) => f.label),
      ["요구사항 분류", "요구사항 고유번호", "요구사항 명칭", "정의", "세부 내용", "산출정보"]
    );
    // 스타일은 구조가 아니라 역할 선택자 토큰으로
    assert.ok(d.style.selectors.includes("table.label"));
    assert.equal(d.style.tokens?.["table.label"]?.backgroundColor, "#e8edf5");
    assert.ok(!JSON.stringify(d.nodes).includes("#e8edf5"), "구조에 색이 남으면 안 된다");
  });

  it("same-shaped tables share one fingerprint; a different table does not", () => {
    const fps = fx.rfp.req.map((b) => skeletonFingerprint(decomposeBlocks({ blocks: [b], slots }).nodes));
    assert.equal(new Set(fps).size, 1, "요구사항 표 4개는 한 에셋");
    const other = skeletonFingerprint(decomposeBlocks({ blocks: fx.rfp.eval, slots }).nodes);
    assert.notEqual(other, fps[0]);
  });

  it("peers promote values identical across every instance to fixed labels", () => {
    const d = decomposeBlocks({ blocks: [sfr1], slots }, { peers: [{ blocks: [sfr2], slots }] });
    const labels = JSON.stringify(d.nodes);
    // 두 SFR 표 모두 '기능 요구사항(SFR)' → 이 둘만 놓고 보면 구조
    assert.ok(labels.includes("기능 요구사항(SFR)"));
    const withAll = decomposeBlocks({ blocks: [sfr1], slots }, { peers: [ecr, sfr2, per].map((b) => ({ blocks: [b], slots })) });
    assert.ok(!JSON.stringify(withAll.nodes).includes("기능 요구사항(SFR)"), "네 표에서 다르면 내용");
  });

  it("round trip: instantiate(decompose(B)) decomposes back to the same structure and content", () => {
    for (const block of [...fx.rfp.req, ...fx.rfp.eval, ...fx.rfp.basic, ...fx.blog]) {
      const d = decomposeBlocks({ blocks: [block], slots });
      const inst = instantiateAssetV3(asAsset(d.nodes, { style: d.style }), d.records, { idPrefix: "rt" });
      const again = decomposeBlocks({ blocks: inst.blocks, slots: { ...slots, ...inst.slots } });
      assert.equal(skeletonFingerprint(again.nodes), skeletonFingerprint(d.nodes), `${block.kind} ${block.blockId}`);
      assert.deepEqual(
        Object.fromEntries(Object.entries(again.records).map(([k, v]) => [k, typeof v === "string" ? plain(v) : JSON.stringify(v).replace(/<[^>]*>/g, "")])),
        Object.fromEntries(Object.entries(d.records).map(([k, v]) => [k, typeof v === "string" ? plain(v) : JSON.stringify(v).replace(/<[^>]*>/g, "")])),
        `${block.kind} ${block.blockId} 내용`
      );
      assert.ok(inst.blocks.every((b) => b.assetRef?.assetId === "t"), "인스턴스는 assetRef 를 가진다");
    }
  });

  it("covers blog components (cover, heading, text, columns, frame, divider, table)", () => {
    const d = decomposeBlocks({ blocks: fx.blog, slots });
    const v = validateAssetV3(asAsset(d.nodes, { style: d.style }));
    assert.ok(v.ok, JSON.stringify(v.errors));
    assert.deepEqual(
      d.nodes.map((n) => (n.t === "grid" || n.t === "container" ? `${n.t}:${n.component}` : n.t)),
      ["container:cover", "field", "field", "grid:columns", "container:frame", "divider", "grid:table"]
    );
    assert.equal(d.notes.length, 0);
  });
});

describe("repeat units (늘리기)", () => {
  it("a top-header data table becomes one repeated row; more records extend it", () => {
    const d = decomposeBlocks({ blocks: fx.rfp.eval, slots });
    const grid = d.nodes[0] as Extract<SkelNode, { t: "grid" }>;
    assert.equal(grid.rows.length, 2, "머리 행 + 반복 행 하나");
    assert.equal(grid.rows[1].repeat, "rows");
    const rows = d.records.rows as unknown as Record<string, string>[];
    assert.equal(rows.length, 5);
    const more = [...rows, { ...rows[0] }, { ...rows[1] }];
    const inst = instantiateAssetV3(asAsset(d.nodes), { ...d.records, rows: more });
    const table = inst.blocks[0] as Extract<LayoutBlock, { kind: "structured-table" }>;
    assert.equal(table.rows.length, 1 + 7);
    assert.equal(inst.report.repeats.rows, 7);
  });
});

describe("reshape into another asset (형식 바꾸기)", () => {
  it("SFR 2-column table → ECR 3-column shape keeps all 6 values and their cells", () => {
    const sfr = fx.rfp.req[1] as Extract<LayoutBlock, { kind: "structured-table" }>;
    const res = applyAssetToBlocks({ blocks: [sfr], slots }, ECR_TRUTH, { idPrefix: "rs" });
    assert.deepEqual(res.preserved, { kept: 6, total: 6 }, JSON.stringify(res.map));
    assert.equal(res.map.unmapped.length, 0);
    const table = res.blocks[0] as Extract<LayoutBlock, { kind: "structured-table" }>;
    const back = decomposeBlocks({ blocks: [table], slots: { ...slots, ...res.slots } });
    const s = scoreSkeleton(ECR_TRUTH, asAsset(back.nodes));
    for (const k of ["gridShape", "cellKind", "span", "role", "labels"] as const) assert.equal(s.metrics[k], 1, `결과 모양 = 목표 에셋 (${k})`);
    // 칸 정체성: 원래 값 칸 id 를 이어받는다
    const oldValueSlots = new Set(sfr.rows.map((r) => r.cells[1].slotId));
    const newSlotIds = table.rows.flatMap((r) => r.cells.map((c) => c.slotId));
    assert.equal(newSlotIds.filter((s) => oldValueSlots.has(s)).length, 6);
  });
});

describe("validator (사양 문)", () => {
  it("accepts the truth asset", () => assert.ok(validateAssetV3(ECR_TRUTH).ok));
  const bad = (nodes: unknown) => validateAssetV3({ ...ECR_TRUTH, nodes }).errors.map((e) => e.code);
  it("rejects style inside structure", () => {
    assert.ok(bad([{ t: "label", role: "title", text: "제목", color: "#222" }]).includes("unknown-key"));
  });
  it("rejects overlapping / ragged grids", () => {
    const codes = bad([{ t: "grid", component: "table", rows: [{ cells: [{ role: "label", rs: 2, text: "A" }, { role: "value", field: { id: "a", type: "text" } }] }, { cells: [{ role: "label", text: "B" }, { role: "value", field: { id: "b", type: "text" } }] }] }]);
    assert.ok(codes.includes("geometry"));
  });
  it("rejects wrong role kind, duplicate ids, empty labels", () => {
    const codes = bad([
      { t: "label", role: "value", text: "x" },
      { t: "field", role: "body", field: { id: "a", type: "text" } },
      { t: "field", role: "body", field: { id: "a", type: "text" } },
      { t: "label", role: "label", text: "" },
    ]);
    assert.ok(codes.includes("role-kind"));
    assert.ok(codes.includes("field-dup"));
    assert.ok(codes.includes("text-empty"));
  });
  it("rejects a vertical merge that crosses a repeat unit", () => {
    const codes = bad([
      {
        t: "grid",
        component: "table",
        rows: [
          { cells: [{ role: "label", rs: 2, text: "A" }, { role: "value", field: { id: "a", type: "text" } }] },
          { repeat: "r", cells: [{ role: "value", field: { id: "b", type: "text" } }] },
        ],
      },
    ]);
    assert.ok(codes.includes("repeat-span"));
  });
});

describe("scoring (분해 채점)", () => {
  it("truth vs itself is 1", () => assert.equal(scoreSkeleton(ECR_TRUTH, ECR_TRUTH).overall, 1));
  it("a flat 2-column misreading scores clearly lower", () => {
    const flat = decomposeBlocks({ blocks: [fx.rfp.req[0]], slots });
    const s = scoreSkeleton(ECR_TRUTH, asAsset(flat.nodes));
    assert.ok(s.overall < 0.8 && s.overall > 0.2, String(s.overall));
    assert.ok(s.metrics.span < 1);
  });
  it("expanded data rows still align, but missing repeat is penalised", () => {
    const d = decomposeBlocks({ blocks: fx.rfp.eval, slots });
    const truth = asAsset(d.nodes);
    const header = (d.nodes[0] as Extract<SkelNode, { t: "grid" }>).rows[0];
    const unit = (d.nodes[0] as Extract<SkelNode, { t: "grid" }>).rows[1];
    const expanded = asAsset([
      {
        t: "grid",
        component: "table",
        rows: [header, ...[0, 1, 2].map((i) => ({ cells: unit.cells.map((c) => ({ ...c, field: { ...c.field!, id: `${c.field!.id}_${i}` } })) }))],
      },
    ]);
    const s = scoreSkeleton(truth, expanded);
    assert.equal(s.metrics.cellKind, 1);
    assert.equal(s.metrics.repeat, 0);
    assert.ok(s.overall < 1);
  });
  it("geometry helper reports widths", () => {
    const g = gridGeometry((ECR_TRUTH.nodes[0] as Extract<SkelNode, { t: "grid" }>).rows);
    assert.equal(g.colCount, 3);
    assert.equal(g.errors.length, 0);
  });
});

describe("mapping other data onto an asset (유사 데이터)", () => {
  it("similar labels map; unknown items are reported, not dropped", () => {
    assert.ok(labelSimilarity("요구사항명칭", "요구사항 명칭") === 1);
    assert.ok(labelSimilarity("요구사항 명", "요구사항 명칭") > 0.5);
    const res = mapItemsToAsset(
      [
        { label: "분류", value: "보안 요구사항(SER)" },
        { label: "고유번호", value: "SER-003" },
        { label: "요구사항 명", value: "접근 통제" },
        { label: "정의", value: "권한별 접근 제한" },
        { label: "세부 내용", value: "<ul><li>RBAC</li></ul>" },
        { label: "담당 부서", value: "보안팀" },
      ],
      ECR_TRUTH
    );
    assert.equal(res.records.req_id, "SER-003");
    assert.equal(res.records.name, "접근 통제");
    assert.equal(res.records.details, "<ul><li>RBAC</li></ul>");
    assert.deepEqual(res.unmapped, ["담당 부서"]);
    assert.deepEqual(res.missing, ["outputs"]);
  });
});

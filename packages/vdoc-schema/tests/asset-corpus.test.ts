/**
 * 처음 보는 양식 코퍼스(evals/asset-forms)의 정답 자체가 사양을 지키는가 — 채점 기준이 틀리면 평가가 틀린다.
 * 그리고 정답은 인스턴스화 → 다시 분해해도 같은 모양으로 돌아와야 한다 (렌더 경로가 사양의 모든 노드를 다룬다).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { collectFields, decomposeBlocks, instantiateAssetV3, mapItemsToAsset, scoreSkeleton, validateAssetV3, type AssetRecords, type AssetV3 } from "../src";

/** 반복 단위마다 레코드 2건, 나머지 자리는 글 하나 — 묶음 머리칸 · 반복 펼치기가 실제로 돈다. */
function sampleRecords(asset: AssetV3): AssetRecords {
  const out: Record<string, string | AssetRecords[]> = {};
  const units = new Map<string, string[]>();
  for (const f of collectFields(asset.nodes)) {
    if (f.repeat) units.set(f.repeat, [...(units.get(f.repeat) ?? []), f.field.id]);
    else out[f.field.id] = f.field.type === "image" ? "img.png" : `값 ${f.field.id}`;
  }
  for (const [u, ids] of units) out[u] = [0, 1].map((i) => Object.fromEntries(ids.map((id) => [id, `값 ${id} ${i}`])));
  return out;
}

const casesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "evals", "asset-forms", "cases");
const cases = existsSync(casesDir) ? readdirSync(casesDir).filter((d) => existsSync(join(casesDir, d, "truth.json"))) : [];

describe("asset-forms corpus truths", () => {
  it("has cases", () => assert.ok(cases.length >= 10, `cases=${cases.length}`));
  for (const id of cases) {
    const truth = JSON.parse(readFileSync(join(casesDir, id, "truth.json"), "utf8")) as AssetV3;
    it(`${id}: truth passes the spec`, () => {
      const v = validateAssetV3(truth);
      assert.ok(v.ok, JSON.stringify(v.errors, null, 1));
      assert.equal(scoreSkeleton(truth, truth).overall, 1);
    });
    it(`${id}: truth instantiates and decomposes back to the same structure`, () => {
      const inst = instantiateAssetV3(truth, sampleRecords(truth), { idPrefix: id.replace(/\W/g, "") });
      assert.ok(inst.blocks.length > 0);
      const back = decomposeBlocks({ blocks: inst.blocks, slots: inst.slots });
      const s = scoreSkeleton(truth, { ...truth, nodes: back.nodes });
      // 고정 글 · 격자 · 병합 · 반복은 그대로여야 한다 (필드 종류는 값에서 추론하므로 제외)
      for (const k of ["gridShape", "cellKind", "span", "labels", "repeat"] as const) assert.ok(s.metrics[k] >= 0.99, `${id} ${k}=${s.metrics[k]} ${s.notes.join(";")}`);
    });
  }
});

describe("similar-data mapping (deterministic part)", () => {
  it("ECR truth: renamed labels map, extra items are reported", () => {
    const truth = JSON.parse(readFileSync(join(casesDir, "ecr-requirement-screenshot", "truth.json"), "utf8")) as AssetV3;
    const res = mapItemsToAsset(
      [
        { label: "분류", value: "보안 요구사항(SER)" },
        { label: "고유번호", value: "SER-003" },
        { label: "명칭", value: "접근 통제" },
        { label: "정의", value: "권한별 접근 제한" },
        { label: "세부 내용", value: "<ul><li>RBAC</li></ul>" },
        { label: "산출물", value: "보안 설계서" },
        { label: "담당 부서", value: "보안팀" },
      ],
      truth
    );
    assert.equal(res.records.category, "보안 요구사항(SER)");
    assert.equal(res.records.req_id, "SER-003");
    assert.equal(res.records.name, "접근 통제");
    assert.ok(res.unmapped.includes("담당 부서"));
  });
  it("invoice: row data with different column names extends the repeat", () => {
    const truth = JSON.parse(readFileSync(join(casesDir, "invoice", "truth.json"), "utf8")) as AssetV3;
    const res = mapItemsToAsset(
      [
        { label: "견적 번호", value: "Q-1" },
        { label: "작성일", value: "2026-03-20" },
        {
          label: "품목들",
          rows: [
            { 품명: "노트북", 수량: "3", 단가: "1,200,000", 금액: "3,600,000" },
            { 품명: "마우스", 수량: "3", 단가: "25,000", 금액: "75,000" },
            { 품명: "가방", 수량: "3", 단가: "40,000", 금액: "120,000" },
            { 품명: "배송비", 수량: "1", 단가: "30,000", 금액: "30,000" },
          ],
        },
        { label: "총액", value: "3,825,000" },
      ],
      truth
    );
    assert.equal(res.records.quote_no, "Q-1");
    assert.equal((res.records.items as unknown[]).length, 4);
    // 글자가 하나도 겹치지 않는 동의어(총액 ↔ 합계, 작성일 ↔ 견적일)는 코드가 짝짓지 않는다 — 버리지 않고 보고한다.
    // 이 짝짓기는 에셋 자리 목록을 본 에이전트가 이름표를 맞춰 넘기는 몫이다 (평가 러너의 유사 데이터 과제).
    assert.ok(res.unmapped.includes("총액"));
    assert.ok(res.missing.includes("total"));
    const inst = instantiateAssetV3(truth, res.records);
    assert.equal(inst.report.repeats.items, 4);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryVaultAdapter } from "@vibe/vault-core";
import {
  collectVaultAssets,
  saveAssetToVault,
} from "@vibe/vault-formats";
import {
  getActiveAssetDriver,
  getActiveAssetSchemaVersion,
  getAssetDriver,
  setActiveAssetSchemaVersion,
  validateCompiledAssetBlocks,
} from "@vibe/vdoc-schema";
import {
  applyAssetPreviewViaAi,
  parseAssetFromRefViaAi,
  recommendAssetsViaAi,
} from "@vibe/ai-vault";

describe("One-Switch 에셋 스키마 A/B 드라이버 (v1-dsl <-> v2-primitive) · Import / Apply / Select 검증", () => {
  it("단일 스위치(v1 <-> v2)로 시드 · 볼트 네임스페이스(.vibedoc/assets/ vs v2/)가 충돌 없이 일괄 전환된다", () => {
    const vault = new MemoryVaultAdapter({ id: "ab-vault", name: "AB Vault", initialEntries: [] });

    setActiveAssetSchemaVersion("v1");
    assert.equal(getActiveAssetSchemaVersion(), "v1");
    const v1List = collectVaultAssets(vault);
    assert.equal(v1List.length, 6);
    assert.equal(getActiveAssetDriver().vaultSubdir, "");

    setActiveAssetSchemaVersion("v2");
    assert.equal(getActiveAssetSchemaVersion(), "v2");
    const v2List = collectVaultAssets(vault);
    assert.ok(v2List.length >= 4);
    assert.ok(v2List.some((e) => e.asset.assetId === "asset-v2-legal-appeal-brief"));
    assert.equal(getActiveAssetDriver().vaultSubdir, "v2");

    // 상고이유서 v2 시드가 표(structured-table) 없이 무테두리 KV + 계층번호 산문으로 안전 컴파일되는지 검증
    const appeal = v2List.find((e) => e.asset.assetId === "asset-v2-legal-appeal-brief")!.asset;
    assert.equal(appeal.v2?.flowMode, "prose-form");
    assert.equal(
      appeal.structure.blocks.some((b) => b.kind === "structured-table"),
      false,
      "상고이유서 글 중심 폼은 structured-table 로 억지 변환되면 안 된다"
    );
    const validated = validateCompiledAssetBlocks(appeal.structure.blocks, appeal.structure.slots);
    assert.equal(validated.ok, true);

    // v2 에셋 저장 시 `.vibedoc/assets/v2/` 네임스페이스에 격리 저장되고 v1 목록을 오염시키지 않는다
    const savedV2Path = saveAssetToVault(vault, appeal);
    assert.ok(savedV2Path.startsWith(".vibedoc/assets/v2/"));
    assert.equal(collectVaultAssets(vault, { schemaVersion: "v1" }).length, 6);
    assert.equal(collectVaultAssets(vault, { schemaVersion: "v2" }).some((e) => e.vaultPath === savedV2Path), true);
  });

  it("1단계 Import: 상고이유서 레퍼런스를 v1 vs v2 로 각각 추출하면 v2 는 prose-form(무테두리 KV + 계층번호)으로 패턴화한다", async () => {
    const refInput = {
      refTitle: "상고이유서",
      assetKind: "a4-page" as const,
      blockSummaries: [
        "[서식 예] 상고이유서",
        "사건 20○○다○○○ 부당이득금반환 · 원고(상고인) · 피고(피상고인)",
        "- 아 래 -",
        "1. 상고이유 제1점 — 가. 원심은 주택임대차보호법상 우선변제권에 관한 법리를 오해",
      ],
    };

    const resV1 = await parseAssetFromRefViaAi({ ...refInput, schemaVersion: "v1" });
    const resV2 = await parseAssetFromRefViaAi({ ...refInput, schemaVersion: "v2" });

    assert.equal(resV1.asset.version, "1.0.0");
    assert.equal(
      resV1.asset.structure.blocks.some((b) => b.kind === "structured-table"),
      true,
      "v1 기준선은 A4 페이지를 table 위주로 추상화한다"
    );

    assert.equal(resV2.asset.version, "2.0.0");
    assert.equal(resV2.asset.v2?.flowMode, "prose-form");
    assert.equal(
      resV2.asset.structure.blocks.some((b) => b.kind === "structured-table"),
      false,
      "v2 드라이버는 글 중심 법률 서면을 table 없이 무테두리 KV + clause-tree 로 추출한다"
    );
    assert.ok((resV2.asset.v2?.fields.length ?? 0) >= 4);
  });

  it("2단계 Apply: 상고이유서 v2 에셋에 실제 사건 데이터 + <<resource:...>> 근거를 주입해도 구조 깨짐 없이 컴파일된다", async () => {
    const appeal = getAssetDriver("v2")
      .getSeeds()
      .find((a) => a.assetId === "asset-v2-legal-appeal-brief")!;

    const applied = await applyAssetPreviewViaAi({
      asset: appeal,
      schemaVersion: "v2",
      mode: "transform",
      targetScope: "page",
      documentTitle: "상고이유서 (2026다10428 부당이득금반환)",
      userOutlineDsl: [],
      userPlainText: [
        "사건: 2026다10428 부당이득금반환",
        "원고(상고인): 김철수",
        "피고(피상고인): 이영희",
        "원심은 소액임차인의 우선변제권 범위를 오해하였다.",
        "<<resource: [[제안요청서_샘플_5P.pdf]] #p5 | 테넌트 단위 AES-256 암호화로 격리 저장되며>>",
      ].join("\n"),
    });

    assert.equal(applied.ok, true);
    assert.ok(applied.blocks.length > 0);
    assert.ok(applied.outlineDsl.some((l) => l.includes("2026다10428") || l.includes("김철수")));
  });

  it("3단계 Select: 사람용 배지 요약과 에이전트 추천 정확도(법원 서면 / 계약서 / 실적표 / 블로그)가 v2 에서 의도에 정확히 매칭된다", async () => {
    const v2Driver = getAssetDriver("v2");
    const v2Seeds = v2Driver.getSeeds();

    const appealSummary = v2Driver.summarizeForSelect(
      v2Seeds.find((a) => a.assetId === "asset-v2-legal-appeal-brief")!
    );
    assert.ok(appealSummary.badges.includes("글 중심 폼"));
    assert.ok(appealSummary.badges.includes("무테두리 KV"));
    assert.ok(appealSummary.badges.includes("법률번호(1.→가.)"));
    assert.ok(appealSummary.evidenceHintCount >= 3);

    // 모호한 자연어 요청별 Top-1 추천 검증
    const q1 = await recommendAssetsViaAi("법원에 제출할 상고 이유 서면 만들어줘", v2Seeds, "v2");
    assert.equal(q1.recommendations[0]?.asset.assetId, "asset-v2-legal-appeal-brief");

    const q2 = await recommendAssetsViaAi("거래처와 체결할 업무위탁 계약서 조항 양식 추천해줘", v2Seeds, "v2");
    assert.equal(q2.recommendations[0]?.asset.assetId, "asset-v2-legal-contract");

    const q3 = await recommendAssetsViaAi("공공 입찰용 사업 실적 증명서 표 양식", v2Seeds, "v2");
    assert.equal(q3.recommendations[0]?.asset.assetId, "asset-v2-attach5-performance");

    const q4 = await recommendAssetsViaAi("여행지 스팟 리뷰 블로그 포스팅 섹션", v2Seeds, "v2");
    assert.equal(q4.recommendations[0]?.asset.assetId, "asset-v2-blog-spot");

    // 테스트 종료 후 기본값 복원
    setActiveAssetSchemaVersion("v2");
  });
});

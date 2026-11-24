import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildEvidenceBacklinkIndex,
  compileDirectiveSubtreeToVDoc,
  extractInlineCiteBullets,
  parseCiteBullet,
  type OutlineSyntaxNode,
} from "@vibe/vdoc-schema";
import { parseOutlineJson, parseVDocJson, toVaultUri } from "@vibe/vault-formats";
import {
  collectOutlineEvidenceEntries,
  collectVDocEvidenceEntries,
  resolveEvidenceVaultPath,
} from "../ui/EvidenceExpressions";
import { tokenizeOutlineInline } from "../ui/outlineLiveRenderer";

const VAULT_ROOT = path.resolve(process.cwd(), "data/vaults/default-vault");
const SHOWCASE_DIR = "06. 근거_인용_쇼케이스";
const UNIFIED_OUTLINE = "00. 근거_인용_6대_표현_통합_쇼케이스.outline";
const UNIFIED_VDOC = "00. 근거_인용_6대_표현_통합_쇼케이스.vdoc";

function resolveResourceInVault(rawTarget: string): string | undefined {
  const resDir = path.join(VAULT_ROOT, SHOWCASE_DIR, "resources");
  const full = path.join(resDir, rawTarget);
  if (fs.existsSync(full)) {
    return toVaultUri(`${SHOWCASE_DIR}/resources/${rawTarget}`);
  }
  return undefined;
}

describe("v2 근거·인용 6대 표현 통합 쇼케이스 (편집 가능한 <<cite:...>> 하위 불릿)", () => {
  it("parseCiteBullet 이 6대 표현 문법과 N:1 파이프 분리·수정 시나리오를 정확히 파싱한다", () => {
    const rationale = parseCiteBullet(
      "<<cite:rationale>> 백데이터 참석 설문지 응답(35명) + 추가 신청 메일(3명) | [[참석_설문지.csv]] #L2-L36 | [[추가_신청_메일.md]] #L6-L9",
      { resolveSourcePath: resolveResourceInVault }
    );
    assert.ok(rationale && rationale.length === 2);
    assert.equal(rationale[0].presentation, "inline-rationale");
    assert.equal(rationale[0].relation, "derives");
    assert.match(rationale[0].rationale ?? "", /백데이터 참석 설문지/);
    assert.deepEqual(rationale[0].lines, [2, 36]);
    assert.deepEqual(rationale[1].lines, [6, 9]);

    const matrix = parseCiteBullet(
      "<<cite:matrix @REQ-SEC-01>> [[제안요청서_핵심조항_발췌.md]] #p14 #L10-L13 | 제7조 보안 요구사항"
    );
    assert.ok(matrix && matrix.length === 1);
    assert.equal(matrix[0].presentation, "matrix");
    assert.equal(matrix[0].requirementId, "REQ-SEC-01");
    assert.equal(matrix[0].page, 14);

    const bound = parseCiteBullet(
      "<<cite:bound {38명} = COUNT(참석_설문지.csv#L2-L36) + 3>> [[참석_설문지.csv]] #L2-L36 | 확정 35 + 추가 3"
    );
    assert.ok(bound && bound.length === 1);
    assert.equal(bound[0].presentation, "bound-value");
    assert.equal(bound[0].boundValue, "38명");
    assert.equal(bound[0].boundFormula, "COUNT(참석_설문지.csv#L2-L36) + 3");

    // 일반 텍스트 불릿은 null 을 반환해 본문 불릿으로 보존된다
    assert.equal(parseCiteBullet("워크샵 참석 인원 : 38 명"), null);

    // outlineLiveRenderer 가 <<cite:...>> 를 directive 배지 + 클릭 가능한 wikilink 로 토큰화한다
    const tokens = tokenizeOutlineInline(
      "<<cite:rationale>> 산출 근거 | [[참석_설문지.csv]] #L2-L36"
    );
    assert.equal(tokens[0]?.kind, "directive");
    assert.ok(tokens.some((t) => t.kind === "wikilink" && t.target === "참석_설문지.csv"));
  });

  it("단일 통합 .outline 에 Case 1~6 이 모두 일반 하위 불릿으로 구성되고 .vdoc 로 손실 없이 컴파일된다", () => {
    const outlineFull = path.join(VAULT_ROOT, SHOWCASE_DIR, UNIFIED_OUTLINE);
    const vdocFull = path.join(VAULT_ROOT, SHOWCASE_DIR, UNIFIED_VDOC);
    assert.ok(fs.existsSync(outlineFull), "통합 .outline 파일이 존재해야 함");
    assert.ok(fs.existsSync(vdocFull), "통합 .vdoc 파일이 존재해야 함");

    const payload = parseOutlineJson(fs.readFileSync(outlineFull, "utf-8"), UNIFIED_OUTLINE);
    // 사이드카 고정이 아니라 100% 편집 가능한 하위 불릿으로 구성됨
    assert.equal(payload.nodeEvidence, undefined);

    const extracted = extractInlineCiteBullets(payload.rootNodes, {
      resolveSourcePath: resolveResourceInVault,
    });
    const allLocs = Object.values(extracted.nodeEvidence).flat();
    const presentations = new Set(allLocs.map((l) => l.presentation));
    assert.deepEqual(
      presentations,
      new Set(["footnote", "inline-rationale", "sidenote", "quote-embed", "matrix", "bound-value"])
    );

    // 모든 참조 리소스 파일이 디스크에 실존
    for (const loc of allLocs) {
      const vp = resolveEvidenceVaultPath(loc);
      assert.ok(vp, `sourcePath 해석 실패: ${loc.label}`);
      assert.ok(fs.existsSync(path.join(VAULT_ROOT, vp)), `리소스 파일 누락: ${vp}`);
    }

    // 1:N / N:1 매핑 검증 (REQ-SEC-01 -> 4곳 + Case 1 1곳 포함 다중 인용, Case 2 c2-b1 -> 2개 출처)
    assert.equal(extracted.nodeEvidence["c2-b1"]?.length, 2);
    const olEntries = collectOutlineEvidenceEntries(
      payload.rootNodes,
      payload.nodeEvidence,
      resolveResourceInVault
    );
    const olIndex = buildEvidenceBacklinkIndex(olEntries);
    const sec14 = olIndex.groups.find((g) => g.locator.page === 14 && g.locator.lines?.[0] === 10 && g.locator.lines?.[1] === 13);
    assert.ok(sec14 && sec14.targets.length >= 4, "p.14 보안 조항은 1:N 으로 4곳 이상 매핑되어야 함");

    // 컴파일 시 `<<cite:...>>` 하위 불릿은 본문 텍스트에서 빠지고 `evidenceLinks` 로 승계된다
    const rootId = payload.rootNodes[0].id;
    const compiled = compileDirectiveSubtreeToVDoc(
      payload.rootNodes as OutlineSyntaxNode[],
      rootId,
      { resolveEvidencePath: resolveResourceInVault }
    );
    assert.ok(compiled);
    assert.equal(compiled.pages.length, 6, "6개 Case 섹션이 6개 페이지로 컴파일되어야 함");
    assert.ok(
      Object.values(compiled.slots).every((s) => !s.content.includes("<<cite:")),
      "컴파일된 본문 슬롯에 raw <<cite:...>> 태그가 누출되면 안 됨"
    );
    assert.ok((compiled.evidenceLinks?.length ?? 0) >= 18);

    // 디스크의 통합 .vdoc 도 정상 파싱 + 6대 표현 모두 보유
    const parsedVDoc = parseVDocJson(fs.readFileSync(vdocFull, "utf-8"), UNIFIED_VDOC);
    const vdocEntries = collectVDocEvidenceEntries(parsedVDoc);
    const vdocPres = new Set(vdocEntries.map((e) => e.link.presentation ?? e.locator.presentation));
    assert.deepEqual(
      vdocPres,
      new Set(["footnote", "inline-rationale", "sidenote", "quote-embed", "matrix", "bound-value"])
    );
  });
});

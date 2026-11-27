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
  type VDocDocument,
} from "@vibe/vdoc-schema";
import { MemoryVaultAdapter } from "@vibe/vault-core";
import {
  EVIDENCE_SETTINGS_PATH,
  createDefaultVDoc,
  parseOutlineJson,
  parseVDocJson,
  readVaultEvidenceSettings,
  serializeOutlineJson,
  serializeVDocJson,
  toVaultUri,
  writeVaultEvidenceSettings,
} from "@vibe/vault-formats";
import { syncVDocMeaningBackToOutline } from "@vibe/outline-sync";
import {
  collectOutlineEvidenceEntries,
  collectVDocEvidenceEntries,
  effectivePresentation,
  formatEvidenceLocation,
  openEvidenceLocator,
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

  it("볼트 리소스 표현 설정(defaultPresentation · force-default · clickAction)이 영속화되고 effectivePresentation 에 반영된다", () => {
    const vault = new MemoryVaultAdapter({ name: "test-vault" });
    const initial = readVaultEvidenceSettings(vault);
    assert.equal(initial.defaultPresentation, "footnote");
    assert.equal(initial.displayPolicy, "link-first");
    assert.equal(initial.clickAction, "open-pair");

    writeVaultEvidenceSettings(vault, {
      version: "1.0.0",
      defaultPresentation: "sidenote",
      displayPolicy: "force-default",
      clickAction: "open-pair",
    });
    assert.ok(vault.exists(EVIDENCE_SETTINGS_PATH));
    const reloaded = readVaultEvidenceSettings(vault);
    assert.equal(reloaded.defaultPresentation, "sidenote");
    assert.equal(reloaded.displayPolicy, "force-default");

    const footnoteLoc = { kind: "resource" as const, refId: "a.md", label: "a.md", presentation: "footnote" as const };
    // force-default 이면 기존 footnote 링크도 설정한 sidenote 로 일괄 변환된다
    assert.equal(effectivePresentation(footnoteLoc, { presentation: "footnote" }, reloaded), "sidenote");
    // hidden 은 강제 덮어쓰기하지 않는다
    assert.equal(effectivePresentation({ ...footnoteLoc, presentation: "hidden" }, undefined, reloaded), "hidden");
    // link-first 이면 링크별 설정을 우선하되 미지정 링크만 기본 표현형을 따른다
    const linkFirst = { ...reloaded, displayPolicy: "link-first" as const };
    assert.equal(effectivePresentation(footnoteLoc, { presentation: "footnote" }, linkFirst), "footnote");
    assert.equal(effectivePresentation({ kind: "resource", refId: "b.md", label: "b.md" }, undefined, linkFirst), "sidenote");
  });

  it("디자인 모드 .vdoc → .outline 반영(syncVDocMeaningBackToOutline) 시 evidenceLinks 가 숨겨진 사이드카가 아니라 .vsyntax <<cite:...>> 편집 가능 하위 불릿으로 역동기화된다", () => {
    const vault = new MemoryVaultAdapter({ name: "sync-evidence-vault" });
    const outlinePath = "proj.vproj/doc.outline";
    const vdocPath = "proj.vproj/doc.vdoc";
    vault.createFolder("proj.vproj");
    const outlinePayload = {
      version: 1 as const,
      id: "ol-ev-1",
      title: "테스트 문서",
      defaultView: "bullets" as const,
      createdAt: "2026-11-25T00:00:00.000Z",
      updatedAt: "2026-11-25T00:00:00.000Z",
      docBindings: {
        doc_root: {
          docId: "vdoc-ev-1",
          vdocPath: toVaultUri(vdocPath),
          profileId: "a4",
          lastSyncedAt: "2026-11-25T00:00:00.000Z",
        },
      },
      rootNodes: [
        {
          id: "doc_root",
          text: "<<doc:a4>> 테스트 문서",
          isFolded: false,
          children: [
            {
              id: "memo_1",
              text: "작업 메모 :: 유지되어야 함",
              isFolded: false,
              children: [
                {
                  id: "memo_cite",
                  text: "<<cite:footnote>> [[memo.md]] #L1-L2 | 메모 근거",
                  isFolded: false,
                  children: [],
                },
              ],
            },
            {
              id: "sec_1",
              text: "<<view:section>> 1쪽",
              isFolded: false,
              children: [
                { id: "blk_1", text: "핵심 추진 배경 요약", isFolded: false, children: [] },
              ],
            },
          ],
        },
      ],
    };
    vault.createFile(outlinePath, serializeOutlineJson(outlinePayload));

    const baseVdoc = createDefaultVDoc("테스트 문서", "a4");
    const vdoc: VDocDocument = {
      ...baseVdoc,
      docId: "vdoc-ev-1",
      outlineRef: {
        outlinePath: toVaultUri(outlinePath),
        outlineId: "ol-ev-1",
        rootNodeId: "doc_root",
      },
      pages: [
        {
          ...baseVdoc.pages[0],
          pageId: "p1",
          pageLabel: "1쪽",
          sourceNodeId: "sec_1",
          blocks: [
            {
              blockId: "b1",
              kind: "text",
              title: "본문",
              slotId: "s1",
              sourceNodeId: "blk_1",
            },
          ],
        },
      ],
      slots: {
        s1: {
          slotId: "s1",
          label: "본문",
          role: "editable-slot",
          content: "<p>핵심 추진 배경 요약<sup data-cite=\"1\"></sup></p>",
          backDataRefs: [],
        },
      },
      evidenceLinks: [
        {
          linkId: "ev-1",
          slotId: "s1",
          locator: {
            kind: "resource",
            refId: "proj.vproj/sources/src.md",
            label: "src.md",
            sourcePath: "proj.vproj/sources/src.md",
            lines: [10, 14],
            excerpt: "원문 핵심 근거",
            presentation: "sidenote",
          },
          origin: "ai",
          createdAt: "2026-11-25T00:00:00.000Z",
          citationIds: ["1"],
          presentation: "sidenote",
        },
      ],
    };
    vault.createFile(vdocPath, serializeVDocJson(vdoc));

    // 본문 텍스트 변화가 없어도 evidenceLinks 가 <<cite:...>> 하위 불릿으로 역동기화되어야 한다
    const changed = syncVDocMeaningBackToOutline(vault, vdocPath, vdoc);
    assert.equal(changed, true);

    const afterOutline = parseOutlineJson(vault.read(outlinePath), "doc.outline");
    // 숨겨진 사이드카가 아니라 100% 편집 가능한 <<cite:...>> 하위 불릿으로 표현되어야 한다
    assert.equal(afterOutline.nodeEvidence, undefined);

    const blkNode = afterOutline.rootNodes[0]?.children[1]?.children[0];
    assert.equal(blkNode?.id, "blk_1");
    assert.equal(blkNode?.children.length, 1);
    assert.equal(blkNode?.children[0]?.text, "<<cite:sidenote>> [[src.md]] #L10-L14 | 원문 핵심 근거");

    // 무손실 왕복 검증: extractInlineCiteBullets 로 다시 파싱하면 원래 locator 가 복원된다
    const extracted = extractInlineCiteBullets(afterOutline.rootNodes);
    assert.equal(extracted.nodeEvidence["blk_1"]?.length, 1);
    assert.deepEqual(extracted.nodeEvidence["blk_1"]?.[0]?.lines, [10, 14]);
    assert.equal(extracted.nodeEvidence["blk_1"]?.[0]?.presentation, "sidenote");
    assert.equal(extracted.nodeEvidence["blk_1"]?.[0]?.excerpt, "원문 핵심 근거");
    // 일반 메모 불릿의 기존 <<cite:...>> 하위 불릿도 훼손되지 않고 보존된다
    assert.equal(extracted.nodeEvidence["memo_1"]?.length, 1);

    // 변경 없이 재호출 시 no-op (false)
    assert.equal(syncVDocMeaningBackToOutline(vault, vdocPath, vdoc), false);
  });

  it("formatEvidenceLocation 과 openEvidenceLocator 는 .vclip/content.md 경로를 기사명과 .vclip 번들 경로로 정규화한다", () => {
    const locator = {
      kind: "resource" as const,
      refId: "content.md",
      label: "content.md",
      sourcePath: "프로젝트.vproj/sources/인터풋볼_현장_리포트.vclip/content.md",
      lines: [7, 7] as [number, number],
      excerpt: "현장 리포트 발췌 문장",
    };

    assert.equal(formatEvidenceLocation(locator), "인터풋볼_현장_리포트 · L7-L7");

    let openedPath = "";
    const opened = openEvidenceLocator(locator, (vaultPath) => {
      openedPath = vaultPath;
    });
    assert.equal(opened, true);
    assert.equal(openedPath, "프로젝트.vproj/sources/인터풋볼_현장_리포트.vclip");
  });
});

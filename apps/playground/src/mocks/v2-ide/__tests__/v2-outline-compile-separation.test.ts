/**
 * `.outline` → `.vdoc` 컴파일 분리 사양(Compilation Separation Spec) 통합 테스트.
 *
 * 검증 항목 (볼트 내 격리된 인메모리 테스트 케이스 사용 — 실제 사용자 테스트 볼트 무접촉):
 * 1. 단일 섹션 선택 파생: 원본 불릿·형제 불릿 100% 보존 + 선택 노드 하위에만 새 `<<doc:blog>>` 파생 + 미선택 형제 제외
 * 2. 중복 포함 다중 선택(부모 + 하위 7개 = 8개 드래그): 상위-하위 중복 자동 제거(dedup), 중복 문단 없음
 * 3. 1:N 다중 투영: 같은 원본 가지 하위에 `<<doc:blog>>` 와 `<<doc:a4>>` 를 순차 파생해도 이전 `<<doc>>` 가 재복제되지 않음
 * 4. 기본 구조 태그 + 컴파일 품질:
 *    - `blog`: 섹션별 `<<view:section>>` + `<<view:title:h1|h2>>` heading 블록 생성, 본문 `align` 이 `"center"` 로 강제되지 않음
 *    - `a4`: 섹션 단위(`unitKind: "section"` — 섹션 = 구조, 쪽 = 출력) · `surface.width: 794` + 섹션마다 heading 블록 + `left` 정렬
 *    - 순수 근거 리프(`.vclip` 첨부)가 상위 주장 `nodeEvidence` 로 호이스팅되어 본문에 raw `[[...vclip]]` 누출 없음 + `.vdoc` `evidenceLinks` 승계
 * 5. 따옴표 안 파이프(`|`) 안전성: `'시점 | 국면 | 핵심 경과 | 비고'` 는 `columns-grid` 로 깨지지 않고 일반 문단 유지,
 *    실제 레이아웃 구분 `[img:A] | [img:B]` 는 여전히 `columns-grid` 로 컴파일
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  compileOutlineTargetForPreview,
  deriveCompileSubtreeInOutline,
  materializeVDocFromOutlineDirective,
} from "@vibe/outline-sync";
import { documentSurface, validateOutlineHierarchy } from "@vibe/vdoc-schema";
import {
  parseOutlineJson,
  parseVDocJson,
  serializeOutlineJson,
  type OutlineFilePayload,
} from "@vibe/vault-formats";
import { createIdeWorkbenchRuntime } from "../model/useIdeWorkbench";

function buildTimelineResearchOutline(): OutlineFilePayload {
  return {
    version: 1,
    id: "ol-sep-test-1",
    title: "신규 결제 게이트웨이 장애 타임라인 및 현황 정리",
    defaultView: "bullets",
    nodeEvidence: {
      "n-2-1-ev": [
        {
          kind: "resource",
          refId: "incident_log_clip.vclip",
          label: "incident_log_clip.vclip",
          sourcePath: "장애_분석.vproj/incident_log_clip.vclip",
          excerpt: "14:22 UTC gateway latency exceeded 4800ms threshold across ap-northeast-2",
        },
      ],
      "n-2-2-a": [
        {
          kind: "resource",
          refId: "postmortem_brief.vclip",
          label: "postmortem_brief.vclip",
          sourcePath: "장애_분석.vproj/postmortem_brief.vclip",
          excerpt: "Failover completed in 180 seconds with zero transaction loss.",
        },
      ],
    },
    rootNodes: [
      {
        id: "n-1",
        text: "1. 개요 및 현재 상황 요약",
        isFolded: false,
        children: [
          {
            id: "n-1-1",
            text: "영향 범위: 결제 승인 API 일부 리전 지연 (데이터 유실 없음)",
            isFolded: false,
            children: [],
          },
        ],
      },
      {
        id: "n-2",
        text: "2. 장애 발생 및 복구 타임라인",
        isFolded: false,
        children: [
          {
            id: "n-2-1",
            text: "[2026-11-22 14:22] 1차 지연 감지 — 결제 승인 타임아웃 급증",
            isFolded: false,
            children: [
              {
                id: "n-2-1-a",
                text: "관측 지표: 평균 응답시간 120ms → 4,800ms 급등",
                isFolded: false,
                children: [],
              },
              {
                id: "n-2-1-ev",
                text: "\"14:22 UTC gateway latency exceeded 4800ms\" [[incident_log_clip.vclip]]",
                isFolded: false,
                children: [],
                file: {
                  target: "장애_분석.vproj/incident_log_clip.vclip",
                },
              },
              {
                id: "n-2-1-b",
                text: "자동 경보 발동 및 온콜 엔지니어 호출 완료",
                isFolded: false,
                children: [],
              },
            ],
          },
          {
            id: "n-2-2",
            text: "[2026-11-22 14:25] 자동 페일오버 및 1차 복구",
            isFolded: false,
            children: [
              {
                id: "n-2-2-a",
                text: "보조 리전 라우팅 전환 완료 (180초 소요) [[postmortem_brief.vclip]]",
                isFolded: false,
                children: [],
              },
              {
                id: "n-2-2-b",
                text: "결제 성공률 99.98% 정상 회복 확인",
                isFolded: false,
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: "n-3",
        text: "3. 향후 재발 방지 및 문서화 계획",
        isFolded: false,
        children: [
          {
            id: "n-3-1",
            text: "최종 사후 보고서에서는 '시점 | 국면 | 핵심 경과 | 비고' 표로 정리하는 편이 가독성이 높다.",
            isFolded: false,
            children: [],
          },
        ],
      },
    ],
  };
}

describe("Outline -> VDoc Compilation Separation Spec", () => {
  it("1) 단일 섹션 선택 시 원본을 보존하고 하위에만 <<doc:blog>> 컴파일 가지를 파생하며 미선택 형제는 제외한다", () => {
    const runtime = createIdeWorkbenchRuntime();
    const vault = runtime.vault;
    const outlinePath = "장애_분석.vproj/장애_타임라인.outline";
    const original = buildTimelineResearchOutline();
    vault.createFile(outlinePath, serializeOutlineJson(original));

    const derived = deriveCompileSubtreeInOutline(original, {
      profile: "blog",
      targetIds: ["n-2"],
      idPrefix: "doc_blog_1",
    });

    // 원본 최상위 형제 3개 모두 그대로 보존
    assert.equal(derived.payload.rootNodes.length, 3);
    assert.equal(derived.payload.rootNodes[0].id, "n-1");
    assert.equal(derived.payload.rootNodes[1].id, "n-2");
    assert.equal(derived.payload.rootNodes[2].id, "n-3");
    assert.equal(derived.parentNodeId, "n-2");

    // n-2 최상단 바로 하위(children[0])에 새 <<doc:blog>> 파생 가지가 고정 생성되고, 기존 리서치 하위 2개는 그 뒤로 그대로 유지
    const n2 = derived.payload.rootNodes[1];
    assert.equal(n2.children.length, 3);
    const docBranch = n2.children[0];
    assert.equal(n2.children[1].id, "n-2-1");
    assert.equal(n2.children[2].id, "n-2-2");
    assert.equal(docBranch.id, derived.docNodeId);
    assert.match(docBranch.text, /^<<doc:blog>>\s+2\. 장애 발생 및 복구 타임라인/);

    // 기본 구조 태그가 파생 가지 안에 자동 부여됨
    assert.ok(docBranch.children.some((c) => c.text.startsWith("<<view:section")));

    // 볼트에 저장 후 실제 .vdoc 물질화
    vault.write(outlinePath, serializeOutlineJson(derived.payload));
    const mat = materializeVDocFromOutlineDirective(vault, outlinePath, derived.docNodeId);
    assert.ok(mat?.vdocPath, "vdoc 파일이 생성되어야 함");

    const vdoc = parseVDocJson(vault.read(mat.vdocPath), "timeline-blog");
    assert.ok(vdoc, "생성된 vdoc 이 유효하게 파싱되어야 함");
    assert.equal(vdoc.schemaRef?.profileId ?? vdoc.viewId, "blog");

    const allBlocks = vdoc.pages.flatMap((p) => p.blocks);
    const allSlotContents = Object.values(vdoc.slots)
      .map((s) => s.content)
      .join("\n");

    // 미선택 형제(1번 개요, 3번 계획)는 절대 포함되지 않음
    assert.ok(!allSlotContents.includes("1. 개요 및 현재 상황 요약"), "미선택 1번 형제가 섞이면 안 됨");
    assert.ok(!allSlotContents.includes("3. 향후 재발 방지"), "미선택 3번 형제가 섞이면 안 됨");

    // 선택된 2번 타임라인 내용은 포함 + heading 존재 + 본문 좌측 정렬 + raw [[...vclip]] 미누출
    assert.ok(allSlotContents.includes("1차 지연 감지"), "선택된 타임라인 내용 포함");
    assert.ok(allBlocks.some((b) => b.kind === "heading"), "기본 제목 태그로 heading 블록이 생성되어야 함");

    const textBlocks = allBlocks.filter((b) => b.kind === "text");
    assert.ok(textBlocks.length > 0);
    for (const tb of textBlocks) {
      const slot = vdoc.slots[tb.slotId];
      assert.notEqual(
        slot?.constraints?.align,
        "center",
        `blog 기본 문단이 center 로 강제 정렬되면 안 됨 (${tb.blockId})`
      );
      assert.ok(
        !(slot?.content ?? "").includes("text-align: center"),
        `blog 기본 문단 HTML 에 text-align: center 가 들어가면 안 됨 (${tb.blockId})`
      );
    }

    assert.ok(
      !allSlotContents.includes("[[incident_log_clip.vclip]]"),
      "순수 근거 리프 raw [[...vclip]] 텍스트가 본문에 누출되면 안 됨"
    );
    assert.ok(
      !allSlotContents.includes("[[postmortem_brief.vclip]]"),
      "본문 말미 raw [[...vclip]] 꼬리가 제거되어야 함"
    );

    // 호이스팅된 evidenceLinks 가 .vdoc 문서에 승계됨
    const linkedEvidenceCount = vdoc.evidenceLinks?.length ?? 0;
    assert.ok(linkedEvidenceCount >= 2, `evidenceLinks 가 승계되어야 함 (실제: ${linkedEvidenceCount})`);
  });

  it("2) 부모 + 하위 7개 중복 다중 선택 시 중복 없이 깔끔하게 1회만 파생한다", () => {
    const runtime = createIdeWorkbenchRuntime();
    const outlinePath = "장애_분석.vproj/장애_타임라인_dedup.outline";
    const original = buildTimelineResearchOutline();
    const overlappingSelection = [
      "n-2",
      "n-2-1",
      "n-2-1-a",
      "n-2-1-ev",
      "n-2-1-b",
      "n-2-2",
      "n-2-2-a",
      "n-2-2-b",
    ];

    const derived = deriveCompileSubtreeInOutline(original, {
      profile: "blog",
      targetIds: overlappingSelection,
      idPrefix: "doc_dedup",
    });

    assert.equal(derived.parentNodeId, "n-2");
    assert.deepEqual(derived.sourceTargetIds, ["n-2"]);

    const compiled = compileOutlineTargetForPreview(
      runtime.vault,
      outlinePath,
      derived.payload,
      derived.docNodeId
    );
    assert.ok(compiled.doc, "프리뷰 컴파일 결과가 있어야 함");
    const rendered = JSON.stringify(compiled.doc.slots);
    const occurrences = rendered.split("평균 응답시간 120ms → 4,800ms 급등").length - 1;
    assert.equal(occurrences, 1, "중복 선택된 하위 불릿이 2번 이상 복제되면 안 됨");
  });

  it("3) 1:N 다중 투영: 같은 불릿 하위에 blog 생성 후 a4 추가 생성 시 이전 <<doc:blog>> 가 재복제되지 않는다", () => {
    const runtime = createIdeWorkbenchRuntime();
    const vault = runtime.vault;
    const outlinePath = "장애_분석.vproj/장애_타임라인.outline";
    const original = buildTimelineResearchOutline();

    const first = deriveCompileSubtreeInOutline(original, {
      profile: "blog",
      targetIds: ["n-2"],
      idPrefix: "doc_first_blog",
    });
    const second = deriveCompileSubtreeInOutline(first.payload, {
      profile: "a4",
      targetIds: ["n-2"],
      idPrefix: "doc_second_a4",
    });

    const n2 = second.payload.rootNodes[1];
    // 최상단 바로 하위에 최신 파생 가지(<<doc:a4>>), 그다음 이전 <<doc:blog>>, 그다음 기존 리서치 2개 = 4개
    assert.equal(n2.children.length, 4);
    assert.match(n2.children[0].text, /^<<doc:a4>>/);
    assert.match(n2.children[1].text, /^<<doc:blog>>/);
    assert.equal(n2.children[2].id, "n-2-1");
    assert.equal(n2.children[3].id, "n-2-2");

    // 두 번째 <<doc:a4>> 내부에 첫 번째 <<doc:blog>> 가 중첩 복제되지 않았는지 확인
    const a4SubtreeJson = JSON.stringify(n2.children[0]);
    assert.ok(!a4SubtreeJson.includes("<<doc:blog>>"), "이전 컴파일 가지가 재복제되면 안 됨");

    vault.createFile(outlinePath, serializeOutlineJson(second.payload));
    const mat = materializeVDocFromOutlineDirective(vault, outlinePath, second.docNodeId);
    assert.ok(mat?.vdocPath);
    const a4Doc = parseVDocJson(vault.read(mat.vdocPath), "timeline-a4");
    assert.ok(a4Doc);
    assert.equal(a4Doc.schemaRef?.profileId ?? a4Doc.viewId, "a4");
    assert.ok(a4Doc.pages.length >= 2, "A4 도 1단계 가지마다 섹션");
    assert.ok(a4Doc.pages.every((p) => p.unitKind === "section" && p.sourceNodeId));
    assert.equal(documentSurface(a4Doc).width, 794);
    assert.ok(a4Doc.pages[0].blocks.some((b) => b.kind === "heading"));
    assert.ok(
      validateOutlineHierarchy(second.payload.rootNodes, second.docNodeId).ok,
      "파생 가지는 계층 문법 오류가 없다"
    );

    // `.outline` 에 docBindings 가 정상 기록되고 원본 불릿은 유지됨
    const savedOutline = parseOutlineJson(vault.read(outlinePath), "timeline");
    assert.ok(savedOutline?.docBindings?.[second.docNodeId]?.vdocPath);
    assert.equal(savedOutline?.rootNodes[1].children[2].id, "n-2-1");
  });

  it("4) 따옴표 안 파이프('|') 문장은 columns-grid 로 깨지지 않고, [img] | [img] 레이아웃 파이프는 유지된다", () => {
    const runtime = createIdeWorkbenchRuntime();
    const outlinePath = "장애_분석.vproj/파이프_테스트.outline";
    const original = buildTimelineResearchOutline();
    const derived = deriveCompileSubtreeInOutline(original, {
      profile: "blog",
      targetIds: ["n-3"],
      idPrefix: "doc_pipe_test",
    });

    const compiled = compileOutlineTargetForPreview(
      runtime.vault,
      outlinePath,
      derived.payload,
      derived.docNodeId
    );
    assert.ok(compiled.doc);
    const blocks = compiled.doc.pages.flatMap((p) => p.blocks);
    assert.equal(
      blocks.filter((b) => b.kind === "columns-grid").length,
      0,
      "따옴표 안 파이프('시점 | 국면 | 핵심 경과 | 비고')가 columns-grid 로 쪼개지면 안 됨"
    );
    const allSlotContents = Object.values(compiled.doc.slots)
      .map((s) => s.content)
      .join("\n");
    assert.ok(
      allSlotContents.includes("'시점 | 국면 | 핵심 경과 | 비고'"),
      "원본 따옴표 파이프 문장이 온전한 문단으로 유지되어야 함"
    );

    // 반대로 실제 레이아웃 구분 `[img:A] | [img:B]` 는 여전히 columns-grid 로 컴파일되어야 함
    const gridPayload: OutlineFilePayload = {
      version: 1,
      id: "ol-grid",
      title: "갤러리 테스트",
      defaultView: "bullets",
      rootNodes: [
        {
          id: "doc-grid",
          text: "<<doc:blog>> 갤러리 테스트",
          isFolded: false,
          children: [
            {
              id: "sec-1",
              text: "<<view:section>> 비교",
              isFolded: false,
              children: [
                {
                  id: "row-1",
                  text: "[img:before.png] | [img:after.png]",
                  isFolded: false,
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };
    const gridCompiled = compileOutlineTargetForPreview(
      runtime.vault,
      outlinePath,
      gridPayload,
      "doc-grid"
    );
    assert.ok(gridCompiled.doc);
    const gridBlocks = gridCompiled.doc.pages.flatMap((p) => p.blocks);
    assert.ok(
      gridBlocks.some((b) => b.kind === "columns-grid"),
      "실제 레이아웃 구분 파이프([img] | [img])는 계속 columns-grid 로 컴파일되어야 함"
    );
  });

  it("5) 파생 컴파일 가지에서도 <<resource:...>> 하위 불릿이 삭제되지 않고, 레거시 .vclip/content.md 근거도 편집 가능한 <<resource:...>> 불릿으로 승격된다", () => {
    const original: OutlineFilePayload = {
      version: 1,
      id: "ol-res-preserve",
      title: "근거 보존 테스트",
      defaultView: "bullets",
      nodeEvidence: {
        "n-claim-legacy": [
          {
            kind: "resource",
            refId: "content.md",
            label: "content.md",
            sourcePath: "리서치.vproj/sources/현장_기사.vclip/content.md",
            lines: [7, 9],
            excerpt: "레거시 사이드카 발췌 원문",
          },
        ],
      },
      rootNodes: [
        {
          id: "n-root",
          text: "1. 핵심 타임라인",
          isFolded: false,
          children: [
            {
              id: "n-sec",
              text: "1단계 점검",
              isFolded: false,
              children: [
                {
                  id: "n-claim-inline",
                  text: "현장 점검 결과 핵심 지표가 정상 범위로 회복되었다.",
                  isFolded: false,
                  children: [
                    {
                      id: "n-claim-inline-res",
                      text: "<<resource: 리서치.vproj/sources/공식_발표.vclip #L12-L14 | 공식 발표 발췌>>",
                      isFolded: false,
                      children: [],
                    },
                  ],
                },
                {
                  id: "n-claim-legacy",
                  text: "추가 정밀 점검에서도 이상 징후는 발견되지 않았다.",
                  isFolded: false,
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const derived = deriveCompileSubtreeInOutline(original, {
      profile: "blog",
      targetIds: ["n-root"],
      idPrefix: "doc_res_keep",
    });

    const docBranch = derived.payload.rootNodes[0].children.find((c) => c.id === derived.docNodeId);
    assert.ok(docBranch, "파생 <<doc:blog>> 가지가 생성되어야 함");

    const collectTexts = (nodes: typeof docBranch.children): string[] =>
      nodes.flatMap((n) => [n.text, ...collectTexts(n.children ?? [])]);
    const texts = collectTexts(docBranch.children);

    assert.ok(
      texts.some((t) => t === "<<resource: 리서치.vproj/sources/공식_발표.vclip #L12-L14 | 공식 발표 발췌>>"),
      "기존 <<resource:...>> 하위 불릿이 파생 가지에 그대로 남아 있어야 함"
    );
    assert.ok(
      texts.some((t) => t === "<<resource: 리서치.vproj/sources/현장_기사.vclip #L7-L9 | 레거시 사이드카 발췌 원문>>"),
      "레거시 .vclip/content.md 사이드카 근거도 .vclip 번들 경로의 편집 가능한 <<resource:...>> 불릿으로 승격되어야 함"
    );
    const hiddenDerivedKeys = Object.keys(derived.payload.nodeEvidence ?? {}).filter((k) =>
      k.startsWith("doc_res_keep")
    );
    assert.deepEqual(hiddenDerivedKeys, [], "파생 가지 노드에 숨겨진 nodeEvidence 사이드카를 새로 만들면 안 됨");
  });

  it("6) 복수 블록 선택 시 마지막 블록이 아니라 선택한 블록 최상단(첫 번째) 바로 하위 맨 앞(children[0])에 고정 생성한다", () => {
    const original = buildTimelineResearchOutline();
    const derived = deriveCompileSubtreeInOutline(original, {
      profile: "a4",
      targetIds: ["n-3", "n-1", "n-2"],
      idPrefix: "doc_topmost_a4",
    });

    assert.equal(derived.parentNodeId, "n-1", "문서 순서상 최상단 선택 블록(n-1) 하위에 부착되어야 함");
    assert.equal(derived.payload.rootNodes[0].children[0].id, derived.docNodeId, "n-1 의 바로 하위 맨 앞(children[0])에 생성되어야 함");
    assert.equal(derived.payload.rootNodes[0].children[1].id, "n-1-1", "원본 자식은 그대로 보존되어야 함");
  });

  it("7) A4 보고서 컴파일 품질: 자동 제목·메타 프레임·다열 표 상단 헤더·비례 열 폭·좌측 콜아웃·적정 이미지·A4 여백을 적용한다", () => {
    const runtime = createIdeWorkbenchRuntime();
    const outlinePath = "장애_분석.vproj/A4_품질_테스트.outline";
    const a4Payload: OutlineFilePayload = {
      version: 1,
      id: "ol-a4-quality",
      title: "결제 게이트웨이 장애 현황 보고서",
      defaultView: "bullets",
      rootNodes: [
        {
          id: "doc-a4-q",
          text: "<<doc:a4>> 결제 게이트웨이 장애 현황 보고서",
          isFolded: false,
          children: [
            {
              id: "sec-open",
              text: "<<view:section:opening>> 결제 게이트웨이 장애 현황 보고서",
              isFolded: false,
              children: [
                { id: "m1", text: "보고 기준일 :: 2026년 11월 26일", isFolded: false, children: [] },
                { id: "m2", text: "대상 시스템 :: 결제 승인 게이트웨이 v3", isFolded: false, children: [] },
                { id: "m3", text: "핵심 요약 :: 3분 만에 자동 페일오버 완료, 유실 0건", isFolded: false, children: [] },
                {
                  id: "img1",
                  text: "시스템 아키텍처 다이어그램",
                  isFolded: false,
                  children: [],
                  file: { target: "장애_분석.vproj/images/arch.png" },
                },
              ],
            },
            {
              id: "sec-body",
              text: "<<view:section>> 1. 장애 타임라인 및 리스크",
              isFolded: false,
              children: [
                { id: "h2-1", text: "<<view:title:h2>> 1. 장애 타임라인 및 리스크", isFolded: false, children: [] },
                {
                  id: "tbl-1",
                  text: "<<view:table>> 일자별 경과 요약표",
                  isFolded: false,
                  children: [
                    {
                      id: "tbl-res",
                      text: "<<resource: 장애_분석.vproj/sources/log.vclip #L1-L2 | 14:22 latency spike>>",
                      isFolded: false,
                      children: [],
                    },
                    { id: "r0", text: "시점 | 국면 | 핵심 경과 | 비고", isFolded: false, children: [] },
                    {
                      id: "r1",
                      text: "14:22 | 지연 | ap-northeast-2 리전 결제 승인 응답시간 4800ms 급등 및 타임아웃 다수 발생 | 자동 경보",
                      isFolded: false,
                      children: [],
                    },
                    {
                      id: "r2",
                      text: "14:25 | 복구 | 보조 리전 자동 페일오버 전환 완료 후 결제 성공률 99.98% 정상 회복 | 유실 0건",
                      isFolded: false,
                      children: [],
                    },
                  ],
                },
                { id: "acc-1", text: "! 트래픽 피크 시 재발 방지를 위한 서킷 브레이커 임계치 하향 필요", isFolded: false, children: [] },
                { id: "q-1", text: "> 참고: 외부 결제사 로그 일부는 API 제한으로 요약본으로 교차 검증함", isFolded: false, children: [] },
              ],
            },
          ],
        },
      ],
    };

    const compiled = compileOutlineTargetForPreview(runtime.vault, outlinePath, a4Payload, "doc-a4-q");
    assert.ok(compiled.doc);
    const doc = compiled.doc;
    const p1 = doc.pages[0];
    const p2 = doc.pages[1];

    // 1) A4 전용 여백/타이포
    assert.equal(p1.layout?.margin?.left, 48);
    assert.equal(p1.layout?.fontSize, "13px");
    assert.equal(p1.layout?.lineHeight, "1.6");

    // 2) opening 자동 문서 제목 + 연속 :: 메타 그룹 info-frame + 적정 이미지 크기
    assert.equal(p1.blocks[0].kind, "form-title", "opening 섹션에 제목 누락 시 자동 form-title 생성");
    assert.equal(p1.blocks[1].kind, "callout-box", "연속 :: 메타 3줄이 info-frame 으로 묶여야 함");
    if (p1.blocks[1].kind === "callout-box") {
      assert.equal(p1.blocks[1].variant, "info-frame");
      assert.equal(p1.blocks[1].kvItems?.length, 3);
    }
    const img = p1.blocks.find((b) => b.kind === "image");
    assert.ok(img && img.kind === "image");
    assert.equal(img.width, "82%");
    assert.equal(img.maxHeight, "340px");

    // 3) 4열 데이터 표: :header 생략해도 1행 컬럼 헤더("top-row") + 비례 열 폭 + <<resource>> 행 제외
    const tbl = p2.blocks.find((b) => b.kind === "structured-table");
    assert.ok(tbl && tbl.kind === "structured-table");
    assert.equal(tbl.rows.length, 3, "<<resource>> 자식이 표 행으로 들어가면 안 됨");
    assert.ok(tbl.rows[0].cells.every((c) => c.isHeader === true), "1행 전체가 상단 헤더여야 함");
    assert.equal(tbl.rows[1].cells[0].isHeader, false, "2행 1열이 폼 헤더로 칠해지면 안 됨");
    const col0W = Number.parseFloat(tbl.columnWidths[0]);
    const col2W = Number.parseFloat(tbl.columnWidths[2]);
    assert.ok(col2W > col0W, `긴 핵심 경과 열(${col2W}%)이 짧은 시점 열(${col0W}%)보다 넓어야 함`);

    // 4) A4 콜아웃 좌측 정렬 (블로그식 center 강제 해제)
    const callouts = p2.blocks.filter((b) => b.kind === "callout-box");
    assert.equal(callouts.length, 2);
    for (const c of callouts) {
      if (c.kind === "callout-box") {
        assert.equal(c.align, "left");
      }
    }
  });
});

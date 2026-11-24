/**
 * @vibe/vdoc-schema — 6 Built-in Extracted Structural Assets
 *
 * - A4 Page × 2: [붙임 6호] 기술적용계획표, [붙임 5호] 사업 실적 증명서
 * - Blog Section × 2: 블로그 스팟 리뷰 섹션, 블로그 도입부 히어로 섹션
 * - Table × 2: 좌측 구분 + 우측 복합 셀 상단헤더 표, 공문 기본정보 2열 메타 폼 표
 *
 * 모든 시드 에셋은 별도 하드코딩 없이 실제 `compileOutlineToVDoc` 파서로
 * 표준 `.outline` DSL 을 컴파일해 `blocks` / `slots` 를 생성한다.
 */
import { compileOutlineToVDoc } from "../element-syntax/ir-compiler";
import { createElementSyntaxRegistry } from "../element-syntax/registry";
import type { OutlineSyntaxNode } from "../element-syntax/contract";
import type { LayoutBlock, VDocSlot } from "../types";
import type { VDocAsset } from "./types";

const SEED_TIMESTAMP = "2026-11-23T09:00:00.000Z";

function parseIndentedOutlineLines(lines: readonly string[], prefix: string): OutlineSyntaxNode[] {
  const roots: OutlineSyntaxNode[] = [];
  const stack: { indent: number; node: OutlineSyntaxNode }[] = [];
  let seq = 0;

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const node: OutlineSyntaxNode = {
      id: `${prefix}_${++seq}`,
      text: rawLine.trim(),
      children: [],
    };
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      const parent = stack[stack.length - 1].node;
      (parent.children as OutlineSyntaxNode[]).push(node);
    }
    stack.push({ indent, node });
  }
  return roots;
}

function compileSeedAssetStructure(
  outlineDsl: readonly string[],
  profileId: "a4" | "blog",
  prefix: string,
  options?: { readonly wrapInSection?: boolean; readonly sectionTitle?: string }
): { readonly blocks: LayoutBlock[]; readonly slots: Record<string, VDocSlot> } {
  const effectiveLines = options?.wrapInSection
    ? [`<<view:section>> ${options.sectionTitle ?? "샘플"}`, ...outlineDsl.map((l) => `  ${l}`)]
    : outlineDsl;
  const rootNodes = parseIndentedOutlineLines(effectiveLines, prefix);
  const registry = createElementSyntaxRegistry();
  const doc = compileOutlineToVDoc(
    { version: 1, title: options?.sectionTitle ?? "Asset", rootNodes },
    {
      registry,
      profileId,
      now: SEED_TIMESTAMP,
      docId: `seed-${prefix}`,
    }
  );
  const blocks = doc.pages.flatMap((p) =>
    p.blocks.map((b) => {
      const copy = structuredClone(b);
      delete copy.sourceNodeId;
      return copy;
    })
  );
  return { blocks, slots: doc.slots };
}

function buildBuiltinAssets(): readonly VDocAsset[] {
  // 1. A4 Page #1 — [붙임 6호] 기술적용계획표 (from 00. System-Proposal Page 3)
  const attach6Dsl = [
    "<<view:section>> [붙임 6호 서식] 기술적용계획표",
    "  [붙임 6호 서식]",
    "  <<view:title>> [  ] {{서식 제목}}",
    "  <<view:table>> 사업 기본 정보",
    "    {{사업명 항목}} | {{사업명 내용}}",
    "    {{작성일 항목}} | {{YYYY. MM. DD.}}",
    "  ◇ {{분류 소제목}}",
    "  <<view:table:header>> {{분류별 상세 표}}",
    "    {{구분}} | {{항 목}}",
    "    {{분류 1}} | <<cell>>",
    "      <<view:list>>",
    "        {{세부 항목 1-1}}",
    "        {{세부 항목 1-2}}",
    "        {{세부 항목 1-3}}",
    "      [img:{{대표 참고 이미지}}]",
    "      [img:{{좌측 비교 컷}}] | [img:{{우측 비교 컷}}]",
    "    {{분류 2}} | <<cell>>",
    "      <<view:list>>",
    "        {{세부 항목 2-1}}",
    "        {{세부 항목 2-2}}",
  ];
  const attach6Compiled = compileSeedAssetStructure(attach6Dsl, "a4", "a4_att6");

  // 2. A4 Page #2 — [붙임 5호] 사업 실적 증명서 (복합 병합 공문 페이지)
  const attach5Dsl = [
    "<<view:section>> [붙임 5호 서식] 사업 실적 증명서",
    "  [붙임 5호 서식]",
    "  <<view:title>> {{증명서 제목 (예: 사업 실적 증명서)}}",
    "  <<view:table>> {{증명서 본문 복합표}}",
    "    {{신청인 대분류}}",
    "      {{업체명(상호)}} | [-] | {{대 표 자}} | [-]",
    "      {{영업소재지}} | [-] | {{전화번호}} | [-]",
    "      {{사업자번호}} | [-] | {{제 출 처}} | [-]",
    "      {{증명서 용도}} | {{입찰 및 제안서 심사 제출용}} | [<] | [<]",
    "    {{이행 실적 대분류}}",
    "      {{사 업 명}} | [-] | {{구 분}} | <<cell>>",
    "        <<view:list>>",
    "          {{유형 1}} (  )",
    "          {{유형 2}} (  )",
    "          {{유형 3}} (  )",
    "      {{사업개요}} | [-] | [<] | [<]",
    "      {{계약번호}} | {{계약일자}} | {{계약기간}} | {{이행실적(비율/금액)}}",
    "      [-] | [-] | [-] | [-]",
    "    {{발급기관 대분류}}",
    "      {{위 사실을 증명함 (YYYY년 MM월 DD일)}} | [<] | [<] | [<]",
    "      {{기관명 :}} | [-] | {{(전화번호 : )}} | [-]",
    "      {{발급부서 :}} | [-] | {{담당자 : (인)}} | [-]",
    "  <<view:list>>",
    "    ※ ① {{작성 유의사항 1}}",
    "    ※ ② {{작성 유의사항 2}}",
    "    ※ ③ {{관련 증빙 안내}}",
  ];
  const attach5Compiled = compileSeedAssetStructure(attach5Dsl, "a4", "a4_att5");

  // 3. Blog Section #1 — 블로그 스팟 리뷰 섹션 (from 02. 미국_여행_라스베가스 <<view:section:spot>>)
  const blogSpotDsl = [
    "<<view:section:spot>> {{N. 주요 스팟 / 주제명}}",
    "  [img:{{대표 리드 사진}}]",
    "  > {{장소 / 핵심 대상 제목}}",
    "    {{핵심 속성 1 (예: 입장료)}} :: {{속성 1 값}}",
    "    {{핵심 속성 2 (예: 운영 시간)}} :: {{속성 2 값}}",
    "    {{핵심 속성 3 (예: 위치/접근법)}} :: {{속성 3 값}}",
    "  {{핵심 경험과 장점을 설명하는 본문 문단입니다. 중요 키워드는 ==강조==로 표시합니다.}}",
    "  [img:{{세부 컷 좌측}}] | [img:{{세부 컷 우측}}]",
    "  {{현장 방문 팁과 추천 포인트를 정리하는 보조 문단입니다.}}",
    "  [cta:{{관련 예약 · 상세 링크 버튼 라벨}} -> https://example.com]",
  ];
  const blogSpotCompiled = compileSeedAssetStructure(blogSpotDsl, "blog", "blog_spot");

  // 4. Blog Section #2 — 블로그 도입부 히어로 + 꿀팁 섹션 (from 02. 미국_여행_라스베가스 hero + tip)
  const blogHeroDsl = [
    "<<view:section:hero>> {{도입부 · 핵심 요약}}",
    "  [embed:disclosure | {{상단 안내 또는 제휴 고지 문구}}]",
    "  [img:{{글 전체를 대표하는 히어로 이미지}}]",
    "  {{독자의 공감을 끌어내는 도입 첫 문단입니다.}}",
    "  {{이 글에서 다룰 핵심 주제를 요약하는 두 번째 문단입니다.}}",
    "  > {{글 핵심 타이틀 인용 프레임}}",
    "  ! {{독자가 먼저 알아야 할 핵심 요약 포인트 / 팁}}",
    "  {{핵심 팁에 대한 구체적 설명 문단 (==핵심 키워드== 포함)}}",
  ];
  const blogHeroCompiled = compileSeedAssetStructure(blogHeroDsl, "blog", "blog_hero");

  // 5. Table #1 — 좌측 구분 + 우측 복합 셀(목록·이미지) 상단헤더 표 (from 00. System-Proposal Page 3 p3_laws_tbl)
  const tableRichCellDsl = [
    "<<view:table:header>> {{표 제목 (예: 구분별 항목 및 참고 자료)}}",
    "  {{구분 헤더}} | {{항목 헤더}}",
    "  {{분류 1}} | <<cell>>",
    "    <<view:list>>",
    "      {{목록 항목 1-1}}",
    "      {{목록 항목 1-2}}",
    "    [img:{{대표 이미지}}]",
    "    [img:{{좌측 컷}}] | [img:{{우측 컷}}]",
    "    <<view:list>>",
    "      {{추가 세부 항목 1-3}}",
    "  {{분류 2}} | <<cell>>",
    "    <<view:list>>",
    "      {{목록 항목 2-1}}",
    "      {{목록 항목 2-2}}",
  ];
  const tableRichCellCompiled = compileSeedAssetStructure(tableRichCellDsl, "a4", "tbl_rich", {
    wrapInSection: true,
    sectionTitle: "복합 셀 표",
  });

  // 6. Table #2 — 공문 기본정보 2열 메타 폼 표 (from 00. System-Proposal Page 3 사업 기본 정보 + 기본 인적 사항)
  const tableMetaKvDsl = [
    "<<view:table>> {{기본 정보 표 제목}}",
    "  {{항목명 1 (예: 사업명)}} | {{내용 1}}",
    "  {{항목명 2 (예: 작성일)}} | {{내용 2}}",
    "  {{항목명 3 (예: 담당부서)}} | [-]",
    "  {{항목명 4 (예: 비고)}} | [-]",
  ];
  const tableMetaKvCompiled = compileSeedAssetStructure(tableMetaKvDsl, "a4", "tbl_meta", {
    wrapInSection: true,
    sectionTitle: "기본 정보 표",
  });

  return [
    {
      version: "1.0.0",
      assetId: "asset-a4-attach6-tech-plan",
      title: "[붙임 6호] 기술적용계획표 (공문 서식 페이지)",
      scope: "section",
      assetKind: "a4-page",
      targetKind: "page",
      category: "A4 공문 · 서식",
      tags: ["a4-page", "붙임6호", "공문서", "복합셀표", "메타표"],
      nuance: {
        summary:
          "상단 서식번호·문서 제목·2열 기본정보 메타표 아래에 소제목과 좌측 분류/우측 복합 셀 표를 배치하는 공공·제안서 표준 A4 페이지 구조입니다.",
        structureRules: [
          "최상단에 서식 번호 텍스트 + 중앙 문서 제목(<<view:title>>) 배치",
          "문서 기본 메타는 좌측 라벨·우측 값 2열 폼 표(<<view:table>>)로 요약",
          "본문 핵심 영역은 ◇ 소제목 + 상단 헤더가 있는 2열 표(<<view:table:header>>)로 구성하고 우측 셀(<<cell>>)에 목록과 참고 이미지를 중첩 배치",
        ],
        adaptationHints: [
          "사용자 주제가 기술 계획이 아니더라도, '문서 기본정보 + 분류별 상세 항목' 구조가 필요한 모든 보고서·제안서·점검표에 항목명만 교체해 적용",
        ],
      },
      structure: {
        outlineDsl: attach6Dsl,
        blocks: attach6Compiled.blocks,
        slots: attach6Compiled.slots,
        pageMeta: {
          pageLabel: "[붙임 6호 서식] 기술적용계획표",
          unitKind: "page",
          sectionRole: "form",
          surfaceWidth: 794,
        },
      },
      origin: {
        sourceType: "builtin",
        sourceRef: "vault://01. Architecture/00. System-Proposal.vdoc#page-3",
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
    },
    {
      version: "1.0.0",
      assetId: "asset-a4-attach5-performance-cert",
      title: "[붙임 5호] 사업 실적 증명서 (복합 병합 공문 페이지)",
      scope: "section",
      assetKind: "a4-page",
      targetKind: "page",
      category: "A4 공문 · 서식",
      tags: ["a4-page", "붙임5호", "실적증명서", "세로병합", "서명란", "각주"],
      nuance: {
        summary:
          "좌측 3단 대분류 세로 병합(rowSpan) + 다열 기입칸 + 선택 체크리스트 + 확인/발급 서명란 + 하단 ※ 유의사항 각주로 구성된 정통 한국형 공식 증명서 페이지 구조입니다.",
        structureRules: [
          "서식번호 + 중앙 증명서 제목(<<view:title>>)으로 시작",
          "본문 표는 좌측 대분류(신청인 / 핵심 내용 / 발급·확인 기관)를 트리 들여쓰기 세로 병합(rowSpan)으로 묶음",
          "우측 내부는 2~4열 기입칸([-])과 가로 병합([<]), 선택지 목록(<<cell>> 내 <<view:list>>)을 조합",
          "표 하단에는 ※ 기호 기반 작성 유의사항 목록(<<view:list>>) 배치",
        ],
        adaptationHints: [
          "실적 증명서뿐 아니라 경력 증명서·확인서·신청서·점검 확인표 등 '신청자 + 핵심 내역 + 확인/서명' 3단 공식 서식에 자유롭게 재구성",
        ],
      },
      structure: {
        outlineDsl: attach5Dsl,
        blocks: attach5Compiled.blocks,
        slots: attach5Compiled.slots,
        pageMeta: {
          pageLabel: "[붙임 5호 서식] 사업 실적 증명서",
          unitKind: "page",
          sectionRole: "certificate",
          surfaceWidth: 794,
        },
      },
      origin: {
        sourceType: "builtin",
        sourceRef: "builtin://korean-official-forms/attach-5-performance-cert",
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
    },
    {
      version: "1.0.0",
      assetId: "asset-blog-spot-review",
      title: "블로그 스팟 리뷰 섹션 (대표컷 · 정보카드 · 2단 스트립 · CTA)",
      scope: "section",
      assetKind: "blog-section",
      targetKind: "section",
      category: "블로그 · 매거진",
      tags: ["blog-section", "스팟리뷰", "정보카드", "사진스트립", "CTA"],
      nuance: {
        summary:
          "리드 이미지로 시선을 열고, 핵심 스펙 정보 카드(> + ::), 경험 본문, 2단 사진 스트립, 액션 CTA 버튼으로 자연스럽게 이어지는 리뷰형 블로그 섹션 구조입니다.",
        structureRules: [
          "섹션 최상단에 대표 리드 이미지([img:...]) 배치",
          "바로 아래 정보 프레임(> 제목) + Key::Value 메타 3줄로 핵심 사실(가격·시간·위치 등)을 요약",
          "본문 설명(==강조==)과 2단 가로 사진 스트립([img] | [img])을 교차 배치",
          "섹션 말미에 행동 유도 버튼([cta:라벨 -> url]) 배치",
        ],
        adaptationHints: [
          "여행지 리뷰뿐 아니라 제품 리뷰·맛집 소개·툴 비교·행사 소개 등 '대상 1건을 시각적으로 소개하고 링크로 연결'하는 모든 섹션에 적용 가능",
        ],
      },
      structure: {
        outlineDsl: blogSpotDsl,
        blocks: blogSpotCompiled.blocks,
        slots: blogSpotCompiled.slots,
        pageMeta: {
          pageLabel: "스팟 리뷰 섹션",
          unitKind: "section",
          sectionRole: "spot",
          surfaceWidth: 720,
        },
      },
      origin: {
        sourceType: "builtin",
        sourceRef: "vault://문서 스키마 표준 정비 프로젝트/01. 라스베가스_블로그_구조_추출.outline#spot",
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
    },
    {
      version: "1.0.0",
      assetId: "asset-blog-hero-intro",
      title: "블로그 도입부 히어로 섹션 (고지배지 · 대표컷 · 인용 · 꿀팁 바)",
      scope: "section",
      assetKind: "blog-section",
      targetKind: "section",
      category: "블로그 · 매거진",
      tags: ["blog-section", "도입부", "히어로", "고지배지", "강조바"],
      nuance: {
        summary:
          "상단 고지 배지와 대표 히어로 이미지로 글을 열고, 공감 도입 문단·중앙 인용 타이틀·핵심 포인트 강조 바(!)로 독자를 본론으로 이끄는 블로그 오프닝 구조입니다.",
        structureRules: [
          "선택적 상단 고지 배지([embed:disclosure | ...]) 후 전체 대표 이미지([img:...]) 배치",
          "짧은 호흡의 도입 문단 2개 + 핵심 주제 인용 프레임(> 타이틀)",
          "본론 전 꼭 알아둘 핵심 요약을 강조 바(! ...) + 설명 문단으로 마감",
        ],
        adaptationHints: [
          "제휴 고지가 필요 없는 글은 상단 disclosure 배지를 공지·요약 배지로 바꾸거나 생략하고, 핵심 팁은 글 성격에 맞는 사전 안내로 치환",
        ],
      },
      structure: {
        outlineDsl: blogHeroDsl,
        blocks: blogHeroCompiled.blocks,
        slots: blogHeroCompiled.slots,
        pageMeta: {
          pageLabel: "도입부 히어로",
          unitKind: "section",
          sectionRole: "hero",
          surfaceWidth: 720,
        },
      },
      origin: {
        sourceType: "builtin",
        sourceRef: "vault://문서 스키마 표준 정비 프로젝트/01. 라스베가스_블로그_구조_추출.outline#hero",
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
    },
    {
      version: "1.0.0",
      assetId: "asset-table-category-rich-cell",
      title: "좌측 구분 + 우측 복합 셀(목록·이미지) 상단헤더 표",
      scope: "element",
      assetKind: "table",
      targetKind: "structured-table",
      category: "표 · 서식",
      tags: ["table", "상단헤더", "복합셀", "목록중첩", "이미지중첩"],
      nuance: {
        summary:
          "1행을 상단 헤더(구분 | 항목)로 두고, 각 행의 좌측에 분류명, 우측 복합 셀(<<cell>>) 안에 개조식 목록과 참고 이미지를 자유롭게 중첩 배치하는 2열 구조 표입니다.",
        structureRules: [
          "<<view:table:header>> 로 1행 상단 헤더 행 구성 (예: 구분 | 항목)",
          "본문 각 행은 '분류명 | <<cell>>' 패턴으로 좌측 범주와 우측 복합 컨테이너를 분리",
          "우측 <<cell>> 내부에는 <<view:list>> 세부 항목 목록과 필요 시 [img] / [img] | [img] 참고 이미지를 자유롭게 배치",
        ],
        adaptationHints: [
          "법률·지침 정리뿐 아니라 기능 명세, 요구사항 분류, 추진 전략·과제, 커리큘럼·체크리스트 등 '카테고리별 다중 항목 + 시각 자료'가 필요한 모든 표에 적용",
        ],
      },
      structure: {
        outlineDsl: tableRichCellDsl,
        blocks: tableRichCellCompiled.blocks,
        slots: tableRichCellCompiled.slots,
      },
      origin: {
        sourceType: "builtin",
        sourceRef: "vault://01. Architecture/00. System-Proposal.vdoc#tbl_5_table",
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
    },
    {
      version: "1.0.0",
      assetId: "asset-table-meta-kv-form",
      title: "공문 기본정보 2열 메타 폼 표",
      scope: "element",
      assetKind: "table",
      targetKind: "structured-table",
      category: "표 · 서식",
      tags: ["table", "메타표", "기본정보", "2열폼", "기입칸"],
      nuance: {
        summary:
          "좌측에 짧은 항목 라벨, 우측에 값 또는 빈 기입칸([-])을 짝지어 문서 개요·기본 인적 사항·사업 메타를 간결하게 정리하는 2열 Key-Value 폼 표입니다.",
        structureRules: [
          "<<view:table>> 로 상단 헤더 없이 좌측 라벨 열 + 우측 값 열의 2열 폼 구조 구성",
          "확정된 메타는 '항목명 | 값'으로 채우고, 추후 기입할 칸은 '항목명 | [-]' 빈 슬롯으로 표시",
          "사용자 데이터에 메타 항목이 많으면 행을 자연스럽게 추가하고, 필요 시 4열(항목1 | 값1 | 항목2 | 값2)로 압축 가능",
        ],
        adaptationHints: [
          "사업명·작성일 요약표, 회의록 개요표, 신청자 인적사항표, 프로젝트 프로필 카드 등 핵심 속성 요약이 필요한 모든 위치에 적용",
        ],
      },
      structure: {
        outlineDsl: tableMetaKvDsl,
        blocks: tableMetaKvCompiled.blocks,
        slots: tableMetaKvCompiled.slots,
      },
      origin: {
        sourceType: "builtin",
        sourceRef: "vault://01. Architecture/00. System-Proposal.vdoc#tbl_3_table",
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      },
    },
  ];
}

export const BUILTIN_VDOC_ASSETS: readonly VDocAsset[] = buildBuiltinAssets();

export function getBuiltinVDocAsset(assetId: string): VDocAsset | null {
  return BUILTIN_VDOC_ASSETS.find((a) => a.assetId === assetId) ?? null;
}

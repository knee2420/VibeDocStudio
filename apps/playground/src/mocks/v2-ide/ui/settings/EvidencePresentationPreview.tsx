import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  Crosshair,
  ExternalLink,
  FileImage,
  FileSpreadsheet,
  FileText,
  LayoutTemplate,
  ListTree,
  MousePointerClick,
  Sparkles,
} from "lucide-react";
import {
  buildEvidenceBacklinkIndex,
  formatEvidenceLocatorToCiteBullet,
  type EvidenceLink,
  type EvidenceLocator,
} from "@vibe/vdoc-schema";
import type {
  VaultEvidenceSettings,
  VisibleEvidencePresentation,
} from "@vibe/vault-formats";

import { VDocSlotEvidenceInline } from "../EvidenceExpressions";
import { tokenizeOutlineInline } from "../outlineLiveRenderer";

interface PresentationTraitMeta {
  readonly title: string;
  readonly density: string;
  readonly bestFor: string;
  readonly summary: string;
  readonly sampleSentence: string;
  readonly links: readonly EvidenceLink[];
  readonly mdResourceRaw: string;
  readonly mdChipLabel: string;
}

const SAMPLE_BASE_SOURCE = "sources/Decision 05 — 북극성 지표 확정.md";
const SAMPLE_SECOND_SOURCE = "sources/요구사항 정의서 핵심 조항.md";

const SAMPLE_BY_PRESENTATION: Record<VisibleEvidencePresentation, PresentationTraitMeta> = {
  footnote: {
    title: "각주 (Footnote)",
    density: "최소 (본문 위첨자 [1] 유지)",
    bestFor: "공식 제안서 · 입찰 공고서 · 대외 제출본",
    summary:
      "본문 흐름을 해치지 않고 문장 끝에 문서 전역 번호([1])만 표시하며, 상세 출처는 페이지 하단 각주 목록으로 정리합니다.",
    sampleSentence:
      "산재된 원천 자료의 구조화 및 전문 문서 작성 리드타임을 기존 대비 1/10 (90% 단축) 수준으로 압축합니다.",
    links: [
      {
        linkId: "prev-fn-1",
        slotId: "prev-slot",
        origin: "ai",
        createdAt: "2026-11-25T00:00:00.000Z",
        citationIds: ["1"],
        presentation: "footnote",
        locator: {
          kind: "resource",
          refId: SAMPLE_BASE_SOURCE,
          label: "Decision 05 — 북극성 지표 확정",
          sourcePath: SAMPLE_BASE_SOURCE,
          lines: [33, 35],
          excerpt: "북극성 Outcome 지표 확정: 도구 도입 전 대비 문서 작업 완료 시간 1/10 (90% 단축)",
          presentation: "footnote",
        },
      },
    ],
    mdResourceRaw:
      "<<resource: [[Decision 05 — 북극성 지표 확정.md]] #L33-L35 | 문서 작업 완료 시간 1/10 (90% 단축)>>",
    mdChipLabel: "📄 Decision 05 — 북극성 지표 확정.md · L33-L35  |  “문서 작업 완료 시간 1/10 (90% 단축)”",
  },
  sidenote: {
    title: "여백 주석 (Sidenote)",
    density: "여백 분리 (본문 §1 + 우측 레일)",
    bestFor: "시니어 리뷰 · 대조 검토 · 편집자 검수본",
    summary:
      "본문에는 작은 §1 마커만 두고 원문 발췌 카드를 A4 페이지 우측 여백에 나란히 배치해, 시선 이동만으로 즉시 대조할 수 있습니다.",
    sampleSentence:
      "문서 저장소와 AI 분석 캐시는 프로젝트 경계 단위로 분리하며, 모든 근거 링크는 원문 줄 번호까지 추적합니다.",
    links: [
      {
        linkId: "prev-sn-1",
        slotId: "prev-slot",
        origin: "ai",
        createdAt: "2026-11-25T00:00:00.000Z",
        citationIds: ["1"],
        presentation: "sidenote",
        locator: {
          kind: "resource",
          refId: SAMPLE_SECOND_SOURCE,
          label: "요구사항 정의서 핵심 조항",
          sourcePath: SAMPLE_SECOND_SOURCE,
          page: 14,
          lines: [10, 13],
          excerpt: "모든 AI 자동 생성 문단은 원문 파일·페이지·줄 범위 추적성을 95% 이상 충족하여야 한다.",
          presentation: "sidenote",
        },
      },
    ],
    mdResourceRaw:
      "<<resource: [[요구사항 정의서 핵심 조항.md]] #p14 #L10-L13 | 원문 파일·페이지·줄 범위 추적성 95% 이상>>",
    mdChipLabel: "📄 요구사항 정의서 핵심 조항.md · p.14 L10-L13  |  “원문 파일·페이지·줄 범위 추적성 95% 이상”",
  },
  "inline-rationale": {
    title: "인라인 산출 근거",
    density: "문단 하단 1줄 확장 (N:1 합산)",
    bestFor: "예산 · 인원 · 일정 산출 근거 문서",
    summary:
      "숫자나 결론이 어떤 원천 자료들의 합산·논리로 나왔는지 문단 바로 아래에 ‘← 산출 근거’ 1줄과 출처 칩으로 명시합니다.",
    sampleSentence: "파일럿 검증 참여 인원 : 38 명 (핵심 실무자 35명 + 추가 신청 3명)",
    links: [
      {
        linkId: "prev-ir-1",
        slotId: "prev-slot",
        origin: "ai",
        createdAt: "2026-11-25T00:00:00.000Z",
        presentation: "inline-rationale",
        rationale: "사전 설문 응답 35명 + 추가 신청 메일 3명 합산 의거",
        locator: {
          kind: "backdata",
          refId: "sources/참석_설문지.csv",
          label: "참석_설문지.csv",
          sourcePath: "sources/참석_설문지.csv",
          lines: [2, 36],
          rationale: "사전 설문 응답 35명 + 추가 신청 메일 3명 합산 의거",
          presentation: "inline-rationale",
        },
      },
      {
        linkId: "prev-ir-2",
        slotId: "prev-slot",
        origin: "ai",
        createdAt: "2026-11-25T00:00:00.000Z",
        presentation: "inline-rationale",
        locator: {
          kind: "resource",
          refId: "sources/추가_신청_메일.md",
          label: "추가_신청_메일.md",
          sourcePath: "sources/추가_신청_메일.md",
          lines: [6, 9],
          presentation: "inline-rationale",
        },
      },
    ],
    mdResourceRaw:
      "<<resource: [[참석_설문지.csv]] #L2-L36 | 사전 설문 응답 35명 + 추가 신청 메일 3명 합산>>",
    mdChipLabel: "📊 참석_설문지.csv · L2-L36  |  “사전 설문 응답 35명 + 추가 신청 메일 3명 합산”",
  },
  "quote-embed": {
    title: "원문 직접 인용 카드",
    density: "인용구 블록 직접 삽입",
    bestFor: "법령 · 약관 · 인터뷰 원문 트랜스클루전",
    summary:
      "원본 문서의 핵심 문장을 요약하지 않고 보라색 인용구 카드로 그대로 삽입해, 독자가 원본 문구를 즉시 읽고 원문으로 이동합니다.",
    sampleSentence:
      "최대 2-Pane 집중 워크스페이스 원칙에 따라 모기장식 5분할 화면을 배제합니다.",
    links: [
      {
        linkId: "prev-qe-1",
        slotId: "prev-slot",
        origin: "ai",
        createdAt: "2026-11-25T00:00:00.000Z",
        presentation: "quote-embed",
        locator: {
          kind: "resource",
          refId: "sources/5단계 워크스페이스 설계.md",
          label: "5단계 워크스페이스 설계",
          sourcePath: "sources/5단계 워크스페이스 설계.md",
          lines: [35, 38],
          excerpt:
            "어떤 순간에도 인간의 눈앞에는 최대 2개의 집중 창(70:30 또는 50:50)만 유지하여 인지 부하를 차단한다.",
          presentation: "quote-embed",
        },
      },
    ],
    mdResourceRaw:
      "<<resource: [[5단계 워크스페이스 설계.md]] #L35-L38 | 어떤 순간에도 최대 2개의 집중 창만 유지>>",
    mdChipLabel: "📄 5단계 워크스페이스 설계.md · L35-L38  |  “어떤 순간에도 최대 2개의 집중 창만 유지”",
  },
  matrix: {
    title: "1:N 추적 매트릭스",
    density: "요구사항 ID + 1:N 배지 + 하단 추적표",
    bestFor: "RFP 요구사항 충족표 · 감사 · 규정 준수",
    summary:
      "하나의 원천 조항(@REQ-ID)이 문서 내 몇 곳(1:N)에 반영되었는지 태그와 하단 추적 매트릭스 표로 자동 집계합니다.",
    sampleSentence:
      "[보안 요구] 원천 리소스 인용 강제 검증 및 프로젝트 경계 기반 접근 제어를 구현합니다.",
    links: [
      {
        linkId: "prev-mx-1",
        slotId: "prev-slot",
        origin: "ai",
        createdAt: "2026-11-25T00:00:00.000Z",
        presentation: "matrix",
        locator: {
          kind: "resource",
          refId: SAMPLE_SECOND_SOURCE,
          label: "요구사항 정의서 핵심 조항",
          sourcePath: SAMPLE_SECOND_SOURCE,
          page: 14,
          lines: [10, 13],
          requirementId: "REQ-SEC-01",
          excerpt: "제7조 보안 및 출처 거버넌스 요구사항",
          presentation: "matrix",
        },
      },
    ],
    mdResourceRaw:
      "<<resource: [[요구사항 정의서 핵심 조항.md]] #p14 #L10-L13 | REQ-SEC-01 보안 및 출처 거버넌스>>",
    mdChipLabel: "📄 요구사항 정의서 핵심 조항.md · p.14 L10-L13  |  “REQ-SEC-01 보안 및 출처 거버넌스”",
  },
  "bound-value": {
    title: "근거 바인딩 수치",
    density: "팩트 토큰({ 값 } = 산식) 강조",
    bestFor: "KPI 목표치 · 단가/총액 · 정량 지표 관리",
    summary:
      "문서 속 핵심 수치와 산식을 원천 파일에 바인딩된 토큰으로 표시해, 같은 수치가 여러 곳에 쓰여도 근거를 1초 만에 검증합니다.",
    sampleSentence: "문서 작성 리드타임 단축 목표는 기존 대비 90% 이상으로 설정합니다.",
    links: [
      {
        linkId: "prev-bv-1",
        slotId: "prev-slot",
        origin: "ai",
        createdAt: "2026-11-25T00:00:00.000Z",
        presentation: "bound-value",
        locator: {
          kind: "resource",
          refId: SAMPLE_BASE_SOURCE,
          label: "Decision 05 — 북극성 지표 확정",
          sourcePath: SAMPLE_BASE_SOURCE,
          lines: [33, 35],
          boundValue: "90% 단축",
          boundFormula: "1 - (1 / 10)",
          excerpt: "북극성 Outcome 지표 확정: 작업 완료 시간 1/10",
          presentation: "bound-value",
        },
      },
    ],
    mdResourceRaw:
      "<<resource: [[Decision 05 — 북극성 지표 확정.md]] #L33-L35 | 작업 완료 시간 1/10 (90% 단축)>>",
    mdChipLabel: "📄 Decision 05 — 북극성 지표 확정.md · L33-L35  |  “작업 완료 시간 1/10 (90% 단축)”",
  },
};

function renderDirectiveBadgeClass(raw: string): string {
  const low = raw.toLowerCase();
  if (low.startsWith("<<cite:rationale")) {
    return "border-amber-400/40 bg-amber-500/20 text-amber-200";
  }
  if (low.startsWith("<<cite:sidenote")) {
    return "border-teal-400/40 bg-teal-500/20 text-teal-200";
  }
  if (low.startsWith("<<cite:quote")) {
    return "border-violet-400/45 bg-violet-500/20 text-violet-200";
  }
  if (low.startsWith("<<cite:matrix")) {
    return "border-rose-400/40 bg-rose-500/20 text-rose-200";
  }
  if (low.startsWith("<<cite:bound")) {
    return "border-cyan-400/40 bg-cyan-500/20 text-cyan-200";
  }
  return "border-indigo-400/45 bg-indigo-500/20 text-indigo-200";
}

export interface EvidencePresentationPreviewProps {
  readonly settings: VaultEvidenceSettings;
}

type ResourceHighlightTab = "md" | "csv" | "pdf" | "image";

function defaultResourceTabFor(pres: VisibleEvidencePresentation): ResourceHighlightTab {
  if (pres === "inline-rationale") return "csv";
  if (pres === "sidenote" || pres === "matrix") return "pdf";
  return "md";
}

/**
 * 설정창 전용 3대 표면(.vdoc · .outline · .md) + 페어 탭 원 리소스 하이라이트 인터랙티브 목업 프리뷰.
 * 선택한 표현형과 클릭 정책을 즉시 시각·동작으로 체험할 수 있다.
 */
export const EvidencePresentationPreview: React.FC<EvidencePresentationPreviewProps> = ({
  settings,
}) => {
  const pres = settings.defaultPresentation;
  const sample = SAMPLE_BY_PRESENTATION[pres];
  const [simulatedJump, setSimulatedJump] = useState<{
    readonly presKey: string;
    readonly text: string;
    readonly file: string;
    readonly locLabel: string;
    readonly excerpt: string;
  } | null>(null);
  const [resourceTabOverride, setResourceTabOverride] = useState<{
    readonly presKey: string;
    readonly tab: ResourceHighlightTab;
  } | null>(null);

  const activeResourceTab: ResourceHighlightTab =
    resourceTabOverride?.presKey === pres ? resourceTabOverride.tab : defaultResourceTabFor(pres);

  const previewIndex = useMemo(() => {
    const entries = sample.links.map((link) => ({
      targetId: link.slotId,
      targetLabel: sample.sampleSentence.slice(0, 28),
      locator: link.locator,
    }));
    // matrix 예시에서는 1:3 다중 인용 느낌을 실감나게 표현
    if (pres === "matrix" && sample.links[0]) {
      entries.push(
        { targetId: "prev-slot-2", targetLabel: "Ⅱ. 추진전략 · 보안 아키텍처", locator: sample.links[0].locator },
        { targetId: "prev-slot-3", targetLabel: "Ⅳ. 산출물 · 보안 점검 결과서", locator: sample.links[0].locator }
      );
    }
    return buildEvidenceBacklinkIndex(entries);
  }, [pres, sample]);

  const outlineCiteLines = useMemo(
    () =>
      sample.links.map((link) =>
        formatEvidenceLocatorToCiteBullet(link.locator, {
          presentation: pres,
          rationale: link.rationale,
        })
      ),
    [sample.links, pres]
  );

  const handlePreviewOpen = (vaultPath: string, locator?: EvidenceLocator) => {
    const file = vaultPath.split("/").pop() || vaultPath;
    const locBits = [
      locator?.page ? `p.${locator.page}` : "",
      locator?.lines ? `L${locator.lines[0]}-L${locator.lines[1]}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    setSimulatedJump({
      presKey: pres,
      text: `페어 탭 오픈 → ${file}${locBits ? ` (${locBits} 하이라이트)` : ""}`,
      file,
      locLabel: locBits || "L33-L35",
      excerpt: locator?.excerpt || locator?.rationale || sample.links[0]?.locator.excerpt || "",
    });
    if (/\.csv$/i.test(file)) {
      setResourceTabOverride({ presKey: pres, tab: "csv" });
    } else if (/\.pdf$/i.test(file) || locator?.page) {
      setResourceTabOverride({ presKey: pres, tab: "pdf" });
    } else if (/\.(png|jpe?g|webp|svg)$/i.test(file)) {
      setResourceTabOverride({ presKey: pres, tab: "image" });
    } else {
      setResourceTabOverride({ presKey: pres, tab: "md" });
    }
  };

  const clickActionDesc =
    pres === "footnote"
      ? settings.clickAction === "open-pair"
        ? "1클릭 즉시 페어 탭 + 하이라이트"
        : "1차 발췌 팝오버 → 페어 탭 이동"
      : "1클릭 즉시 페어 탭 + 하이라이트";

  const activeJump = simulatedJump && simulatedJump.presKey === pres ? simulatedJump : null;
  const activeJumpMessage = activeJump?.text ?? null;
  const primaryLoc = sample.links[0]?.locator;
  const previewSourceFile =
    activeJump?.file ??
    (primaryLoc?.sourcePath ?? SAMPLE_BASE_SOURCE).split("/").pop() ??
    "Decision 05 — 북극성 지표 확정.md";
  const previewLocLabel =
    activeJump?.locLabel ??
    ([
      primaryLoc?.page ? `p.${primaryLoc.page}` : "",
      primaryLoc?.lines ? `L${primaryLoc.lines[0]}-L${primaryLoc.lines[1]}` : "",
    ]
      .filter(Boolean)
      .join(" · ") || "L33-L35");
  const previewQuote =
    activeJump?.excerpt ||
    primaryLoc?.excerpt ||
    primaryLoc?.rationale ||
    "도구 도입 전 대비 문서 작업 완료 시간 1/10 (90% 단축)";

  return (
    <div
      data-testid="evidence-presentation-live-preview"
      className="rounded-xl border border-[var(--obs-border-subtle,#2b2b2b)] bg-[var(--obs-bg-secondary,#242424)] px-5 py-4"
    >
      {/* Header + 3-Trait Summary */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--obs-border-subtle,#303030)] pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--obs-text-normal,#ececec)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--obs-accent,#8a5cf5)]" />
            <span>라이브 프리뷰 · {sample.title}</span>
          </div>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--obs-text-muted,#a3a3a3)]">
            {sample.summary}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
          <span className="rounded border border-white/10 bg-black/25 px-2 py-0.5 text-slate-300">
            <span className="text-slate-500">지면:</span> {sample.density}
          </span>
          <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
            <MousePointerClick className="mr-1 inline h-3 w-3" />
            {clickActionDesc}
          </span>
          <span className="rounded border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-violet-200">
            추천: {sample.bestFor}
          </span>
        </div>
      </div>

      {/* 2-Column 3-Surface Visual Mockup: Left (.vdoc 2D Paper) | Right (.outline + .md) */}
      <div className="mt-3.5 grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* 1. `.vdoc` 2D Canvas Surface Mockup */}
        <div className="flex flex-col rounded-lg border border-white/10 bg-[#1a1b1e] overflow-hidden lg:col-span-7">
          <div className="flex items-center justify-between border-b border-white/[0.07] bg-[#222328] px-3 py-1.5 text-[10.5px]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-sky-300">
              <LayoutTemplate className="h-3 w-3" />
              .vdoc (2D 지면 렌더링)
            </span>
            <span className="text-[10px] text-slate-400">배지·번호 클릭 시 동작 체험 가능</span>
          </div>

          <div className="flex flex-1 flex-col justify-between gap-2.5 bg-[#2b2d31] p-3">
            <div className="flex items-start gap-2.5">
              {/* Mini A4 Paper Sheet */}
              <div className="min-w-0 flex-1 rounded-md border border-slate-300/70 bg-white px-3.5 py-3 text-[11.5px] leading-[1.6] text-slate-800 shadow-sm">
                <div className="mb-1 text-[10px] font-bold tracking-wide text-slate-500">
                  나. 추진배경 및 핵심 목표
                </div>
                <p className="text-[11.5px] text-slate-900">
                  {sample.sampleSentence}
                  {pres === "footnote" && (
                    <button
                      type="button"
                      onClick={() =>
                        handlePreviewOpen(
                          sample.links[0].locator.sourcePath ?? SAMPLE_BASE_SOURCE,
                          sample.links[0].locator
                        )
                      }
                      title="클릭 시 페어 탭으로 원문 열기 · 하이라이트"
                      className="ml-0.5 align-super font-mono text-[9.5px] font-bold text-indigo-600 hover:underline"
                    >
                      [1]
                    </button>
                  )}
                </p>

                {/* Actual VDocSlotEvidenceInline component (passes empty slotHtml so popover mode chip also renders faithfully) */}
                <VDocSlotEvidenceInline
                  links={sample.links}
                  mode="review"
                  citationNumberBySourceKey={previewIndex.citationNumberBySourceKey}
                  backlinkGroups={previewIndex.groups}
                  settings={{
                    ...settings,
                    displayPolicy: "force-default",
                  }}
                  slotHtml={
                    pres === "footnote" && settings.clickAction === "open-pair"
                      ? `<p>${sample.sampleSentence}<sup data-cite="1"></sup></p>`
                      : undefined
                  }
                  onOpenSource={handlePreviewOpen}
                />

                {/* Mini bottom footnote strip for Footnote mode */}
                {pres === "footnote" && (
                  <div className="mt-3 border-t border-slate-200 pt-2 text-[10px] text-slate-600">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        <strong className="mr-1 font-mono text-indigo-700">[1]</strong>
                        Decision 05 — 북극성 지표 확정 · L33-L35
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handlePreviewOpen(
                            sample.links[0].locator.sourcePath ?? SAMPLE_BASE_SOURCE,
                            sample.links[0].locator
                          )
                        }
                        className="inline-flex shrink-0 items-center gap-0.5 rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0 text-[9.5px] font-medium text-indigo-700 hover:bg-indigo-100"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        원본
                      </button>
                    </div>
                  </div>
                )}

                {/* Mini 1:N traceability row for Matrix mode */}
                {pres === "matrix" && (
                  <div className="mt-2.5 rounded border border-rose-200 bg-rose-50/50 px-2 py-1.5 text-[10px] text-rose-950">
                    <div className="flex items-center justify-between font-semibold text-rose-800">
                      <span>하단 1:N 추적 매트릭스 자동 집계</span>
                      <span className="font-mono">REQ-SEC-01 · 1:3</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[9.5px] text-slate-600">
                      <span className="rounded bg-white px-1.5 py-0.5 border border-rose-200/70">Ⅰ. 보안 요구</span>
                      <span className="rounded bg-white px-1.5 py-0.5 border border-rose-200/70">Ⅱ. 보안 아키텍처</span>
                      <span className="rounded bg-white px-1.5 py-0.5 border border-rose-200/70">Ⅳ. 보안 점검서</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Compact Right Sidenote Rail mockup when Sidenote is selected */}
              {pres === "sidenote" && sample.links[0] && (
                <div className="w-[148px] shrink-0 rounded-md border border-teal-500/40 bg-[#1e2729] p-2 text-[10px] text-teal-50 shadow">
                  <div className="flex items-center justify-between text-teal-300">
                    <span className="font-mono font-bold">§1 여백 주석</span>
                    <button
                      type="button"
                      onClick={() =>
                        handlePreviewOpen(
                          sample.links[0].locator.sourcePath ?? SAMPLE_SECOND_SOURCE,
                          sample.links[0].locator
                        )
                      }
                      className="rounded border border-teal-400/40 bg-black/25 px-1 py-0 text-[9px] text-teal-200 hover:bg-teal-500/20"
                    >
                      원본 ↗
                    </button>
                  </div>
                  <div className="mt-1 font-medium text-teal-100">
                    요구사항 정의서 · p.14 L10-L13
                  </div>
                  <p className="mt-0.5 leading-snug text-teal-100/80">
                    “{sample.links[0].locator.excerpt}”
                  </p>
                </div>
              )}
            </div>

            {activeJumpMessage && (
              <div className="flex items-center gap-1.5 rounded border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-[10.5px] text-amber-100">
                <CheckCircle2 className="h-3 w-3 shrink-0 text-amber-300" />
                <span className="truncate">{activeJumpMessage}</span>
              </div>
            )}
          </div>
        </div>

        {/* 2. Right Stack: `.outline` (.vsyntax tag bullet) + `.md` (Resource chip) */}
        <div className="flex flex-col gap-3 lg:col-span-5">
          {/* `.outline` Mockup */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#1a1b1e]">
            <div className="flex items-center justify-between border-b border-white/[0.07] bg-[#222328] px-3 py-1.5 text-[10.5px]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
                <ListTree className="h-3 w-3" />
                .outline (.vsyntax 하위 불릿)
              </span>
              <span className="text-[9.5px] text-slate-400">텍스트 직접 편집 가능</span>
            </div>

            <div className="space-y-1.5 p-3 text-[11px] leading-[1.55] text-slate-200">
              <div className="flex items-start gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                <span className="text-slate-100">{sample.sampleSentence}</span>
              </div>

              <div className="ml-2 border-l border-white/10 pl-3 space-y-1.5">
                {outlineCiteLines.map((line, lineIdx) => {
                  const tokens = tokenizeOutlineInline(line);
                  return (
                    <div key={lineIdx} className="flex items-start gap-2 text-[10.5px]">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400/80" />
                      <div className="min-w-0 flex-1 break-words leading-[1.6]">
                        {tokens.map((tok, tIdx) => {
                          if (tok.kind === "directive") {
                            return (
                              <span
                                key={tIdx}
                                className={`mr-1 inline-flex items-center rounded border px-1 py-0 font-mono text-[10px] ${renderDirectiveBadgeClass(tok.raw)}`}
                              >
                                {tok.raw}
                              </span>
                            );
                          }
                          if (tok.kind === "wikilink") {
                            return (
                              <button
                                key={tIdx}
                                type="button"
                                onClick={() =>
                                  handlePreviewOpen(
                                    sample.links[lineIdx]?.locator.sourcePath ?? tok.target,
                                    sample.links[lineIdx]?.locator
                                  )
                                }
                                className="mx-0.5 text-left text-[#c4b5fd] underline decoration-[#c4b5fd]/45 underline-offset-2 hover:text-white"
                              >
                                {tok.alias}
                              </button>
                            );
                          }
                          if (tok.kind === "tag") {
                            return (
                              <span
                                key={tIdx}
                                className="mx-0.5 inline-flex items-center rounded-full bg-indigo-500/20 px-1.5 py-0 font-mono text-[9.5px] text-indigo-300"
                              >
                                {tok.value}
                              </span>
                            );
                          }
                          return (
                            <span key={tIdx} className="text-slate-300/90">
                              {tok.kind === "text" ? tok.value : ""}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* `.md` Mockup */}
          <div className="flex flex-col overflow-hidden rounded-lg border border-white/10 bg-[#1a1b1e]">
            <div className="flex items-center justify-between border-b border-white/[0.07] bg-[#222328] px-3 py-1.5 text-[10.5px]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-cyan-300">
                <FileText className="h-3 w-3" />
                .md (Markdown 통합 리소스 칩)
              </span>
              <span className="text-[9.5px] text-slate-400">Live Preview</span>
            </div>

            <div className="space-y-2 p-3 text-[11px]">
              <div>
                <button
                  type="button"
                  onClick={() =>
                    handlePreviewOpen(
                      sample.links[0].locator.sourcePath ?? SAMPLE_BASE_SOURCE,
                      sample.links[0].locator
                    )
                  }
                  className="inline-flex max-w-full items-center gap-1 rounded-md border border-cyan-400/45 bg-cyan-500/15 px-2 py-0.5 text-left text-[10.5px] text-cyan-100 hover:bg-cyan-500/25"
                >
                  <span className="truncate">{sample.mdChipLabel}</span>
                </button>
              </div>
              <div className="rounded border border-white/[0.06] bg-black/30 px-2 py-1 font-mono text-[9.5px] leading-relaxed text-slate-400 break-all">
                {sample.mdResourceRaw}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Pair Tab Original Resource Highlight Mockup (`.md` / `.csv` / `.pdf` / `이미지`) */}
      <div
        data-testid="evidence-resource-highlight-preview"
        className="mt-3 overflow-hidden rounded-lg border border-amber-500/25 bg-[#191a1d]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] bg-[#222328] px-3 py-1.5 text-[10.5px]">
          <div className="flex items-center gap-1.5">
            <Crosshair className="h-3 w-3 text-amber-300" />
            <span className="font-semibold text-amber-200">
              원 리소스 페어 탭 하이라이트 표기
            </span>
            <span className="hidden text-[9.5px] text-slate-400 sm:inline">
              · 원본 파일 비파괴 오버레이 (현재 6종 공통 호박색 강조)
            </span>
          </div>
          <div className="inline-flex overflow-hidden rounded border border-white/10 bg-black/30 text-[10px]">
            {(
              [
                { id: "md", label: ".md 마크다운", Icon: FileText },
                { id: "csv", label: ".csv · 코드", Icon: FileSpreadsheet },
                { id: "pdf", label: ".pdf 페이지", Icon: FileText },
                { id: "image", label: "이미지 영역", Icon: FileImage },
              ] as const
            ).map(({ id, label, Icon }) => {
              const active = activeResourceTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setResourceTabOverride({ presKey: pres, tab: id })}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 transition-colors ${
                    active
                      ? "bg-amber-500/25 font-semibold text-amber-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Icon className="h-2.5 w-2.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Simulated Top Amber Highlight Banner (shared across all resource viewers) */}
        <div className="flex items-center justify-between gap-2 border-b border-amber-500/35 bg-amber-500/15 px-3 py-1 text-[10.5px] text-amber-100">
          <div className="flex min-w-0 items-center gap-2">
            <Crosshair className="h-3 w-3 shrink-0 text-amber-300" />
            <span className="shrink-0 font-semibold text-amber-200">
              {activeResourceTab === "md"
                ? `${previewLocLabel} 하이라이트`
                : activeResourceTab === "csv"
                  ? "L2-L36 하이라이트"
                  : activeResourceTab === "pdf"
                    ? `📕 PDF 하이라이트 · ${primaryLoc?.page ? `p.${primaryLoc.page}` : "p.14"} · 영역`
                    : "🖼 이미지 영역 하이라이트 · bbox(180,120,460,780)"}
            </span>
            <span className="truncate text-amber-100/85">“{previewQuote}”</span>
          </div>
          <span className="shrink-0 font-mono text-[9.5px] text-amber-200/75">
            {previewSourceFile}
          </span>
        </div>

        {/* Viewer-specific Highlight Body */}
        <div className="p-3 text-[11px]">
          {activeResourceTab === "md" && (
            <div className="space-y-0.5 rounded border border-white/[0.06] bg-[#141518] py-2 font-sans text-[11px] leading-[1.65] text-slate-300">
              <div className="px-3 text-slate-500">## 3. 핵심 성과 목표 (North Star)</div>
              <div
                className="px-3 text-slate-100"
                style={{
                  background: "rgba(245,158,11,0.14)",
                  boxShadow: "inset 3px 0 0 #fbbf24",
                }}
              >
                -{" "}
                <span
                  style={{
                    background: "rgba(251,191,36,0.34)",
                    color: "#fef3c7",
                    borderBottom: "2px solid #fbbf24",
                    borderRadius: "3px",
                    padding: "0 3px",
                  }}
                >
                  {previewQuote}
                </span>
              </div>
              <div className="px-3 text-slate-500">
                - 모든 파생 문장은 원문 줄 번호 좌표를 유지한다.
              </div>
            </div>
          )}

          {activeResourceTab === "csv" && (
            <div className="overflow-hidden rounded border border-white/[0.06] bg-[#141518] font-mono text-[10.5px] leading-6">
              <div className="flex text-slate-500">
                <span className="w-10 shrink-0 border-r border-white/10 bg-[#1c1d21] px-2 text-right">1</span>
                <span className="px-3">부서,성명,참석여부,비고</span>
              </div>
              <div className="flex border-y border-amber-400/55 bg-amber-400/15 text-amber-100">
                <span className="w-10 shrink-0 border-r-2 border-amber-400 bg-amber-400/25 px-2 text-right font-bold text-amber-200">
                  2
                </span>
                <span className="px-3">기획팀,홍길동,확정,사전 설문 응답 (총 35명)</span>
              </div>
              <div className="flex border-b border-amber-400/40 bg-amber-400/12 text-amber-100/95">
                <span className="w-10 shrink-0 border-r-2 border-amber-400 bg-amber-400/25 px-2 text-right font-bold text-amber-200">
                  3
                </span>
                <span className="px-3">개발팀,김민수,확정,추가 신청 메일 (+3명)</span>
              </div>
            </div>
          )}

          {activeResourceTab === "pdf" && (
            <div className="flex items-center justify-center rounded border border-white/[0.06] bg-[#141518] p-3">
              <div className="relative w-full max-w-[380px] rounded border border-slate-300/70 bg-white px-4 py-3 text-[10px] leading-relaxed text-slate-700 shadow">
                <div className="mb-1 flex items-center justify-between text-[9px] text-slate-400">
                  <span>제안요청서 원문 (PDF)</span>
                  <span className="font-mono font-semibold text-amber-600">
                    {primaryLoc?.page ? `p.${primaryLoc.page}` : "p.14"}
                  </span>
                </div>
                <p className="text-slate-400">제6조 (일반 보안 준수사항) 사업 수행자는 관련 법령을 준수한다.</p>
                <div className="relative my-1.5 rounded border-2 border-amber-400 bg-amber-300/25 px-2 py-1 text-slate-900 shadow-[0_0_12px_rgba(251,191,36,0.35)]">
                  <span className="font-semibold">제7조:</span> {previewQuote}
                </div>
                <p className="text-slate-400">제8조 (검수 기준) 최종 산출물은 품질 점검을 통과해야 한다.</p>
              </div>
            </div>
          )}

          {activeResourceTab === "image" && (
            <div className="flex items-center justify-center rounded border border-white/[0.06] bg-[#141518] p-3">
              <div className="relative flex h-[96px] w-full max-w-[380px] items-center justify-between rounded border border-white/10 bg-gradient-to-br from-[#232732] to-[#1a1d24] px-4 text-[10px] text-slate-400">
                <div className="rounded border border-white/10 bg-black/25 px-2.5 py-2">
                  좌측 패널
                </div>
                <div className="relative rounded border-2 border-amber-400 bg-amber-400/20 px-3 py-2 text-amber-100 shadow-[0_0_16px_rgba(251,191,36,0.4)]">
                  <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-amber-500 px-1.5 py-0 text-[9.5px] font-semibold text-slate-950 shadow">
                    bbox 영역 · 핵심 도식
                  </span>
                  2-Pane 집중 영역
                </div>
                <div className="rounded border border-white/10 bg-black/25 px-2.5 py-2">
                  우측 페어 탭
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import type { WebFormVariant } from "@vibe/vdoc-schema";
import type { BlockVariantId, LayoutChoice } from "./types";

/**
 * AG-UI 1.0 + A2UI 1.0 인터랙션 목업 전용 도메인 모델.
 * - A2UI 1.0: `surfaceId` 기반 다중 배치(drawer / popover / chat-inline) + `catalogId` 화이트리스트 카드 + `updateDataModel`
 * - AG-UI 1.0: `RUN_*` / `SUBAGENT_*` / `ACTIVITY_DELTA` / `STATE_DELTA(JSON Patch)` / `Interrupt-Resume`
 */

export type AguiSurfacePlacement = "drawer" | "popover" | "chat-inline";

export type AguiToneFilter = "all" | "executive" | "compact" | "visual";

export interface AguiWireEvent {
  seq: number;
  timestamp: string;
  protocol: "AG-UI 1.0" | "A2UI 1.0";
  type: string;
  subagentRunId?: string;
  summary: string;
  payload: Record<string, unknown>;
}

export type CandidateApplyAction =
  | { kind: "block-variant"; blockId: string; variantId: BlockVariantId }
  | { kind: "node-layout"; nodeId: string; layoutChoice: LayoutChoice }
  | { kind: "webform-theme"; theme: WebFormVariant };

export interface A2uiCandidateCard {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  score: number;
  toneTags: readonly AguiToneFilter[];
  rationale: string;
  previewBars: readonly { label: string; tone: "dark" | "indigo" | "emerald" | "slate" }[];
  action: CandidateApplyAction;
}

export interface A2uiCandidateGroup {
  id: string;
  docNodeId: string;
  surfaceId: string;
  catalogId: string;
  targetBlockId: string;
  targetNodeId: string;
  targetLabel: string;
  title: string;
  description: string;
  candidates: readonly A2uiCandidateCard[];
}

export interface WysiwygSuggestionVariant {
  id: "A" | "B";
  label: string;
  toneBadge: string;
  afterText: string;
  afterHtml: string;
  layoutAction?: CandidateApplyAction;
}

export interface WysiwygSuggestion {
  id: string;
  docNodeId: string;
  targetBlockId: string;
  targetSlotId: string;
  targetNodeId: string;
  targetLabel: string;
  category: "rewrite" | "metric" | "structure";
  categoryLabel: string;
  rationale: string;
  beforeText: string;
  variants: readonly [WysiwygSuggestionVariant, WysiwygSuggestionVariant];
  status: "pending" | "accepted" | "rejected";
  selectedVariantId: "A" | "B";
  originalHtmlSnapshot?: string;
}

export interface SubagentRunState {
  subagentRunId: string;
  name: string;
  role: string;
  status: "idle" | "running" | "finished";
  progress: number;
  activityText: string;
}

export const AGUI_A2UI_CANDIDATE_GROUPS: readonly A2uiCandidateGroup[] = [
  // ① HWP 공문/기획 품의서 포맷
  {
    id: "cand-hwp-title",
    docNodeId: "agui-doc-hwp",
    surfaceId: "surface://asset-picker/hwp-title",
    catalogId: "vibe.catalog.title-assets@1.0",
    targetBlockId: "pg_blk_agui-hwp-p1-title_raw",
    targetNodeId: "agui-hwp-p1-title",
    targetLabel: "문서 상단 표지 제목",
    title: "표지 · 결재 헤더 에셋 후보 4종",
    description: "같은 제목 텍스트를 품의/공문/보고 목적에 맞는 4가지 네이티브 헤더로 즉시 교체합니다.",
    candidates: [
      {
        id: "hwp-title-approval",
        title: "우측 결재란 결합형",
        subtitle: "제목 좌측 + 담당/팀장/임원 3단 결재란",
        badge: "품의 추천",
        score: 96,
        toneTags: ["all", "executive"],
        rationale: "결재선이 필요한 기획 품의서에서는 표지 상단 우측에 결재란을 일체화하는 형식이 가장 표준입니다.",
        previewBars: [
          { label: "제목 블록 (70%)", tone: "dark" },
          { label: "결재란 3칸 (30%)", tone: "indigo" },
        ],
        action: { kind: "block-variant", blockId: "pg_blk_agui-hwp-p1-title_raw", variantId: "title-with-approval" },
      },
      {
        id: "hwp-title-underline",
        title: "공문 중앙 밑줄형",
        subtitle: "중앙 정렬 + 2px 진한 하단 구분선",
        badge: "표준 공문",
        score: 91,
        toneTags: ["all", "compact"],
        rationale: "군더더기 없이 문서 제목만 깔끔하게 강조할 때 적합합니다.",
        previewBars: [
          { label: "중앙 대제목", tone: "dark" },
          { label: "2px 하단 밑줄", tone: "slate" },
        ],
        action: { kind: "block-variant", blockId: "pg_blk_agui-hwp-p1-title_raw", variantId: "title-underline" },
      },
      {
        id: "hwp-title-section-bar",
        title: "상단 좌측 포인트 바형",
        subtitle: "모던 보고서 스타일 좌측 액센트 바",
        badge: "모던 보고",
        score: 88,
        toneTags: ["all", "visual"],
        rationale: "대외·경영진 브리핑 문서에서 시각적 주목도를 높입니다.",
        previewBars: [
          { label: "좌측 컬러 바 + 볼드 헤더", tone: "indigo" },
          { label: "보조 메타 라인", tone: "slate" },
        ],
        action: { kind: "block-variant", blockId: "pg_blk_agui-hwp-p1-title_raw", variantId: "title-section-bar" },
      },
      {
        id: "hwp-title-seal",
        title: "직인 테두리 박스형",
        subtitle: "이중 외곽선 + 공식 문서 씰 스타일",
        badge: "대외 공식",
        score: 83,
        toneTags: ["all", "executive"],
        rationale: "대외 발송 공문이나 공식 협약안 표지에 적합합니다.",
        previewBars: [
          { label: "이중 박스 프레임", tone: "dark" },
          { label: "공식 문서 헤더", tone: "emerald" },
        ],
        action: { kind: "block-variant", blockId: "pg_blk_agui-hwp-p1-title_raw", variantId: "title-boxed-seal" },
      },
    ],
  },
  {
    id: "cand-hwp-table",
    docNodeId: "agui-doc-hwp",
    surfaceId: "surface://asset-picker/hwp-table",
    catalogId: "vibe.catalog.table-assets@1.0",
    targetBlockId: "pg_blk_agui-hwp-p1-sec2-tbl_raw",
    targetNodeId: "agui-hwp-p1-sec2-tbl",
    targetLabel: "추진 일정 · 예산 요약표",
    title: "데이터 표 에셋 후보 4종 (원문 보존 전환)",
    description: "아웃라이너 원문은 1글자도 건드리지 않고, 표 시각 틀과 병합 구조만 즉시 비교합니다.",
    candidates: [
      {
        id: "hwp-tbl-modern",
        title: "모던 수평 비교표",
        subtitle: "세로선 제거 · 상단 연음영 헤더",
        badge: "가독성 1위",
        score: 97,
        toneTags: ["all", "executive", "visual"],
        rationale: "임원 보고용 일정·예산 요약은 세로 격자를 걷어낸 수평 비교표가 스캔 속도가 가장 빠릅니다.",
        previewBars: [
          { label: "연회색 1행 헤더", tone: "indigo" },
          { label: "가로 구분선 본문 행", tone: "slate" },
        ],
        action: { kind: "block-variant", blockId: "pg_blk_agui-hwp-p1-sec2-tbl_raw", variantId: "table-modern-flat" },
      },
      {
        id: "hwp-tbl-grouped",
        title: "좌측 대분류 병합 비교표",
        subtitle: "대분류 세로 병합 + 항목별 세부 행",
        badge: "한글 표준",
        score: 93,
        toneTags: ["all", "compact"],
        rationale: "단계별 업무와 예산을 그룹 단위로 묶어 한눈에 대조할 때 최적입니다.",
        previewBars: [
          { label: "좌측 rowSpan 그룹열", tone: "dark" },
          { label: "우측 세부 항목 매트릭스", tone: "slate" },
        ],
        action: { kind: "block-variant", blockId: "pg_blk_agui-hwp-p1-sec2-tbl_raw", variantId: "table-grouped-compare" },
      },
      {
        id: "hwp-tbl-ledger",
        title: "관리대장형 굵은 외곽표",
        subtitle: "2px 외곽선 + 조밀한 결재/감사 양식",
        badge: "감사·제출",
        score: 86,
        toneTags: ["all", "executive", "compact"],
        rationale: "회계·감사 제출용 예산 증빙 테이블에 적합한 공식 대장 포맷입니다.",
        previewBars: [
          { label: "2px 외곽 프레임", tone: "dark" },
          { label: "열별 실선 구분", tone: "emerald" },
        ],
        action: { kind: "block-variant", blockId: "pg_blk_agui-hwp-p1-sec2-tbl_raw", variantId: "table-roster-ledger" },
      },
      {
        id: "hwp-tbl-checklist",
        title: "점검 체크리스트형",
        subtitle: "항목별 확인란 강조 매트릭스",
        badge: "검토 체크",
        score: 82,
        toneTags: ["all", "visual"],
        rationale: "단계별 마일스톤 완료 여부를 인쇄해 체크할 때 유용합니다.",
        previewBars: [
          { label: "항목 + 상태 체크칸", tone: "emerald" },
          { label: "비고·담당 열", tone: "slate" },
        ],
        action: { kind: "block-variant", blockId: "pg_blk_agui-hwp-p1-sec2-tbl_raw", variantId: "table-eval-checklist" },
      },
    ],
  },

  // ② Blog 전사 공지 아티클 포맷
  {
    id: "cand-blog-kpi",
    docNodeId: "agui-doc-blog",
    surfaceId: "surface://asset-picker/blog-highlights",
    catalogId: "vibe.catalog.layout-blocks@1.0",
    targetBlockId: "pg_blk_agui-blog-changes",
    targetNodeId: "agui-blog-changes",
    targetLabel: "핵심 변화 3가지 블록",
    title: "블로그 핵심 변화 섹션 에셋 후보 3종",
    description: "동일한 3개 항목을 카드 그리드 · 비교표 · 강조 콜아웃으로 비파괴 전환합니다.",
    candidates: [
      {
        id: "blog-kpi-cards",
        title: "3단 하이라이트 카드 그리드",
        subtitle: "가로 3열 카드 배치 · 시각적 스캔 최적화",
        badge: "블로그 추천",
        score: 98,
        toneTags: ["all", "visual"],
        rationale: "전사 공지 아티클은 핵심 변화 3가지를 가로 3단 카드로 배치할 때 첫 화면 체류율이 높습니다.",
        previewBars: [
          { label: "카드 1 | 카드 2 | 카드 3", tone: "indigo" },
          { label: "제목 볼드 + 2줄 요약", tone: "slate" },
        ],
        action: { kind: "node-layout", nodeId: "agui-blog-changes", layoutChoice: "columns-grid" },
      },
      {
        id: "blog-kpi-table",
        title: "Before/After 구조화 비교표",
        subtitle: "항목별 핵심 수치를 격자 표로 정리",
        badge: "수치 강조",
        score: 90,
        toneTags: ["all", "executive", "compact"],
        rationale: "정량 효과(검색 시간 단축 등)를 한눈에 비교시키고 싶을 때 적합합니다.",
        previewBars: [
          { label: "헤더: 영역 | 핵심 변화", tone: "dark" },
          { label: "3행 비교 그리드", tone: "slate" },
        ],
        action: { kind: "node-layout", nodeId: "agui-blog-changes", layoutChoice: "structured-table" },
      },
      {
        id: "blog-kpi-callout",
        title: "핵심 요약 콜아웃 박스",
        subtitle: "배경 강조 박스 안 세로 요약 리스트",
        badge: "모바일 친화",
        score: 85,
        toneTags: ["all", "compact"],
        rationale: "좁은 폭이나 모바일 뉴스레터 형태에서 깨짐 없이 읽기 좋습니다.",
        previewBars: [
          { label: "좌측 강조선 + 연배경", tone: "emerald" },
          { label: "압축 불릿 3줄", tone: "slate" },
        ],
        action: { kind: "node-layout", nodeId: "agui-blog-changes", layoutChoice: "callout-box" },
      },
    ],
  },
  {
    id: "cand-blog-hero",
    docNodeId: "agui-doc-blog",
    surfaceId: "surface://asset-picker/blog-hero",
    catalogId: "vibe.catalog.cover-assets@1.0",
    targetBlockId: "pg_blk_agui-blog-hero",
    targetNodeId: "agui-blog-hero",
    targetLabel: "아티클 상단 히어로 헤더",
    title: "상단 타이틀 스타일 후보 3종",
    description: "블로그 톤앤매너에 맞춰 히어로 / 배너 / 심플 헤딩 중 선택합니다.",
    candidates: [
      {
        id: "blog-hdr-hero",
        title: "에디토리얼 히어로",
        subtitle: "큰 타이포 + 리드 문구 중심",
        badge: "매거진형",
        score: 95,
        toneTags: ["all", "visual"],
        rationale: "사내 기술/프로덕트 블로그 공지에 가장 자연스러운 히어로 스타일입니다.",
        previewBars: [
          { label: "대형 타이틀 + 서브노트", tone: "indigo" },
        ],
        action: { kind: "node-layout", nodeId: "agui-blog-hero", layoutChoice: "hero" },
      },
      {
        id: "blog-hdr-banner",
        title: "공식 배너 헤더",
        subtitle: "배경 박스 강조 + 공식 발표 톤",
        badge: "전사 공지",
        score: 89,
        toneTags: ["all", "executive"],
        rationale: "중요한 전사 정책/시스템 오픈 안내에 무게감을 줍니다.",
        previewBars: [
          { label: "배너 박스 + 메타 배지", tone: "dark" },
        ],
        action: { kind: "node-layout", nodeId: "agui-blog-hero", layoutChoice: "cover-banner" },
      },
      {
        id: "blog-hdr-simple",
        title: "미니멀 언더라인 제목",
        subtitle: "여백 최소화 · 빠른 본문 진입",
        badge: "컴팩트",
        score: 82,
        toneTags: ["all", "compact"],
        rationale: "짧은 주간 업데이트 노트처럼 본문으로 바로 들어가야 할 때 적합합니다.",
        previewBars: [
          { label: "심플 H1 + 얇은 구분선", tone: "slate" },
        ],
        action: { kind: "node-layout", nodeId: "agui-blog-hero", layoutChoice: "heading" },
      },
    ],
  },

  // ③ WebForm 현업 사전 설문 포맷
  {
    id: "cand-webform-theme",
    docNodeId: "agui-doc-webform",
    surfaceId: "surface://asset-picker/webform-theme",
    catalogId: "vibe.catalog.webform-themes@1.0",
    targetBlockId: "pg_blk_agui-wf-sec1-tbl_raw",
    targetNodeId: "agui-wf-sec1-tbl",
    targetLabel: "웹 설문 전체 UI 테마",
    title: "WebForm 인터랙티브 테마 후보 4종",
    description: "동일한 설문 문항 스키마를 4가지 웹 설문 UI로 즉시 전환해 응답 UX를 비교합니다.",
    candidates: [
      {
        id: "wf-theme-google",
        title: "Google Forms 카드형",
        subtitle: "상단 컬러 바 + 문항별 화이트 카드",
        badge: "익숙한 UX",
        score: 95,
        toneTags: ["all", "executive"],
        rationale: "전사 구성원 누구나 설명 없이 즉시 응답할 수 있는 가장 친숙한 설문 레이아웃입니다.",
        previewBars: [
          { label: "인디고 상단 띠", tone: "indigo" },
          { label: "라디오/체크 카드 스택", tone: "slate" },
        ],
        action: { kind: "webform-theme", theme: "webform-card-google" },
      },
      {
        id: "wf-theme-chips",
        title: "Pill Chips 타일 선택형",
        subtitle: "선택지를 큰 버튼 칩으로 배치",
        badge: "모바일 추천",
        score: 97,
        toneTags: ["all", "visual"],
        rationale: "모바일/태블릿 터치 응답률을 높이고 선택 피로도를 크게 줄여줍니다.",
        previewBars: [
          { label: "[칩 1] [칩 2] [칩 3]", tone: "emerald" },
        ],
        action: { kind: "webform-theme", theme: "webform-pill-chips" },
      },
      {
        id: "wf-theme-tally",
        title: "Tally 미니멀 문서형",
        subtitle: "박스 테두리 최소화 · 깔끔한 문서 감성",
        badge: "모던 미니멀",
        score: 91,
        toneTags: ["all", "compact"],
        rationale: "설문 문항이 많을 때 시각적 잡음을 줄이고 집중도를 높입니다.",
        previewBars: [
          { label: "문서형 타이포 + 연한 입력 필드", tone: "slate" },
        ],
        action: { kind: "webform-theme", theme: "webform-minimal-tally" },
      },
      {
        id: "wf-theme-step",
        title: "Step Accent 단계 강조형",
        subtitle: "좌측 컬러 보더 + STEP 배지 강조",
        badge: "단계형",
        score: 88,
        toneTags: ["all", "executive", "visual"],
        rationale: "응답 구간이 명확히 나뉘는 요구사항 조사에 진행감을 부여합니다.",
        previewBars: [
          { label: "좌측 액센트 보더 + STEP 01", tone: "indigo" },
        ],
        action: { kind: "webform-theme", theme: "webform-step-accent" },
      },
    ],
  },

  // ④ RFP 요구사항 명세서 포맷
  {
    id: "cand-rfp-spec",
    docNodeId: "agui-doc-rfp",
    surfaceId: "surface://asset-picker/rfp-spec",
    catalogId: "vibe.catalog.rfp-blocks@1.0",
    targetBlockId: "pg_blk_agui-rfp-reqs",
    targetNodeId: "agui-rfp-reqs",
    targetLabel: "상세 요구사항 명세 블록",
    title: "RFP 요구사항 표현 에셋 후보 3종",
    description: "동일한 요구사항 데이터를 상세 명세 카드표 · 목록 요약표 · 비교 카드로 전환합니다.",
    candidates: [
      {
        id: "rfp-view-spec",
        title: "공공 RFP 상세 명세표",
        subtitle: "요구사항 1건당 정의/세부내용/산출물 6행 카드표",
        badge: "발주 표준",
        score: 98,
        toneTags: ["all", "executive"],
        rationale: "공공·대기업 제안요청서에서 요구사항별 검증 기준과 산출물을 빠짐없이 명시하는 정석 포맷입니다.",
        previewBars: [
          { label: "고유번호 · 명칭 · 정의 · 세부 · 산출물", tone: "dark" },
        ],
        action: { kind: "node-layout", nodeId: "agui-rfp-reqs", layoutChoice: "rfp-spec-table" },
      },
      {
        id: "rfp-view-summary",
        title: "요구사항 일람 요약표",
        subtitle: "전체 요구사항을 1표에 압축 조망",
        badge: "1페이지 요약",
        score: 92,
        toneTags: ["all", "compact"],
        rationale: "경영진 검토나 총괄 목차 페이지에서 요구사항 전체 규모를 빠르게 파악할 때 유리합니다.",
        previewBars: [
          { label: "순번 | 분류 | 고유번호 | 명칭 | 산출물", tone: "indigo" },
        ],
        action: { kind: "node-layout", nodeId: "agui-rfp-reqs", layoutChoice: "rfp-summary-table" },
      },
      {
        id: "rfp-view-cards",
        title: "핵심 요구사항 3단 카드",
        subtitle: "발표·브리핑용 병렬 카드 비교",
        badge: "브리핑용",
        score: 84,
        toneTags: ["all", "visual"],
        rationale: "착수 보고회나 비개발 이해관계자 설명 자료로 재활용할 때 가독성이 뛰어납니다.",
        previewBars: [
          { label: "REQ-001 | REQ-002 | REQ-003", tone: "emerald" },
        ],
        action: { kind: "node-layout", nodeId: "agui-rfp-reqs", layoutChoice: "columns-grid" },
      },
    ],
  },
];

export function buildInitialSuggestions(): WysiwygSuggestion[] {
  return [
    // ① HWP 공문/기획 품의서용 위지윅 수정 제안
    {
      id: "sug-hwp-title",
      docNodeId: "agui-doc-hwp",
      targetBlockId: "pg_blk_agui-hwp-p1-title_raw",
      targetSlotId: "pg_slot_pg_blk_agui-hwp-p1-title_raw",
      targetNodeId: "agui-hwp-p1-title",
      targetLabel: "상단 문서 제목",
      category: "rewrite",
      categoryLabel: "공문 톤 정제",
      rationale: "구두 표현('만들기 기획안')을 사내 품의·결재 표준 문서 제목 규격으로 격상합니다.",
      beforeText: "2026 차세대 사내 지식포털 만들기 기획안",
      variants: [
        {
          id: "A",
          label: "A안 · 공식 품의형",
          toneBadge: "임원 결재용",
          afterText: "2026년 차세대 사내 지식포털 구축 추진 품의서",
          afterHtml: "<h1>2026년 차세대 사내 지식포털 구축 추진 품의서</h1>",
        },
        {
          id: "B",
          label: "B안 · 간결 보고형",
          toneBadge: "실무 공유용",
          afterText: "2026 차세대 지식포털 구축 실행 계획(안)",
          afterHtml: "<h1>2026 차세대 지식포털 구축 실행 계획(안)</h1>",
        },
      ],
      status: "pending",
      selectedVariantId: "A",
    },
    {
      id: "sug-hwp-goal",
      docNodeId: "agui-doc-hwp",
      targetBlockId: "pg_blk_agui-hwp-p1-sec1-list_raw",
      targetSlotId: "pg_slot_pg_blk_agui-hwp-p1-sec1-list_raw_0",
      targetNodeId: "agui-hwp-p1-sec1-l1",
      targetLabel: "추진 배경 첫 항목",
      category: "metric",
      categoryLabel: "정량 근거 보강",
      rationale: "'많이 흩어져 있어 불편함' 같은 정성 표현에 실제 조사 수치와 기대 효과를 추가하면 설득력이 높아집니다.",
      beforeText: "사내 문서가 여러 곳에 흩어져 있어 검색이 불편하고 중복 작성이 많음",
      variants: [
        {
          id: "A",
          label: "A안 · KPI 수치 포함",
          toneBadge: "경영 보고용",
          afterText: "분산 저장(위키·공유폴더·메일 4개 채널)으로 인당 주 3.4시간의 탐색 손실 발생 → 단일 허브 통합으로 60% 단축 목표",
          afterHtml: "<p>분산 저장(위키·공유폴더·메일 4개 채널)으로 인당 주 3.4시간의 탐색 손실 발생 → 단일 허브 통합으로 60% 단축 목표</p>",
        },
        {
          id: "B",
          label: "B안 · 핵심 개조식",
          toneBadge: "간결 요약",
          afterText: "4개 저장소 분산에 따른 검색 지연·버전 충돌 해소 및 단일 기준 문서(SSOT) 체계 확립",
          afterHtml: "<p>4개 저장소 분산에 따른 검색 지연·버전 충돌 해소 및 단일 기준 문서(SSOT) 체계 확립</p>",
        },
      ],
      status: "pending",
      selectedVariantId: "A",
    },

    // ② Blog 전사 공지 아티클용 위지윅 수정 제안
    {
      id: "sug-blog-summary",
      docNodeId: "agui-doc-blog",
      targetBlockId: "pg_blk_agui-blog-summary",
      targetSlotId: "pg_slot_agui-blog-summary_callout",
      targetNodeId: "agui-blog-summary",
      targetLabel: "한 줄 요약 콜아웃",
      category: "rewrite",
      categoryLabel: "도입부 훅 강화",
      rationale: "구성원 관점의 체감 이점(검색 시간, 자동 동기화)을 첫 문장에 배치해 읽기 이탈을 줄입니다.",
      beforeText: "새로운 지식포털이 다음 달 오픈합니다. 앞으로 문서를 여기서 찾으시면 됩니다.",
      variants: [
        {
          id: "A",
          label: "A안 · 효익 중심 훅",
          toneBadge: "전사 공지 추천",
          afterText: "이제 '최신본 어디 있나요?'라고 묻지 마세요. 12월 오픈하는 차세대 지식포털에서 모든 표준 양식과 정책 문서를 3초 만에 찾고 AI 요약까지 바로 확인할 수 있습니다.",
          afterHtml: "<h3>한 줄 안내</h3><ul><li>이제 '최신본 어디 있나요?'라고 묻지 마세요. 12월 오픈하는 차세대 지식포털에서 모든 표준 양식과 정책 문서를 3초 만에 찾고 AI 요약까지 바로 확인할 수 있습니다.</li></ul>",
        },
        {
          id: "B",
          label: "B안 · 담백한 안내형",
          toneBadge: "차분한 톤",
          afterText: "12월 1일, 분산되어 있던 사내 위키·양식함·기술 문서를 하나로 통합한 차세대 지식포털이 정식 오픈합니다.",
          afterHtml: "<h3>한 줄 안내</h3><ul><li>12월 1일, 분산되어 있던 사내 위키·양식함·기술 문서를 하나로 통합한 차세대 지식포털이 정식 오픈합니다.</li></ul>",
        },
      ],
      status: "pending",
      selectedVariantId: "A",
    },
    {
      id: "sug-blog-card1",
      docNodeId: "agui-doc-blog",
      targetBlockId: "pg_blk_agui-blog-changes",
      targetSlotId: "pg_slot_agui-blog-c1_col",
      targetNodeId: "agui-blog-c1",
      targetLabel: "핵심 변화 1번 카드",
      category: "structure",
      categoryLabel: "문구 + 레이아웃 제안",
      rationale: "카드 제목과 본문의 대비를 선명하게 다듬고, 원하면 비교표 레이아웃으로 전환할 수 있습니다.",
      beforeText: "검색 개선 | 키워드랑 자연어 검색이 둘 다 잘 됩니다.",
      variants: [
        {
          id: "A",
          label: "A안 · 카드 문구 정교화",
          toneBadge: "카드 유지",
          afterText: "① 시맨틱 통합 검색 — 파일명을 몰라도 자연어 질문만으로 관련 문단·표·첨부까지 즉시 탐색",
          afterHtml: "<p><strong>① 시맨틱 통합 검색</strong></p><p>파일명을 몰라도 자연어 질문만으로 관련 문단·표·첨부까지 3초 내 즉시 탐색합니다.</p>",
          layoutAction: { kind: "node-layout", nodeId: "agui-blog-changes", layoutChoice: "columns-grid" },
        },
        {
          id: "B",
          label: "B안 · 비교표 전환 + 정량화",
          toneBadge: "표로 전환",
          afterText: "통합 검색 | 평균 탐색 시간 8분 → 40초 단축 (시맨틱 + 필터 하이브리드)",
          afterHtml: "<p><strong>① 통합 검색 (8분 → 40초)</strong></p><p>시맨틱 + 메타 필터 하이브리드 검색으로 탐색 시간을 90% 단축합니다.</p>",
          layoutAction: { kind: "node-layout", nodeId: "agui-blog-changes", layoutChoice: "structured-table" },
        },
      ],
      status: "pending",
      selectedVariantId: "A",
    },

    // ③ WebForm 현업 사전 설문용 위지윅 수정 제안
    {
      id: "sug-wf-intro",
      docNodeId: "agui-doc-webform",
      targetBlockId: "pg_blk_agui-doc-webform_raw_doc_title",
      targetSlotId: "pg_slot_pg_blk_agui-doc-webform_raw_doc_title",
      targetNodeId: "agui-doc-webform",
      targetLabel: "웹 설문 헤더 제목",
      category: "rewrite",
      categoryLabel: "응답률 개선 문구",
      rationale: "예상 소요 시간(2분)을 제목에 명시하면 사내 설문 완료율이 평균 20% 이상 올라갑니다.",
      beforeText: "현업 요구사항 사전 설문",
      variants: [
        {
          id: "A",
          label: "A안 · 소요시간 명시",
          toneBadge: "응답률 최적화",
          afterText: "[2분 설문] 차세대 지식포털 현업 우선 기능 수요조사",
          afterHtml: "<h1>[2분 설문] 차세대 지식포털 현업 우선 기능 수요조사</h1>",
        },
        {
          id: "B",
          label: "B안 · 공식 조사명",
          toneBadge: "표준 안내",
          afterText: "2026 차세대 지식포털 도입 사전 요구사항 조사",
          afterHtml: "<h1>2026 차세대 지식포털 도입 사전 요구사항 조사</h1>",
        },
      ],
      status: "pending",
      selectedVariantId: "A",
    },

    // ④ RFP 요구사항 명세서용 위지윅 수정 제안
    {
      id: "sug-rfp-summary",
      docNodeId: "agui-doc-rfp",
      targetBlockId: "pg_blk_agui-rfp-scope",
      targetSlotId: "pg_slot_agui-rfp-scope_callout",
      targetNodeId: "agui-rfp-scope",
      targetLabel: "사업 범위 핵심 요약",
      category: "metric",
      categoryLabel: "검수 기준 명확화",
      rationale: "RFP 범위 조항에는 SLA·응답시간 등 객관적 검수 지표를 명시해야 분쟁을 예방할 수 있습니다.",
      beforeText: "사내 문서 통합 검색과 AI 요약, 권한 관리 기능을 빠르게 동작하도록 구축함",
      variants: [
        {
          id: "A",
          label: "A안 · SLA 수치 명시",
          toneBadge: "발주 검수용",
          afterText: "통합 검색(P95 응답 ≤ 1.2초), 문서 AI 요약·출처 인용(정확도 검수셋 ≥ 95%), 조직도/RBAC 기반 문서 권한 제어를 포함한 전사 지식포털 구축",
          afterHtml: "<h3>사업 핵심 범위</h3><ul><li>통합 검색(P95 응답 ≤ 1.2초), 문서 AI 요약·출처 인용(정확도 검수셋 ≥ 95%), 조직도/RBAC 기반 문서 권한 제어를 포함한 전사 지식포털 구축</li></ul>",
        },
        {
          id: "B",
          label: "B안 · 항목별 핵심 범위",
          toneBadge: "간결 명세",
          afterText: "① 전사 통합 검색 허브 ② 출처 기반 AI 문서 요약 ③ SSO·RBAC 보안 권한 체계 3대 영역 일괄 구축",
          afterHtml: "<h3>사업 핵심 범위</h3><ul><li>① 전사 통합 검색 허브 ② 출처 기반 AI 문서 요약 ③ SSO·RBAC 보안 권한 체계 3대 영역 일괄 구축</li></ul>",
        },
      ],
      status: "pending",
      selectedVariantId: "A",
    },
  ];
}

export function buildInitialSubagents(): SubagentRunState[] {
  return [
    {
      subagentRunId: "sub_asset_recommender",
      name: "asset-recommender",
      role: "A2UI 에셋 후보 생성",
      status: "finished",
      progress: 100,
      activityText: "문서 포맷 분석 완료 · 카탈로그 후보 생성됨",
    },
    {
      subagentRunId: "sub_wysiwyg_reviewer",
      name: "wysiwyg-reviewer",
      role: "AG-UI 위지윅 수정 제안",
      status: "finished",
      progress: 100,
      activityText: "슬롯 문구·수치 스캔 완료 · A/B안 Diff 준비됨",
    },
  ];
}

export function createTimestamp(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

export function buildSeedWireEvents(docNodeId: string): AguiWireEvent[] {
  const ts = createTimestamp();
  const groups = AGUI_A2UI_CANDIDATE_GROUPS.filter((g) => g.docNodeId === docNodeId);
  const firstGroup = groups[0];
  return [
    {
      seq: 1,
      timestamp: ts,
      protocol: "AG-UI 1.0",
      type: "RUN_STARTED",
      summary: `run_agui_demo 시작 (문서: ${docNodeId})`,
      payload: {
        threadId: "thread_v1_demo",
        runId: "run_agui_demo_01",
        docNodeId,
      },
    },
    {
      seq: 2,
      timestamp: ts,
      protocol: "AG-UI 1.0",
      type: "SUBAGENT_STARTED",
      subagentRunId: "sub_asset_recommender",
      summary: "병렬 워커 #1 가동: 에셋 후보군 추천",
      payload: {
        subagentRunId: "sub_asset_recommender",
        parallel: true,
        goal: "recommend-native-asset-candidates",
      },
    },
    {
      seq: 3,
      timestamp: ts,
      protocol: "AG-UI 1.0",
      type: "SUBAGENT_STARTED",
      subagentRunId: "sub_wysiwyg_reviewer",
      summary: "병렬 워커 #2 가동: 위지윅 문구·수치 수정 제안",
      payload: {
        subagentRunId: "sub_wysiwyg_reviewer",
        parallel: true,
        goal: "propose-inline-wysiwyg-patches",
      },
    },
    {
      seq: 4,
      timestamp: ts,
      protocol: "A2UI 1.0",
      type: "createSurface",
      subagentRunId: "sub_asset_recommender",
      summary: `Surface 생성 (${firstGroup?.surfaceId ?? "surface://asset-picker"})`,
      payload: {
        surfaceId: firstGroup?.surfaceId ?? "surface://asset-picker",
        "@catalogId": firstGroup?.catalogId ?? "vibe.catalog.assets@1.0",
        placementHint: "drawer | popover | chat-inline",
      },
    },
    {
      seq: 5,
      timestamp: ts,
      protocol: "A2UI 1.0",
      type: "updateDataModel",
      subagentRunId: "sub_asset_recommender",
      summary: `에셋 후보 ${firstGroup?.candidates.length ?? 3}건 데이터 바인딩`,
      payload: {
        surfaceId: firstGroup?.surfaceId ?? "surface://asset-picker",
        "@path": "/candidates",
        count: firstGroup?.candidates.length ?? 3,
        candidateIds: firstGroup?.candidates.map((c) => c.id) ?? [],
      },
    },
    {
      seq: 6,
      timestamp: ts,
      protocol: "AG-UI 1.0",
      type: "STATE_DELTA",
      subagentRunId: "sub_wysiwyg_reviewer",
      summary: "JSON Patch로 위지윅 수정 제안(/suggestions) 동기화",
      payload: {
        delta: [
          {
            op: "replace",
            path: "/suggestions",
            value: { docNodeId, mode: "ab-inline-diff", status: "pending" },
          },
        ],
      },
    },
    {
      seq: 7,
      timestamp: ts,
      protocol: "AG-UI 1.0",
      type: "RUN_FINISHED",
      summary: "사용자 선택 대기 (outcome: interrupted · 웨이크업 알림)",
      payload: {
        runId: "run_agui_demo_01",
        outcome: "interrupted",
        interruptReason: "awaiting_user_candidate_and_patch_decisions",
      },
    },
  ];
}

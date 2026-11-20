import type {
  LayoutBlock,
  StructuredTableBlockDef,
  TableCellSlotDef,
  VDocSlot,
  WebFormFieldDef,
  WebFormVariant,
} from "@vibe/vdoc-schema";
import { parseContainerDirective, stripLinkTags } from "./documentLinkParser";
import type {
  BlockRoleKind,
  BlockVariantId,
  FormAssetCategory,
  FormAssetId,
  LinkedDocumentSpec,
  LinkedPageSpec,
  PlaygroundBlockMeta,
  PlaygroundNode,
  SlotReverseTarget,
} from "./types";

export interface FormAssetMeta {
  id: FormAssetId;
  title: string;
  shortLabel: string;
  category: Exclude<FormAssetCategory, "all">;
  categoryLabel: string;
  wireframe:
  | "survey-grid"
  | "approval-official"
  | "merged-timetable"
  | "compare-dual-header"
  | "standard-doc";
  description: string;
  slotsSummary: readonly string[];
  badgeColor: string;
}

export interface BlockAssetMeta {
  id: BlockVariantId;
  role: BlockRoleKind;
  title: string;
  badge: string;
  wireframe:
    | "bar"
    | "box"
    | "grid-2x4"
    | "grid-approval"
    | "grid-3col"
    | "checkbox"
    | "bullets"
    | "tbl-header-below"
    | "tbl-choice-matrix"
    | "tbl-stacked-box"
    | "tbl-banner-rows"
    | "tbl-roster-pivot"
    | "tbl-grouped-compare"
    | "tbl-modern-flat"
    | "tbl-roster-ledger"
    | "wf-google"
    | "wf-tally"
    | "wf-chips"
    | "wf-step";
  description: string;
  slotsSummary: readonly string[];
  reference?: string;
  transformRule?: string;
  visualStyle?: string;
  templateSnippet?: string;
}

export const BLOCK_ROLE_LABELS: Record<BlockRoleKind, string> = {
  title: "제목",
  list: "리스트 · 글머리 기호",
  table: "데이터 표",
  "web-form": "웹 설문 UI",
  guide: "건명 · 안내 블록",
  "meta-table": "개요 · 메타 표",
  "approval-box": "결재란 블록",
  "main-table": "본문 문항 · 데이터 표",
  "roster-table": "명부 · 수합 · 역할표",
  "schedule-table": "세부 일정표",
  "budget-table": "소요예산 비교표",
};

export const BLOCK_ASSET_CATALOG: Record<BlockRoleKind, ReadonlyArray<BlockAssetMeta>> = {
  list: [
    {
      id: "list-square-box",
      role: "list",
      title: "□ 공문 네모 개조식 (□ · ◦)",
      badge: "네모기호",
      wireframe: "bullets",
      description: "한글 공문 표준 글머리 기호(□)로 항목을 깔끔하게 표시합니다.",
      slotsSummary: ["□ 네모기호", "◦ 하위불릿"],
    },
    {
      id: "list-filled-square",
      role: "list",
      title: "❏ 입체 · 사각 강조 기호 (❏ · ▪)",
      badge: "강조기호",
      wireframe: "bullets",
      description: "중요 목적·유의 안내를 입체 사각(❏) 기호로 강조해 표시합니다.",
      slotsSummary: ["❏ 입체기호", "▪ 보조점"],
    },
    {
      id: "list-numbered",
      role: "list",
      title: "1. · 가. 공문 번호 목록",
      badge: "번호형",
      wireframe: "bullets",
      description: "글머리 기호 대신 계층 번호(1., 2. / 가., 나.)를 부여합니다.",
      slotsSummary: ["1. 대항목", "가. 소항목"],
    },
  ],
  table: [
    {
      id: "table-grouped-compare",
      role: "table",
      title: "1. 좌측 대분류 세로 묶음 비교표",
      badge: "병합비교",
      wireframe: "tbl-grouped-compare",
      description: "큰 분류를 왼쪽에 세로로 묶고, 오른쪽 행마다 항목과 빈 기입칸을 나란히 배치합니다.",
      slotsSummary: ["좌측 대분류(rowSpan)", "항목·속성 비교"],
      reference: "예스폼_무료계약검토회의록양식과활용법안내.pdf",
      transformRule: "상위 분류를 좌측 세로 병합(rowSpan) 열로 묶고, 하위 항목과 속성들을 우측 행으로 나열",
      visualStyle: "테두리=HWP 실선 | 헤더배경=#e2e8f0 | 빈칸=[-]",
      templateSnippet: [
        "{{분류열}} | {{항목열}} | {{속성1}} | {{속성2}} | {{속성3}}",
        "{{대분류_1}}",
        "  {{항목_1}} | {{속성1_값}} | {{속성2_값}} | {{속성3_값}}",
        "  {{항목_2}} | {{속성1_값}} | {{속성2_값}} | {{속성3_값}}",
        "{{대분류_2}}",
        "  {{항목_3}} | {{속성1_값}} | [-] | {{속성3_값}}",
      ].join("\n"),
    },
    {
      id: "table-modern-flat",
      role: "table",
      title: "2. 모던 수평 비교표 (세로선 없음)",
      badge: "모던수평",
      wireframe: "tbl-modern-flat",
      description: "세로선·칸 합침 없이 윗줄 헤더 아래로 모든 행을 깔끔하게 수평 정렬합니다.",
      slotsSummary: ["세로선 없음", "1행 헤더 고정", "수평 비교"],
      reference: "예스폼_분기성과분석및전략이행회의록(구글문서변환).pdf",
      transformRule: "세로 병합 없이 모든 행을 동일 열 개수로 수평 정렬하고 1행 상단 헤더 고정",
      visualStyle: "테두리=가로 연한 실선(세로선 없음) | 헤더배경=#f1f5f9 | 빈칸=[-]",
      templateSnippet: [
        "{{분류}} | {{항목}} | {{요약1}} | {{요약2}} | {{비고}}",
        "{{대분류_1}} | {{항목_1}} | {{값_1}} | {{값_2}} | {{비고_값}}",
        "{{대분류_2}} | {{항목_2}} | {{값_1}} | [-] | {{비고_값}}",
      ].join("\n"),
    },
    {
      id: "table-roster-ledger",
      role: "table",
      title: "3. 다열 실무 현황·관리대장형",
      badge: "현황대장",
      wireframe: "tbl-roster-ledger",
      description: "좁은 구분·상태 열 + 넓은 내용 열 + 우측 확인/비고 빈 칸을 두는 고밀도 일람표로 재구성합니다.",
      slotsSummary: ["고밀도 다열", "외곽 2px", "상태·비고 [-]"],
      reference: "예스폼_회의록관리현황표무료다운로드및활용법.pdf",
      transformRule: "좁은 구분·상태 열 + 넓은 내용 열 + 우측 확인/비고 빈 칸을 두는 고밀도 일람표",
      visualStyle: "테두리=HWP 실선(외곽 2px) | 헤더배경=#e2e8f0 | 빈칸=[-]",
      templateSnippet: [
        "{{구분}} | {{명칭}} | {{핵심지표}} | {{세부내용}} | {{일정}} | {{상태}} | {{비고}}",
        "{{구분_1}} | {{명칭_1}} | {{지표_1}} | {{내용_1}} | {{일정_1}} | [-] | [-]",
        "{{구분_2}} | {{명칭_2}} | {{지표_2}} | [-] | {{일정_2}} | [-] | [-]",
      ].join("\n"),
    },
    {
      id: "table-header-below-matrix",
      role: "table",
      title: "4. 상하 2단 (위 라벨 · 아래 기입칸)",
      badge: "2단매트릭스",
      wireframe: "tbl-header-below",
      description: "항목 이름을 윗줄 라벨에 두고, 바로 아래 칸을 넓게 비워 기입·비교할 수 있게 만듭니다.",
      slotsSummary: ["그룹+상하2단", "라벨행(#e2e8f0)", "하단값/기입"],
      reference: "예스폼_무료설계심사회의록샘플과예문다운로드.pdf",
      transformRule: "좌측 그룹 열 옆에 개체명을 윗줄(가로 헤더)로 올리고 바로 아랫줄에 상세/기입칸을 나란히 배치",
      visualStyle: "테두리=HWP 실선 | 라벨행배경=#e2e8f0 | 빈칸=[-]",
      templateSnippet: [
        "{{대분류_1}}",
        "  {{항목_1}} | {{항목_2}} | {{항목_3}}",
        "  {{상세요약_1}} | {{상세요약_2}} | {{상세요약_3}}",
        "{{대분류_2}}",
        "  {{항목_4}} | {{항목_5}}",
        "  {{상세요약_4}} | [-]",
      ].join("\n"),
    },
    {
      id: "table-eval-checklist",
      role: "table",
      title: "5. 내용 + 우측 체크/평가 품평표",
      badge: "체크품평",
      wireframe: "tbl-choice-matrix",
      description: "개체별 요약 내용을 넓은 좌측 열에 두고, 우측에 체크 선택(□) 및 평가 메모([-]) 열을 부착합니다.",
      slotsSummary: ["좌측 요약", "우측 □ 평가", "비고 [-]"],
      reference: "예스폼_제품품평회의록무료양식과샘플다운로드.pdf",
      transformRule: "개체별 요약 내용을 넓은 좌측 열에 두고, 우측에 체크 선택(□) 및 평가 메모([-]) 열을 부착",
      visualStyle: "테두리=HWP 실선 | 헤더배경=#e2e8f0 | 선택기호=□ | 빈칸=[-]",
      templateSnippet: [
        "{{항목 및 요약}} | {{평가/선택}} | {{비고}}",
        "{{항목_1}} — {{요약_1}} | □ {{선택1}}   □ {{선택2}}   □ {{선택3}} | [-]",
        "{{항목_2}} — {{요약_2}} | □ {{선택1}}   □ {{선택2}}   □ {{선택3}} | [-]",
      ].join("\n"),
    },
  ],
  title: [
    {
      id: "title-underline",
      role: "title",
      title: "공문 밑줄 대제목 (문서 상단형)",
      badge: "대제목",
      wireframe: "bar",
      description: "중앙 정렬 24px 대제목 + 하단 2px 굵은 구분 실선",
      slotsSummary: ["문서대제목", "2px 하단실선"],
    },
    {
      id: "title-section-bar",
      role: "title",
      title: "섹션 좌측 강조 바 소제목 (구역형)",
      badge: "AI 소제목",
      wireframe: "bar",
      description: "좌측 4px 강조 바 + 16px 좌측 정렬 볼드 + 1px 하단 실선 (본문 구역 구분용)",
      slotsSummary: ["좌측바", "섹션소제목", "1px 실선"],
    },
    {
      id: "title-with-approval",
      role: "title",
      title: "제목 + 우측 3단 결재란 결합 헤더",
      badge: "결재결합",
      wireframe: "grid-approval",
      description: "좌측 문서 제목(rowSpan=2)과 우측 결재란(담당·검토·팀장)을 한 격자로 묶은 품의 헤더",
      slotsSummary: ["문서제목(rowSpan=2)", "결재3단(서명칸)"],
    },
    {
      id: "title-boxed-seal",
      role: "title",
      title: "이중 외곽선 박스 공고형 타이틀",
      badge: "박스강조",
      wireframe: "box",
      description: "회색 바탕과 2px 상하 테두리로 구획한 사내 공지·조사표 상단 헤더",
      slotsSummary: ["외곽선 프레임", "배경음영"],
    },
    {
      id: "title-web-hero",
      role: "title",
      title: "웹 설문 인디고 섹션 헤더 (웹 폼용)",
      badge: "웹헤더",
      wireframe: "wf-google",
      description: "인디고 포인트 바와 산세리프 타이포그래피로 웹 설문 섹션을 깔끔하게 구분",
      slotsSummary: ["인디고 바", "웹 섹션 제목"],
    },
  ],
  "web-form": [
    {
      id: "webform-card-google",
      role: "web-form",
      title: "구글 폼 카드형 (상단 바 · 스택 질문)",
      badge: "카드형",
      wireframe: "wf-google",
      description: "상단 포인트 바가 있는 섹션 카드와 라디오·체크박스·밑줄 입력 질문 카드를 쌓아 표시",
      slotsSummary: ["상단 강조 바", "질문 카드", "라디오/체크"],
    },
    {
      id: "webform-minimal-tally",
      role: "web-form",
      title: "Tally · 노션 미니멀 폼 (오픈 스택)",
      badge: "미니멀",
      wireframe: "wf-tally",
      description: "카드 테두리를 없애고 부드러운 배경 입력창과 얇은 선택 버튼으로 가독성을 극대화",
      slotsSummary: ["오픈 레이아웃", "소프트 인풋", "클린 체크"],
    },
    {
      id: "webform-pill-chips",
      role: "web-form",
      title: "칩 · 버튼 그리드 선택형 (모던 SaaS)",
      badge: "칩그리드",
      wireframe: "wf-chips",
      description: "선택지를 2~3열 클릭형 토글 버튼 그리드로, 복수 입력을 3열 칩 박스로 배치",
      slotsSummary: ["토글 칩 그리드", "다열 인풋칩", "카드 강조"],
    },
    {
      id: "webform-step-accent",
      role: "web-form",
      title: "스텝 섹션 · 좌측 2단 분할형 (대시보드)",
      badge: "2단스텝",
      wireframe: "wf-step",
      description: "좌측 인디고 바 + STEP 배지와 좌측 질문/우측 입력 2단 분할로 밀도 높게 표시",
      slotsSummary: ["좌측 스텝바", "질문|입력 2단", "압축 그리드"],
    },
  ],
  guide: [
    {
      id: "guide-inline",
      role: "guide",
      title: "인라인 건명 · 유의사항 문구",
      badge: "기본서식",
      wireframe: "bar",
      description: "표 상단에 간결하게 건명과 목적 안내를 한 줄로 배치",
      slotsSummary: ["건명", "참고안내"],
    },
    {
      id: "guide-notice-box",
      role: "guide",
      title: "한글 주의사항 외곽 박스 프레임",
      badge: "유의박스",
      wireframe: "box",
      description: "1.5px 실선 박스와 연회색 배경으로 제출 기한·주의사항을 분리 강조",
      slotsSummary: ["유의사항 박스", "제출안내"],
    },
    {
      id: "guide-doc-number",
      role: "guide",
      title: "시행 문서번호 · 시행일 메타 바",
      badge: "공문시행",
      wireframe: "grid-2x4",
      description: "문서번호, 시행일자 정보를 4열 공문 바 형태로 배치",
      slotsSummary: ["문서번호", "시행일자"],
    },
  ],
  "meta-table": [
    {
      id: "meta-2x4",
      role: "meta-table",
      title: "2행 4열 표준 메타 격자표",
      badge: "표준4열",
      wireframe: "grid-2x4",
      description: "작성부서·대상·기한·담당자를 균형 있게 배치하는 기본 회사 개요표",
      slotsSummary: ["부서·대상", "기한·담당"],
    },
    {
      id: "meta-with-approval",
      role: "meta-table",
      title: "개요 + 결재 서명 결합 복합표",
      badge: "결재포함",
      wireframe: "grid-approval",
      description: "좌측 기안 요약(2열)과 우측 결재 서명칸(담당·팀장)을 나란히 병합한 기안용 메타표",
      slotsSummary: ["기안메타(3행)", "우측결재란"],
    },
    {
      id: "meta-2col-kv",
      role: "meta-table",
      title: "2열 세로형 공문 요약표 (Key-Value)",
      badge: "2열단순",
      wireframe: "box",
      description: "항목명(22%)과 긴 설명(78%)을 줄바꿈 없이 깔끔히 적는 세로형 표",
      slotsSummary: ["항목라벨(22%)", "상세값(78%)"],
    },
  ],
  "approval-box": [
    {
      id: "approval-4col",
      role: "approval-box",
      title: "4단 표준 결재란 (담당·검토·팀장·부서장)",
      badge: "4단표준",
      wireframe: "grid-approval",
      description: "사내 정식 품의서용 4단계 결재 라인 (rowSpan=2 세로 결재 라벨)",
      slotsSummary: ["담당", "검토", "팀장", "부서장"],
    },
    {
      id: "approval-3col",
      role: "approval-box",
      title: "3단 팀 내 결재란 (담당·팀장·부서장)",
      badge: "3단약식",
      wireframe: "grid-approval",
      description: "검토 단계를 생략한 신속 보고용 3단 결재란",
      slotsSummary: ["담당", "팀장", "부서장"],
    },
    {
      id: "approval-2col-date",
      role: "approval-box",
      title: "기안일 포함 2단 간이 결재란",
      badge: "간이결재",
      wireframe: "grid-2x4",
      description: "좌측 문서번호/기안일자 메타와 우측 담당·팀장 2단 서명칸 결합",
      slotsSummary: ["기안일자", "담당", "팀장"],
    },
  ],
  "main-table": [
    {
      id: "main-grouped-grid",
      role: "main-table",
      title: "구분(rowSpan) + 문항 + 기준 3열 표준표",
      badge: "기본격자",
      wireframe: "grid-3col",
      description: "Phase 1 `#page` 구분을 좌측 세로 병합(rowSpan)으로 묶은 표준 기준표",
      slotsSummary: ["구분(rowSpan)", "항목명", "상세기준"],
    },
    {
      id: "main-printable-checkbox",
      role: "main-table",
      title: "인쇄 · 수기 체크(□) 회람용 조사표",
      badge: "체크서식",
      wireframe: "checkbox",
      description: "출력·회람 시 바로 체크할 수 있는 □ 선택칸이 들어간 현장 수합용 표",
      slotsSummary: ["□ 체크박스란", "직접기입칸"],
    },
    {
      id: "main-summary-matrix",
      role: "main-table",
      title: "4열 운영 · 비고 확장 매트릭스 표",
      badge: "4열확장",
      wireframe: "grid-2x4",
      description: "구분·항목·세부기준에 담당/비고 열을 붙여 TF 실무 검수용으로 확장한 표",
      slotsSummary: ["구분", "항목·기준", "비고/확인"],
    },
    {
      id: "main-official-bullets",
      role: "main-table",
      title: "공문 개조식 계층 목록 (Ⅰ · ❏ · ◦)",
      badge: "개조식",
      wireframe: "bullets",
      description: "격자 표 대신 Ⅰ · ❏ · ◦ 공문서 계층 들여쓰기 문단으로 전환",
      slotsSummary: ["공문대제목", "❏·◦ 계층"],
    },
  ],
  "roster-table": [
    {
      id: "roster-9col",
      role: "roster-table",
      title: "9열 상세 수합 · 장비 발주 명부",
      badge: "발주상세",
      wireframe: "grid-3col",
      description: "참석·일정·트랙·강습·부츠/의류 사이즈·레크 선호까지 발주용으로 기록하는 상세표",
      slotsSummary: ["9열 수합", "하단 집계요약(colSpan=7)"],
    },
    {
      id: "roster-compact-sign",
      role: "roster-table",
      title: "6열 약식 회람 · 수기 서명 체크 명부",
      badge: "회람서명",
      wireframe: "checkbox",
      description: "프린트해서 돌리며 참석(□)·트랙(□)·본인 서명만 빠르게 받는 간이 명부",
      slotsSummary: ["참석·활동 체크", "본인 서명란"],
    },
    {
      id: "roster-grouped-summary",
      role: "roster-table",
      title: "트랙 · 역할별 요약 집계표",
      badge: "요약집계",
      wireframe: "grid-2x4",
      description: "개인 명단 대신 트랙·대기·TF 분과별 인원수/담당자만 압축 요약한 표",
      slotsSummary: ["구분·인원수", "담당·비고"],
    },
  ],
  "schedule-table": [
    {
      id: "sched-3track-merged",
      role: "schedule-table",
      title: "3트랙 분기 병합 일정표 (colSpan=3)",
      badge: "3트랙병합",
      wireframe: "grid-3col",
      description: "이동·식사·만찬은 통합 행으로, 낮 활동만 자유/강습/스파 3열로 나눈 운영표",
      slotsSummary: ["공통(colSpan=3)", "3트랙 분리열", "안전비고"],
    },
    {
      id: "sched-timeline-4col",
      role: "schedule-table",
      title: "시간대별 4열 순차 타임테이블",
      badge: "순차일정",
      wireframe: "grid-2x4",
      description: "구분·시간·세부 프로그램·안전/담당을 세로 시간순으로 깔끔히 나열한 일정표",
      slotsSummary: ["시간대", "프로그램", "담당/비고"],
    },
    {
      id: "sched-plan-ab",
      role: "schedule-table",
      title: "A안(1박2일) vs B안(당일) 대조 일정표",
      badge: "AB대조",
      wireframe: "grid-approval",
      description: "시간대별로 A안 1박 일정과 B안 당일 일정을 나란히 비교해 결재 선택을 돕는 표",
      slotsSummary: ["A안 흐름", "B안 흐름", "선정포인트"],
    },
  ],
  "budget-table": [
    {
      id: "budget-dual-ab",
      role: "budget-table",
      title: "A안 vs B안 2단 복합헤더 예산 비교표",
      badge: "2단복합",
      wireframe: "grid-approval",
      description: "비목·산출기준 아래 A안/B안 내역·금액을 2단 헤더(rowSpan=2·colSpan=2)로 대조",
      slotsSummary: ["2단복합헤더", "A안 vs B안", "합계행"],
    },
    {
      id: "budget-single-detail",
      role: "budget-table",
      title: "단일 실행안 상세 산출내역서",
      badge: "상세산출",
      wireframe: "grid-3col",
      description: "선택된 실행안의 비목·단가·수량·총액·산출근거를 5열로 명기하는 정식 품의 내역서",
      slotsSummary: ["단가×수량", "금액", "산출근거"],
    },
    {
      id: "budget-per-head",
      role: "budget-table",
      title: "비목 · 인당 단가 · 재원 배분 요약표",
      badge: "인당요약",
      wireframe: "grid-2x4",
      description: "각 비목의 총액과 1인당 환산 단가, 팀비/자부담 재원 구분을 함께 보여주는 요약표",
      slotsSummary: ["총액", "1인당 단가", "재원구분"],
    },
  ],
};

export const TOTAL_BLOCK_ASSET_COUNT = Object.values(BLOCK_ASSET_CATALOG).reduce(
  (sum, list) => sum + list.length,
  0
);

export const FORM_ASSET_CATALOG: ReadonlyArray<FormAssetMeta> = [
  {
    id: "asset-survey-sheet",
    title: "부서 워크샵 수요조사표 (참가·활동·장비 수합)",
    shortLabel: "수요조사표",
    category: "survey",
    categoryLabel: "조사·수합",
    wireframe: "survey-grid",
    description:
      "문항 구분(rowSpan) + 선택지·기재 기준표 + 30인 개인별 수합 격자표가 포함된 한글 배포·회수 서식",
    slotsSummary: ["조사개요(4칸)", "문항·분기표(병합)", "개인별 수합명부(9열)"],
    badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  {
    id: "asset-approval-plan",
    title: "행사·워크샵 기안 품의서 (결재란 4단 + 본문)",
    shortLabel: "기안 품의서",
    category: "approval",
    categoryLabel: "품의·결재",
    wireframe: "approval-official",
    description:
      "결재란(담당·검토·팀장·부서장 rowSpan=2) · 기안메타표 · 공문서 계층(Ⅰ·가·❏) 본문 결재 양식",
    slotsSummary: ["결재란(rowSpan=2)", "기안메타(4행)", "공문계층(#page)"],
    badgeColor: "bg-blue-50 text-blue-800 border-blue-200",
  },
  {
    id: "asset-schedule-ops",
    title: "3트랙 세부 일정 · 안전 및 TF 역할분담표",
    shortLabel: "일정·역할표",
    category: "ops",
    categoryLabel: "일정·운영",
    wireframe: "merged-timetable",
    description:
      "공통 이동/만찬(colSpan=3 병합)과 스키·강습·스파 3트랙이 분기·합류하는 현장 운영 한글 격자표",
    slotsSummary: ["3트랙 병합일정표", "TF분과·당직표", "#page 요약"],
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    id: "asset-budget-compare",
    title: "소요예산 비교 및 재원 분담 품의표 (A안 vs B안)",
    shortLabel: "예산 비교품의",
    category: "budget",
    categoryLabel: "견적·비교",
    wireframe: "compare-dual-header",
    description:
      "2단 복합헤더(rowSpan=2·colSpan=2)로 1박2일/당일 비목별 단가를 대조하고 팀비·차등분담을 보고하는 품의 양식",
    slotsSummary: ["미니결재란", "2단복합 비교표", "재원·차등검토표"],
    badgeColor: "bg-amber-50 text-amber-800 border-amber-200",
  },
  {
    id: "asset-general-doc",
    title: "표준 개조식 보고서 / 공공 제안요청서 양식",
    shortLabel: "표준·RFP",
    category: "standard",
    categoryLabel: "표준·RFP",
    wireframe: "standard-doc",
    description:
      "Phase 1 `#page` 목록을 공문 개조식·표지·RFP 명세표로 직접 투영하는 기본 문서 에셋",
    slotsSummary: ["#page 직렬 투영", "공공 RFP 명세표"],
    badgeColor: "bg-slate-100 text-slate-700 border-slate-300",
  },
];

export type RegisterSlotFn = (
  nodeId: string,
  slotId: string,
  label: string,
  defaultHtml: string,
  target: SlotReverseTarget
) => string;

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const HWP_BORDER_RULES = {
  outer: "1px solid #334155",
  headerTop: "2px solid #0f172a",
  headerBottom: "1.5px solid #334155",
  rowBottom: "1px solid #64748b",
  vertical: "1px solid #64748b",
  radius: "0px",
};

const MODERN_FLAT_BORDER_RULES = {
  outer: "none",
  headerTop: "1.5px solid #94a3b8",
  headerBottom: "1px solid #cbd5e1",
  rowBottom: "1px solid #e2e8f0",
  vertical: "none",
  radius: "0px",
};

const LEDGER_BORDER_RULES = {
  outer: "2px solid #0f172a",
  headerTop: "2px solid #0f172a",
  headerBottom: "1.5px solid #334155",
  rowBottom: "1px solid #64748b",
  vertical: "1px solid #64748b",
  radius: "0px",
};

const HWP_HEADER_STYLE = {
  bg: "#e2e8f0",
  fontWeight: "700",
  padding: "5px 8px",
};

function renderOfficialOutlineHtml(nodes: readonly PlaygroundNode[], depth = 0): string {
  if (nodes.length === 0) return "";
  return nodes
    .map((n) => {
      const marker = depth === 0 ? "❏" : depth === 1 ? "◦" : "-";
      const indent = depth * 14;
      const childrenHtml =
        n.children.length > 0 ? renderOfficialOutlineHtml(n.children, depth + 1) : "";
      return `<p style="margin-left:${indent}px">${marker} ${escapeHtml(stripLinkTags(n.text))}</p>${childrenHtml}`;
    })
    .join("");
}

export function buildTitleVariantBlock(
  blockId: string,
  ownerId: string,
  headingText: string,
  variant: BlockVariantId,
  registerSlot: RegisterSlotFn
): LayoutBlock {
  if (variant === "title-section-bar") {
    return {
      blockId,
      kind: "heading",
      level: 3,
      align: "left",
      decoration: "bar",
      accent: "#1e3a8a",
      title: "섹션 좌측 강조 바 소제목",
      slotId: registerSlot(
        ownerId,
        `${ownerId}_tsb_title`,
        "섹션소제목",
        `<p style="font-size:15.5px;line-height:1.4;font-weight:700;color:#0f172a">${escapeHtml(headingText)}</p>`,
        { nodeId: ownerId, field: "text" }
      ),
      underline: { width: "100%", thickness: "1.5px", color: "#334155", marginTop: "4px" },
    };
  }

  if (variant === "title-with-approval") {
    return {
      blockId,
      kind: "structured-table",
      title: "제목 + 3단 결재란",
      columnWidths: ["58%", "6%", "12%", "12%", "12%"],
      borderRules: HWP_BORDER_RULES,
      cellPadding: "6px 6px",
      rows: [
        {
          rowId: `${blockId}_r1`,
          cells: [
            {
              cellId: `${blockId}_t`,
              slotId: registerSlot(
                ownerId,
                `${ownerId}_twa_title`,
                "문서제목",
                `<h2><strong>${escapeHtml(headingText)}</strong></h2>`,
                { nodeId: ownerId, field: "text" }
              ),
              rowSpan: 2,
              hAlign: "center",
              vAlign: "middle",
              fontSize: "17px",
            },
            {
              cellId: `${blockId}_ap`,
              slotId: registerSlot(ownerId, `${ownerId}_twa_ap`, "결재라벨", "<p>결<br/>재</p>", { nodeId: ownerId, field: "note" }),
              rowSpan: 2,
              hAlign: "center",
              vAlign: "middle",
              backgroundColor: "#e2e8f0",
              fontWeight: "700",
              fontSize: "10.5px",
            },
            ...["담 당", "검 토", "팀 장"].map((rank, i) => ({
              cellId: `${blockId}_ah${i}`,
              slotId: registerSlot(ownerId, `${ownerId}_twa_h${i}`, rank, `<p>${rank}</p>`, { nodeId: ownerId, field: "note" }),
              isHeader: true,
              hAlign: "center" as const,
              vAlign: "middle" as const,
              backgroundColor: "#e2e8f0",
              fontWeight: "700",
              fontSize: "10.5px",
            })),
          ],
        },
        {
          rowId: `${blockId}_r2`,
          cells: [0, 1, 2].map((i) => ({
            cellId: `${blockId}_av${i}`,
            slotId: registerSlot(ownerId, `${ownerId}_twa_v${i}`, `서명${i}`, "<p><br/></p>", { nodeId: ownerId, field: "note" }),
            hAlign: "center" as const,
            vAlign: "middle" as const,
            fontSize: "11px",
          })),
        },
      ],
    };
  }

  if (variant === "title-boxed-seal") {
    return {
      blockId,
      kind: "structured-table",
      title: "박스 공고형 제목",
      columnWidths: ["100%"],
      borderRules: {
        outer: "2px solid #0f172a",
        headerTop: "2px solid #0f172a",
        headerBottom: "2px solid #0f172a",
        rowBottom: "2px solid #0f172a",
        vertical: "2px solid #0f172a",
        radius: "0px",
      },
      cellPadding: "10px 12px",
      rows: [
        {
          rowId: `${blockId}_box_r`,
          cells: [
            {
              cellId: `${blockId}_box_c`,
              slotId: registerSlot(
                ownerId,
                `${ownerId}_tbs_title`,
                "박스제목",
                `<h2><strong>${escapeHtml(headingText)}</strong></h2>`,
                { nodeId: ownerId, field: "text" }
              ),
              hAlign: "center",
              vAlign: "middle",
              backgroundColor: "#f1f5f9",
              fontSize: "17px",
            },
          ],
        },
      ],
    };
  }

  if (variant === "title-web-hero") {
    return {
      blockId,
      kind: "heading",
      level: 3,
      align: "left",
      decoration: "bar",
      accent: "#4f46e5",
      title: "웹 설문 인디고 섹션 헤더",
      slotId: registerSlot(
        ownerId,
        `${ownerId}_twh_title`,
        "웹섹션제목",
        `<p style="font-size:17px;line-height:1.4;font-weight:700;color:#0f172a">${escapeHtml(headingText)}</p>`,
        { nodeId: ownerId, field: "text" }
      ),
      underline: { width: "100%", thickness: "2px", color: "#e0e7ff", marginTop: "6px" },
    };
  }

  return {
    blockId,
    kind: "form-title",
    title: "공문 밑줄 대제목",
    slotId: registerSlot(
      ownerId,
      `${ownerId}_tu_title`,
      "양식제목",
      `<h1>${escapeHtml(headingText)}</h1>`,
      { nodeId: ownerId, field: "text" }
    ),
    align: "center",
    letterSpacing: headingText.length > 15 ? "0.02em" : "0.22em",
    underline: { width: "100%", thickness: "2px", color: "#0f172a", marginTop: "6px" },
  };
}

function buildGuideVariantBlock(
  blockId: string,
  ownerId: string,
  inlineHtml: string,
  docTitle: string,
  variant: BlockVariantId,
  registerSlot: RegisterSlotFn
): LayoutBlock {
  if (variant === "guide-notice-box") {
    return {
      blockId,
      kind: "structured-table",
      title: "유의사항 외곽 박스",
      columnWidths: ["100%"],
      borderRules: HWP_BORDER_RULES,
      cellPadding: "8px 10px",
      rows: [
        {
          rowId: `${blockId}_gb_r`,
          cells: [
            {
              cellId: `${blockId}_gb_c`,
              slotId: registerSlot(
                ownerId,
                `${blockId}_gnb_txt`,
                "유의박스",
                `<p><strong>[안내 및 유의사항]</strong> &nbsp;건명: ${escapeHtml(docTitle)}<br/>${inlineHtml}</p>`,
                { nodeId: ownerId, field: "note" }
              ),
              vAlign: "middle",
              backgroundColor: "#f8fafc",
              fontSize: "11.5px",
            },
          ],
        },
      ],
    };
  }

  if (variant === "guide-doc-number") {
    const cellsData = [["문서번호", "전자제어-2026-1117", "시행일자", "2026. 11. 17."]];
    return {
      blockId,
      kind: "structured-table",
      title: "시행문 번호 메타바",
      columnWidths: ["15%", "35%", "15%", "35%"],
      borderRules: HWP_BORDER_RULES,
      cellPadding: "5px 8px",
      rows: cellsData.map((row, rIdx) => ({
        rowId: `${blockId}_dn_${rIdx}`,
        cells: [
          {
            cellId: `${blockId}_dnc0`,
            slotId: registerSlot(ownerId, `${blockId}_dn_0`, "문서번호라벨", `<p>${row[0]}</p>`, { nodeId: ownerId, field: "note" }),
            hAlign: "center" as const,
            vAlign: "middle" as const,
            backgroundColor: "#e2e8f0",
            fontWeight: "700",
            fontSize: "11px",
          },
          {
            cellId: `${blockId}_dnc1`,
            slotId: registerSlot(ownerId, `${blockId}_dn_1`, "문서번호", `<p>${row[1]}</p>`, { nodeId: ownerId, field: "note" }),
            vAlign: "middle" as const,
            fontSize: "11px",
          },
          {
            cellId: `${blockId}_dnc2`,
            slotId: registerSlot(ownerId, `${blockId}_dn_2`, "시행일라벨", `<p>${row[2]}</p>`, { nodeId: ownerId, field: "note" }),
            hAlign: "center" as const,
            vAlign: "middle" as const,
            backgroundColor: "#e2e8f0",
            fontWeight: "700",
            fontSize: "11px",
          },
          {
            cellId: `${blockId}_dnc3`,
            slotId: registerSlot(ownerId, `${blockId}_dn_3`, "시행일", `<p>${row[3]}</p>`, { nodeId: ownerId, field: "note" }),
            vAlign: "middle" as const,
            fontSize: "11px",
          },
        ],
      })),
    };
  }

  return {
    blockId,
    kind: "text",
    title: "안내 문구",
    slotId: registerSlot(ownerId, `${blockId}_gi_txt`, "안내문", inlineHtml, {
      nodeId: ownerId,
      field: "note",
    }),
  };
}

function buildMetaVariantBlock(
  blockId: string,
  ownerId: string,
  docTitle: string,
  variant: BlockVariantId,
  registerSlot: RegisterSlotFn
): LayoutBlock {
  if (variant === "meta-with-approval") {
    return {
      blockId,
      kind: "structured-table",
      title: "개요 + 결재 서명 결합표",
      columnWidths: ["14%", "44%", "7%", "11%", "12%", "12%"],
      borderRules: HWP_BORDER_RULES,
      cellPadding: "5px 7px",
      rows: [
        {
          rowId: `${blockId}_ma1`,
          cells: [
            {
              cellId: `${blockId}_mk1`,
              slotId: registerSlot(ownerId, `${ownerId}_ma_k1`, "기안부서", "<p>기안부서</p>", { nodeId: ownerId, field: "note" }),
              hAlign: "center",
              vAlign: "middle",
              backgroundColor: "#e2e8f0",
              fontWeight: "700",
              fontSize: "11px",
            },
            {
              cellId: `${blockId}_mv1`,
              slotId: registerSlot(ownerId, `${ownerId}_ma_v1`, "부서", "<p>전자설비제어팀 (준비 TF)</p>", { nodeId: ownerId, field: "note" }),
              vAlign: "middle",
              fontSize: "11px",
            },
            {
              cellId: `${blockId}_map`,
              slotId: registerSlot(ownerId, `${ownerId}_ma_ap`, "결재", "<p>결<br/>재</p>", { nodeId: ownerId, field: "note" }),
              rowSpan: 2,
              hAlign: "center",
              vAlign: "middle",
              backgroundColor: "#e2e8f0",
              fontWeight: "700",
              fontSize: "10.5px",
            },
            ...["담당", "검토", "팀장"].map((r, i) => ({
              cellId: `${blockId}_mah${i}`,
              slotId: registerSlot(ownerId, `${ownerId}_ma_h${i}`, r, `<p>${r}</p>`, { nodeId: ownerId, field: "note" }),
              isHeader: true,
              hAlign: "center" as const,
              vAlign: "middle" as const,
              backgroundColor: "#e2e8f0",
              fontWeight: "700",
              fontSize: "10.5px",
            })),
          ],
        },
        {
          rowId: `${blockId}_ma2`,
          cells: [
            {
              cellId: `${blockId}_mk2`,
              slotId: registerSlot(ownerId, `${ownerId}_ma_k2`, "건명", "<p>건 명</p>", { nodeId: ownerId, field: "note" }),
              hAlign: "center",
              vAlign: "middle",
              backgroundColor: "#e2e8f0",
              fontWeight: "700",
              fontSize: "11px",
            },
            {
              cellId: `${blockId}_mv2`,
              slotId: registerSlot(ownerId, `${ownerId}_ma_v2`, "건명값", `<p><strong>${escapeHtml(docTitle)}</strong></p>`, { nodeId: ownerId, field: "note" }),
              vAlign: "middle",
              fontSize: "11px",
            },
            ...[0, 1, 2].map((i) => ({
              cellId: `${blockId}_mav${i}`,
              slotId: registerSlot(ownerId, `${ownerId}_ma_s${i}`, "서명", "<p><br/></p>", { nodeId: ownerId, field: "note" }),
              hAlign: "center" as const,
              vAlign: "middle" as const,
              fontSize: "11px",
            })),
          ],
        },
        {
          rowId: `${blockId}_ma3`,
          cells: [
            {
              cellId: `${blockId}_mk3`,
              slotId: registerSlot(ownerId, `${ownerId}_ma_k3`, "대상기한", "<p>대상/기한</p>", { nodeId: ownerId, field: "note" }),
              hAlign: "center",
              vAlign: "middle",
              backgroundColor: "#e2e8f0",
              fontWeight: "700",
              fontSize: "11px",
            },
            {
              cellId: `${blockId}_mv3`,
              slotId: registerSlot(ownerId, `${ownerId}_ma_v3`, "대상값", "<p>팀원 전체 약 30명  |  회신 기한: 2026. 11. 20.(금) 17:00</p>", { nodeId: ownerId, field: "note" }),
              colSpan: 5,
              vAlign: "middle",
              fontSize: "11px",
            },
          ],
        },
      ],
    };
  }

  if (variant === "meta-2col-kv") {
    const kvRows = [
      ["작성 부서 / 담당", "전자설비제어팀 준비 TF (인원·제휴·레크 분과)"],
      ["건 명", docTitle],
      ["대상 및 장소", "팀원 약 30명  |  곤지암리조트 (오창 출발 1시간권)"],
      ["회신 기한", "2026. 11. 20.(금) 17:00까지"],
    ];
    return {
      blockId,
      kind: "structured-table",
      title: "2열 공문 요약표",
      columnWidths: ["22%", "78%"],
      borderRules: HWP_BORDER_RULES,
      cellPadding: "6px 8px",
      rows: kvRows.map(([k, v], rIdx) => ({
        rowId: `${blockId}_kv_${rIdx}`,
        cells: [
          {
            cellId: `${blockId}_kvk_${rIdx}`,
            slotId: registerSlot(ownerId, `${ownerId}_mk_${rIdx}`, k, `<p>${k}</p>`, { nodeId: ownerId, field: "note" }),
            hAlign: "center" as const,
            vAlign: "middle" as const,
            backgroundColor: "#e2e8f0",
            fontWeight: "700",
            fontSize: "11px",
          },
          {
            cellId: `${blockId}_kvv_${rIdx}`,
            slotId: registerSlot(ownerId, `${ownerId}_mv_${rIdx}`, k, `<p>${escapeHtml(v)}</p>`, { nodeId: ownerId, field: "note" }),
            vAlign: "middle" as const,
            fontSize: "11.5px",
          },
        ],
      })),
    };
  }

  const metaPairs = [
    ["작성 부서", "전자설비제어팀 (준비 TF)", "조사 대상", "팀원 전체 (약 30명)"],
    ["회신 기한", "2026. 11. 20.(금) 17:00까지", "수합 및 문의", "TF 인원조사 분과 (사내 메신저)"],
  ] as const;

  return {
    blockId,
    kind: "structured-table",
    title: "수합 개요표 (2×4)",
    columnWidths: ["17%", "33%", "17%", "33%"],
    borderRules: HWP_BORDER_RULES,
    cellPadding: "6px 8px",
    rows: metaPairs.map((pair, rIdx) => ({
      rowId: `sv_meta_${rIdx}`,
      cells: [
        {
          cellId: `sv_m_${rIdx}_0`,
          slotId: registerSlot(ownerId, `${ownerId}_svm_${rIdx}_0`, "라벨", `<p>${pair[0]}</p>`, { nodeId: ownerId, field: "note" }),
          hAlign: "center" as const,
          vAlign: "middle" as const,
          backgroundColor: "#e2e8f0",
          fontWeight: "700",
          fontSize: "11px",
        },
        {
          cellId: `sv_m_${rIdx}_1`,
          slotId: registerSlot(ownerId, `${ownerId}_svm_${rIdx}_1`, "값", `<p>${pair[1]}</p>`, { nodeId: ownerId, field: "note" }),
          vAlign: "middle" as const,
          fontSize: "11.5px",
        },
        {
          cellId: `sv_m_${rIdx}_2`,
          slotId: registerSlot(ownerId, `${ownerId}_svm_${rIdx}_2`, "라벨", `<p>${pair[2]}</p>`, { nodeId: ownerId, field: "note" }),
          hAlign: "center" as const,
          vAlign: "middle" as const,
          backgroundColor: "#e2e8f0",
          fontWeight: "700",
          fontSize: "11px",
        },
        {
          cellId: `sv_m_${rIdx}_3`,
          slotId: registerSlot(ownerId, `${ownerId}_svm_${rIdx}_3`, "값", `<p>${pair[3]}</p>`, { nodeId: ownerId, field: "note" }),
          vAlign: "middle" as const,
          fontSize: "11.5px",
        },
      ],
    })),
  };
}

function buildApprovalVariantBlock(
  blockId: string,
  ownerId: string,
  variant: BlockVariantId,
  registerSlot: RegisterSlotFn
): LayoutBlock {
  if (variant === "approval-2col-date") {
    return {
      blockId,
      kind: "structured-table",
      title: "기안일 포함 2단 결재란",
      columnWidths: ["14%", "40%", "8%", "19%", "19%"],
      borderRules: HWP_BORDER_RULES,
      cellPadding: "5px 6px",
      rows: [
        {
          rowId: `${blockId}_d1`,
          cells: [
            {
              cellId: `${blockId}_dl1`,
              slotId: registerSlot(ownerId, `${blockId}_dl1`, "문서번호", "<p>문서번호</p>", { nodeId: ownerId, field: "note" }),
              hAlign: "center",
              vAlign: "middle",
              backgroundColor: "#e2e8f0",
              fontWeight: "700",
              fontSize: "10.5px",
            },
            {
              cellId: `${blockId}_dv1`,
              slotId: registerSlot(ownerId, `${blockId}_dv1`, "번호값", "<p>전자제어-2026-1117</p>", { nodeId: ownerId, field: "note" }),
              vAlign: "middle",
              fontSize: "11px",
            },
            {
              cellId: `${blockId}_dap`,
              slotId: registerSlot(ownerId, `${blockId}_dap`, "결재", "<p>결<br/>재</p>", { nodeId: ownerId, field: "note" }),
              rowSpan: 2,
              hAlign: "center",
              vAlign: "middle",
              backgroundColor: "#e2e8f0",
              fontWeight: "700",
              fontSize: "10.5px",
            },
            {
              cellId: `${blockId}_dh0`,
              slotId: registerSlot(ownerId, `${blockId}_dh0`, "담당", "<p>담 당</p>", { nodeId: ownerId, field: "note" }),
              isHeader: true,
              hAlign: "center",
              vAlign: "middle",
              backgroundColor: "#e2e8f0",
              fontWeight: "700",
              fontSize: "10.5px",
            },
            {
              cellId: `${blockId}_dh1`,
              slotId: registerSlot(ownerId, `${blockId}_dh1`, "팀장", "<p>팀 장</p>", { nodeId: ownerId, field: "note" }),
              isHeader: true,
              hAlign: "center",
              vAlign: "middle",
              backgroundColor: "#e2e8f0",
              fontWeight: "700",
              fontSize: "10.5px",
            },
          ],
        },
        {
          rowId: `${blockId}_d2`,
          cells: [
            {
              cellId: `${blockId}_dl2`,
              slotId: registerSlot(ownerId, `${blockId}_dl2`, "기안일", "<p>기안일자</p>", { nodeId: ownerId, field: "note" }),
              hAlign: "center",
              vAlign: "middle",
              backgroundColor: "#e2e8f0",
              fontWeight: "700",
              fontSize: "10.5px",
            },
            {
              cellId: `${blockId}_dv2`,
              slotId: registerSlot(ownerId, `${blockId}_dv2`, "일자값", "<p>2026. 11. 17.</p>", { nodeId: ownerId, field: "note" }),
              vAlign: "middle",
              fontSize: "11px",
            },
            {
              cellId: `${blockId}_ds0`,
              slotId: registerSlot(ownerId, `${blockId}_ds0`, "서명0", "<p><br/></p>", { nodeId: ownerId, field: "note" }),
              hAlign: "center",
              vAlign: "middle",
              fontSize: "11px",
            },
            {
              cellId: `${blockId}_ds1`,
              slotId: registerSlot(ownerId, `${blockId}_ds1`, "서명1", "<p><br/></p>", { nodeId: ownerId, field: "note" }),
              hAlign: "center",
              vAlign: "middle",
              fontSize: "11px",
            },
          ],
        },
      ],
    };
  }

  const ranks =
    variant === "approval-3col"
      ? ["담 당", "팀 장", "부 서 장"]
      : ["담 당", "검 토", "팀 장", "부 서 장"];

  const labelSid = registerSlot(
    ownerId,
    `${blockId}_ap_lbl`,
    "결재라벨",
    "<p>결<br/><br/>재</p>",
    { nodeId: ownerId, field: "note" }
  );
  const rankHeaders: TableCellSlotDef[] = ranks.map((r, i) => ({
    cellId: `${blockId}_ap_ch${i}`,
    slotId: registerSlot(ownerId, `${blockId}_ap_h${i}`, `결재직급${i + 1}`, `<p>${escapeHtml(r)}</p>`, { nodeId: ownerId, field: "note" }),
    isHeader: true,
    hAlign: "center",
    vAlign: "middle",
    backgroundColor: "#e2e8f0",
    fontWeight: "700",
    fontSize: "11px",
  }));

  const stampCells: TableCellSlotDef[] = ranks.map((r, i) => ({
    cellId: `${blockId}_ap_cv${i}`,
    slotId: registerSlot(ownerId, `${blockId}_ap_v${i}`, `${r}서명`, "<p><br/></p>", { nodeId: ownerId, field: "note" }),
    hAlign: "center",
    vAlign: "middle",
    fontSize: "11px",
  }));

  const colWidth = `${Math.floor(92 / ranks.length)}%`;
  return {
    blockId,
    kind: "structured-table",
    title: `${ranks.length}단 결재란`,
    columnWidths: ["8%", ...ranks.map(() => colWidth)],
    borderRules: HWP_BORDER_RULES,
    cellPadding: "6px 6px",
    rows: [
      {
        rowId: `${blockId}_ap_r1`,
        cells: [
          {
            cellId: `${blockId}_ap_c0`,
            slotId: labelSid,
            rowSpan: 2,
            hAlign: "center",
            vAlign: "middle",
            backgroundColor: "#e2e8f0",
            fontWeight: "700",
            fontSize: "11px",
          },
          ...rankHeaders,
        ],
      },
      {
        rowId: `${blockId}_ap_r2`,
        cells: stampCells,
      },
    ],
  };
}

function buildMainQuestionVariantBlock(
  blockId: string,
  ownerId: string,
  linkedDoc: LinkedDocumentSpec | undefined,
  variant: BlockVariantId,
  registerSlot: RegisterSlotFn,
  overridePages?: readonly LinkedPageSpec[]
): LayoutBlock {
  const pages = overridePages ?? linkedDoc?.pages ?? [];

  if (variant === "main-official-bullets") {
    const headSid = registerSlot(
      ownerId,
      `${blockId}_mob_h`,
      "공문개조식제목",
      "<h3>1. 조사 문항 및 작성 기준</h3>",
      { nodeId: ownerId, field: "note" }
    );
    const bodyHtml = pages
      .map((p, idx) => {
        const itemsHtml =
          p.node.children.length > 0 ? renderOfficialOutlineHtml(p.node.children, 1) : "";
        return `<p><strong>❏ ${idx + 1}. ${escapeHtml(p.title)}</strong></p>${itemsHtml}`;
      })
      .join("");
    const bodySid = registerSlot(
      ownerId,
      `${blockId}_mob_b`,
      "공문개조식본문",
      bodyHtml || "<p>❏ 연결된 `&lt;&lt;page&gt;&gt;` 항목 없음</p>",
      { nodeId: ownerId, field: "note" }
    );
    return {
      blockId,
      kind: "section-block",
      title: "공문 개조식 문항 본문",
      headingSlotId: headSid,
      bodySlotId: bodySid,
    };
  }

  if (variant === "main-printable-checkbox") {
    const rows = pages.flatMap((page, pIdx) => {
      const items =
        page.node.children.length > 0
          ? page.node.children
          : [{ ...page.node, text: page.title }];
      return items.map((child, cIdx) => {
        const cleaned = stripLinkTags(child.text);
        const colonIdx = cleaned.indexOf(":");
        const qLabel = colonIdx > 0 ? cleaned.slice(0, colonIdx).trim() : `항목 ${cIdx + 1}`;
        const rawChoices = colonIdx > 0 ? cleaned.slice(colonIdx + 1).trim() : cleaned;
        const checkboxFormatted = rawChoices
          .split("/")
          .map((part) => `□ ${part.trim()}`)
          .join("   ");

        const cells: TableCellSlotDef[] = [];
        if (cIdx === 0) {
          cells.push({
            cellId: `${blockId}_cb_${page.id}_grp`,
            slotId: registerSlot(
              page.nodeId,
              `${blockId}_cbgrp_${page.id}`,
              `구분${pIdx + 1}`,
              `<p>${escapeHtml(page.title.replace(/^\d+페이지\s*·\s*/, ""))}</p>`,
              { nodeId: page.nodeId, field: "text" }
            ),
            rowSpan: items.length,
            hAlign: "center",
            vAlign: "middle",
            backgroundColor: "#f1f5f9",
            fontWeight: "700",
            fontSize: "11px",
          });
        }
        cells.push(
          {
            cellId: `${blockId}_cb_${child.id}_k`,
            slotId: registerSlot(child.id, `${blockId}_cbk_${child.id}`, "문항", `<p>${escapeHtml(qLabel)}</p>`, {
              nodeId: child.id,
              field: "text",
            }),
            vAlign: "middle",
            fontWeight: "600",
            fontSize: "11px",
          },
          {
            cellId: `${blockId}_cb_${child.id}_v`,
            slotId: registerSlot(
              child.id,
              `${blockId}_cbv_${child.id}`,
              "체크선택",
              `<p>${escapeHtml(checkboxFormatted)}</p>`,
              { nodeId: child.id, field: "text" }
            ),
            vAlign: "middle",
            fontSize: "11px",
          }
        );
        return { rowId: `${blockId}_cbr_${child.id}`, cells };
      });
    });

    return {
      blockId,
      kind: "structured-table",
      title: "인쇄·수기 체크(□) 회람용 조사표",
      columnWidths: ["21%", "23%", "56%"],
      borderRules: HWP_BORDER_RULES,
      headerStyle: HWP_HEADER_STYLE,
      cellPadding: "6px 8px",
      rows: [
        {
          rowId: `${blockId}_cbt_hdr`,
          cells: ["구 분", "확인 항목", "해당란 V 표기 (□ 선택 / 직접기입)"].map((h, i) => ({
            cellId: `${blockId}_cbh_${i}`,
            slotId: registerSlot(ownerId, `${blockId}_svcbh_${i}`, h, `<p>${h}</p>`, { nodeId: ownerId, field: "note" }),
            isHeader: true,
            hAlign: "center" as const,
            vAlign: "middle" as const,
            fontSize: "11px",
          })),
        },
        ...rows,
      ],
    };
  }

  const is4Col = variant === "main-summary-matrix";
  const rows =
    pages.length > 0
      ? pages.flatMap((page, pIdx) => {
        const items =
          page.node.children.length > 0
            ? page.node.children
            : [{ ...page.node, text: page.title }];
        return items.map((child, cIdx) => {
          const cleaned = stripLinkTags(child.text);
          const colonIdx = cleaned.indexOf(":");
          const qLabel = colonIdx > 0 ? cleaned.slice(0, colonIdx).trim() : `항목 ${cIdx + 1}`;
          const qDetail = colonIdx > 0 ? cleaned.slice(colonIdx + 1).trim() : cleaned;
          const cells: TableCellSlotDef[] = [];
          if (cIdx === 0) {
            cells.push({
              cellId: `${blockId}_q_${page.id}_grp`,
              slotId: registerSlot(
                page.nodeId,
                `${blockId}_grp_${page.id}`,
                `구분${pIdx + 1}`,
                `<p>${escapeHtml(page.title.replace(/^\d+페이지\s*·\s*/, ""))}</p>`,
                { nodeId: page.nodeId, field: "text" }
              ),
              rowSpan: items.length,
              hAlign: "center",
              vAlign: "middle",
              backgroundColor: "#f1f5f9",
              fontWeight: "700",
              fontSize: "11px",
            });
          }
          cells.push(
            {
              cellId: `${blockId}_q_${child.id}_k`,
              slotId: registerSlot(child.id, `${blockId}_qk_${child.id}`, "문항", `<p>${escapeHtml(qLabel)}</p>`, {
                nodeId: child.id,
                field: "text",
              }),
              vAlign: "middle",
              fontWeight: "600",
              fontSize: "11px",
            },
            {
              cellId: `${blockId}_q_${child.id}_v`,
              slotId: registerSlot(child.id, `${blockId}_qv_${child.id}`, "선택지", `<p>${escapeHtml(qDetail)}</p>`, {
                nodeId: child.id,
                field: "text",
              }),
              vAlign: "middle",
              fontSize: "11px",
            }
          );
          if (is4Col) {
            cells.push({
              cellId: `${blockId}_q_${child.id}_n`,
              slotId: registerSlot(child.id, `${blockId}_qn_${child.id}`, "비고", "<p>TF 검수</p>", {
                nodeId: child.id,
                field: "note",
              }),
              hAlign: "center",
              vAlign: "middle",
              fontSize: "10.5px",
            });
          }
          return { rowId: `${blockId}_qr_${child.id}`, cells };
        });
      })
      : [];

  return {
    blockId,
    kind: "structured-table",
    title: is4Col ? "4열 운영 · 비고 확장표" : "조사항목 기준표 (rowSpan 3열)",
    columnWidths: is4Col ? ["20%", "22%", "44%", "14%"] : ["22%", "24%", "54%"],
    borderRules: HWP_BORDER_RULES,
    headerStyle: HWP_HEADER_STYLE,
    cellPadding: "6px 8px",
    rows: [
      {
        rowId: `${blockId}_qt_hdr`,
        cells: (
          is4Col
            ? ["구 분 (&lt;&lt;page&gt;&gt;)", "조사 항목", "선택지 및 기재 요령", "확인/비고"]
            : ["구 분 (&lt;&lt;page&gt;&gt;)", "조사 항목", "선택지 및 기재 요령"]
        ).map((h, i) => ({
          cellId: `${blockId}_qth_${i}`,
          slotId: registerSlot(ownerId, `${blockId}_svqth_${i}`, h, `<p>${h}</p>`, { nodeId: ownerId, field: "note" }),
          isHeader: true,
          hAlign: "center" as const,
          vAlign: "middle" as const,
          fontSize: "11px",
        })),
      },
      ...rows,
    ],
  };
}

function buildRosterVariantBlock(
  blockId: string,
  ownerId: string,
  variant: BlockVariantId,
  registerSlot: RegisterSlotFn
): LayoutBlock {
  if (variant === "roster-compact-sign") {
    const cols = ["연번", "성명/파트", "참석(□참석/□대기)", "일정(□1박/□당일)", "활동(□스키/□보드/□스파)", "본인서명"];
    const rows = [
      ["1", "김OO / 제어1", "□ 참석   □ 대기", "□ 1박   □ 당일", "□ 스키  □ 보드  □ 스파", ""],
      ["2", "이OO / 제어2", "□ 참석   □ 대기", "□ 1박   □ 당일", "□ 스키  □ 보드  □ 스파", ""],
      ["3", "박OO / 제어1", "□ 참석   □ 대기", "□ 1박   □ 당일", "□ 스키  □ 보드  □ 스파", ""],
      ["4", "", "□ 참석   □ 대기", "□ 1박   □ 당일", "□ 스키  □ 보드  □ 스파", ""],
    ];
    return {
      blockId,
      kind: "structured-table",
      title: "6열 약식 회람 · 수기 서명 명부",
      columnWidths: ["7%", "16%", "20%", "19%", "28%", "10%"],
      borderRules: HWP_BORDER_RULES,
      headerStyle: HWP_HEADER_STYLE,
      cellPadding: "6px 6px",
      rows: [
        {
          rowId: `${blockId}_ch`,
          cells: cols.map((lbl, idx) => ({
            cellId: `${blockId}_ch_${idx}`,
            slotId: registerSlot(ownerId, `${blockId}_ch_${idx}`, lbl, `<p>${lbl}</p>`, { nodeId: ownerId, field: "note" }),
            isHeader: true,
            hAlign: "center" as const,
            vAlign: "middle" as const,
            fontSize: "10.5px",
          })),
        },
        ...rows.map((r, ri) => ({
          rowId: `${blockId}_cr_${ri}`,
          cells: r.map((v, ci) => ({
            cellId: `${blockId}_cc_${ri}_${ci}`,
            slotId: registerSlot(ownerId, `${blockId}_cc_${ri}_${ci}`, `행${ri}`, `<p>${escapeHtml(v)}</p>`, { nodeId: ownerId, field: "note" }),
            hAlign: ci === 0 ? ("center" as const) : ("left" as const),
            vAlign: "middle" as const,
            fontSize: "10.5px",
          })),
        })),
      ],
    };
  }

  if (variant === "roster-grouped-summary") {
    const cols = ["구분 · 트랙", "예상 인원", "필요 준비 및 발주 요약", "확인 담당"];
    const rows = [
      ["자유 스키·보드 조", "(   )명", "시간권(4h/6h) · 장비/의류 대여 사이즈 취합분", "TF 분과 2"],
      ["초보 강습 조", "(   )명", "초보 기초 강습 2h 배정 · 헬멧/보호대 일괄 신청", "TF 분과 2"],
      ["비탑승(스파·휴게) 조", "(   )명", "곤지암 스파·카페 이용권 및 저녁 만찬 합류", "TF 분과 3"],
      ["본사 설비 필수 대기", "(   )명", "오창 사업장 설비 모니터링 교대 당직 확정", "팀장 승인"],
    ];
    return {
      blockId,
      kind: "structured-table",
      title: "트랙 · 역할별 요약 집계표",
      columnWidths: ["22%", "14%", "48%", "16%"],
      borderRules: HWP_BORDER_RULES,
      headerStyle: HWP_HEADER_STYLE,
      cellPadding: "6px 7px",
      rows: [
        {
          rowId: `${blockId}_gh`,
          cells: cols.map((lbl, idx) => ({
            cellId: `${blockId}_gh_${idx}`,
            slotId: registerSlot(ownerId, `${blockId}_gh_${idx}`, lbl, `<p>${lbl}</p>`, { nodeId: ownerId, field: "note" }),
            isHeader: true,
            hAlign: "center" as const,
            vAlign: "middle" as const,
            fontSize: "10.5px",
          })),
        },
        ...rows.map((r, ri) => ({
          rowId: `${blockId}_gr_${ri}`,
          cells: r.map((v, ci) => ({
            cellId: `${blockId}_gc_${ri}_${ci}`,
            slotId: registerSlot(ownerId, `${blockId}_gc_${ri}_${ci}`, r[0], `<p>${escapeHtml(v)}</p>`, { nodeId: ownerId, field: "note" }),
            hAlign: ci === 1 || ci === 3 ? ("center" as const) : ("left" as const),
            vAlign: "middle" as const,
            backgroundColor: ci === 0 ? "#f8fafc" : undefined,
            fontWeight: ci === 0 ? "700" : undefined,
            fontSize: "10.5px",
          })),
        })),
      ],
    };
  }

  const rosterCols = [
    "연번",
    "성명/파트",
    "참석구분",
    "일정선호",
    "낮 활동",
    "강습여부",
    "대여품목/사이즈",
    "비음주레크",
    "비고",
  ];
  const sampleRows = [
    ["1", "김OO / 제어1", "참석", "B안(당일)", "스키", "초보강습", "장비·270 / L", "퀴즈·보드", ""],
    ["2", "이OO / 제어2", "설비대기", "-", "-", "-", "-", "-", "교대 당직"],
    ["3", "박OO / 제어1", "참석", "A안(1박)", "미탑승(스파)", "-", "-", "협동·보드", "리조트 스파"],
    ["4", "", "", "", "", "", "", "", ""],
    ["5", "", "", "", "", "", "", "", ""],
  ];

  return {
    blockId,
    kind: "structured-table",
    title: "9열 상세 수합 · 장비 발주 명부",
    columnWidths: ["6%", "12%", "10%", "10%", "12%", "10%", "16%", "12%", "12%"],
    borderRules: HWP_BORDER_RULES,
    headerStyle: HWP_HEADER_STYLE,
    cellPadding: "5px 5px",
    rows: [
      {
        rowId: "sv_ros_hdr",
        cells: rosterCols.map((lbl, idx) => ({
          cellId: `sv_rh_${idx}`,
          slotId: registerSlot(ownerId, `${ownerId}_svrh_${idx}`, lbl, `<p>${lbl}</p>`, { nodeId: ownerId, field: "note" }),
          isHeader: true,
          hAlign: "center" as const,
          vAlign: "middle" as const,
          fontSize: "10.5px",
        })),
      },
      ...sampleRows.map((vals, rIdx) => ({
        rowId: `sv_ros_r${rIdx}`,
        cells: vals.map((val, cIdx) => ({
          cellId: `sv_rc_${rIdx}_${cIdx}`,
          slotId: registerSlot(
            ownerId,
            `${ownerId}_svrc_${rIdx}_${cIdx}`,
            `${rIdx + 1}행 ${rosterCols[cIdx]}`,
            `<p>${escapeHtml(val)}</p>`,
            { nodeId: ownerId, field: "note" }
          ),
          hAlign: cIdx === 0 || cIdx >= 2 ? ("center" as const) : ("left" as const),
          vAlign: "middle" as const,
          fontSize: "10.5px",
        })),
      })),
      {
        rowId: "sv_ros_sum",
        cells: [
          {
            cellId: "sv_sum_lbl",
            slotId: registerSlot(ownerId, `${ownerId}_svsum_0`, "집계라벨", "<p>집 계 요 약</p>", { nodeId: ownerId, field: "note" }),
            colSpan: 2,
            hAlign: "center" as const,
            vAlign: "middle" as const,
            backgroundColor: "#e2e8f0",
            fontWeight: "700",
            fontSize: "10.5px",
          },
          {
            cellId: "sv_sum_val",
            slotId: registerSlot(
              ownerId,
              `${ownerId}_svsum_1`,
              "집계내용",
              "<p>참석 (  )명 / 설비대기 (  )명  |  A안(  ) · B안(  )  |  스키(  ) · 보드(  ) · 스파(  )  |  강습 (  )명</p>",
              { nodeId: ownerId, field: "note" }
            ),
            colSpan: 7,
            hAlign: "center" as const,
            vAlign: "middle" as const,
            backgroundColor: "#f8fafc",
            fontWeight: "600",
            fontSize: "10.5px",
          },
        ],
      },
    ],
  };
}

function buildScheduleVariantBlock(
  blockId: string,
  ownerId: string,
  variant: BlockVariantId,
  registerSlot: RegisterSlotFn
): LayoutBlock {
  if (variant === "sched-timeline-4col") {
    const rows = [
      ["이동", "08:30 ~ 09:40", "오창 사업장 집결 → 곤지암리조트 전세버스 이동", "TF 분과 1 (탑승 체크)"],
      ["준비·강습", "09:40 ~ 12:00", "장비·의류 수령 / 초보 강습 조 2h 기초 강습", "TF 분과 2 / 스파 조 체크인"],
      ["중식", "12:00 ~ 13:10", "단체 중식 및 오후 활동 안전 유의사항 공지", "30명 전원 집결"],
      ["오후 활동", "13:10 ~ 16:40", "자유 활주(포토미션) / 스파·휴게 대체 프로그램", "상해보험 적용"],
      ["만찬·레크", "17:30 ~ 20:30", "저음주 저녁 만찬 + 세미나실 비음주 레크 90분", "TF 분과 3 / 우승 조 시상"],
      ["복귀", "20:30 ~ 21:40", "곤지암 출발 → 오창 사업장 도착 및 해산 (1박 시 숙박)", "안전 귀가 확인"],
    ];
    return {
      blockId,
      kind: "structured-table",
      title: "시간대별 4열 순차 타임테이블",
      columnWidths: ["14%", "18%", "46%", "22%"],
      borderRules: HWP_BORDER_RULES,
      headerStyle: HWP_HEADER_STYLE,
      cellPadding: "6px 7px",
      rows: [
        {
          rowId: `${blockId}_th`,
          cells: ["구분", "시간", "세부 운영 내용", "담당 · 안전포인트"].map((h, i) => ({
            cellId: `${blockId}_th_${i}`,
            slotId: registerSlot(ownerId, `${blockId}_th_${i}`, h, `<p>${h}</p>`, { nodeId: ownerId, field: "note" }),
            isHeader: true,
            hAlign: "center" as const,
            vAlign: "middle" as const,
            fontSize: "10.5px",
          })),
        },
        ...rows.map((r, ri) => ({
          rowId: `${blockId}_tr_${ri}`,
          cells: r.map((v, ci) => ({
            cellId: `${blockId}_tc_${ri}_${ci}`,
            slotId: registerSlot(ownerId, `${blockId}_tc_${ri}_${ci}`, r[0], `<p>${escapeHtml(v)}</p>`, { nodeId: ownerId, field: "note" }),
            hAlign: ci <= 1 ? ("center" as const) : ("left" as const),
            vAlign: "middle" as const,
            backgroundColor: ci === 0 ? "#f8fafc" : undefined,
            fontWeight: ci === 0 ? "700" : undefined,
            fontSize: "10.5px",
          })),
        })),
      ],
    };
  }

  if (variant === "sched-plan-ab") {
    const rows = [
      ["출발 · 이동", "1일차 12:30 오창 출발 → 13:40 도착", "당일 08:30 오창 출발 → 09:40 도착", "45인승 버스 동일"],
      ["낮 스키 · 대체", "1일차 14:15~17:45 (3트랙 운영)", "10:00~16:30 (중식 포함 3트랙 풀타임)", "초보 강습 2h 포함"],
      ["만찬 · 비음주레크", "18:10 만찬 + 19:40~21:10 세미나실 레크", "17:10 이른 만찬 + 18:15~19:45 레크", "전원 합류 90분"],
      ["숙박 / 복귀", "제휴 콘도 6실 숙박 → 2일차 오전 정리 복귀", "20:00 출발 → 21:15 오창 도착 해산", "숙박비·티오 차이"],
    ];
    return {
      blockId,
      kind: "structured-table",
      title: "A안(1박2일) vs B안(당일) 대조 일정표",
      columnWidths: ["16%", "34%", "34%", "16%"],
      borderRules: HWP_BORDER_RULES,
      headerStyle: HWP_HEADER_STYLE,
      cellPadding: "6px 7px",
      rows: [
        {
          rowId: `${blockId}_abh`,
          cells: ["일정 구분", "A안 · 평일 1박 2일(목~금)", "B안 · 당일 집중형", "비교 포인트"].map((h, i) => ({
            cellId: `${blockId}_abh_${i}`,
            slotId: registerSlot(ownerId, `${blockId}_abh_${i}`, h, `<p>${h}</p>`, { nodeId: ownerId, field: "note" }),
            isHeader: true,
            hAlign: "center" as const,
            vAlign: "middle" as const,
            fontSize: "10.5px",
          })),
        },
        ...rows.map((r, ri) => ({
          rowId: `${blockId}_abr_${ri}`,
          cells: r.map((v, ci) => ({
            cellId: `${blockId}_abc_${ri}_${ci}`,
            slotId: registerSlot(ownerId, `${blockId}_abc_${ri}_${ci}`, r[0], `<p>${escapeHtml(v)}</p>`, { nodeId: ownerId, field: "note" }),
            hAlign: ci === 0 || ci === 3 ? ("center" as const) : ("left" as const),
            vAlign: "middle" as const,
            backgroundColor: ci === 0 ? "#f8fafc" : undefined,
            fontWeight: ci === 0 ? "700" : undefined,
            fontSize: "10.5px",
          })),
        })),
      ],
    };
  }

  const schHdr = ["구분", "시간대", "자유 스키·보드 조", "초보 강습 조", "비탑승(스파·휴게) 조", "안전·운영 비고"];
  const commonRows = [
    {
      id: "move",
      cat: "이동",
      time: "08:30 ~ 09:40\n(1박시 12:30~)",
      merged: "청주 오창 사업장 집결 → 곤지암리조트 전세버스(45인승) 일괄 이동",
      note: "음주운전 방지 · 당직자 제외",
    },
    {
      id: "lunch",
      cat: "중식",
      time: "12:00 ~ 13:10",
      merged: "전원 합동 중식 및 오후 트랙별 집결 확인",
      note: "식사 알레르기 사전 체크",
    },
  ];

  const mergedRows = commonRows.map((r) => ({
    rowId: `op_r_${r.id}`,
    cells: [
      {
        cellId: `op_${r.id}_0`,
        slotId: registerSlot(ownerId, `${ownerId}_op_${r.id}_0`, "구분", `<p>${r.cat}</p>`, { nodeId: ownerId, field: "note" }),
        hAlign: "center" as const,
        vAlign: "middle" as const,
        backgroundColor: "#f1f5f9",
        fontWeight: "700",
        fontSize: "11px",
      },
      {
        cellId: `op_${r.id}_1`,
        slotId: registerSlot(ownerId, `${ownerId}_op_${r.id}_1`, "시간", `<p>${escapeHtml(r.time).replace("\n", "<br/>")}</p>`, { nodeId: ownerId, field: "note" }),
        hAlign: "center" as const,
        vAlign: "middle" as const,
        fontSize: "10.5px",
      },
      {
        cellId: `op_${r.id}_2`,
        slotId: registerSlot(ownerId, `${ownerId}_op_${r.id}_2`, "공통내용", `<p>${escapeHtml(r.merged)}</p>`, { nodeId: ownerId, field: "note" }),
        colSpan: 3,
        hAlign: "center" as const,
        vAlign: "middle" as const,
        backgroundColor: "#f8fafc",
        fontSize: "11px",
      },
      {
        cellId: `op_${r.id}_5`,
        slotId: registerSlot(ownerId, `${ownerId}_op_${r.id}_5`, "비고", `<p>${escapeHtml(r.note)}</p>`, { nodeId: ownerId, field: "note" }),
        vAlign: "middle" as const,
        fontSize: "10.5px",
      },
    ],
  }));

  const splitRow = {
    rowId: "op_r_tracks",
    cells: [
      {
        cellId: "op_tr_0",
        slotId: registerSlot(ownerId, `${ownerId}_op_tr_0`, "구분", "<p>낮 활동<br/>(3트랙)</p>", { nodeId: ownerId, field: "note" }),
        hAlign: "center" as const,
        vAlign: "middle" as const,
        backgroundColor: "#e2e8f0",
        fontWeight: "700",
        fontSize: "11px",
      },
      {
        cellId: "op_tr_1",
        slotId: registerSlot(ownerId, `${ownerId}_op_tr_1`, "시간", "<p>13:10 ~ 16:40<br/>(약 3.5시간)</p>", { nodeId: ownerId, field: "note" }),
        hAlign: "center" as const,
        vAlign: "middle" as const,
        fontSize: "10.5px",
      },
      {
        cellId: "op_tr_2",
        slotId: registerSlot(ownerId, `${ownerId}_op_tr_2`, "자유조", "<p>• 시간권(4h) 자유 활주<br/>• 조별 포토 미션 1건 수행</p>", { nodeId: ownerId, field: "note" }),
        vAlign: "middle" as const,
        fontSize: "10.5px",
      },
      {
        cellId: "op_tr_3",
        slotId: registerSlot(ownerId, `${ownerId}_op_tr_3`, "초보강습조", "<p>• 기초 강습 2시간 집중<br/>• 헬멧·보호대 필수 착용</p>", { nodeId: ownerId, field: "note" }),
        vAlign: "middle" as const,
        fontSize: "10.5px",
      },
      {
        cellId: "op_tr_4",
        slotId: registerSlot(ownerId, `${ownerId}_op_tr_4`, "비탑승조", "<p>• 리조트 스파·사우나 이용<br/>• 카페 휴게 및 단지 산책</p>", { nodeId: ownerId, field: "note" }),
        vAlign: "middle" as const,
        fontSize: "10.5px",
      },
      {
        cellId: "op_tr_5",
        slotId: registerSlot(ownerId, `${ownerId}_op_tr_5`, "비고", "<p>단체 상해보험<br/>응급연락망 공지</p>", { nodeId: ownerId, field: "note" }),
        vAlign: "middle" as const,
        fontSize: "10.5px",
      },
    ],
  };

  const eveningRow = {
    rowId: "op_r_eve",
    cells: [
      {
        cellId: "op_eve_0",
        slotId: registerSlot(ownerId, `${ownerId}_op_eve_0`, "구분", "<p>만찬·단합</p>", { nodeId: ownerId, field: "note" }),
        hAlign: "center" as const,
        vAlign: "middle" as const,
        backgroundColor: "#f1f5f9",
        fontWeight: "700",
        fontSize: "11px",
      },
      {
        cellId: "op_eve_1",
        slotId: registerSlot(ownerId, `${ownerId}_op_eve_1`, "시간", "<p>17:30 ~ 20:30</p>", { nodeId: ownerId, field: "note" }),
        hAlign: "center" as const,
        vAlign: "middle" as const,
        fontSize: "10.5px",
      },
      {
        cellId: "op_eve_2",
        slotId: registerSlot(
          ownerId,
          `${ownerId}_op_eve_2`,
          "저녁합류",
          "<p><strong>30명 전원 합류:</strong> 저음주 저녁 만찬(60분) → 세미나실 비음주 단체 레크리에이션(90분: 스피드퀴즈·테이블 협동게임·포토시상)</p>",
          { nodeId: ownerId, field: "note" }
        ),
        colSpan: 3,
        vAlign: "middle" as const,
        backgroundColor: "#f8fafc",
        fontSize: "11px",
      },
      {
        cellId: "op_eve_5",
        slotId: registerSlot(ownerId, `${ownerId}_op_eve_5`, "비고", "<p>억지 장기자랑 배제<br/>B안 시 21:30 복귀</p>", { nodeId: ownerId, field: "note" }),
        vAlign: "middle" as const,
        fontSize: "10.5px",
      },
    ],
  };

  return {
    blockId,
    kind: "structured-table",
    title: "3트랙 병합 일정표",
    columnWidths: ["10%", "14%", "21%", "21%", "20%", "14%"],
    borderRules: HWP_BORDER_RULES,
    headerStyle: HWP_HEADER_STYLE,
    cellPadding: "6px 6px",
    rows: [
      {
        rowId: "op_hdr",
        cells: schHdr.map((h, i) => ({
          cellId: `op_h_${i}`,
          slotId: registerSlot(ownerId, `${ownerId}_oph_${i}`, h, `<p>${h}</p>`, { nodeId: ownerId, field: "note" }),
          isHeader: true,
          hAlign: "center" as const,
          vAlign: "middle" as const,
          fontSize: "10.5px",
        })),
      },
      mergedRows[0],
      mergedRows[1],
      splitRow,
      eveningRow,
    ],
  };
}

function buildBudgetVariantBlock(
  blockId: string,
  ownerId: string,
  variant: BlockVariantId,
  registerSlot: RegisterSlotFn
): LayoutBlock {
  if (variant === "budget-single-detail") {
    const rows = [
      ["교통비", "700,000", "1대", "700,000", "45인승 전세버스 오창↔곤지암 왕복"],
      ["스키·렌탈", "80,000", "20명", "1,600,000", "외부 렌탈샵 단체 패키지(리프트+장비+의류)"],
      ["초보 강습", "400,000", "1식", "400,000", "초보 그룹 안전 기초 강습 2시간"],
      ["비탑승 대안", "35,000", "7명", "245,000", "곤지암 스파/휴게 지원"],
      ["식음·만찬", "35,000", "27명", "945,000", "중식 + 저음주 저녁 만찬 (당일형 기준)"],
      ["레크·대관", "650,000", "1식", "650,000", "단체홀/세미나 패키지 + 비음주 레크 경품"],
      ["합 계", "-", "27명", "4,540,000", "B안(당일 집중형) 실소요 예상"],
    ];
    return {
      blockId,
      kind: "structured-table",
      title: "단일 실행안 상세 산출내역서",
      columnWidths: ["16%", "14%", "11%", "16%", "43%"],
      borderRules: HWP_BORDER_RULES,
      headerStyle: HWP_HEADER_STYLE,
      cellPadding: "6px 7px",
      rows: [
        {
          rowId: `${blockId}_sdh`,
          cells: ["비 목", "단 가(원)", "수 량", "금 액(원)", "산 출 근 거"].map((h, i) => ({
            cellId: `${blockId}_sdh_${i}`,
            slotId: registerSlot(ownerId, `${blockId}_sdh_${i}`, h, `<p>${h}</p>`, { nodeId: ownerId, field: "note" }),
            isHeader: true,
            hAlign: "center" as const,
            vAlign: "middle" as const,
            fontSize: "10.5px",
          })),
        },
        ...rows.map((r, ri) => {
          const isTotal = ri === rows.length - 1;
          return {
            rowId: `${blockId}_sdr_${ri}`,
            cells: r.map((v, ci) => ({
              cellId: `${blockId}_sdc_${ri}_${ci}`,
              slotId: registerSlot(ownerId, `${blockId}_sdc_${ri}_${ci}`, r[0], `<p>${isTotal ? `<strong>${escapeHtml(v)}</strong>` : escapeHtml(v)}</p>`, { nodeId: ownerId, field: "note" }),
              hAlign: ci === 0 || ci === 2 ? ("center" as const) : ci === 1 || ci === 3 ? ("right" as const) : ("left" as const),
              vAlign: "middle" as const,
              backgroundColor: isTotal ? "#f1f5f9" : ci === 0 ? "#f8fafc" : undefined,
              fontWeight: isTotal || ci === 0 ? "700" : undefined,
              fontSize: "10.5px",
            })),
          };
        }),
      ],
    };
  }

  if (variant === "budget-per-head") {
    const rows = [
      ["교통·이동", "700,000", "25,900", "팀비 충당"],
      ["활동·강습·스파", "2,245,000", "83,100", "팀비 + 지원금"],
      ["식음·레크·대관", "1,595,000", "59,100", "팀비 충당"],
      ["숙박(A안 선택 시)", "1,920,000", "71,100", "초과 시 차등분담 검토"],
      ["합계 (당일 / 1박)", "4,540,000 / 7,135,000", "168,100 / 264,300", "가용 재원 대조 필요"],
    ];
    return {
      blockId,
      kind: "structured-table",
      title: "비목 · 인당 단가 · 재원 배분 요약표",
      columnWidths: ["26%", "28%", "22%", "24%"],
      borderRules: HWP_BORDER_RULES,
      headerStyle: HWP_HEADER_STYLE,
      cellPadding: "6px 7px",
      rows: [
        {
          rowId: `${blockId}_phh`,
          cells: ["비목 구분", "총 소요액(원)", "1인당 단가(27명)", "재원 구분"].map((h, i) => ({
            cellId: `${blockId}_phh_${i}`,
            slotId: registerSlot(ownerId, `${blockId}_phh_${i}`, h, `<p>${h}</p>`, { nodeId: ownerId, field: "note" }),
            isHeader: true,
            hAlign: "center" as const,
            vAlign: "middle" as const,
            fontSize: "10.5px",
          })),
        },
        ...rows.map((r, ri) => {
          const isTotal = ri === rows.length - 1;
          return {
            rowId: `${blockId}_phr_${ri}`,
            cells: r.map((v, ci) => ({
              cellId: `${blockId}_phc_${ri}_${ci}`,
              slotId: registerSlot(ownerId, `${blockId}_phc_${ri}_${ci}`, r[0], `<p>${isTotal ? `<strong>${escapeHtml(v)}</strong>` : escapeHtml(v)}</p>`, { nodeId: ownerId, field: "note" }),
              hAlign: ci === 0 || ci === 3 ? ("center" as const) : ("right" as const),
              vAlign: "middle" as const,
              backgroundColor: isTotal ? "#f1f5f9" : ci === 0 ? "#f8fafc" : undefined,
              fontWeight: isTotal || ci === 0 ? "700" : undefined,
              fontSize: "10.5px",
            })),
          };
        }),
      ],
    };
  }

  const budgetItems = [
    ["교통비", "45인승 전세버스 1대 왕복", "오창↔곤지암 1박 대기", "700,000", "오창↔곤지암 당일 왕복", "700,000"],
    ["스키·렌탈", "리프트+장비+의류 단체", "탑승 N명 × 외부패키지", "1,600,000", "탑승 N명 × 외부패키지", "1,600,000"],
    ["초보 강습", "입문자 안전 기초 강습", "강사 1~2인 그룹 배정", "400,000", "강사 1~2인 그룹 배정", "400,000"],
    ["비탑승 대안", "스파·휴게 체류 지원", "미탑승 인원 스파 이용", "245,000", "미탑승 인원 스파 이용", "245,000"],
    ["식음·만찬", "저음주 식사 및 간식", "중식+만찬+2일 조·중식", "1,620,000", "중식 + 저녁 만찬(저음주)", "945,000"],
    ["레크·대관", "세미나실 및 경품비", "90분 진행·실속 경품", "650,000", "단체홀/세미나 패키지", "650,000"],
    ["숙박비", "제휴 콘도 5~6인실", "6실 × 1박(티오 선점)", "1,920,000", "해당 없음 (당일 복귀)", "0"],
    ["합 계", "총 예상 소요 예산 (가견적)", "A안 (1박 2일 기준)", "7,135,000", "B안 (당일 집중 기준)", "4,540,000"],
  ];

  return {
    blockId,
    kind: "structured-table",
    title: "2단 복합헤더 예산 비교표",
    columnWidths: ["14%", "24%", "20%", "11%", "20%", "11%"],
    borderRules: HWP_BORDER_RULES,
    headerStyle: HWP_HEADER_STYLE,
    cellPadding: "5.5px 6px",
    rows: [
      {
        rowId: "bg_hdr_1",
        cells: [
          {
            cellId: "bgh1_0",
            slotId: registerSlot(ownerId, `${ownerId}_bgh1_0`, "비목", "<p>비 목</p>", { nodeId: ownerId, field: "note" }),
            rowSpan: 2,
            isHeader: true,
            hAlign: "center" as const,
            vAlign: "middle" as const,
            fontSize: "10.5px",
          },
          {
            cellId: "bgh1_1",
            slotId: registerSlot(ownerId, `${ownerId}_bgh1_1`, "산출기준", "<p>산 출 기 준</p>", { nodeId: ownerId, field: "note" }),
            rowSpan: 2,
            isHeader: true,
            hAlign: "center" as const,
            vAlign: "middle" as const,
            fontSize: "10.5px",
          },
          {
            cellId: "bgh1_2",
            slotId: registerSlot(ownerId, `${ownerId}_bgh1_2`, "A안헤더", "<p>A안 · 평일 1박 2일</p>", { nodeId: ownerId, field: "note" }),
            colSpan: 2,
            isHeader: true,
            hAlign: "center" as const,
            vAlign: "middle" as const,
            fontSize: "10.5px",
          },
          {
            cellId: "bgh1_3",
            slotId: registerSlot(ownerId, `${ownerId}_bgh1_3`, "B안헤더", "<p>B안 · 당일 집중형</p>", { nodeId: ownerId, field: "note" }),
            colSpan: 2,
            isHeader: true,
            hAlign: "center" as const,
            vAlign: "middle" as const,
            fontSize: "10.5px",
          },
        ],
      },
      {
        rowId: "bg_hdr_2",
        cells: ["세부 내역", "금액(원)", "세부 내역", "금액(원)"].map((lbl, i) => ({
          cellId: `bgh2_${i}`,
          slotId: registerSlot(ownerId, `${ownerId}_bgh2_${i}`, lbl, `<p>${lbl}</p>`, { nodeId: ownerId, field: "note" }),
          isHeader: true,
          hAlign: "center" as const,
          vAlign: "middle" as const,
          fontSize: "10px",
        })),
      },
      ...budgetItems.map((row, rIdx) => {
        const isTotal = rIdx === budgetItems.length - 1;
        return {
          rowId: `bg_r_${rIdx}`,
          cells: row.map((val, cIdx) => ({
            cellId: `bg_c_${rIdx}_${cIdx}`,
            slotId: registerSlot(
              ownerId,
              `${ownerId}_bgc_${rIdx}_${cIdx}`,
              `${row[0]}_${cIdx}`,
              `<p>${isTotal ? `<strong>${escapeHtml(val)}</strong>` : escapeHtml(val)}</p>`,
              { nodeId: ownerId, field: "note" }
            ),
            hAlign:
              cIdx === 0
                ? ("center" as const)
                : cIdx === 3 || cIdx === 5
                  ? ("right" as const)
                  : ("left" as const),
            vAlign: "middle" as const,
            backgroundColor: isTotal ? "#f1f5f9" : cIdx === 0 ? "#f8fafc" : undefined,
            fontWeight: isTotal || cIdx === 0 ? "700" : undefined,
            fontSize: "10.5px",
          })),
        };
      }),
    ],
  };
}

export interface CompiledAssetResult {
  blocks: LayoutBlock[];
  blockMetaMap: Record<string, PlaygroundBlockMeta>;
}

export interface CompileAssetPageParams {
  assetId: FormAssetId;
  pageId: string;
  pageIndex: number;
  totalPages: number;
  docTitle: string;
  linkedDoc: LinkedDocumentSpec | undefined;
  pageSpec: LinkedPageSpec | undefined;
  linkedNodes: readonly PlaygroundNode[];
  registerSlot: RegisterSlotFn;
  blockVariants: Record<string, BlockVariantId>;
}

function buildSurveySheetAsset(
  pageId: string,
  pageIndex: number,
  totalPages: number,
  docTitle: string,
  linkedDoc: LinkedDocumentSpec | undefined,
  pageSpec: LinkedPageSpec | undefined,
  registerSlot: RegisterSlotFn,
  blockVariants: Record<string, BlockVariantId>
): CompiledAssetResult {
  const ownerId = pageSpec?.nodeId ?? linkedDoc?.nodeId ?? `survey_doc_p${pageIndex}`;
  const blocks: LayoutBlock[] = [];
  const blockMetaMap: Record<string, PlaygroundBlockMeta> = {};
  const scopedPages = pageSpec ? [pageSpec] : linkedDoc?.pages;
  const pageTitle = pageSpec?.title ?? docTitle;
  const hint = pageSpec?.assetHint ?? "";

  if (pageIndex === 0) {
    const titleBid = `pg_blk_${ownerId}_title`;
    blocks.push(
      buildTitleVariantBlock(
        titleBid,
        ownerId,
        "부 서 워 크 샵 수 요 조 사 표",
        blockVariants[titleBid] ?? "title-underline",
        registerSlot
      )
    );
    blockMetaMap[titleBid] = {
      blockId: titleBid,
      pageId,
      role: "title",
      label: "1. 양식 제목 (수요조사표)",
      defaultVariant: "title-underline",
    };

    const guideBid = `pg_blk_${ownerId}_sub`;
    blocks.push(
      buildGuideVariantBlock(
        guideBid,
        ownerId,
        `<p><strong>건명:</strong> ${escapeHtml(docTitle)} &nbsp;|&nbsp; <strong>제${pageIndex + 1}쪽:</strong> ${escapeHtml(pageTitle)} — ※ 본 조사지는 단체 예약·장비 발주 및 일정 조율용으로만 활용됩니다.</p>`,
        docTitle,
        blockVariants[guideBid] ?? "guide-inline",
        registerSlot
      )
    );
    blockMetaMap[guideBid] = {
      blockId: guideBid,
      pageId,
      role: "guide",
      label: "2. 건명 · 조사 안내",
      defaultVariant: "guide-inline",
    };

    const metaBid = `pg_blk_${ownerId}_sv_meta`;
    blocks.push(
      buildMetaVariantBlock(
        metaBid,
        ownerId,
        docTitle,
        blockVariants[metaBid] ?? "meta-2x4",
        registerSlot
      )
    );
    blockMetaMap[metaBid] = {
      blockId: metaBid,
      pageId,
      role: "meta-table",
      label: "3. 수합 개요표 (부서·대상·기한)",
      defaultVariant: "meta-2x4",
    };
  } else {
    const pageGuideBid = `pg_blk_${ownerId}_pg_sub`;
    const guideText = hint.includes("체크")
      ? `<p><strong>[${pageIndex + 1}/${totalPages}쪽 · 체크서식]</strong> ${escapeHtml(pageTitle)} &nbsp;|&nbsp; 해당 항목 □ 표기 및 직접 기입 (현장 회람 겸용)</p>`
      : `<p><strong>[${pageIndex + 1}/${totalPages}쪽]</strong> ${escapeHtml(pageTitle)} &nbsp;|&nbsp; ${escapeHtml(docTitle)}</p>`;
    blocks.push(
      buildGuideVariantBlock(
        pageGuideBid,
        ownerId,
        guideText,
        pageTitle,
        blockVariants[pageGuideBid] ?? "guide-notice-box",
        registerSlot
      )
    );
    blockMetaMap[pageGuideBid] = {
      blockId: pageGuideBid,
      pageId,
      role: "guide",
      label: `${pageIndex + 1}쪽 헤더 · 안내`,
      defaultVariant: "guide-notice-box",
    };
  }

  const defaultMainVariant: BlockVariantId =
    hint.includes("체크") || pageIndex === 1
      ? "main-printable-checkbox"
      : "main-grouped-grid";
  const qTableBid = `pg_blk_${ownerId}_sv_qtable`;
  blocks.push(
    buildMainQuestionVariantBlock(
      qTableBid,
      ownerId,
      linkedDoc,
      blockVariants[qTableBid] ?? defaultMainVariant,
      registerSlot,
      scopedPages
    )
  );
  blockMetaMap[qTableBid] = {
    blockId: qTableBid,
    pageId,
    role: "main-table",
    label: hint.includes("체크") ? "수기 체크(□) 분기 조사표" : `${pageIndex + 1}쪽 조사 문항표`,
    defaultVariant: defaultMainVariant,
  };

  if (hint.includes("명부") || pageIndex >= totalPages - 1) {
    const rosterBid = `pg_blk_${ownerId}_sv_roster`;
    blocks.push(
      buildRosterVariantBlock(
        rosterBid,
        ownerId,
        blockVariants[rosterBid] ?? "roster-9col",
        registerSlot
      )
    );
    blockMetaMap[rosterBid] = {
      blockId: rosterBid,
      pageId,
      role: "roster-table",
      label: "개인별 수요 취합 · 발주 명부",
      defaultVariant: "roster-9col",
    };
  }

  return { blocks, blockMetaMap };
}

function buildApprovalPlanAsset(
  pageId: string,
  pageIndex: number,
  totalPages: number,
  docTitle: string,
  linkedDoc: LinkedDocumentSpec | undefined,
  pageSpec: LinkedPageSpec | undefined,
  linkedNodes: readonly PlaygroundNode[],
  registerSlot: RegisterSlotFn,
  blockVariants: Record<string, BlockVariantId>
): CompiledAssetResult {
  const ownerId = pageSpec?.nodeId ?? linkedDoc?.nodeId ?? `approval_doc_p${pageIndex}`;
  const blocks: LayoutBlock[] = [];
  const blockMetaMap: Record<string, PlaygroundBlockMeta> = {};
  const targetNodes = pageSpec ? [pageSpec.node] : linkedNodes;

  if (pageIndex === 0) {
    const titleBid = `pg_blk_${ownerId}_ap_title`;
    blocks.push(
      buildTitleVariantBlock(
        titleBid,
        ownerId,
        "행 사 활 동 계 획 품 의 서",
        blockVariants[titleBid] ?? "title-underline",
        registerSlot
      )
    );
    blockMetaMap[titleBid] = {
      blockId: titleBid,
      pageId,
      role: "title",
      label: "1. 품의서 제목",
      defaultVariant: "title-underline",
    };

    const apBid = `pg_blk_${ownerId}_approval`;
    blocks.push(
      buildApprovalVariantBlock(
        apBid,
        ownerId,
        blockVariants[apBid] ?? "approval-4col",
        registerSlot
      )
    );
    blockMetaMap[apBid] = {
      blockId: apBid,
      pageId,
      role: "approval-box",
      label: "2. 결재란 (4단/3단/간이)",
      defaultVariant: "approval-4col",
    };

    const metaBid = `pg_blk_${ownerId}_ap_meta`;
    blocks.push(
      buildMetaVariantBlock(
        metaBid,
        ownerId,
        docTitle,
        blockVariants[metaBid] ?? "meta-2x4",
        registerSlot
      )
    );
    blockMetaMap[metaBid] = {
      blockId: metaBid,
      pageId,
      role: "meta-table",
      label: "3. 기안 개요표",
      defaultVariant: "meta-2x4",
    };
  } else {
    const subBid = `pg_blk_${ownerId}_ap_pgsub`;
    blocks.push(
      buildGuideVariantBlock(
        subBid,
        ownerId,
        `<p><strong>[${pageIndex + 1}/${totalPages}쪽]</strong> ${escapeHtml(pageSpec?.title ?? docTitle)} &nbsp;|&nbsp; ${escapeHtml(docTitle)}</p>`,
        docTitle,
        blockVariants[subBid] ?? "guide-inline",
        registerSlot
      )
    );
    blockMetaMap[subBid] = {
      blockId: subBid,
      pageId,
      role: "guide",
      label: `${pageIndex + 1}쪽 건명 · 안내`,
      defaultVariant: "guide-inline",
    };
  }

  const romans = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ"] as const;
  targetNodes.forEach((node, idx) => {
    const cleanTitle = stripLinkTags(node.text).replace(/^\d+[.)]\s*/, "");
    const secBid = `pg_blk_${node.id}`;
    const secVar = blockVariants[secBid] ?? "main-official-bullets";
    const romanLabel = romans[(pageSpec ? pageIndex : idx) % romans.length];

    if (
      secVar === "main-grouped-grid" ||
      secVar === "main-printable-checkbox" ||
      secVar === "main-summary-matrix"
    ) {
      const children = node.children.length > 0 ? node.children : [node];
      blocks.push({
        blockId: secBid,
        kind: "structured-table",
        title: cleanTitle,
        columnWidths: ["24%", "76%"],
        borderRules: HWP_BORDER_RULES,
        headerStyle: HWP_HEADER_STYLE,
        cellPadding: "6px 8px",
        rows: [
          {
            rowId: `${secBid}_hdr`,
            cells: [
              {
                cellId: `${secBid}_h0`,
                slotId: registerSlot(
                  node.id,
                  `${node.id}_th0`,
                  "구분",
                  `<p>${romanLabel}. ${escapeHtml(cleanTitle)}</p>`,
                  { nodeId: node.id, field: "text" }
                ),
                colSpan: 2,
                isHeader: true,
                hAlign: "left" as const,
                vAlign: "middle" as const,
                fontSize: "11px",
              },
            ],
          },
          ...children.map((c, ci) => {
            const cText = stripLinkTags(c.text);
            const split = cText.indexOf(":");
            const k = split > 0 ? cText.slice(0, split).trim() : `세부 ${ci + 1}`;
            const v = split > 0 ? cText.slice(split + 1).trim() : cText;
            return {
              rowId: `${secBid}_r${ci}`,
              cells: [
                {
                  cellId: `${secBid}_rk${ci}`,
                  slotId: registerSlot(c.id, `${c.id}_k`, k, `<p>${escapeHtml(k)}</p>`, { nodeId: c.id, field: "text" }),
                  hAlign: "center" as const,
                  vAlign: "middle" as const,
                  backgroundColor: "#f8fafc",
                  fontWeight: "700",
                  fontSize: "11px",
                },
                {
                  cellId: `${secBid}_rv${ci}`,
                  slotId: registerSlot(c.id, `${c.id}_v`, k, `<p>${escapeHtml(v)}</p>`, { nodeId: c.id, field: "text" }),
                  vAlign: "middle" as const,
                  fontSize: "11px",
                },
              ],
            };
          }),
        ],
      });
    } else {
      const headSid = registerSlot(
        node.id,
        `pg_slot_${node.id}_ap_h`,
        `${pageIndex + 1}항 제목`,
        `<h3>${romanLabel}. ${escapeHtml(cleanTitle)}</h3>`,
        { nodeId: node.id, field: "text" }
      );
      const bodyHtml =
        node.children.length > 0
          ? renderOfficialOutlineHtml(node.children)
          : `<p>❏ ${escapeHtml(node.note || cleanTitle)}</p>`;
      const bodySid = registerSlot(
        node.id,
        `pg_slot_${node.id}_ap_b`,
        `${pageIndex + 1}항 본문`,
        bodyHtml,
        { nodeId: node.id, field: "text" }
      );
      blocks.push({
        blockId: secBid,
        kind: "section-block",
        title: cleanTitle,
        headingSlotId: headSid,
        bodySlotId: bodySid,
      });
    }
    blockMetaMap[secBid] = {
      blockId: secBid,
      pageId,
      role: "main-table",
      label: `<<page>> · ${cleanTitle}`,
      defaultVariant: "main-official-bullets",
    };
  });

  if (pageIndex === totalPages - 1) {
    const attachBid = `pg_blk_${ownerId}_ap_attach`;
    blocks.push(
      buildGuideVariantBlock(
        attachBid,
        ownerId,
        "<p>[붙임] 1. 세부 운영 일정 및 3트랙 안전관리표 1부.<br/>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2. 소요예산 비교 및 재원 분담 내역 1부. &nbsp;끝.</p>",
        docTitle,
        blockVariants[attachBid] ?? "guide-inline",
        registerSlot
      )
    );
    blockMetaMap[attachBid] = {
      blockId: attachBid,
      pageId,
      role: "guide",
      label: "[붙임] 안내 문구",
      defaultVariant: "guide-inline",
    };
  }

  return { blocks, blockMetaMap };
}

function buildScheduleOpsAsset(
  pageId: string,
  pageIndex: number,
  totalPages: number,
  docTitle: string,
  linkedDoc: LinkedDocumentSpec | undefined,
  pageSpec: LinkedPageSpec | undefined,
  registerSlot: RegisterSlotFn,
  blockVariants: Record<string, BlockVariantId>
): CompiledAssetResult {
  const ownerId = pageSpec?.nodeId ?? linkedDoc?.nodeId ?? `ops_doc_p${pageIndex}`;
  const blocks: LayoutBlock[] = [];
  const blockMetaMap: Record<string, PlaygroundBlockMeta> = {};

  if (pageIndex === 0) {
    const titleBid = `pg_blk_${ownerId}_op_title`;
    blocks.push(
      buildTitleVariantBlock(
        titleBid,
        ownerId,
        "세 부 운 영 일 정 및 역 할 분 담 표",
        blockVariants[titleBid] ?? "title-underline",
        registerSlot
      )
    );
    blockMetaMap[titleBid] = {
      blockId: titleBid,
      pageId,
      role: "title",
      label: "1. 운영일정표 제목",
      defaultVariant: "title-underline",
    };
  }

  const guideBid = `pg_blk_${ownerId}_op_sub`;
  blocks.push(
    buildGuideVariantBlock(
      guideBid,
      ownerId,
      `<p><strong>[${pageIndex + 1}/${totalPages}쪽 · 일정·운영]</strong> ${escapeHtml(pageSpec?.title ?? docTitle)} &nbsp;|&nbsp; <strong>장소:</strong> 곤지암리조트 (오창 출발 약 1시간 10분)</p>`,
      docTitle,
      blockVariants[guideBid] ?? (pageIndex === 0 ? "guide-inline" : "guide-notice-box"),
      registerSlot
    )
  );
  blockMetaMap[guideBid] = {
    blockId: guideBid,
    pageId,
    role: "guide",
    label: "대상 · 위치 안내",
    defaultVariant: pageIndex === 0 ? "guide-inline" : "guide-notice-box",
  };

  const opTableBid = `pg_blk_${ownerId}_op_table`;
  blocks.push(
    buildScheduleVariantBlock(
      opTableBid,
      ownerId,
      blockVariants[opTableBid] ?? "sched-3track-merged",
      registerSlot
    )
  );
  blockMetaMap[opTableBid] = {
    blockId: opTableBid,
    pageId,
    role: "schedule-table",
    label: "세부 운영 일정표 (3트랙)",
    defaultVariant: "sched-3track-merged",
  };

  const tfBid = `pg_blk_${ownerId}_op_tf`;
  blocks.push(
    buildRosterVariantBlock(
      tfBid,
      ownerId,
      blockVariants[tfBid] ?? "roster-grouped-summary",
      registerSlot
    )
  );
  blockMetaMap[tfBid] = {
    blockId: tfBid,
    pageId,
    role: "roster-table",
    label: "TF 분업 · 트랙별 요약표",
    defaultVariant: "roster-grouped-summary",
  };

  return { blocks, blockMetaMap };
}

function buildBudgetCompareAsset(
  pageId: string,
  pageIndex: number,
  totalPages: number,
  docTitle: string,
  linkedDoc: LinkedDocumentSpec | undefined,
  pageSpec: LinkedPageSpec | undefined,
  registerSlot: RegisterSlotFn,
  blockVariants: Record<string, BlockVariantId>
): CompiledAssetResult {
  const ownerId = pageSpec?.nodeId ?? linkedDoc?.nodeId ?? `budget_doc_p${pageIndex}`;
  const blocks: LayoutBlock[] = [];
  const blockMetaMap: Record<string, PlaygroundBlockMeta> = {};

  if (pageIndex === 0) {
    const titleBid = `pg_blk_${ownerId}_bg_title`;
    blocks.push(
      buildTitleVariantBlock(
        titleBid,
        ownerId,
        "소 요 예 산 비 교 및 재 원 분 담 품 의 표",
        blockVariants[titleBid] ?? "title-underline",
        registerSlot
      )
    );
    blockMetaMap[titleBid] = {
      blockId: titleBid,
      pageId,
      role: "title",
      label: "1. 예산 비교품의 제목",
      defaultVariant: "title-underline",
    };

    const apBid = `pg_blk_${ownerId}_bg_ap`;
    blocks.push(
      buildApprovalVariantBlock(
        apBid,
        ownerId,
        blockVariants[apBid] ?? "approval-3col",
        registerSlot
      )
    );
    blockMetaMap[apBid] = {
      blockId: apBid,
      pageId,
      role: "approval-box",
      label: "2. 결재란",
      defaultVariant: "approval-3col",
    };
  }

  const subBid = `pg_blk_${ownerId}_bg_sub`;
  blocks.push(
    buildGuideVariantBlock(
      subBid,
      ownerId,
      `<p><strong>[${pageIndex + 1}/${totalPages}쪽 · 견적·비교]</strong> ${escapeHtml(pageSpec?.title ?? docTitle)} &nbsp;|&nbsp; <strong>산출 가정:</strong> 실참석 27명 기준 (본사 설비 대기 3명 제외)</p>`,
      docTitle,
      blockVariants[subBid] ?? (pageIndex === 0 ? "guide-inline" : "guide-notice-box"),
      registerSlot
    )
  );
  blockMetaMap[subBid] = {
    blockId: subBid,
    pageId,
    role: "guide",
    label: "산출 기준 안내",
    defaultVariant: pageIndex === 0 ? "guide-inline" : "guide-notice-box",
  };

  const bgBid = `pg_blk_${ownerId}_bg_table`;
  blocks.push(
    buildBudgetVariantBlock(
      bgBid,
      ownerId,
      blockVariants[bgBid] ?? "budget-dual-ab",
      registerSlot
    )
  );
  blockMetaMap[bgBid] = {
    blockId: bgBid,
    pageId,
    role: "budget-table",
    label: "소요예산 비교 · 산출표",
    defaultVariant: "budget-dual-ab",
  };

  const fundBid = `pg_blk_${ownerId}_bg_fund`;
  blocks.push(
    buildMetaVariantBlock(
      fundBid,
      ownerId,
      docTitle,
      blockVariants[fundBid] ?? "meta-2col-kv",
      registerSlot
    )
  );
  blockMetaMap[fundBid] = {
    blockId: fundBid,
    pageId,
    role: "meta-table",
    label: "재원 · 기안 요약표",
    defaultVariant: "meta-2col-kv",
  };

  return { blocks, blockMetaMap };
}

export function compileAssetPageBlocks(params: CompileAssetPageParams): CompiledAssetResult | null {
  const {
    assetId,
    pageId,
    pageIndex,
    totalPages,
    docTitle,
    linkedDoc,
    pageSpec,
    linkedNodes,
    registerSlot,
    blockVariants,
  } = params;

  if (assetId === "asset-survey-sheet") {
    return buildSurveySheetAsset(
      pageId,
      pageIndex,
      totalPages,
      docTitle,
      linkedDoc,
      pageSpec,
      registerSlot,
      blockVariants
    );
  }
  if (assetId === "asset-approval-plan") {
    return buildApprovalPlanAsset(
      pageId,
      pageIndex,
      totalPages,
      docTitle,
      linkedDoc,
      pageSpec,
      linkedNodes,
      registerSlot,
      blockVariants
    );
  }
  if (assetId === "asset-schedule-ops") {
    return buildScheduleOpsAsset(
      pageId,
      pageIndex,
      totalPages,
      docTitle,
      linkedDoc,
      pageSpec,
      registerSlot,
      blockVariants
    );
  }
  if (assetId === "asset-budget-compare") {
    return buildBudgetCompareAsset(
      pageId,
      pageIndex,
      totalPages,
      docTitle,
      linkedDoc,
      pageSpec,
      registerSlot,
      blockVariants
    );
  }
  return null;
}

export function compileFormAssetBlocks(
  assetId: FormAssetId,
  docTitle: string,
  linkedDoc: LinkedDocumentSpec | undefined,
  linkedNodes: readonly PlaygroundNode[],
  registerSlot: RegisterSlotFn,
  blockVariants: Record<string, BlockVariantId>,
  pageId = "page_1",
  pageIndex = 0,
  totalPages = 1,
  pageSpec?: LinkedPageSpec
): CompiledAssetResult | null {
  return compileAssetPageBlocks({
    assetId,
    pageId,
    pageIndex,
    totalPages,
    docTitle,
    linkedDoc,
    pageSpec,
    linkedNodes,
    registerSlot,
    blockVariants,
  });
}

export function inferBlockRoleFromKind(block: LayoutBlock): BlockRoleKind {
  if (block.kind === "form-title" || block.kind === "cover-banner" || block.kind === "hero") {
    return "title";
  }
  if (block.kind === "composite-form-frame") {
    return "meta-table";
  }
  if (block.kind === "text" || block.kind === "callout-box" || block.kind === "heading") {
    return "guide";
  }
  return "main-table";
}

export function buildListVariantBlock(
  blockId: string,
  items: readonly PlaygroundNode[],
  variant: BlockVariantId,
  registerSlot: RegisterSlotFn
): LayoutBlock {
  const validItems = items.filter((n) => stripLinkTags(n.text).length > 0);
  const renderItems = (list: readonly PlaygroundNode[], depth: number): string =>
    list
      .map((item, idx) => {
        const clean = stripLinkTags(item.text);
        if (!clean) return "";
        let marker = "□";
        if (variant === "list-filled-square") {
          marker = depth === 0 ? "❏" : depth === 1 ? "▪" : "-";
        } else if (variant === "list-numbered") {
          const hangul = ["가", "나", "다", "라", "마", "바"];
          marker =
            depth === 0
              ? `${idx + 1}.`
              : depth === 1
                ? `${hangul[idx % hangul.length]}.`
                : `${idx + 1})`;
        } else {
          marker = depth === 0 ? "□" : depth === 1 ? "◦" : "-";
        }
        const indent = depth * 20;
        const isGroupHeader = depth === 0 && item.children.length > 0;
        const topGap = isGroupHeader && idx > 0 ? "padding-top:10px;" : "";
        const bottomGap = isGroupHeader ? "padding-bottom:2px;" : "";
        const textColor = depth === 0 ? "#0f172a" : "#334155";
        const bodyHtml = isGroupHeader
          ? `<strong>${marker} ${escapeHtml(clean)}</strong>`
          : `${marker} ${escapeHtml(clean)}`;
        const sub = item.children.length > 0 ? renderItems(item.children, depth + 1) : "";
        return `<p style="padding-left:${indent}px;${topGap}${bottomGap}color:${textColor};line-height:1.55">${bodyHtml}</p>${sub}`;
      })
      .join("");

  const html = renderItems(validItems, 0) || "<p>□ 항목을 입력하세요</p>";
  const primaryNodeId = validItems[0]?.id ?? blockId;
  const sid = registerSlot(
    primaryNodeId,
    `pg_slot_${blockId}`,
    "글머리 목록",
    html,
    { nodeId: primaryNodeId, field: "text" }
  );

  return {
    blockId,
    kind: "text",
    title: "글머리 기호 목록",
    slotId: sid,
  };
}

const BLANK_CELL_REGEX = /^\[\s*-\s*\]$/;
const MERGE_UP_REGEX = /^\[\s*\^\s*\]$/;
const MERGE_LEFT_REGEX = /^\[\s*<\s*\]$/;

export function isBlankCellToken(text: string): boolean {
  return BLANK_CELL_REGEX.test(text.trim());
}

export function isMergeUpToken(text: string): boolean {
  return MERGE_UP_REGEX.test(text.trim());
}

export function isMergeLeftToken(text: string): boolean {
  return MERGE_LEFT_REGEX.test(text.trim());
}

export function parseExplicitPipeCells(rawText: string): string[] {
  const clean = stripLinkTags(rawText);
  if (!clean.includes("|")) {
    return [clean];
  }
  return clean.split("|").map((part) => part.trim());
}

function formatExplicitCellHtml(rawText: string, stripCheckboxPrefix = false): string {
  const trimmed = rawText.trim();
  if (!trimmed || isBlankCellToken(trimmed)) {
    return "<p><br/></p>";
  }
  const normalized = stripCheckboxPrefix ? trimmed.replace(/□\s*/g, "").trim() : trimmed;
  if (!normalized) return "<p><br/></p>";
  const lines = normalized.split(/\r?\n/);
  if (lines.length === 1) {
    return `<p>${escapeHtml(lines[0])}</p>`;
  }
  return lines
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : "<p><br/></p>"))
    .join("");
}

function isChoiceCellText(text: string): boolean {
  const t = text.trim();
  return /^□\s*/.test(t);
}

function splitChoicesFromCellText(rawText: string): string[] | null {
  const trimmed = rawText.trim();
  if (!trimmed || isBlankCellToken(trimmed)) return null;
  if (trimmed.includes("□")) {
    const parts = trimmed
      .split("□")
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length >= 2 ? parts : null;
  }
  if (trimmed.includes("/")) {
    const parts = trimmed
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length >= 2 ? parts : null;
  }
  return null;
}

interface ParsedCell {
  text: string;
  isBlank: boolean;
  isMergeUp?: boolean;
  isMergeLeft?: boolean;
  ownerNodeId: string;
  cellIndex: number;
  hasPipe: boolean;
}

interface ParsedExplicitRow {
  rowNode: PlaygroundNode;
  cells: ParsedCell[];
  groupParent?: {
    node: PlaygroundNode;
    text: string;
    rowSpan: number;
    isFirstInGroup: boolean;
  };
}

function flattenChildLeafRows(nodes: readonly PlaygroundNode[]): PlaygroundNode[] {
  const out: PlaygroundNode[] = [];
  for (const n of nodes) {
    const validSub = n.children.filter(
      (c) => stripLinkTags(c.text).length > 0 || c.children.length > 0
    );
    if (validSub.length > 0) {
      out.push(...flattenChildLeafRows(validSub));
    } else if (stripLinkTags(n.text).length > 0) {
      out.push(n);
    }
  }
  return out;
}

function parseExplicitTableRows(rowNodes: readonly PlaygroundNode[]): ParsedExplicitRow[] {
  const out: ParsedExplicitRow[] = [];
  for (const rowNode of rowNodes) {
    const cleanText = stripLinkTags(rowNode.text);
    const validChildren = rowNode.children.filter(
      (c) => stripLinkTags(c.text).length > 0 || c.children.length > 0
    );
    if (!cleanText && validChildren.length === 0) continue;

    if (validChildren.length > 0) {
      const leafRows = flattenChildLeafRows(validChildren);
      const groupText = cleanText.replace(/\|\s*$/, "").trim();
      leafRows.forEach((child, idx) => {
        const hasPipe = stripLinkTags(child.text).includes("|");
        const parts = parseExplicitPipeCells(child.text);
        out.push({
          rowNode: child,
          cells: parts.map((p, cIdx) => {
            const up = isMergeUpToken(p);
            const left = isMergeLeftToken(p);
            return {
              text: p,
              isBlank: !p.trim() || isBlankCellToken(p),
              isMergeUp: up || undefined,
              isMergeLeft: left || undefined,
              ownerNodeId: child.id,
              cellIndex: cIdx,
              hasPipe,
            };
          }),
          groupParent: {
            node: rowNode,
            text: groupText,
            rowSpan: leafRows.length,
            isFirstInGroup: idx === 0,
          },
        });
      });
      continue;
    }

    const hasPipe = cleanText.includes("|");
    const parts = parseExplicitPipeCells(rowNode.text);
    out.push({
      rowNode,
      cells: parts.map((p, cIdx) => {
        const up = isMergeUpToken(p);
        const left = isMergeLeftToken(p);
        return {
          text: p,
          isBlank: !p.trim() || isBlankCellToken(p),
          isMergeUp: up || undefined,
          isMergeLeft: left || undefined,
          ownerNodeId: rowNode.id,
          cellIndex: cIdx,
          hasPipe,
        };
      }),
    });
  }
  return out;
}

const NAIVE_KV_COLON_REGEX = /(?<!\d):|:(?!\d)/;
const UNIT_HINT_REGEX = /\((?:cm|mm|kg|m|g|ml|l|%|s~[^)]+)\)/i;

/** 시간(`17:30`) 콜론은 제외하고 `라벨: 값` 형태의 나이브 키-값 행을 분해한다. */
export function parseNaiveKeyValue(rawText: string): { key: string; value: string } | null {
  const clean = stripLinkTags(rawText);
  const match = NAIVE_KV_COLON_REGEX.exec(clean);
  if (!match || match.index === undefined) return null;
  const idx = match.index;
  const key = clean.slice(0, idx).trim();
  const value = clean.slice(idx + 1).trim();
  if (!key) return null;
  return { key, value };
}

function isViewDirectiveNode(node: PlaygroundNode): boolean {
  return parseContainerDirective(node.text).kind === "view";
}

function getNonViewChildren(node: PlaygroundNode): PlaygroundNode[] {
  return node.children.filter(
    (c) => !isViewDirectiveNode(c) && (stripLinkTags(c.text).length > 0 || c.children.length > 0)
  );
}

function isNaiveVerticalGroup(label: string, validChildren: readonly PlaygroundNode[]): boolean {
  if (/인적\s*사항|기본\s*정보/.test(label)) return true;
  return validChildren.some((c) => {
    const clean = stripLinkTags(c.text);
    return (
      clean.includes("|") ||
      parseNaiveKeyValue(clean) !== null ||
      isBlankCellToken(clean) ||
      clean.includes("/") ||
      getNonViewChildren(c).length > 0
    );
  });
}

export function isNaiveMultiInputRow(label: string, validChildren: readonly PlaygroundNode[]): boolean {
  if (validChildren.length < 2) return false;
  const texts = validChildren.map((c) => stripLinkTags(c.text));
  if (texts.some((t) => t.includes("|") || isBlankCellToken(t) || t.includes("□"))) {
    return false;
  }
  const unitCount = texts.filter((t) => UNIT_HINT_REGEX.test(t)).length;
  return unitCount >= 2 || (/치수|사이즈/.test(label) && validChildren.length >= 2);
}

function isNaiveNestedChoiceRow(rowNode: PlaygroundNode): boolean {
  const label = stripLinkTags(rowNode.text);
  const validChildren = getNonViewChildren(rowNode);
  if (validChildren.length < 2) return false;
  if (validChildren.some((c) => getNonViewChildren(c).length > 0)) return false;
  if (isNaiveVerticalGroup(label, validChildren)) return false;
  if (isNaiveMultiInputRow(label, validChildren)) return false;
  if (validChildren.some((c) => isChoiceCellText(stripLinkTags(c.text)))) return false;
  return true;
}

type NaiveTableItem =
  | { kind: "group"; node: PlaygroundNode; label: string; items: NaiveTableItem[] }
  | { kind: "choice"; node: PlaygroundNode; label: string; options: string[] }
  | { kind: "multi-input"; node: PlaygroundNode; columns: string[]; fromChildLabels: boolean }
  | { kind: "kv"; node: PlaygroundNode; label: string; value: string }
  | { kind: "blank-field"; node: PlaygroundNode; label: string }
  | { kind: "explicit-node"; node: PlaygroundNode };

function hasFormSignalsInRows(rows: readonly PlaygroundNode[]): boolean {
  for (const row of rows) {
    if (isViewDirectiveNode(row)) continue;
    const clean = stripLinkTags(row.text);
    const validChildren = getNonViewChildren(row);
    if (!clean && validChildren.length === 0) continue;
    if (validChildren.length > 0) {
      if (
        isNaiveVerticalGroup(clean, validChildren) ||
        isNaiveMultiInputRow(clean, validChildren) ||
        isNaiveNestedChoiceRow(row) ||
        hasFormSignalsInRows(validChildren)
      ) {
        return true;
      }
      continue;
    }
    if (
      clean.includes("□") ||
      parseExplicitPipeCells(row.text).some(
        (c) => isBlankCellToken(c) || isMergeUpToken(c) || isMergeLeftToken(c)
      )
    ) {
      return true;
    }
    if (!clean.includes("|")) {
      const kv = parseNaiveKeyValue(clean);
      if (kv) {
        if (splitChoicesFromCellText(kv.value) !== null) return true;
      } else {
        return true;
      }
    }
  }
  return false;
}

function classifyNaiveRow(
  rowNode: PlaygroundNode,
  insideGroup: boolean,
  hasFormSignals: boolean
): NaiveTableItem | null {
  if (isViewDirectiveNode(rowNode)) return null;
  const clean = stripLinkTags(rowNode.text);
  const validChildren = getNonViewChildren(rowNode);
  if (!clean && validChildren.length === 0) return null;

  if (validChildren.length > 0) {
    if (isNaiveVerticalGroup(clean, validChildren)) {
      const items = validChildren
        .map((c) => classifyNaiveRow(c, true, true))
        .filter((it): it is NaiveTableItem => it !== null);
      return {
        kind: "group",
        node: rowNode,
        label: clean.replace(/\|\s*$/, "").trim(),
        items,
      };
    }
    if (isNaiveMultiInputRow(clean, validChildren)) {
      return {
        kind: "multi-input",
        node: rowNode,
        columns: validChildren.map((c) => stripLinkTags(c.text)),
        fromChildLabels: true,
      };
    }
    if (isNaiveNestedChoiceRow(rowNode)) {
      return {
        kind: "choice",
        node: rowNode,
        label: clean,
        options: validChildren.map((c) => stripLinkTags(c.text)),
      };
    }
    return { kind: "explicit-node", node: rowNode };
  }

  if (clean.includes("|")) {
    const cells = parseExplicitPipeCells(rowNode.text);
    const hasExplicitMarkers = cells.some(
      (c) => isBlankCellToken(c) || isChoiceCellText(c) || isMergeUpToken(c) || isMergeLeftToken(c)
    );
    if (
      !hasExplicitMarkers &&
      (insideGroup || hasFormSignals) &&
      cells.length >= 2 &&
      cells.every((c) => c.length > 0 && c.length <= 20)
    ) {
      return {
        kind: "multi-input",
        node: rowNode,
        columns: cells,
        fromChildLabels: false,
      };
    }
    return { kind: "explicit-node", node: rowNode };
  }

  const kv = parseNaiveKeyValue(clean);
  if (kv) {
    const splitOpts = splitChoicesFromCellText(kv.value);
    if (splitOpts && splitOpts.length >= 2) {
      return { kind: "choice", node: rowNode, label: kv.key, options: splitOpts };
    }
    return { kind: "kv", node: rowNode, label: kv.key, value: kv.value };
  }

  if (
    isBlankCellToken(clean) ||
    isChoiceCellText(clean) ||
    isMergeUpToken(clean) ||
    isMergeLeftToken(clean)
  ) {
    return { kind: "explicit-node", node: rowNode };
  }
  return { kind: "blank-field", node: rowNode, label: clean };
}

function parseNaiveTableSemantics(rows: readonly PlaygroundNode[]): NaiveTableItem[] {
  const formSignals = hasFormSignalsInRows(rows);
  return rows
    .map((r) => classifyNaiveRow(r, false, formSignals))
    .filter((it): it is NaiveTableItem => it !== null);
}

function cloneNodeWithoutViews(node: PlaygroundNode): PlaygroundNode {
  return {
    ...node,
    children: node.children.filter((c) => !isViewDirectiveNode(c)).map(cloneNodeWithoutViews),
  };
}

function makeViewRowNode(id: string, text: string, note = "", children: PlaygroundNode[] = []): PlaygroundNode {
  return {
    id,
    role: "body",
    layoutChoice: "text",
    text,
    note,
    children,
  };
}

function normalizeCompiledRowLine(rawLine: string): string {
  let line = rawLine.trim();
  if (!line) return "";
  if (/^[-*]\s+/.test(line)) {
    line = line.replace(/^[-*]\s+/, "").trim();
  }
  if (line.startsWith("|") && line.endsWith("|") && line.length >= 2) {
    line = line.slice(1, -1).trim();
  }
  if (/^[:\-\s|]+$/.test(line) && line.includes("-")) {
    return "";
  }
  if (/^<<\s*(?:table|view(?::[^>]+)?)\s*>>$/i.test(line)) {
    return "";
  }
  return line;
}

/**
 * 3규칙 텍스트(`줄바꿈=행`, `|=열`, `[-]=빈칸`, `들여쓰기=세로병합`)를
 * `<<view:table>>` / `<<template:table>>` 하위 `PlaygroundNode[]` 트리로 파싱한다.
 */
export function parseThreeRuleTextToNodes(
  rawText: string,
  idPrefix = "pg_ai_view"
): PlaygroundNode[] {
  let body = rawText.trim();
  if (body.startsWith("```")) {
    const nl = body.indexOf("\n");
    body = nl >= 0 ? body.slice(nl + 1) : "";
    if (body.trimEnd().endsWith("```")) {
      body = body.trimEnd().slice(0, -3);
    }
  }

  const roots: PlaygroundNode[] = [];
  const stack: Array<{ indent: number; node: PlaygroundNode }> = [];
  let seq = 0;

  for (const rawLine of body.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const expanded = rawLine.replace(/\t/g, "  ");
    const indentMatch = /^( *)/.exec(expanded);
    const indent = indentMatch ? indentMatch[1].length : 0;
    const normalized = normalizeCompiledRowLine(expanded);
    if (!normalized) continue;

    seq += 1;
    const node: PlaygroundNode = {
      id: `${idPrefix}_${seq}`,
      role: "body",
      layoutChoice: "text",
      text: normalized,
      note: "",
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }
    stack.push({ indent, node });
  }

  return roots;
}

/**
 * 순수 나이브 `<<table>>` 원문 행들을 선택한 에셋(`variant`)의 3규칙(`enter=행, |=열, [-]=빈칸, indent=세로병합`)
 * 컴파일 뷰(`<<view:table>>` 하위 노드)로 변환한다.
 */
export function compileSourceNodesToViewRows(
  sourceRows: readonly PlaygroundNode[],
  variant: BlockVariantId,
  idPrefix = "pg_view"
): PlaygroundNode[] {
  const items = parseNaiveTableSemantics(sourceRows);
  const isHeaderBelowMode =
    variant === "table-header-below" || variant === "table-header-below-matrix";

  if (variant === "table-modern-flat") {
    const flatRows: PlaygroundNode[] = [];
    const hasGroups = items.some((it) => it.kind === "group");
    flatRows.push(
      makeViewRowNode(
        `${idPrefix}_mf_hdr`,
        hasGroups ? "분류 | 항목 | 세부 내용 / 선택" : "항목 | 세부 내용 / 선택"
      )
    );
    const appendFlat = (list: readonly NaiveTableItem[], grpLabel: string, pfx: string) => {
      list.forEach((it, idx) => {
        if (it.kind === "group") {
          appendFlat(it.items, it.label, `${pfx}_g${idx}`);
        } else if (it.kind === "choice") {
          const val = it.options.map((o) => `□ ${o}`).join("   ");
          flatRows.push(
            makeViewRowNode(
              `${pfx}_c_${idx}`,
              hasGroups ? `${grpLabel || "일반"} | ${it.label} | ${val}` : `${it.label} | ${val}`,
              it.node.note
            )
          );
        } else if (it.kind === "multi-input") {
          const label = it.columns.join(" / ");
          flatRows.push(
            makeViewRowNode(
              `${pfx}_m_${idx}`,
              hasGroups ? `${grpLabel || "일반"} | ${label} | [-]` : `${label} | [-]`,
              it.node.note
            )
          );
        } else if (it.kind === "kv") {
          flatRows.push(
            makeViewRowNode(
              `${pfx}_k_${idx}`,
              hasGroups ? `${grpLabel || "일반"} | ${it.label} | ${it.value}` : `${it.label} | ${it.value}`,
              it.node.note
            )
          );
        } else if (it.kind === "blank-field") {
          flatRows.push(
            makeViewRowNode(
              `${pfx}_b_${idx}`,
              hasGroups ? `${grpLabel || "일반"} | ${it.label} | [-]` : `${it.label} | [-]`,
              it.node.note
            )
          );
        } else {
          flatRows.push(cloneNodeWithoutViews(it.node));
        }
      });
    };
    appendFlat(items, "", idPrefix);
    return flatRows;
  }

  if (variant === "table-roster-ledger") {
    const ledgerRows: PlaygroundNode[] = [
      makeViewRowNode(`${idPrefix}_rl_hdr`, "구분 | 항목 | 세부 기준 / 선택 | 상태 | 비고"),
    ];
    const appendLedger = (list: readonly NaiveTableItem[], grpLabel: string, pfx: string) => {
      list.forEach((it, idx) => {
        const g = grpLabel || "일반";
        if (it.kind === "group") {
          appendLedger(it.items, it.label, `${pfx}_g${idx}`);
        } else if (it.kind === "choice") {
          ledgerRows.push(
            makeViewRowNode(
              `${pfx}_c_${idx}`,
              `${g} | ${it.label} | ${it.options.map((o) => `□ ${o}`).join("   ")} | [-] | [-]`,
              it.node.note
            )
          );
        } else if (it.kind === "multi-input") {
          ledgerRows.push(
            makeViewRowNode(
              `${pfx}_m_${idx}`,
              `${g} | ${it.columns.join(" / ")} | [-] | [-] | [-]`,
              it.node.note
            )
          );
        } else if (it.kind === "kv") {
          ledgerRows.push(
            makeViewRowNode(`${pfx}_k_${idx}`, `${g} | ${it.label} | ${it.value} | [-] | [-]`, it.node.note)
          );
        } else if (it.kind === "blank-field") {
          ledgerRows.push(
            makeViewRowNode(`${pfx}_b_${idx}`, `${g} | ${it.label} | [-] | [-] | [-]`, it.node.note)
          );
        } else {
          ledgerRows.push(cloneNodeWithoutViews(it.node));
        }
      });
    };
    appendLedger(items, "", idPrefix);
    return ledgerRows;
  }

  if (variant === "table-eval-checklist") {
    const evalRows: PlaygroundNode[] = [
      makeViewRowNode(`${idPrefix}_ev_hdr`, "항목 및 요약 | 평가 / 선택 | 비고"),
    ];
    const appendEval = (list: readonly NaiveTableItem[], prefix: string, pfx: string) => {
      list.forEach((it, idx) => {
        if (it.kind === "group") {
          appendEval(it.items, it.label, `${pfx}_g${idx}`);
        } else if (it.kind === "choice") {
          const title = prefix ? `[${prefix}] ${it.label}` : it.label;
          evalRows.push(
            makeViewRowNode(
              `${pfx}_c_${idx}`,
              `${title} | ${it.options.map((o) => `□ ${o}`).join("   ")} | [-]`,
              it.node.note
            )
          );
        } else if (it.kind === "multi-input") {
          const title = prefix ? `[${prefix}] ${it.columns.join(" / ")}` : it.columns.join(" / ");
          evalRows.push(
            makeViewRowNode(`${pfx}_m_${idx}`, `${title} | □ 적정   □ 보완 필요 | [-]`, it.node.note)
          );
        } else if (it.kind === "kv") {
          const title = prefix ? `[${prefix}] ${it.label} — ${it.value}` : `${it.label} — ${it.value}`;
          evalRows.push(
            makeViewRowNode(`${pfx}_k_${idx}`, `${title} | □ 확인   □ 수정 요청 | [-]`, it.node.note)
          );
        } else if (it.kind === "blank-field") {
          const title = prefix ? `[${prefix}] ${it.label}` : it.label;
          evalRows.push(
            makeViewRowNode(`${pfx}_b_${idx}`, `${title} | □ 해당   □ 해당 없음 | [-]`, it.node.note)
          );
        } else {
          evalRows.push(cloneNodeWithoutViews(it.node));
        }
      });
    };
    appendEval(items, "", idPrefix);
    return evalRows;
  }

  const compileItems = (list: readonly NaiveTableItem[], prefix: string): PlaygroundNode[] => {
    const out: PlaygroundNode[] = [];
    let idx = 0;
    while (idx < list.length) {
      const item = list[idx];
      const next = list[idx + 1];

      if (
        (variant === "table-grid-4col" || variant === "table-grouped-compare") &&
        item.kind === "kv" &&
        next?.kind === "kv" &&
        item.label.length <= 20 &&
        item.value.length <= 32 &&
        next.label.length <= 20 &&
        next.value.length <= 32
      ) {
        out.push(
          makeViewRowNode(
            `${prefix}_kv4_${idx}`,
            `${item.label} | ${item.value} | ${next.label} | ${next.value}`,
            item.node.note || next.node.note || ""
          )
        );
        idx += 2;
        continue;
      }

      if (item.kind === "group") {
        out.push(
          makeViewRowNode(
            `${prefix}_grp_${idx}`,
            item.label,
            item.node.note,
            compileItems(item.items, `${prefix}_g${idx}`)
          )
        );
        idx += 1;
        continue;
      }

      if (item.kind === "choice") {
        if (isHeaderBelowMode) {
          out.push(makeViewRowNode(`${prefix}_q_${idx}`, item.label, item.node.note));
          out.push(
            makeViewRowNode(
              `${prefix}_o_${idx}`,
              item.options.map((opt) => `□ ${opt}`).join(" | ")
            )
          );
        } else {
          out.push(
            makeViewRowNode(
              `${prefix}_c_${idx}`,
              `${item.label} | ${item.options.map((opt) => `□ ${opt}`).join("   ")}`,
              item.node.note
            )
          );
        }
        idx += 1;
        continue;
      }

      if (item.kind === "multi-input") {
        if (item.fromChildLabels || isHeaderBelowMode) {
          out.push(makeViewRowNode(`${prefix}_mh_${idx}`, item.columns.join(" | "), item.node.note));
          out.push(
            makeViewRowNode(
              `${prefix}_mb_${idx}`,
              item.columns.map(() => "[-]").join(" | ")
            )
          );
        } else {
          out.push(
            makeViewRowNode(
              `${prefix}_mp_${idx}`,
              item.columns.map((col) => `${col} | [-]`).join(" | "),
              item.node.note
            )
          );
        }
        idx += 1;
        continue;
      }

      if (item.kind === "kv") {
        out.push(
          makeViewRowNode(`${prefix}_kv_${idx}`, `${item.label} | ${item.value}`, item.node.note)
        );
        idx += 1;
        continue;
      }

      if (item.kind === "blank-field") {
        out.push(makeViewRowNode(`${prefix}_bf_${idx}`, `${item.label} | [-]`, item.node.note));
        idx += 1;
        continue;
      }

      out.push(cloneNodeWithoutViews(item.node));
      idx += 1;
    }
    return out;
  };

  return compileItems(items, idPrefix);
}

/** `<<table>>` 하위 트리에 선택지 목록(`□` / `/` / 다중 선택지·나이브 하위 선택지)이 포함되어 있는지 판별한다. */
export function hasNestedChoiceOptions(rows: readonly PlaygroundNode[]): boolean {
  const nonViewRows = rows.filter((r) => !isViewDirectiveNode(r));
  if (nonViewRows.some((r) => isNaiveNestedChoiceRow(r))) {
    return true;
  }
  if (
    nonViewRows.some((r) => {
      const kv = parseNaiveKeyValue(r.text);
      return kv ? splitChoicesFromCellText(kv.value) !== null : false;
    })
  ) {
    return true;
  }
  const parsed = parseExplicitTableRows(nonViewRows);
  return parsed.some((r) =>
    r.cells.some(
      (c) => isChoiceCellText(c.text) || splitChoicesFromCellText(c.text) !== null
    )
  );
}

function splitUniformPercents(count: number, totalPct = 100): string[] {
  const n = Math.max(1, count);
  const base = Math.floor((totalPct * 100) / n) / 100;
  const arr = Array.from({ length: n }, () => base);
  const diff = Number((totalPct - base * n).toFixed(2));
  arr[n - 1] = Number((arr[n - 1] + diff).toFixed(2));
  return arr.map((v) => `${v}%`);
}

function splitProportionalColumnWidths(
  rows: readonly ParsedExplicitRow[],
  colCount: number,
  totalPct = 100
): string[] {
  if (colCount <= 1) return [`${totalPct}%`];
  const weights = Array.from({ length: colCount }, () => 7);
  for (const r of rows) {
    if (r.cells.length !== colCount) continue;
    r.cells.forEach((c, idx) => {
      if (c.isBlank || c.isMergeLeft || c.isMergeUp) return;
      const len = Math.min(34, Math.max(4, c.text.length));
      if (len > weights[idx]) weights[idx] = len;
    });
  }
  const sum = weights.reduce((a, b) => a + b, 0) || colCount;
  const clamped = weights.map((w) => Math.max(11, Math.min(48, (w / sum) * totalPct)));
  const clampedSum = clamped.reduce((a, b) => a + b, 0) || totalPct;
  const rounded = clamped.map((v) => Number(((v / clampedSum) * totalPct).toFixed(2)));
  const diff = Number((totalPct - rounded.reduce((a, b) => a + b, 0)).toFixed(2));
  rounded[colCount - 1] = Number((rounded[colCount - 1] + diff).toFixed(2));
  return rounded.map((v) => `${v}%`);
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function lcmOfCounts(counts: readonly number[], cap = 24): number {
  const valid = counts.filter((c) => c > 1);
  if (valid.length === 0) return 1;
  let acc = valid[0];
  for (let i = 1; i < valid.length; i += 1) {
    const next = (acc * valid[i]) / gcd(acc, valid[i]);
    if (next > cap) {
      return Math.max(cap, ...valid);
    }
    acc = next;
  }
  return acc;
}

function distributeSpan(totalSpan: number, cellCount: number): number[] {
  if (cellCount <= 1) return [totalSpan];
  const base = Math.floor(totalSpan / cellCount);
  const rem = totalSpan % cellCount;
  return Array.from({ length: cellCount }, (_, idx) => base + (idx < rem ? 1 : 0));
}

export function buildDynamicTableVariantBlock(
  blockId: string,
  rowNodes: readonly PlaygroundNode[],
  variant: BlockVariantId,
  registerSlot: RegisterSlotFn
): LayoutBlock {
  const parsedRows = parseExplicitTableRows(rowNodes);
  const firstNodeId = parsedRows[0]?.rowNode.id ?? rowNodes[0]?.id ?? blockId;

  const isPlainKvMode = variant === "table-2col-kv";
  const hasNotesCol = variant === "table-3col-notes";
  const isBannerMode = variant === "table-banner-rows";
  const isModernFlat = variant === "table-modern-flat";
  const isRosterLedger = variant === "table-roster-ledger";
  const tableBorderRules = isModernFlat
    ? MODERN_FLAT_BORDER_RULES
    : isRosterLedger
      ? LEDGER_BORDER_RULES
      : HWP_BORDER_RULES;
  const headerCellBg = isModernFlat ? "#f1f5f9" : "#e2e8f0";

  const makeSlotTarget = (cell: ParsedCell): SlotReverseTarget =>
    cell.hasPipe
      ? { nodeId: cell.ownerNodeId, field: "cell", cellIndex: cell.cellIndex }
      : { nodeId: cell.ownerNodeId, field: "text" };

  const makeCell = (
    cellId: string,
    ownerId: string,
    slotSuffix: string,
    label: string,
    html: string,
    target: SlotReverseTarget,
    opts?: {
      bg?: string;
      weight?: "600" | "700";
      align?: "left" | "center" | "right";
      colSpan?: number;
      rowSpan?: number;
      isHeader?: boolean;
      padding?: string;
      fontSize?: string;
    }
  ): TableCellSlotDef => ({
    cellId,
    slotId: registerSlot(
      ownerId,
      `pg_slot_${blockId}_${slotSuffix}`,
      label || "셀",
      html,
      target
    ),
    ...(opts?.isHeader ? { isHeader: true } : null),
    ...(opts?.colSpan && opts.colSpan > 1 ? { colSpan: opts.colSpan } : null),
    ...(opts?.rowSpan && opts.rowSpan > 1 ? { rowSpan: opts.rowSpan } : null),
    hAlign: opts?.align ?? "left",
    vAlign: "middle",
    ...(opts?.bg ? { backgroundColor: opts.bg } : null),
    ...(opts?.weight ? { fontWeight: opts.weight } : null),
    fontSize: opts?.fontSize ?? "11px",
    lineHeight: "1.35",
    ...(opts?.padding ? { padding: opts.padding } : null),
  });

  const buildNoteCell = (targetNode: PlaygroundNode, seq: number): TableCellSlotDef => ({
    cellId: `${blockId}_fn_${targetNode.id}_${seq}`,
    slotId: registerSlot(
      targetNode.id,
      `pg_slot_${blockId}_${targetNode.id}_${seq}_n`,
      "비고",
      `<p>${escapeHtml(targetNode.note || "") || "<br/>"}</p>`,
      { nodeId: targetNode.id, field: "note" }
    ),
    hAlign: "center",
    vAlign: "middle",
    fontSize: "10.5px",
    lineHeight: "1.35",
  });

  // 1) 가로 열 회전 다인 수합 명부형
  if (variant === "table-roster-pivot") {
    const headerFields: ParsedCell[] = [];
    for (const r of parsedRows) {
      if (r.cells.length === 1 && !r.cells[0].isBlank) {
        if (r.cells.every((c) => !c.isBlank)) continue;
      }
      if (r.cells.every((c) => c.isBlank)) continue;
      r.cells.forEach((c, idx) => {
        if (c.isBlank) return;
        const nextIsBlank = r.cells[idx + 1]?.isBlank ?? false;
        if (nextIsBlank || r.cells.length === 2 || idx === 0) {
          headerFields.push(c);
        }
      });
    }
    const safeCols =
      headerFields.length > 0
        ? headerFields.slice(0, 6)
        : [{ text: "항목", isBlank: false, ownerNodeId: firstNodeId, cellIndex: 0, hasPipe: false }];
    const colWidths = splitUniformPercents(safeCols.length, 100);

    const headerRow = {
      rowId: `${blockId}_rp_hdr`,
      cells: safeCols.map((f, i) =>
        makeCell(
          `${blockId}_rph_${i}`,
          f.ownerNodeId,
          `rph_${i}`,
          f.text,
          formatExplicitCellHtml(f.text, true),
          makeSlotTarget(f),
          { isHeader: true, bg: "#e2e8f0", weight: "700", align: "center" }
        )
      ),
    };

    const blankRows = [0, 1, 2, 3].map((rIdx) => ({
      rowId: `${blockId}_rp_row_${rIdx}`,
      cells: safeCols.map((f, cIdx) =>
        makeCell(
          `${blockId}_rpv_${rIdx}_${cIdx}`,
          f.ownerNodeId,
          `rpv_${rIdx}_${cIdx}`,
          `${f.text} (${rIdx + 1}행)`,
          "<p><br/></p>",
          { nodeId: f.ownerNodeId, field: "note" },
          { align: "center" }
        )
      ),
    }));

    return {
      blockId,
      kind: "structured-table",
      title: "가로 열 회전 다인 수합 명부형",
      columnWidths: colWidths,
      borderRules: HWP_BORDER_RULES,
      headerStyle: HWP_HEADER_STYLE,
      cellPadding: "5px 6px",
      rows: [headerRow, ...blankRows],
    };
  }

  // 2) 선택지 셀 분할 체크 매트릭스 (단일 셀 안의 선택지를 개별 칸으로 분할)
  const effectiveRows: ParsedExplicitRow[] =
    variant === "table-choice-matrix"
      ? parsedRows.map((r) => {
          if (r.cells.length === 2 && !r.cells[0].isBlank) {
            const splitOpts = splitChoicesFromCellText(r.cells[1].text);
            if (splitOpts && splitOpts.length >= 2 && splitOpts.length <= 6) {
              return {
                ...r,
                cells: [
                  r.cells[0],
                  ...splitOpts.map((opt) => ({
                    text: `□ ${opt}`,
                    isBlank: false,
                    ownerNodeId: r.cells[1].ownerNodeId,
                    cellIndex: r.cells[1].cellIndex,
                    hasPipe: r.cells[1].hasPipe,
                  })),
                ],
              };
            }
          }
          return r;
        })
      : parsedRows;

  // 3) 4열(2×N) 쌍 압축 또는 적층형(table-stacked-box) 전처리
  if (variant === "table-stacked-box") {
    const colWidths = splitUniformPercents(6, 100);
    const stackedRows: Array<{ rowId: string; cells: TableCellSlotDef[] }> = [];
    let lastGroupId: string | null = null;

    effectiveRows.forEach((r, rIdx) => {
      if (r.groupParent && r.groupParent.node.id !== lastGroupId) {
        lastGroupId = r.groupParent.node.id;
        stackedRows.push({
          rowId: `${blockId}_st_grp_${r.groupParent.node.id}`,
          cells: [
            makeCell(
              `${blockId}_stg_${r.groupParent.node.id}`,
              r.groupParent.node.id,
              `stg_${r.groupParent.node.id}`,
              r.groupParent.text,
              formatExplicitCellHtml(r.groupParent.text),
              { nodeId: r.groupParent.node.id, field: "text" },
              { bg: "#e2e8f0", weight: "700", align: "center", colSpan: 6, padding: "5px 8px" }
            ),
          ],
        });
      }

      if (r.cells.length === 2 && !r.cells[0].isBlank && !isChoiceCellText(r.cells[0].text)) {
        stackedRows.push({
          rowId: `${blockId}_st_lbl_${r.rowNode.id}_${rIdx}`,
          cells: [
            makeCell(
              `${blockId}_stl_${r.rowNode.id}_${rIdx}`,
              r.cells[0].ownerNodeId,
              `stl_${r.rowNode.id}_${rIdx}`,
              r.cells[0].text,
              formatExplicitCellHtml(r.cells[0].text),
              makeSlotTarget(r.cells[0]),
              {
                bg: r.groupParent ? "#f1f5f9" : "#e2e8f0",
                weight: r.groupParent ? "600" : "700",
                align: "left",
                colSpan: 6,
                padding: "4px 8px",
              }
            ),
          ],
        });
        stackedRows.push({
          rowId: `${blockId}_st_box_${r.rowNode.id}_${rIdx}`,
          cells: [
            makeCell(
              `${blockId}_stb_${r.rowNode.id}_${rIdx}`,
              r.cells[1].ownerNodeId,
              `stb_${r.rowNode.id}_${rIdx}`,
              r.cells[1].isBlank ? `${r.cells[0].text} 기입란` : r.cells[1].text,
              formatExplicitCellHtml(r.cells[1].text),
              makeSlotTarget(r.cells[1]),
              { colSpan: 6, padding: "8px 10px" }
            ),
          ],
        });
      } else {
        const spans = distributeSpan(6, r.cells.length);
        const nextRow = effectiveRows[rIdx + 1];
        const isHdrRow =
          (r.cells.length === 1 && !r.cells[0].isBlank) ||
          (nextRow &&
            nextRow.cells.length === r.cells.length &&
            nextRow.cells.every((c) => c.isBlank));
        stackedRows.push({
          rowId: `${blockId}_st_raw_${r.rowNode.id}_${rIdx}`,
          cells: r.cells.map((c, cIdx) =>
            makeCell(
              `${blockId}_str_${r.rowNode.id}_${rIdx}_${cIdx}`,
              c.ownerNodeId,
              `str_${r.rowNode.id}_${rIdx}_${cIdx}`,
              c.isBlank ? "기입란" : c.text,
              formatExplicitCellHtml(c.text),
              makeSlotTarget(c),
              {
                colSpan: spans[cIdx],
                bg: isHdrRow ? "#e2e8f0" : undefined,
                weight: isHdrRow ? "700" : undefined,
                align: isHdrRow && r.cells.length > 1 ? "center" : isChoiceCellText(c.text) ? "center" : "left",
              }
            )
          ),
        });
      }
    });

    return {
      blockId,
      kind: "structured-table",
      title: "라벨 띠 + 전폭 기입 박스 적층형",
      columnWidths: colWidths,
      borderRules: HWP_BORDER_RULES,
      cellPadding: "5px 8px",
      rows: stackedRows,
    };
  }

  // 4) 4열(2×N) 쌍 압축 변형: 연속된 2칸 행(label | val)을 한 줄에 2쌍(4칸)으로 압축
  const hasExplicitMergeTokens = effectiveRows.some((r) =>
    r.cells.some((c) => c.isMergeUp || c.isMergeLeft)
  );
  const finalRows: ParsedExplicitRow[] = [];
  if (variant === "table-grid-4col" && !hasExplicitMergeTokens) {
    let i = 0;
    while (i < effectiveRows.length) {
      const cur = effectiveRows[i];
      const nxt = effectiveRows[i + 1];
      const canPair = (row: ParsedExplicitRow | undefined): row is ParsedExplicitRow =>
        Boolean(
          row &&
            row.cells.length === 2 &&
            !row.cells[0].isBlank &&
            !isChoiceCellText(row.cells[0].text) &&
            (row.cells[1].isBlank || row.cells[1].text.length <= 24) &&
            !row.cells[1].text.includes("□")
        );
      const sameGroup =
        cur?.groupParent?.node.id === nxt?.groupParent?.node.id;
      if (canPair(cur) && canPair(nxt) && sameGroup) {
        finalRows.push({
          rowNode: cur.rowNode,
          cells: [...cur.cells, ...nxt.cells],
          ...(cur.groupParent
            ? {
                groupParent: {
                  ...cur.groupParent,
                  rowSpan: Math.ceil(cur.groupParent.rowSpan / 2),
                },
              }
            : null),
        });
        i += 2;
      } else {
        finalRows.push(cur);
        i += 1;
      }
    }
    // Recompute exact rowSpan for grouped rows after pairing
    const grpCounts = new Map<string, number>();
    for (const r of finalRows) {
      if (r.groupParent) {
        grpCounts.set(r.groupParent.node.id, (grpCounts.get(r.groupParent.node.id) ?? 0) + 1);
      }
    }
    const seenGrp = new Set<string>();
    for (const r of finalRows) {
      if (r.groupParent) {
        const gid = r.groupParent.node.id;
        r.groupParent.isFirstInGroup = !seenGrp.has(gid);
        r.groupParent.rowSpan = grpCounts.get(gid) ?? 1;
        seenGrp.add(gid);
      }
    }
  } else {
    finalRows.push(...effectiveRows);
  }

  // 5) 공통 명시적 행/열 격자 빌더 (table-checkbox, table-header-below, table-banner-rows, table-grid-4col, table-choice-matrix, table-2col-kv, table-3col-notes)
  const hasGroupCol = !isBannerMode && finalRows.some((r) => Boolean(r.groupParent));
  const groupRightCounts = finalRows
    .filter((r) => Boolean(r.groupParent) && r.cells.length > 1)
    .map((r) => r.cells.length);
  const firstRow = finalRows[0];
  const hasAlignedTopGroupHeader =
    hasGroupCol &&
    Boolean(firstRow) &&
    !firstRow.groupParent &&
    firstRow.cells.length >= 2 &&
    !firstRow.cells.some((c) => c.isBlank || isChoiceCellText(c.text)) &&
    (groupRightCounts.length === 0 || groupRightCounts.includes(firstRow.cells.length - 1));
  const nonGroupMultiCounts = finalRows
    .filter((r, idx) => !r.groupParent && r.cells.length > 1 && !(hasAlignedTopGroupHeader && idx === 0))
    .map((r) => r.cells.length);

  let gridTotalCols = 1;
  let columnWidths: string[] = ["100%"];

  if (hasGroupCol) {
    const alignedHeaderRight = hasAlignedTopGroupHeader ? [firstRow.cells.length - 1] : [];
    const canUse5ColGroup =
      groupRightCounts.every((c) => c === 2 || c === 4) &&
      nonGroupMultiCounts.every((c) => c === 2) &&
      alignedHeaderRight.every((c) => c === 2 || c === 4);
    if (canUse5ColGroup) {
      gridTotalCols = 5;
      columnWidths = hasNotesCol
        ? ["17%", "15%", "20%", "14%", "20%", "14%"]
        : ["19%", "17%", "24%", "15%", "25%"];
    } else {
      const rightLcm = lcmOfCounts(
        [...groupRightCounts, ...nonGroupMultiCounts, ...alignedHeaderRight],
        12
      );
      gridTotalCols = 1 + Math.max(1, rightLcm);
      columnWidths = hasNotesCol
        ? ["17%", ...splitUniformPercents(gridTotalCols - 1, 70), "13%"]
        : ["19%", ...splitUniformPercents(gridTotalCols - 1, 81)];
    }
  } else {
    const distinctMulti = Array.from(new Set(nonGroupMultiCounts));
    const isPair4Col =
      distinctMulti.every((c) => c === 2 || c === 4) &&
      distinctMulti.includes(4) &&
      finalRows.some(
        (r) =>
          r.cells.length === 4 &&
          !r.cells[0].isBlank &&
          r.cells[1].isBlank &&
          !r.cells[2].isBlank &&
          r.cells[3].isBlank
      );
    const isPure2ColKv =
      distinctMulti.length === 1 &&
      distinctMulti[0] === 2 &&
      finalRows.every((r) => r.cells.length <= 2) &&
      !finalRows.some((r) => r.cells.every((c) => isChoiceCellText(c.text)));

    if (isPair4Col) {
      gridTotalCols = 4;
      columnWidths = hasNotesCol
        ? ["22%", "22%", "18%", "24%", "14%"]
        : ["24%", "26%", "22%", "28%"];
    } else if (isPure2ColKv) {
      gridTotalCols = 2;
      columnWidths = hasNotesCol ? ["26%", "56%", "18%"] : ["28%", "72%"];
    } else {
      gridTotalCols = Math.max(1, lcmOfCounts(distinctMulti, 24));
      columnWidths = hasNotesCol
        ? [...splitUniformPercents(gridTotalCols, 86), "14%"]
        : splitUniformPercents(gridTotalCols, 100);
    }
  }

  // 일반 다열 데이터 표(모든 행이 동일한 열 개수 >= 3, 첫 행에 [-] 및 □ 없음)는 1행을 헤더로 취급
  const isUniformDataTable =
    !hasGroupCol &&
    finalRows.length >= 2 &&
    finalRows.every((r) => r.cells.length === finalRows[0].cells.length && r.cells.length >= 3) &&
    !finalRows[0].cells.some((c) => c.isBlank || isChoiceCellText(c.text));
  const isColumnHeaderStyle =
    isUniformDataTable || isModernFlat || isRosterLedger || variant === "table-eval-checklist";

  if (isUniformDataTable && gridTotalCols >= 3 && finalRows[0]?.cells.length === gridTotalCols) {
    columnWidths = hasNotesCol
      ? [...splitProportionalColumnWidths(finalRows, gridTotalCols, 86), "14%"]
      : splitProportionalColumnWidths(finalRows, gridTotalCols, 100);
  }

  interface PlacedGridCell {
    cell: TableCellSlotDef;
    anchorRow: number;
    colStart: number;
    colEnd: number;
  }

  const builtRows: Array<{ rowId: string; cells: TableCellSlotDef[] }> = [];
  const placedByRow: Array<Map<number, PlacedGridCell>> = [];
  let seenBannerGroupId: string | null = null;

  finalRows.forEach((r, rIdx) => {
    const nextRow = finalRows[rIdx + 1];
    const isFollowedByAllBlankSameCols =
      !isColumnHeaderStyle &&
      Boolean(nextRow) &&
      nextRow.cells.length === r.cells.length &&
      nextRow.cells.every((c) => c.isBlank || c.isMergeLeft || c.isMergeUp) &&
      !r.cells.every((c) => c.isBlank || c.isMergeLeft || c.isMergeUp);
    const prevRow = finalRows[rIdx - 1];
    const isTopOfGroupPair =
      variant === "table-header-below-matrix" &&
      Boolean(r.groupParent) &&
      (!prevRow || prevRow.groupParent?.node.id !== r.groupParent?.node.id) &&
      Boolean(nextRow) &&
      nextRow.groupParent?.node.id === r.groupParent?.node.id &&
      nextRow.cells.length === r.cells.length;
    const verticalBlankMatchCount =
      nextRow && nextRow.cells.length === r.cells.length
        ? r.cells.filter(
            (c, idx) =>
              !c.isBlank &&
              !c.isMergeLeft &&
              !c.isMergeUp &&
              !isChoiceCellText(c.text) &&
              Boolean(nextRow.cells[idx]?.isBlank)
          ).length
        : 0;
    const usesVerticalBlankColHeader = verticalBlankMatchCount >= 2;

    if (isBannerMode && r.groupParent && r.groupParent.node.id !== seenBannerGroupId) {
      seenBannerGroupId = r.groupParent.node.id;
      builtRows.push({
        rowId: `${blockId}_bn_${r.groupParent.node.id}`,
        cells: [
          makeCell(
            `${blockId}_bnc_${r.groupParent.node.id}`,
            r.groupParent.node.id,
            `bn_${r.groupParent.node.id}`,
            r.groupParent.text,
            formatExplicitCellHtml(r.groupParent.text, isPlainKvMode),
            { nodeId: r.groupParent.node.id, field: "text" },
            {
              colSpan: gridTotalCols + (hasNotesCol ? 1 : 0),
              bg: "#e2e8f0",
              weight: "700",
              align: "center",
            }
          ),
        ],
      });
    }

    const rowCells: TableCellSlotDef[] = [];
    const rowPlacements = new Map<number, PlacedGridCell>();
    const usesLeftGroupCell = Boolean(r.groupParent && !isBannerMode);

    if (usesLeftGroupCell && r.groupParent?.isFirstInGroup) {
      rowCells.push(
        makeCell(
          `${blockId}_grp_${r.groupParent.node.id}`,
          r.groupParent.node.id,
          `grp_${r.groupParent.node.id}`,
          r.groupParent.text,
          formatExplicitCellHtml(r.groupParent.text, isPlainKvMode),
          { nodeId: r.groupParent.node.id, field: "text" },
          {
            rowSpan: r.groupParent.rowSpan,
            bg: "#e2e8f0",
            weight: "700",
            align: "center",
          }
        )
      );
    }

    const availableSpan = usesLeftGroupCell ? Math.max(1, gridTotalCols - 1) : gridTotalCols;
    const k = r.cells.length;
    const isRowAlignedTopHeader = hasAlignedTopGroupHeader && rIdx === 0;
    let spans: number[];
    if (k === 1) {
      spans = [availableSpan];
    } else if (isRowAlignedTopHeader) {
      spans = [1, ...distributeSpan(Math.max(1, gridTotalCols - 1), k - 1)];
    } else if (!usesLeftGroupCell && gridTotalCols === 4 && k === 2 && !isChoiceCellText(r.cells[0].text)) {
      spans = [1, 3];
    } else if (
      !usesLeftGroupCell &&
      k === 2 &&
      gridTotalCols >= 4 &&
      !r.cells.every((c) => isChoiceCellText(c.text)) &&
      !r.cells[0].isBlank &&
      (r.cells[1].isBlank || !isFollowedByAllBlankSameCols)
    ) {
      const leftSpan = Math.max(1, Math.round(gridTotalCols * 0.25));
      spans = [leftSpan, gridTotalCols - leftSpan];
    } else if (usesLeftGroupCell && k === 2) {
      const leftSpan = 1;
      spans = [leftSpan, Math.max(1, availableSpan - leftSpan)];
    } else {
      spans = distributeSpan(availableSpan, k);
    }

    let gridCursor = usesLeftGroupCell ? 1 : 0;
    let lastBuiltPlacement: PlacedGridCell | null = null;
    let activeUpMergedPlacement: PlacedGridCell | null = null;

    r.cells.forEach((c, cIdx) => {
      const cellSpan = spans[cIdx] ?? 1;
      const colStart = gridCursor;
      const colEnd = colStart + cellSpan;
      gridCursor = colEnd;

      // 1) 가로 병합 토큰 `[<]` 처리
      if (c.isMergeLeft) {
        if (
          activeUpMergedPlacement &&
          colStart >= activeUpMergedPlacement.colStart &&
          colEnd <= activeUpMergedPlacement.colEnd
        ) {
          for (let g = colStart; g < colEnd; g += 1) {
            rowPlacements.set(g, activeUpMergedPlacement);
          }
          return;
        }
        if (lastBuiltPlacement) {
          lastBuiltPlacement.cell.colSpan =
            (lastBuiltPlacement.cell.colSpan ?? 1) + cellSpan;
          lastBuiltPlacement.colEnd = colEnd;
          for (let g = colStart; g < colEnd; g += 1) {
            rowPlacements.set(g, lastBuiltPlacement);
          }
          return;
        }
      }

      activeUpMergedPlacement = null;

      // 2) 세로 병합 토큰 `[^]` 처리 (직전 행과 수직 경계가 일치할 때만 병합해 사각형 구조 보장)
      if (c.isMergeUp && rIdx > 0) {
        const upper = placedByRow[rIdx - 1]?.get(colStart);
        let lookaheadEnd = colEnd;
        let peek = cIdx + 1;
        while (peek < r.cells.length && r.cells[peek].isMergeLeft) {
          lookaheadEnd += spans[peek] ?? 1;
          peek += 1;
        }
        if (
          upper &&
          upper.colStart === colStart &&
          upper.anchorRow < rIdx &&
          (upper.colEnd === colEnd || upper.colEnd === lookaheadEnd)
        ) {
          upper.cell.rowSpan = rIdx - upper.anchorRow + 1;
          activeUpMergedPlacement = upper;
          for (let g = colStart; g < colEnd; g += 1) {
            rowPlacements.set(g, upper);
          }
          return;
        }
      }

      const nextCell = r.cells[cIdx + 1];
      const isMergeMetaToken = Boolean(c.isMergeUp || c.isMergeLeft);
      const isSingleRowBand = k === 1 && !c.isBlank && !isMergeMetaToken && !usesLeftGroupCell;
      const isDataTableHeader = (isUniformDataTable && rIdx === 0) || isRowAlignedTopHeader;
      const isVerticalColLabel =
        usesVerticalBlankColHeader &&
        !c.isBlank &&
        !isMergeMetaToken &&
        !isChoiceCellText(c.text) &&
        Boolean(nextRow?.cells[cIdx]?.isBlank);
      const hasMergeLeftHeader =
        !c.isBlank &&
        !isMergeMetaToken &&
        !isChoiceCellText(c.text) &&
        Boolean(nextCell?.isMergeLeft) &&
        Boolean(nextRow) &&
        !isFollowedByAllBlankSameCols;
      const isPairedLabel =
        !isColumnHeaderStyle &&
        !c.isBlank &&
        !isMergeMetaToken &&
        !isChoiceCellText(c.text) &&
        ((nextCell?.isBlank ?? false) ||
          (k === 2 &&
            cIdx === 0 &&
            !r.cells.every((x) => isChoiceCellText(x.text))));

      const isLabelCell =
        !isMergeMetaToken &&
        !c.isBlank &&
        (isSingleRowBand ||
          isFollowedByAllBlankSameCols ||
          isTopOfGroupPair ||
          isDataTableHeader ||
          isVerticalColLabel ||
          hasMergeLeftHeader ||
          isPairedLabel);

      const bg = isLabelCell
        ? isBannerMode && !isSingleRowBand
          ? "#ffffff"
          : isDataTableHeader
            ? headerCellBg
            : usesLeftGroupCell
              ? "#f1f5f9"
              : headerCellBg
        : undefined;
      const weight: "600" | "700" | undefined = isLabelCell
        ? usesLeftGroupCell
          ? "600"
          : "700"
        : undefined;
      const align: "left" | "center" =
        isSingleRowBand
          ? variant === "table-header-below" || variant === "table-header-below-matrix"
            ? "left"
            : "center"
          : isDataTableHeader && isModernFlat
            ? "left"
            : isFollowedByAllBlankSameCols ||
                isTopOfGroupPair ||
                isDataTableHeader ||
                isVerticalColLabel ||
                hasMergeLeftHeader
              ? "center"
              : isPairedLabel
                ? "center"
                : isChoiceCellText(c.text) && k >= 2 && r.cells.every((x) => isChoiceCellText(x.text))
                  ? "center"
                  : "left";

      const treatAsBlankHtml = c.isBlank || isMergeMetaToken;
      const builtCell = makeCell(
        `${blockId}_c_${r.rowNode.id}_${rIdx}_${cIdx}`,
        c.ownerNodeId,
        `c_${r.rowNode.id}_${rIdx}_${cIdx}`,
        treatAsBlankHtml ? "기입란" : c.text,
        treatAsBlankHtml ? "<p><br/></p>" : formatExplicitCellHtml(c.text, isPlainKvMode),
        makeSlotTarget(c),
        {
          colSpan: cellSpan,
          isHeader: isDataTableHeader || undefined,
          bg,
          weight,
          align,
          ...(isRosterLedger ? { fontSize: "10.5px", padding: "4px 6px" } : null),
        }
      );
      rowCells.push(builtCell);

      const placement: PlacedGridCell = {
        cell: builtCell,
        anchorRow: rIdx,
        colStart,
        colEnd,
      };
      lastBuiltPlacement = placement;
      for (let g = colStart; g < colEnd; g += 1) {
        rowPlacements.set(g, placement);
      }
    });

    placedByRow.push(rowPlacements);

    if (hasNotesCol) {
      rowCells.push(buildNoteCell(r.rowNode, rIdx));
    }

    builtRows.push({
      rowId: `${blockId}_r_${r.rowNode.id}_${rIdx}`,
      cells: rowCells,
    });
  });

  if (builtRows.length === 0) {
    builtRows.push({
      rowId: `${blockId}_empty`,
      cells: [
        makeCell(
          `${blockId}_empty_c`,
          firstNodeId,
          "empty",
          "빈 표",
          "<p><br/></p>",
          { nodeId: firstNodeId, field: "text" },
          { colSpan: gridTotalCols }
        ),
      ],
    });
  }

  const titleByVariant: Partial<Record<BlockVariantId, string>> = {
    "table-grouped-compare": "1. 좌측 대분류 세로 병합(rowSpan) 비교표",
    "table-modern-flat": "2. 모던 수평 비교표 (구글문서 스타일)",
    "table-roster-ledger": "3. 다열 실무 현황·관리대장형",
    "table-header-below-matrix": "4. 상하 2단 라벨·값 가로 비교 매트릭스",
    "table-eval-checklist": "5. 내용 + 우측 체크/평가 품평표",
    "table-header-below": "상하 2단 (위 헤더 · 아래 기입칸) 격자",
    "table-grid-4col": "4열 (2×N) 그룹 내 쌍 압축 격자표",
    "table-choice-matrix": "선택지 셀 분할 체크 매트릭스",
    "table-banner-rows": "상하 배너 · 블록 분할 표",
    "table-2col-kv": "2열 표준 기준표",
    "table-3col-notes": "3열 확장표",
    "table-checkbox": "□ 체크 서식 표",
  };

  return {
    blockId,
    kind: "structured-table",
    title: titleByVariant[variant] ?? "구조화 입력 양식 표",
    columnWidths,
    borderRules: tableBorderRules,
    cellPadding: isModernFlat ? "6px 10px" : isRosterLedger ? "4px 6px" : "5px 8px",
    rows: builtRows,
  };
}

const TEMPLATE_VALUE_PLACEHOLDER_REGEX =
  /^\{\{(?:.*_값|상세요약.*|값_\d+|명칭_\d+|지표_\d+|내용_\d+|일정_\d+|비고_값)\}\}$/;

function formatTemplatePreviewHtml(rawHtml: string): string {
  const text = rawHtml.replace(/<[^>]+>/g, "").trim();
  if (!text) return "<p><br/></p>";
  if (TEMPLATE_VALUE_PLACEHOLDER_REGEX.test(text)) {
    return "<p><br/></p>";
  }
  const cleaned = text
    .replace(/\{\{([^}]+)\}\}/g, (_m, inner: string) => inner.replaceAll("_", " "))
    .trim();
  if (!cleaned) return "<p><br/></p>";
  return `<p>${escapeHtml(cleaned)}</p>`;
}

/**
 * 에셋의 `templateSnippet`(`<<template:table>>`) 자체를 `buildDynamicTableVariantBlock` 으로
 * 렌더링해 에셋 허브 카드에서 "실제 빈칸 표 썸네일"로 보여준다.
 */
export function buildAssetTemplatePreviewTable(
  asset: BlockAssetMeta
): { block: StructuredTableBlockDef; slots: Record<string, VDocSlot> } | null {
  if (!asset.templateSnippet) return null;
  const tplNodes = parseThreeRuleTextToNodes(asset.templateSnippet, `tpl_${asset.id}`);
  if (tplNodes.length === 0) return null;

  const slots: Record<string, VDocSlot> = {};
  const block = buildDynamicTableVariantBlock(
    `tpl_preview_${asset.id}`,
    tplNodes,
    asset.id,
    (_nodeId, slotId, label, defaultHtml) => {
      slots[slotId] = {
        slotId,
        label,
        role: "editable-slot",
        content: formatTemplatePreviewHtml(defaultHtml),
        backDataRefs: [],
        isEdited: false,
      };
      return slotId;
    }
  );
  if (block.kind !== "structured-table") return null;
  return { block, slots };
}

function isMultiSelectPrompt(label: string): boolean {
  return /복수|최대|해당|특이사항|대여 시 희망/.test(label);
}

function flattenNaiveItems(items: readonly NaiveTableItem[]): NaiveTableItem[] {
  const out: NaiveTableItem[] = [];
  for (const item of items) {
    if (item.kind === "group") {
      out.push(...flattenNaiveItems(item.items));
    } else {
      out.push(item);
    }
  }
  return out;
}

function buildExplicitWebFormFields(validRows: readonly PlaygroundNode[]): WebFormFieldDef[] {
  const fields: WebFormFieldDef[] = [];
  const parsedRows = parseExplicitTableRows(validRows);

  const allTwoColPopulated =
    parsedRows.length >= 2 &&
    parsedRows.every(
      (r) =>
        !r.groupParent &&
        r.cells.length === 2 &&
        !r.cells[0].isBlank &&
        !r.cells[1].isBlank &&
        !r.cells[1].text.includes("□") &&
        !r.cells[1].text.includes("/")
    );

  let i = 0;
  while (i < parsedRows.length) {
    const cur = parsedRows[i];
    const nxt = parsedRows[i + 1];

    // 1) 1셀 제목 행 + 다음 행이 선택지(□ ...) 나열인 경우 → single-choice / multi-choice 문항 1개로 결합
    if (
      cur.cells.length === 1 &&
      !cur.cells[0].isBlank &&
      nxt &&
      nxt.cells.length >= 2 &&
      nxt.cells.every((c) => isChoiceCellText(c.text))
    ) {
      const label = cur.cells[0].text;
      fields.push({
        fieldId: cur.rowNode.id,
        label,
        inputKind: isMultiSelectPrompt(label) ? "multi-choice" : "single-choice",
        options: nxt.cells.map((c) => c.text.replace(/^□\s*/, "").trim()),
        helperText: cur.rowNode.note || undefined,
      });
      i += 2;
      continue;
    }

    // 2) 다열 헤더 행 + 다음 행이 모두 [-] 빈 칸인 경우 → multi-input 문항 1개로 결합
    if (
      cur.cells.length >= 2 &&
      !cur.cells.some((c) => c.isBlank || isChoiceCellText(c.text)) &&
      nxt &&
      nxt.cells.length === cur.cells.length &&
      nxt.cells.every((c) => c.isBlank)
    ) {
      fields.push({
        fieldId: cur.rowNode.id,
        label: cur.cells.map((c) => c.text).join(" / "),
        inputKind: "multi-input",
        subFields: cur.cells.map((c, idx) => ({
          id: `${cur.rowNode.id}_c${idx}`,
          label: c.text,
          value: "",
        })),
      });
      i += 2;
      continue;
    }

    // 3) 4칸 쌍 행 (파트 | [-] | 직급 | [-]) → multi-input
    if (
      cur.cells.length >= 4 &&
      cur.cells.length % 2 === 0 &&
      !cur.cells[0].isBlank &&
      cur.cells[1].isBlank
    ) {
      const subFields: { id: string; label: string; value: string }[] = [];
      for (let p = 0; p < cur.cells.length; p += 2) {
        const lbl = cur.cells[p];
        const val = cur.cells[p + 1];
        if (!lbl.isBlank) {
          subFields.push({
            id: `${cur.rowNode.id}_p${p}`,
            label: lbl.text,
            value: val && !val.isBlank ? val.text : "",
          });
        }
      }
      if (subFields.length > 0) {
        fields.push({
          fieldId: cur.rowNode.id,
          label: subFields.map((s) => s.label).join(" / "),
          inputKind: "multi-input",
          subFields,
        });
        i += 1;
        continue;
      }
    }

    // 4) 2칸 행 (라벨 | 값 또는 선택지 또는 [-])
    if (cur.cells.length === 2) {
      const key = cur.cells[0].text;
      const valCell = cur.cells[1];
      const choices = valCell.isBlank ? null : splitChoicesFromCellText(valCell.text);
      if (choices && choices.length > 0) {
        fields.push({
          fieldId: cur.rowNode.id,
          label: key,
          inputKind: isMultiSelectPrompt(key) ? "multi-choice" : "single-choice",
          options: choices,
          helperText: cur.rowNode.note || undefined,
        });
      } else if (
        !valCell.isBlank &&
        (allTwoColPopulated ||
          (parsedRows.length <= 4 && /부서|대상|기한|방식|일시/.test(key)))
      ) {
        fields.push({
          fieldId: cur.rowNode.id,
          label: key,
          inputKind: "info-kv",
          value: valCell.text,
        });
      } else {
        fields.push({
          fieldId: cur.rowNode.id,
          label: key,
          inputKind: "text",
          value: valCell.isBlank ? undefined : valCell.text,
          helperText: cur.rowNode.note || undefined,
        });
      }
      i += 1;
      continue;
    }

    // 5) 단일 셀 등 기타 행
    const first = cur.cells[0];
    if (first && !first.isBlank) {
      const choices = splitChoicesFromCellText(first.text);
      if (choices && choices.length > 0) {
        fields.push({
          fieldId: cur.rowNode.id,
          label: first.text,
          inputKind: "single-choice",
          options: choices,
        });
      } else {
        fields.push({
          fieldId: cur.rowNode.id,
          label: first.text,
          inputKind: "text",
          helperText: cur.rowNode.note || undefined,
        });
      }
    }
    i += 1;
  }

  return fields;
}

function buildWebFormFieldsFromRows(validRows: readonly PlaygroundNode[]): WebFormFieldDef[] {
  const nonViewRows = validRows.filter((r) => !isViewDirectiveNode(r));
  const semanticItems = flattenNaiveItems(parseNaiveTableSemantics(nonViewRows));
  if (semanticItems.length === 0) {
    return buildExplicitWebFormFields(nonViewRows);
  }

  const allSimpleKv =
    semanticItems.length >= 2 && semanticItems.every((it) => it.kind === "kv");
  const fields: WebFormFieldDef[] = [];
  let idx = 0;

  while (idx < semanticItems.length) {
    const item = semanticItems[idx];

    if (item.kind === "explicit-node") {
      const batch: PlaygroundNode[] = [item.node];
      while (idx + 1 < semanticItems.length && semanticItems[idx + 1].kind === "explicit-node") {
        idx += 1;
        batch.push((semanticItems[idx] as { kind: "explicit-node"; node: PlaygroundNode }).node);
      }
      fields.push(...buildExplicitWebFormFields(batch));
      idx += 1;
      continue;
    }

    if (item.kind === "choice") {
      fields.push({
        fieldId: item.node.id,
        label: item.label,
        inputKind: isMultiSelectPrompt(item.label) ? "multi-choice" : "single-choice",
        options: item.options,
        helperText: item.node.note || undefined,
      });
    } else if (item.kind === "multi-input") {
      fields.push({
        fieldId: item.node.id,
        label: item.columns.join(" / "),
        inputKind: "multi-input",
        subFields: item.columns.map((col, cIdx) => ({
          id: `${item.node.id}_c${cIdx}`,
          label: col,
          value: "",
        })),
      });
    } else if (item.kind === "kv") {
      const isInfoKv =
        allSimpleKv ||
        (semanticItems.length <= 4 && /부서|대상|기한|방식|일시/.test(item.label));
      fields.push({
        fieldId: item.node.id,
        label: item.label,
        inputKind: isInfoKv ? "info-kv" : "text",
        value: item.value,
      });
    } else {
      fields.push({
        fieldId: item.node.id,
        label: item.label,
        inputKind: "text",
        helperText: item.node.note || undefined,
      });
    }

    idx += 1;
  }

  return fields;
}

export function buildWebFormVariantBlock(
  blockId: string,
  validRows: readonly PlaygroundNode[],
  variant: WebFormVariant,
  registerSlot: RegisterSlotFn,
  sectionTitle?: string,
  badge?: string,
  omitHeaderSlot = false
): LayoutBlock {
  const firstNodeId = validRows[0]?.id ?? blockId;
  const fields = buildWebFormFieldsFromRows(validRows);
  const titleText = sectionTitle?.trim() || "웹 설문 문항";
  const headerSlotId = omitHeaderSlot
    ? undefined
    : registerSlot(
        firstNodeId,
        `pg_slot_${blockId}_wf_hdr`,
        "설문 구역 제목",
        `<p><strong>${escapeHtml(titleText)}</strong></p>`,
        { nodeId: firstNodeId, field: "note" }
      );

  return {
    blockId,
    kind: "web-form",
    title: titleText,
    variant,
    ...(headerSlotId ? { headerSlotId } : {}),
    badge,
    fields,
  };
}

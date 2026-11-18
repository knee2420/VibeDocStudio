/**
 * 아웃라인 실험용 더미 — 같은 회의록을 "의미 단위" 뼈대로 다시 짠 것.
 * 노드 하나 = 이름 잘 지은 함수 하나: 이름(무엇) · 의도(여기서 말할 것) · 형식(Phase 2) · 내용 채움(Phase 3) · 근거.
 * 표는 칸이 아니라 노드 하나이고, 열 이름이 함수 인자처럼 fields 로 붙는다. 2단 그리드 · 표지 같은 틀은 형식일 뿐 노드가 아니다.
 */

export type FormKind = "form" | "meta" | "text" | "table" | "list" | "twocol" | "nested" | "sign" | "flow" | "title";

/** 이름이 어디서 왔나 — 현실적으로 자동 이름이 얼마나 되는지 보려고 */
export type NameFrom = "plan" | "template" | "label" | "kind" | "ai" | "human";

export interface OForm {
  kind: FormKind;
  /** "표 3열 × 3행", "2단 · 사진 2장" */
  label: string;
}

export interface ONode {
  id: string;
  /** null = 이름이 없다 (지금 앱은 여기에 안내문 · 틀 이름이 보였다) */
  name: string | null;
  /** 지금 앱 트리에 보이던 이름 — 비교용 */
  was?: string;
  /** 여기서 말할 것 (Phase 1) */
  intent: string;
  /** 형식 (Phase 2) */
  form?: OForm;
  /** 표 열 · 양식 칸 이름 — 함수 인자처럼 */
  fields?: string[];
  /** 내용이 채워진 정도 0~1 (Phase 3) */
  fill: number;
  blanks: number;
  cites: number;
  /** 출처 없는 주장 수 */
  noCite?: number;
  /** 캔버스 위치 */
  anchor?: string;
  /** 쪽 노드 — 쪽마다 다른 양식 문서라 쪽이 곧 절 */
  page?: string;
  /** AI 제안 (흐리게) */
  ghost?: boolean;
  /** AI 가 제안하는 이름 */
  suggestName?: string;
  /** 이름 출처 (기획 · 서식 정의 · 칸 머리글 · 종류) — 없으면 이름 필요 */
  nameFrom?: NameFrom;
  /** 고정 글 (서식 제목 · 안내문 · 법정 문구) — 채울 것이 없다 */
  fixed?: boolean;
  /** 신청인이 아니라 기관이 쓰는 칸 */
  office?: boolean;
  /** 칸(속성)에 이미 든 값 — 없으면 빈칸 */
  values?: Record<string, string>;
  children?: ONode[];
}

export const OUTLINE_DOC = {
  title: "10월 4주차 아키텍처 정례 회의록",
  purpose: "위원회가 정한 구조 결정과 근거, 다음 할 일을 남긴다",
  others: ["대만 가오슝 여행 지도 주요 구역 추천 코스 모음집", "[시스템 구현 안내서] VibeDocStudio 사용성 검증 디자인 목업 구축"],
};

export const OUTLINE_TREE: ONode[] = [
  {
    id: "p1",
    page: "1쪽",
    name: "회의 개요와 핵심 의결",
    was: "Page 1 · 회의 개요 및 핵심 의결사항 매트릭스",
    intent: "10월 4주차 위원회에서 무엇을 정했는지 한 쪽에",
    form: { kind: "form", label: "정례 회의록 양식 GSV-01" },
    fill: 0.72,
    blanks: 8,
    cites: 5,
    noCite: 1,
    children: [
      {
        id: "n-meta",
        name: "회의 정보",
        was: "회의 기본 메타데이터",
        intent: "언제 · 누가 · 어떤 기조로 모였나",
        form: { kind: "meta", label: "정보 표 3칸" },
        fields: ["일시", "주관", "핵심 기조"],
        fill: 1,
        blanks: 0,
        cites: 0,
        anchor: "meta",
      },
      {
        id: "n-sum",
        name: "결론 요약",
        was: "핵심 협의 및 결의사항 본문 슬롯",
        intent: "무엇을 왜 정했나 — 한 문단",
        form: { kind: "text", label: "글 한 문단" },
        fill: 1,
        blanks: 0,
        cites: 1,
        anchor: "summary",
      },
      {
        id: "n-dec",
        name: "핵심 결의사항",
        was: "회의 개요 및 핵심 결론 2단 그리드",
        intent: "결정 3가지와 각각의 근거",
        form: { kind: "text", label: "제목 + 글" },
        fill: 0.9,
        blanks: 0,
        cites: 3,
        anchor: "decisions",
        children: [
          { id: "n-dec1", name: "코어 + 플러그인 구조로 간다", intent: "거대 모놀리식 대신 고른 이유", fill: 1, blanks: 0, cites: 1, anchor: "decisions" },
          { id: "n-dec2", name: "칸(슬롯) 단위로 나눈다", intent: "Kolas 검증에서 나온 수치", fill: 1, blanks: 0, cites: 1, anchor: "decisions" },
          { id: "n-dec3", name: "LibreOffice 코어 도입은 보류", intent: "빌드 비용 때문에 미룬 사정", fill: 0.7, blanks: 0, cites: 1, anchor: "decisions" },
          { id: "g-dec4", ghost: true, name: "합의 안 된 쟁점", intent: "보류된 안과 반대 의견도 남긴다", fill: 0, blanks: 0, cites: 0 },
        ],
      },
      {
        id: "n-table",
        name: "영역별 결정과 담당",
        was: "[표] 레이어별 오픈소스 발췌 합체 결정사항 표 (+ 행 3개 · 칸 6개)",
        intent: "결정마다 내용과 담당자를 한눈에",
        form: { kind: "table", label: "표 3열 × 3행" },
        fields: ["항목", "내용", "담당"],
        fill: 0.8,
        blanks: 0,
        cites: 2,
        noCite: 1,
        anchor: "table",
      },
      {
        id: "n-action",
        name: "다음 주 실행 과제",
        was: "차주 핵심 실행 과제 (Action Items)",
        intent: "누가 · 언제까지 · 무엇을",
        form: { kind: "list", label: "할 일 목록 3줄" },
        fields: ["할 일", "담당", "기한"],
        fill: 0,
        blanks: 3,
        cites: 0,
        anchor: "actions",
      },
      {
        id: "n-photo",
        name: null,
        was: "회의 개요 및 핵심 결론 2단 그리드 › 사진 표지 › 표지 제목 · 표지 부제",
        suggestName: "회의 현장 사진",
        intent: "",
        form: { kind: "twocol", label: "2단 · 사진 표지 2개" },
        fill: 0,
        blanks: 4,
        cites: 0,
        anchor: "photos",
      },
      { id: "g-next", ghost: true, name: "다음 회의 안건", intent: "이번에 못 다룬 것 · 다음에 정할 것", fill: 0, blanks: 0, cites: 0 },
    ],
  },
  {
    id: "p2",
    page: "2쪽",
    name: "반상회 회의록",
    was: "Page 2 · 반상회 회의록 (예스폼 07번 정밀 서식)",
    intent: "주민 안건 두 가지와 결의",
    form: { kind: "form", label: "예스폼 07번 회의록" },
    fill: 0.6,
    blanks: 5,
    cites: 0,
    anchor: "p2",
    children: [
      { id: "p2-1", name: "안건 1 · 주차 문제", intent: "불편 사례와 제안된 해결책", form: { kind: "text", label: "글" }, fill: 1, blanks: 0, cites: 0, anchor: "p2" },
      { id: "p2-2", name: "안건 2 · 관리비 인상", intent: "인상 폭과 주민 의견", form: { kind: "text", label: "글" }, fill: 0.5, blanks: 2, cites: 0, anchor: "p2" },
      { id: "p2-3", name: "결의 사항", intent: "표결 결과", form: { kind: "table", label: "표 2열 × 2행" }, fields: ["안건", "결과"], fill: 0, blanks: 3, cites: 0, anchor: "p2" },
    ],
  },
  {
    id: "p3",
    page: "3쪽",
    name: "Atticus 인보이스",
    was: "Page 3 · Atticus Invoice #000081709",
    intent: "청구 내역과 합계",
    form: { kind: "form", label: "인보이스 양식" },
    fill: 1,
    blanks: 0,
    cites: 1,
    anchor: "p3",
    children: [
      { id: "p3-1", name: "청구처", intent: "누구에게 청구하나", form: { kind: "meta", label: "정보 표" }, fields: ["회사", "주소", "담당자"], fill: 1, blanks: 0, cites: 0, anchor: "p3" },
      { id: "p3-2", name: "청구 품목", intent: "무엇을 얼마에", form: { kind: "table", label: "표 4열 × 5행" }, fields: ["품목", "수량", "단가", "금액"], fill: 1, blanks: 0, cites: 1, anchor: "p3" },
    ],
  },
  {
    id: "p4",
    page: "4쪽",
    name: "학술정보운영위원회 규정",
    was: "Page 4 · 학술정보운영위원회 규정",
    intent: "위원회의 목적 · 구성 · 운영",
    form: { kind: "form", label: "규정 양식" },
    fill: 0.3,
    blanks: 6,
    cites: 0,
    anchor: "p4",
    children: [
      { id: "p4-1", name: "제1조 목적", intent: "왜 두는 위원회인가", form: { kind: "text", label: "조문" }, fill: 1, blanks: 0, cites: 0, anchor: "p4" },
      { id: "p4-2", name: "제2조 구성", intent: "위원 수와 임기", form: { kind: "text", label: "조문" }, fill: 0, blanks: 3, cites: 0, anchor: "p4" },
      { id: "p4-3", name: "제3조 운영", intent: "회의 소집과 의결 방법", form: { kind: "text", label: "조문" }, fill: 0, blanks: 3, cites: 0, anchor: "p4" },
    ],
  },
  {
    id: "p5",
    page: "5쪽",
    name: "설계 심사 결과",
    was: "Page 5 · 설계 심사회의록 (예스폼 51번 정밀 서식)",
    intent: "심사 의견과 보완 요청",
    form: { kind: "form", label: "예스폼 51번" },
    fill: 0.4,
    blanks: 4,
    cites: 0,
    anchor: "p5",
    children: [
      { id: "p5-1", name: "심사 의견", nameFrom: "label", intent: "위원별 의견", form: { kind: "text", label: "글" }, fill: 0.6, blanks: 1, cites: 0, anchor: "p5" },
      { id: "p5-2", name: "보완 요청", nameFrom: "label", intent: "고칠 것과 기한", form: { kind: "list", label: "목록" }, fill: 0, blanks: 3, cites: 0, anchor: "p5" },
    ],
  },
  {
    id: "p6",
    page: "6쪽",
    name: "시험 불참원",
    nameFrom: "label",
    was: "Page 6 · 시험 불참원",
    intent: "정기시험에 못 나오는 학생이 사유와 과목을 알리고 확인받는다",
    form: { kind: "form", label: "학교 서식 (PDF 가져옴)" },
    fill: 0,
    blanks: 58,
    cites: 0,
    anchor: "p6",
    children: [
      { id: "f1-title", name: "서식 제목", nameFrom: "kind", fixed: true, intent: "", form: { kind: "title", label: "제목 '시험 불참원'" }, fill: 1, blanks: 0, cites: 0, anchor: "f1-title" },
      {
        id: "f1-applicant",
        name: "신청인 정보",
        nameFrom: "label",
        was: "[표] 표 › 학과(부) · 본문 내용을 입력하세요. · 전공 · … (칸 12개)",
        intent: "누가 내는지",
        form: { kind: "meta", label: "정보 표 3행 × 2쌍" },
        fields: ["학과(부)", "전공", "학번", "학년", "성명", "연락처"],
        fill: 0,
        blanks: 6,
        cites: 0,
        anchor: "f1-applicant",
      },
      {
        id: "f1-reason",
        name: "불참 내용",
        nameFrom: "label",
        was: "1. 시험불참 기간 : · 2. 시험불참 사유 : · 3. 시험 교과목 : (글 3개)",
        intent: "언제 · 왜 · 어느 과목",
        form: { kind: "list", label: "번호 항목 3개" },
        fields: ["불참 기간", "불참 사유", "시험 교과목"],
        fill: 0,
        blanks: 3,
        cites: 0,
        anchor: "f1-reason",
      },
      {
        id: "f1-subjects",
        name: "시험 교과목 표",
        nameFrom: "label",
        was: "[표] 표 (2) › 번호 · 교과목 · … · 본문 내용을 입력하세요. ×40 (칸 54개)",
        intent: "불참하는 시험 과목마다 담당 · 일시 · 장소",
        form: { kind: "table", label: "표 6열 × 8행" },
        fields: ["번호", "교과목", "담당교수", "시험일", "교시", "시험장소 확인"],
        fill: 0,
        blanks: 40,
        cites: 0,
        anchor: "f1-subjects",
      },
      { id: "f1-notice", name: "유의 사항", nameFrom: "label", fixed: true, intent: "제출 기한 · 공결 인정 사유", form: { kind: "text", label: "※ 안내 2줄" }, fill: 1, blanks: 0, cites: 0, anchor: "f1-notice" },
      {
        id: "f1-sign",
        name: "신청 · 서명",
        nameFrom: "kind",
        was: "상기 사유로 … · 20 년 월 일 · 신청인 : (인) (글 3개)",
        intent: "날짜와 신청인 서명",
        form: { kind: "sign", label: "고정 문구 + 날짜 + 서명" },
        fields: ["신청일", "신청인 서명"],
        fill: 0,
        blanks: 2,
        cites: 0,
        anchor: "f1-sign",
      },
      {
        id: "f1-approval",
        name: null,
        suggestName: "확인 · 결재란",
        was: "[표] 표 (3) › 표 (4) › 전공주임교수 · 확인 (인) · 표 (5) › 결재 · 담당 · 주임 · 과장 · 처장 · 칸 4개 (중첩 표 3겹)",
        intent: "",
        office: true,
        form: { kind: "nested", label: "표 안의 표 · 확인 1 + 결재 4" },
        fields: ["전공주임교수 확인", "담당", "주임", "과장", "처장"],
        fill: 0,
        blanks: 5,
        cites: 0,
        anchor: "f1-approval",
      },
      { id: "f1-to", name: "수신", nameFrom: "kind", intent: "누구에게 내는지", form: { kind: "sign", label: "'____ 교수님 귀하'" }, fields: ["교수명"], fill: 0, blanks: 1, cites: 0, anchor: "f1-to" },
    ],
  },
  {
    id: "p7",
    page: "7쪽",
    name: "성적서 증명 교부신청서",
    nameFrom: "label",
    was: "Page 7 · 시험·분석·검정 성적서 증명 교부신청서",
    intent: "발급받은 시험 성적서의 증명본을 신청한다",
    form: { kind: "form", label: "법정 별지 제7호서식 (PDF 가져옴)" },
    fill: 0,
    blanks: 15,
    cites: 0,
    anchor: "p7",
    children: [
      { id: "f2-head", name: "서식 머리", nameFrom: "kind", fixed: true, intent: "근거 법령 · 작성 안내", form: { kind: "title", label: "별지 번호 + 제목 + ※ 안내" }, fill: 1, blanks: 0, cites: 0, anchor: "f2-head" },
      { id: "f2-receipt", name: "접수 정보", nameFrom: "label", office: true, intent: "기관이 접수할 때 쓴다", form: { kind: "meta", label: "정보 표 1행 (어두운 칸)" }, fields: ["접수번호", "접수일자", "처리기간"], values: { 처리기간: "즉시" }, fill: 0.33, blanks: 2, cites: 0, anchor: "f2-receipt" },
      {
        id: "f2-applicant",
        name: "신청인",
        nameFrom: "label",
        was: "[표] 표 (2) › 신청인 · 성명 · 본문 내용을 입력하세요. · 생년월일 · … (칸 15개, 세로 머리 병합)",
        intent: "누가 신청하는지 (개인 · 업체)",
        form: { kind: "nested", label: "세로 머리 '신청인' + 4행" },
        fields: ["성명", "생년월일", "주소", "업체명", "전화번호", "대표자", "사업자등록번호"],
        fill: 0,
        blanks: 7,
        cites: 0,
        anchor: "f2-applicant",
      },
      {
        id: "f2-test",
        name: null,
        suggestName: "증명할 성적서",
        was: "[표] 표 (3) › 시험 접수번호 · 본문 내용을 입력하세요. · 원본 발급 연월일 · … (칸 8개)",
        intent: "",
        form: { kind: "meta", label: "정보 표 4행" },
        fields: ["시험 접수번호", "원본 발급 연월일", "용도", "신청 부수"],
        fill: 0,
        blanks: 4,
        cites: 0,
        anchor: "f2-test",
      },
      {
        id: "f2-statement",
        name: "신청 문구 · 서명",
        nameFrom: "kind",
        intent: "법정 문구 + 날짜 + 서명 + 수신 기관",
        form: { kind: "sign", label: "법정 문구 + 서명 + '기술표준원장 귀하'" },
        fields: ["신청일", "신청인 서명"],
        fill: 0,
        blanks: 2,
        cites: 0,
        anchor: "f2-statement",
      },
      { id: "f2-fee", name: "수수료", nameFrom: "label", fixed: true, intent: "법령에 따른 수수료 안내", form: { kind: "meta", label: "정보 표 1행" }, fill: 1, blanks: 0, cites: 0, anchor: "f2-fee" },
      { id: "f2-flow", name: "처리 절차", nameFrom: "label", fixed: true, intent: "신청 → 접수 → 검토 → 결재 → 교부", form: { kind: "flow", label: "흐름도 5단계" }, fill: 1, blanks: 0, cites: 0, anchor: "f2-flow" },
    ],
  },
];

/** 지금 앱 트리 흉내 — 비교용 (Documents & Pages + Elements, 표가 행 · 칸까지 쪼개진다) */
export type CurIcon = "grid" | "text" | "table" | "image";
export interface CurRow {
  d: number;
  icon: CurIcon;
  t: string;
}

const PH = "본문 내용을 입력하세요.";
const cells = (depth: number, list: string[]): CurRow[] => list.map((t) => ({ d: depth, icon: "table", t }));
const texts = (depth: number, list: string[]): CurRow[] => list.map((t) => ({ d: depth, icon: "text", t }));

/** 표를 칸까지 쪼갠 모습: 머리 칸 + 행마다 칸 */
function tableRows(depth: number, header: string[], rows: number): CurRow[] {
  const out: CurRow[] = cells(depth, header);
  for (let r = 0; r < rows; r++) {
    header.forEach((_, c) => out.push({ d: depth, icon: "table", t: c === 0 ? String(r + 1) : c === 1 ? PH : `${PH} (${c})` }));
  }
  return out;
}

export const CURRENT_TREE: { pages: { id: string; t: string }[]; elements: Record<string, CurRow[]> } = {
  pages: [
    { id: "p1", t: "Page 1 · 회의 개요 및 핵심 의결사항 매트릭스" },
    { id: "p2", t: "Page 2 · 반상회 회의록 (예스폼 07번 정밀 서식)" },
    { id: "p3", t: "Page 3 · Atticus Invoice #000081709" },
    { id: "p4", t: "Page 4 · 학술정보운영위원회 규정" },
    { id: "p5", t: "Page 5 · 설계 심사회의록 (예스폼 51번 정밀 서식)" },
    { id: "p6", t: "Page 6 · 시험 불참원" },
    { id: "p7", t: "Page 7 · 시험·분석·검정 성적서 증명 교부신청서" },
  ],
  elements: {
    p1: [
      { d: 0, icon: "grid", t: "회의 개요 및 핵심 결론 2단 그리드" },
      ...texts(1, ["회의 기본 메타데이터", "핵심 협의 및 결의사항 본문 슬롯"]),
      { d: 0, icon: "table", t: "[표] 레이어별 오픈소스 발췌 합체 결정사항 표" },
      { d: 1, icon: "table", t: PH },
      ...cells(2, [PH, `${PH} (2)`]),
      { d: 1, icon: "table", t: PH },
      ...cells(2, [PH, `${PH} (2)`]),
      { d: 1, icon: "table", t: PH },
      ...cells(2, [PH, `${PH} (2)`]),
      { d: 0, icon: "text", t: "차주 핵심 실행 과제 (Action Items)" },
      { d: 0, icon: "image", t: "사진 표지" },
      ...cells(1, ["표지 제목", "표지 부제"]),
      { d: 0, icon: "grid", t: "회의 개요 및 핵심 결론 2단 그리드" },
      ...texts(1, ["회의 기본 메타데이터", "핵심 아키텍처 결론 요약"]),
    ],
    p6: [
      { d: 0, icon: "text", t: "시 험 불 참 원" },
      { d: 0, icon: "table", t: "[표] 표" },
      ...cells(1, ["학과(부)", PH, "전 공", `${PH} (2)`, "학 번", PH, "학 년", `${PH} (2)`, "성 명", PH, "연락처", `${PH} (2)`]),
      ...texts(0, ["1. 시험불참 기간 : 20 . . . ~ . .", "2. 시험불참 사유 :", "3. 시험 교과목 :"]),
      { d: 0, icon: "table", t: "[표] 표 (2)" },
      ...tableRows(1, ["번호", "교과목", "담당교수", "시험일", "교시", "시험장소 확인"], 8),
      ...texts(0, ["※ 시험 불참 사유 발생 시 시험일로부터 7일 이내 …", "※ 공결 인정 사유 : 1) 본인 질병으로 …", "상기 사유로 정기시험에 불참하여 …", "20 년 월 일", "신청인 : ____________ (인)"]),
      { d: 0, icon: "table", t: "[표] 표 (3)" },
      { d: 1, icon: "table", t: "[표] 표 (4)" },
      ...cells(2, ["전공주임교수", "확 인 (인)"]),
      { d: 1, icon: "table", t: "[표] 표 (5)" },
      ...cells(2, ["결 재", "담 당", "주 임", "과 장", "처 장", PH, `${PH} (2)`, `${PH} (3)`, `${PH} (4)`]),
      { d: 0, icon: "text", t: "____ 교수님 귀하" },
    ],
    p7: [
      ...texts(0, ["■ 국가표준기본법 시행규칙 [별지 제7호서식] …", "시험 · 분석 · 검정 성적서 증명 교부신청서", "※ 색상이 어두운 칸은 신청인이 작성하지 않습니다."]),
      { d: 0, icon: "table", t: "[표] 표" },
      ...cells(1, ["접수번호", PH, "접수일자", "처리기간 즉시"]),
      { d: 0, icon: "table", t: "[표] 표 (2)" },
      ...cells(1, ["신청인", "성명", PH, "생년월일", `${PH} (2)`, "주소", PH, "업체명", PH, "전화번호", `${PH} (2)`, "대표자", PH, "사업자등록번호", `${PH} (2)`]),
      { d: 0, icon: "table", t: "[표] 표 (3)" },
      ...cells(1, ["시험 접수번호", PH, "원본 발급 연월일", PH, "용도", PH, "신청 부수", PH]),
      { d: 0, icon: "table", t: "[표] 표 (4)" },
      ...cells(1, ["「국가표준기본법 시행규칙」 제18조제3항에 따라 …"]),
      { d: 0, icon: "table", t: "[표] 표 (5)" },
      ...cells(1, ["수수료", "「국가표준기본법 시행규칙」 별표에 따른 수수료"]),
      ...texts(0, ["처 리 절 차", "신청서 작성", "신청인", "접 수", "처리기관", "검 토", "처리기관", "결 재", "처리기관", "증명서 교부", "처리기관", "210mm×297mm[일반용지 60g/㎡(재활용품)]"]),
    ],
  },
};

/**
 * O6 — 예스폼식 서식 데이터 스키마 더미 (리서치: reports/예스폼 서식 분류와 AI 작성.md).
 * 서식 메타 = 예스폼식 상품 메타 + 법제처 별표서식(licbyl)식 법정 메타.
 * 칸(슬롯) = 사람이 읽는 데이터 키(`신청인.성명`) · 타입 · 누가 쓰나(filledBy) · AI 가능(aiFillable) · 근거(evidence).
 * 표는 칸이 아니라 반복 행 `교과목[]` 의 열 정의. 고정 글은 채울 칸이 없고 AI 에게 "규칙 · 문맥" 으로 준다.
 */

export type SlotType = "text" | "longtext" | "date" | "period" | "number" | "phone" | "idno" | "choice" | "check" | "sign" | "image";
export type FilledBy = "applicant" | "agency" | "approver" | "author";

export interface SchemaSlot {
  /** 데이터 키 — HWPX 누름틀 · 셀 이름, DOCX w:tag, PDF /T 에 그대로 쓴다 */
  key: string;
  /** 사람용 이름 — DOCX w:alias, PDF /TU */
  label: string;
  type: SlotType;
  filledBy: FilledBy;
  /** AI 가 채워도 되나 (민감정보 · 서명 · 기관 칸은 false) */
  aiFillable: boolean;
  sensitive?: boolean;
  required?: boolean;
  /** 누름틀 안내문 · placeholder */
  guide?: string;
  /** 이미 든 값 */
  value?: string;
  /** AI 채우기 미리보기 값 + 근거 */
  aiSample?: string;
  evidence?: string[];
  options?: string[];
}

export type GroupKind = "fields" | "repeat" | "fixed" | "sign" | "approval" | "image";

export interface SchemaGroup {
  id: string;
  name: string;
  kind: GroupKind;
  /** 캔버스 위치 */
  anchor: string;
  /** 반복 행: 키 접두어 `교과목[]` · 행 수 */
  repeat?: { key: string; rows: number };
  /** 고정 글을 AI 에게 줄 규칙 · 문맥 한 줄씩 */
  rules?: string[];
  slots: SchemaSlot[];
}

export interface TemplateMeta {
  id: string;
  title: string;
  /** 예스폼 division 호환 트리 경로 */
  categoryPath: { code: string; name: string }[];
  /** 이름공간 패싯 */
  facets: string[];
  tags: string[];
  tier: "free" | "paid" | "premium";
  extent: string;
  purpose: string;
  formats: string[];
  origin: string;
  legal?: {
    formNo: string;
    formKind: "별표" | "서식" | "별지" | "별도" | "부록";
    law: string;
    ministry: string;
    revision: string;
    detailUrl: string;
  };
}

export interface TemplateSchema {
  pageId: string;
  meta: TemplateMeta;
  groups: SchemaGroup[];
}

const A = "applicant" as const;

export const SCHEMAS: TemplateSchema[] = [
  {
    pageId: "p1",
    meta: {
      id: "tpl_gsv01_minutes",
      title: "정례 회의록 (GSV-01)",
      categoryPath: [
        { code: "A11", name: "문서서식" },
        { code: "A11B11", name: "회사서식" },
        { code: "A11B11C11", name: "기획/전략" },
      ],
      facets: ["role:architect", "role:pm", "situation:weekly-meeting", "industry:it"],
      tags: ["회의록", "의사결정", "아키텍처"],
      tier: "free",
      extent: "1p",
      purpose: "위원회의 결정과 근거 · 다음 할 일을 남긴다",
      formats: ["vdoc", "hwpx", "docx", "pdf"],
      origin: "Phase 1 기획 → Phase 2 서식 배정",
    },
    groups: [
      {
        id: "n-meta",
        name: "회의 정보",
        kind: "fields",
        anchor: "meta",
        slots: [
          { key: "회의.일시", label: "일시", type: "date", filledBy: "author", aiFillable: true, required: true, value: "2026-10-28 14:00" },
          { key: "회의.주관", label: "주관", type: "text", filledBy: "author", aiFillable: true, value: "아키텍처 위원회" },
          { key: "회의.기조", label: "핵심 기조", type: "text", filledBy: "author", aiFillable: true, value: "PandaDoc 80% + 백데이터/인라인 AI 20%" },
        ],
      },
      {
        id: "n-sum",
        name: "결론 요약",
        kind: "fields",
        anchor: "summary",
        slots: [{ key: "결론.요약", label: "Executive Summary", type: "longtext", filledBy: "author", aiFillable: true, value: "코어 + 플러그인 구조로 합의 …", evidence: ["회의 녹취록 p.3"] }],
      },
      {
        id: "n-table",
        name: "영역별 결정과 담당",
        kind: "repeat",
        anchor: "table",
        repeat: { key: "결정[]", rows: 3 },
        slots: [
          { key: "결정[].항목", label: "항목", type: "text", filledBy: "author", aiFillable: true, value: "구조 · 예산 · 효과" },
          { key: "결정[].내용", label: "내용", type: "longtext", filledBy: "author", aiFillable: true, value: "코어 + 플러그인 …", evidence: ["회의 녹취록 p.3", "예산 집행 현황표"] },
          { key: "결정[].담당", label: "담당", type: "text", filledBy: "author", aiFillable: false, sensitive: true, value: "김민지 · 이도윤 · 박서준" },
        ],
      },
      {
        id: "n-action",
        name: "다음 주 실행 과제",
        kind: "repeat",
        anchor: "actions",
        repeat: { key: "할일[]", rows: 3 },
        slots: [
          { key: "할일[].내용", label: "할 일", type: "text", filledBy: "author", aiFillable: true, guide: "항목을 입력하세요", aiSample: "플러그인 API 초안 작성", evidence: ["회의 녹취록 p.5"] },
          { key: "할일[].담당", label: "담당", type: "text", filledBy: "author", aiFillable: true, aiSample: "김민지", evidence: ["회의 녹취록 p.5"] },
          { key: "할일[].기한", label: "기한", type: "date", filledBy: "author", aiFillable: true, aiSample: "2026-11-04" },
        ],
      },
      {
        id: "n-photo",
        name: "회의 현장 사진",
        kind: "image",
        anchor: "photos",
        slots: [
          { key: "사진[].이미지", label: "사진", type: "image", filledBy: "author", aiFillable: false },
          { key: "사진[].제목", label: "표지 제목", type: "text", filledBy: "author", aiFillable: true, guide: "제목", aiSample: "10월 4주차 위원회" },
        ],
      },
    ],
  },
  {
    pageId: "p6",
    meta: {
      id: "tpl_exam_absence",
      title: "시험 불참원",
      categoryPath: [
        { code: "A11", name: "문서서식" },
        { code: "A11B14", name: "교육행정 서식" },
      ],
      facets: ["role:student", "situation:exam-absence", "season:midterm", "season:final"],
      tags: ["시험", "공결", "불참", "학사"],
      tier: "free",
      extent: "1p",
      purpose: "정기시험에 못 나오는 사유와 과목을 알리고 공결 확인을 받는다",
      formats: ["hwp", "docx", "pdf"],
      origin: "PDF 가져옴 → 칸 머리글로 키 생성",
    },
    groups: [
      {
        id: "f1-title",
        name: "서식 제목",
        kind: "fixed",
        anchor: "f1-title",
        rules: ["문서 종류: 시험 불참원 (학생 → 담당 교수)"],
        slots: [],
      },
      {
        id: "f1-applicant",
        name: "신청인",
        kind: "fields",
        anchor: "f1-applicant",
        slots: [
          { key: "신청인.학과", label: "학과(부)", type: "text", filledBy: A, aiFillable: true, required: true, aiSample: "컴퓨터공학과", evidence: ["학생 프로필"] },
          { key: "신청인.전공", label: "전공", type: "text", filledBy: A, aiFillable: true, aiSample: "소프트웨어", evidence: ["학생 프로필"] },
          { key: "신청인.학번", label: "학번", type: "idno", filledBy: A, aiFillable: false, sensitive: true, required: true },
          { key: "신청인.학년", label: "학년", type: "choice", filledBy: A, aiFillable: true, options: ["1", "2", "3", "4"], aiSample: "3", evidence: ["학생 프로필"] },
          { key: "신청인.성명", label: "성명", type: "text", filledBy: A, aiFillable: false, sensitive: true, required: true },
          { key: "신청인.연락처", label: "연락처", type: "phone", filledBy: A, aiFillable: false, sensitive: true },
        ],
      },
      {
        id: "f1-reason",
        name: "불참 내용",
        kind: "fields",
        anchor: "f1-reason",
        slots: [
          { key: "불참.기간", label: "시험불참 기간", type: "period", filledBy: A, aiFillable: true, required: true, guide: "20 . . . ~ . .", aiSample: "2026.10.20 ~ 10.24", evidence: ["진단서.pdf p.1"] },
          { key: "불참.사유", label: "시험불참 사유", type: "longtext", filledBy: A, aiFillable: true, required: true, aiSample: "독감으로 입원 치료 (진단서 첨부)", evidence: ["진단서.pdf p.1"] },
          { key: "불참.과목요약", label: "시험 교과목", type: "text", filledBy: A, aiFillable: true, aiSample: "아래 표 3과목" },
        ],
      },
      {
        id: "f1-subjects",
        name: "시험 교과목",
        kind: "repeat",
        anchor: "f1-subjects",
        repeat: { key: "교과목[]", rows: 8 },
        slots: [
          { key: "교과목[].번호", label: "번호", type: "number", filledBy: A, aiFillable: true, value: "1 … 8 (자동)" },
          { key: "교과목[].교과목명", label: "교과목", type: "text", filledBy: A, aiFillable: true, required: true, aiSample: "자료구조 · 운영체제 · 확률통계", evidence: ["시간표.xlsx"] },
          { key: "교과목[].담당교수", label: "담당교수", type: "text", filledBy: A, aiFillable: true, aiSample: "김OO · 이OO · 박OO", evidence: ["시간표.xlsx"] },
          { key: "교과목[].시험일", label: "시험일", type: "date", filledBy: A, aiFillable: true, aiSample: "10.21 · 10.22 · 10.24", evidence: ["학사일정.pdf"] },
          { key: "교과목[].교시", label: "교시", type: "number", filledBy: A, aiFillable: true, aiSample: "2 · 3 · 1", evidence: ["시간표.xlsx"] },
          { key: "교과목[].장소확인", label: "시험장소 확인", type: "check", filledBy: "approver", aiFillable: false },
        ],
      },
      {
        id: "f1-notice",
        name: "유의 사항",
        kind: "fixed",
        anchor: "f1-notice",
        rules: ["제출 기한: 시험일로부터 7일 이내, 증빙서류 첨부", "공결 인정 사유: 본인 입원 · 직계 가족 사망 · 병역 의무 (각 증빙)"],
        slots: [],
      },
      {
        id: "f1-sign",
        name: "신청 · 서명",
        kind: "sign",
        anchor: "f1-sign",
        rules: ["고정 문구: 상기 사유로 정기시험에 불참하여 제출함"],
        slots: [
          { key: "신청.일자", label: "신청일", type: "date", filledBy: A, aiFillable: true, guide: "20 년 월 일", aiSample: "2026.10.27 (오늘)" },
          { key: "신청인.서명", label: "신청인 (인)", type: "sign", filledBy: A, aiFillable: false, required: true },
        ],
      },
      {
        id: "f1-approval",
        name: "확인 · 결재",
        kind: "approval",
        anchor: "f1-approval",
        slots: [
          { key: "확인.전공주임교수", label: "전공주임교수 확인 (인)", type: "sign", filledBy: "approver", aiFillable: false },
          { key: "결재.담당", label: "담당", type: "sign", filledBy: "agency", aiFillable: false },
          { key: "결재.주임", label: "주임", type: "sign", filledBy: "agency", aiFillable: false },
          { key: "결재.과장", label: "과장", type: "sign", filledBy: "agency", aiFillable: false },
          { key: "결재.처장", label: "처장", type: "sign", filledBy: "agency", aiFillable: false },
        ],
      },
      {
        id: "f1-to",
        name: "수신",
        kind: "fields",
        anchor: "f1-to",
        slots: [{ key: "수신.교수명", label: "____ 교수님 귀하", type: "text", filledBy: A, aiFillable: true, aiSample: "김OO", evidence: ["시간표.xlsx"] }],
      },
    ],
  },
  {
    pageId: "p7",
    meta: {
      id: "tpl_kats_cert_copy",
      title: "시험 · 분석 · 검정 성적서 증명 교부신청서",
      categoryPath: [
        { code: "A11", name: "문서서식" },
        { code: "A11B12", name: "법률서식" },
      ],
      facets: ["industry:manufacturing", "role:qa-manager", "situation:certificate-request"],
      tags: ["성적서", "시험", "증명", "국가표준"],
      tier: "free",
      extent: "1p",
      purpose: "발급받은 시험 성적서의 증명본을 신청한다",
      formats: ["hwp", "pdf"],
      origin: "법정 서식 · PDF 가져옴",
      legal: {
        formNo: "별지 제7호서식",
        formKind: "별지",
        law: "국가표준기본법 시행규칙",
        ministry: "산업통상자원부 (국가기술표준원)",
        revision: "2017. 7. 26. 개정",
        detailUrl: "law.go.kr/법령/국가표준기본법시행규칙",
      },
    },
    groups: [
      {
        id: "f2-head",
        name: "서식 머리",
        kind: "fixed",
        anchor: "f2-head",
        rules: ["법정 서식: 국가표준기본법 시행규칙 별지 제7호서식", "어두운 칸은 신청인이 적지 않음 → filledBy: agency"],
        slots: [],
      },
      {
        id: "f2-receipt",
        name: "접수",
        kind: "fields",
        anchor: "f2-receipt",
        slots: [
          { key: "접수.번호", label: "접수번호", type: "text", filledBy: "agency", aiFillable: false },
          { key: "접수.일자", label: "접수일자", type: "date", filledBy: "agency", aiFillable: false },
          { key: "접수.처리기간", label: "처리기간", type: "text", filledBy: "agency", aiFillable: false, value: "즉시" },
        ],
      },
      {
        id: "f2-applicant",
        name: "신청인",
        kind: "fields",
        anchor: "f2-applicant",
        slots: [
          { key: "신청인.성명", label: "성명", type: "text", filledBy: A, aiFillable: false, sensitive: true, required: true },
          { key: "신청인.생년월일", label: "생년월일", type: "date", filledBy: A, aiFillable: false, sensitive: true },
          { key: "신청인.주소", label: "주소", type: "text", filledBy: A, aiFillable: true, aiSample: "경기도 OO시 OO로 12", evidence: ["사업자등록증.pdf"] },
          { key: "신청인.업체명", label: "업체명", type: "text", filledBy: A, aiFillable: true, aiSample: "(주)바이브테크", evidence: ["사업자등록증.pdf"] },
          { key: "신청인.전화번호", label: "전화번호", type: "phone", filledBy: A, aiFillable: true, aiSample: "031-000-0000", evidence: ["사업자등록증.pdf"] },
          { key: "신청인.대표자", label: "대표자", type: "text", filledBy: A, aiFillable: true, aiSample: "홍OO", evidence: ["사업자등록증.pdf"] },
          { key: "신청인.사업자등록번호", label: "사업자등록번호", type: "idno", filledBy: A, aiFillable: true, aiSample: "123-45-67890", evidence: ["사업자등록증.pdf"] },
        ],
      },
      {
        id: "f2-test",
        name: "증명할 성적서",
        kind: "fields",
        anchor: "f2-test",
        slots: [
          { key: "성적서.시험접수번호", label: "시험 접수번호", type: "text", filledBy: A, aiFillable: true, required: true, aiSample: "KT-2026-04417", evidence: ["시험성적서_원본.pdf p.1"] },
          { key: "성적서.원본발급일", label: "원본 발급 연월일", type: "date", filledBy: A, aiFillable: true, aiSample: "2026.09.15", evidence: ["시험성적서_원본.pdf p.1"] },
          { key: "성적서.용도", label: "용도", type: "text", filledBy: A, aiFillable: true, aiSample: "해외 바이어 제출용" },
          { key: "성적서.신청부수", label: "신청 부수", type: "number", filledBy: A, aiFillable: true, aiSample: "2" },
        ],
      },
      {
        id: "f2-statement",
        name: "신청 · 서명 · 수신",
        kind: "sign",
        anchor: "f2-statement",
        rules: ["법정 문구: 「국가표준기본법 시행규칙」에 따라 증명 교부를 신청함", "수신: 기술표준원장 (고정)"],
        slots: [
          { key: "신청.일자", label: "신청일", type: "date", filledBy: A, aiFillable: true, aiSample: "2026.10.27 (오늘)" },
          { key: "신청인.서명", label: "신청인 (서명 또는 인)", type: "sign", filledBy: A, aiFillable: false, required: true },
        ],
      },
      {
        id: "f2-fee",
        name: "수수료",
        kind: "fixed",
        anchor: "f2-fee",
        rules: ["수수료: 시행규칙 별표 기준 (기관 안내)"],
        slots: [],
      },
      {
        id: "f2-flow",
        name: "처리 절차",
        kind: "fixed",
        anchor: "f2-flow",
        rules: ["신청인 작성 → 접수 → 검토 → 결재 → 증명서 교부 (처리기관)"],
        slots: [],
      },
    ],
  },
];

export const schemaOf = (pageId: string) => SCHEMAS.find((s) => s.pageId === pageId);

/** AI 에게 넘기는 모양 — 서식 메타 + 규칙 + 칸 (값 · 비어 있음 · 근거 · 권한). 실제로는 요청마다 만든다. */
export function aiView(s: TemplateSchema) {
  return {
    template: {
      id: s.meta.id,
      title: s.meta.title,
      category: s.meta.categoryPath.map((c) => c.name).join(" > "),
      facets: s.meta.facets,
      purpose: s.meta.purpose,
      ...(s.meta.legal ? { legal: { form: s.meta.legal.formNo, law: s.meta.legal.law, ministry: s.meta.legal.ministry, source: s.meta.legal.detailUrl } } : {}),
    },
    rules: s.groups.flatMap((g) => g.rules ?? []),
    groups: s.groups
      .filter((g) => g.slots.length)
      .map((g) => ({
        group: g.name,
        ...(g.repeat ? { repeat: `${g.repeat.key} × ${g.repeat.rows}` } : {}),
        slots: g.slots.map((sl) => ({
          key: sl.key,
          type: sl.type,
          by: sl.filledBy,
          ai: sl.aiFillable ? "fill" : sl.sensitive ? "never (민감정보)" : "never",
          ...(sl.required ? { required: true } : {}),
          ...(sl.value ? { value: sl.value } : { empty: true }),
          ...(sl.guide ? { guide: sl.guide } : {}),
          ...(sl.options ? { options: sl.options } : {}),
        })),
      })),
  };
}

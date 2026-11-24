/**
 * 목업 데이터 — 신생 카드사 "클로드 카드"의 2030 첫 신용카드 상품안내장 (A4 8쪽).
 * 회사 · 상품 · 수치는 모두 지어낸 것. 레퍼런스 대응표는 받은 안내장 8종(7곳)을 읽고 요약한 것.
 */

export type Unit = "identity" | "summary" | "benefit" | "overseas" | "criteria" | "fee" | "notice";

export const UNIT_NAME: Record<Unit, string> = {
  identity: "상품 정체성",
  summary: "혜택 요약",
  benefit: "혜택 상세",
  overseas: "해외 이용",
  criteria: "제공 기준 (실적 · 제외)",
  fee: "연회비 · 발급",
  notice: "법정 · 공통 고지",
};

/* ── ③ 채우기 상태 ── */
export type Fill = "ok" | "draft" | "risk" | "ref";

export type Block =
  | { id: string; kind: "hero"; label: string; title: string; sub: string; fill: Fill; src: string }
  | { id: string; kind: "heading"; label: string; text: string; fill: Fill; src: string }
  | { id: string; kind: "text"; label: string; text: string; fill: Fill; src: string; why?: string }
  | { id: string; kind: "callout"; label: string; text: string; tone: "info" | "warn"; fill: Fill; src: string; why?: string }
  | { id: string; kind: "cards"; label: string; items: { title: string; body: string }[]; fill: Fill; src: string }
  | { id: string; kind: "table"; label: string; rows: string[][]; numeric?: number[]; fill: Fill; src: string; why?: string };

export interface Page {
  id: string;
  no: number;
  title: string;
  unit: Unit;
  /** ① 에서 쓴 의도 한 줄 */
  intent: string;
  /** 따른 레퍼런스 */
  follows: string;
  blocks: Block[];
}

const PLAN = "기획안 v1";
const SPEC = "혜택 정의서 v1";
const REFW = "레퍼런스 구조를 따라 새로 씀";

export const PAGES: Page[] = [
  {
    id: "p1",
    no: 1,
    title: "표지 · 한 줄 약속",
    unit: "identity",
    intent: "무슨 카드인지 3초 안에",
    follows: "KB · 현대 — 표지에 혜택 셋",
    blocks: [
      { id: "p1-hero", kind: "hero", label: "표지", title: "클로드 카드 2030", sub: "내 하루에 맞춰 매달 바꾸는, 처음 만드는 신용카드", fill: "ok", src: PLAN },
      {
        id: "p1-three",
        kind: "cards",
        label: "핵심 혜택 셋",
        items: [
          { title: "구독 30%", body: "OTT · 음악 · 생산성 정기결제" },
          { title: "라이프 팩 10%", body: "배달 · 카페 · 운동 중 매달 하나" },
          { title: "해외 수수료 0원", body: "국제브랜드 · 해외서비스 수수료 면제" },
        ],
        fill: "ok",
        src: PLAN,
      },
      { id: "p1-note", kind: "text", label: "표지 안내", text: "2027년 3월 출시 기준입니다. 자세한 조건은 각 쪽과 8쪽 '꼭 알아 두세요'를 확인하세요.", fill: "ok", src: PLAN },
    ],
  },
  {
    id: "p2",
    no: 2,
    title: "혜택 한눈에",
    unit: "summary",
    intent: "다섯 혜택을 표 한 장으로",
    follows: "삼성 '서비스 제공 기준' 표 · 현대 '혜택' 쪽",
    blocks: [
      { id: "p2-h", kind: "heading", label: "혜택 한눈에", text: "혜택 한눈에", fill: "ok", src: SPEC },
      {
        id: "p2-t",
        kind: "table",
        label: "혜택 요약표",
        rows: [
          ["혜택", "할인", "월 한도 (1 · 2 · 3구간)", "조건"],
          ["구독 할인", "30%", "5천 · 8천 · 1만 2천원", "정기결제 등록"],
          ["간편결제 할인", "5–10%", "6천 · 1만 · 1만 5천원", "구독과 중복 불가"],
          ["라이프 팩", "10%", "5천 · 8천 · 1만원", "매달 하나"],
          ["해외 이용 수수료", "면제", "없음", "조건 없음"],
          ["공항 라운지", "연 2회", "—", "전월 60만원 이상"],
        ],
        numeric: [1, 2],
        fill: "ok",
        src: SPEC,
      },
      {
        id: "p2-persona",
        kind: "cards",
        label: "이런 분께",
        items: [
          { title: "구독이 많은 분", body: "구독을 이 카드로 모으면 매달 30%" },
          { title: "배달 · 카페가 잦은 분", body: "라이프 팩 + 간편결제를 함께" },
          { title: "해외 결제가 있는 분", body: "수수료 0원, 60만원이면 라운지 2회" },
        ],
        fill: "draft",
        src: PLAN,
      },
      {
        id: "p2-ex",
        kind: "table",
        label: "한 달 예시",
        rows: [
          ["2구간(전월 70만원) 예시", "쓴 돈", "할인"],
          ["구독 (OTT 2 · 음악 · 노션)", "4만원", "8천원"],
          ["간편결제 (클로드페이)", "15만원", "1만원"],
          ["라이프 팩 · 배달", "9만원", "8천원"],
          ["한 달 합계", "28만원", "2만 6천원"],
        ],
        numeric: [1, 2],
        fill: "draft",
        src: SPEC,
      },
    ],
  },
  {
    id: "p3",
    no: 3,
    title: "구독 · 간편결제 할인",
    unit: "benefit",
    intent: "2030 지출 1 · 2위",
    follows: "우리 카드의정석2 PAY — 결제 수단별",
    blocks: [
      { id: "p3-h1", kind: "heading", label: "구독 할인 30%", text: "구독 할인 30%", fill: "ok", src: SPEC },
      {
        id: "p3-t1",
        kind: "table",
        label: "구독 대상",
        rows: [
          ["영역", "대상", "건당 한도"],
          ["OTT", "넷플릭스 · 티빙 · 디즈니+ · 웨이브", "5천원"],
          ["음악", "멜론 · 스포티파이 · 유튜브 프리미엄", "5천원"],
          ["생산성", "노션 · 클로드 Pro · 어도비", "5천원"],
        ],
        numeric: [2],
        fill: "ok",
        src: SPEC,
      },
      { id: "p3-h2", kind: "heading", label: "간편결제 할인", text: "간편결제 할인", fill: "ok", src: SPEC },
      {
        id: "p3-t2",
        kind: "table",
        label: "간편결제 대상",
        rows: [
          ["결제 수단", "할인율", "통합 월 한도"],
          ["클로드페이", "10%", "6천 · 1만 · 2만원"],
          ["네이버페이 · 카카오페이 · 토스페이", "5%", "위와 통합"],
        ],
        numeric: [1, 2],
        fill: "risk",
        src: SPEC,
        why: "3구간 '2만원'이 혜택 정의서 표 2(1만 5천원)와 다름 — 근거 없는 숫자",
      },
      { id: "p3-dup", kind: "callout", label: "중복 적용", text: "구독 할인 대상 가맹점은 간편결제 할인에서 빠져요. 건당 할인한도 2천원.", tone: "warn", fill: "ok", src: SPEC },
    ],
  },
  {
    id: "p4",
    no: 4,
    title: "라이프 팩 — 매달 하나",
    unit: "benefit",
    intent: "고정 혜택 대신 고르는 혜택",
    follows: "KB YOU Prime — 팩 택1",
    blocks: [
      { id: "p4-h", kind: "heading", label: "라이프 팩", text: "라이프 팩 — 이번 달 내 생활에 맞게", fill: "ok", src: PLAN },
      { id: "p4-lead", kind: "text", label: "소개", text: "배달 · 카페 · 운동 중 하나를 고르면 그 영역에서 10%. 앱에서 매달 말일까지 다음 달 팩을 바꿀 수 있어요.", fill: "draft", src: PLAN },
      {
        id: "p4-packs",
        kind: "cards",
        label: "팩 세 가지",
        items: [
          { title: "배달 팩 10%", body: "배달의민족 · 쿠팡이츠 · 요기요 (앱 내 결제)" },
          { title: "카페 팩 10%", body: "스타벅스 · 메가MGC커피 · 투썸플레이스" },
          { title: "운동 팩 10%", body: "헬스 · 필라테스 · 요가, 클래스101" },
        ],
        fill: "ok",
        src: SPEC,
      },
      {
        id: "p4-limit",
        kind: "table",
        label: "팩 월 한도",
        rows: [
          ["전월 실적", "1구간", "2구간", "3구간"],
          ["월 할인한도", "5천원", "8천원", "1만원"],
        ],
        numeric: [1, 2, 3],
        fill: "ok",
        src: SPEC,
      },
      { id: "p4-tip", kind: "callout", label: "팩 바꾸기", text: "고르지 않으면 지난달 팩이 이어져요. 처음엔 배달 팩으로 시작해요.", tone: "info", fill: "ok", src: PLAN },
    ],
  },
  {
    id: "p5",
    no: 5,
    title: "여행 · 해외",
    unit: "overseas",
    intent: "해외 수수료 0 · 라운지",
    follows: "현대 '우대 서비스' · 우리 PAY 8쪽",
    blocks: [
      { id: "p5-h", kind: "heading", label: "여행 · 해외", text: "여행 · 해외", fill: "ok", src: SPEC },
      {
        id: "p5-t",
        kind: "table",
        label: "해외 혜택",
        rows: [
          ["항목", "내용", "조건"],
          ["해외 이용 수수료", "국제브랜드 1% · 해외서비스 0.25% 면제", "조건 없음"],
          ["공항 라운지", "국내외 공항 라운지 연 2회 (본인)", "전월 60만원 이상"],
        ],
        fill: "ok",
        src: SPEC,
      },
      { id: "p5-calc", kind: "text", label: "청구금액", text: "해외 이용 시 청구금액 = 거래미화금액 × 접수일 전신환 매도율. 수수료가 면제돼 이 금액만 청구돼요.", fill: "draft", src: REFW },
      {
        id: "p5-tips",
        kind: "cards",
        label: "떠나기 전에",
        items: [
          { title: "1. PIN 확인", body: "6자리를 물으면 비밀번호 4자리 + 00" },
          { title: "2. 현지통화로", body: "원화 결제는 환전 수수료가 한 번 더" },
          { title: "3. 라운지 QR", body: "앱 › 혜택 › 공항 라운지에서 이용권" },
        ],
        fill: "ok",
        src: PLAN,
      },
      { id: "p5-dcc", kind: "callout", label: "원화결제 차단", text: "앱 › 해외 이용 설정 › 원화결제 차단을 켜 두세요.", tone: "warn", fill: "ref", src: REFW },
    ],
  },
  {
    id: "p6",
    no: 6,
    title: "실적 기준 · 할인 제외",
    unit: "criteria",
    intent: "얼마 쓰면 얼마 — 빠지는 것까지",
    follows: "우리 카드의정석2 PAY 5–6쪽",
    blocks: [
      { id: "p6-h", kind: "heading", label: "실적 기준", text: "실적 기준 · 할인 제외", fill: "ok", src: SPEC },
      {
        id: "p6-t",
        kind: "table",
        label: "실적 구간",
        rows: [
          ["구간", "전월 이용금액 (승인일 기준)"],
          ["1구간", "30만원 이상 60만원 미만"],
          ["2구간", "60만원 이상 100만원 미만"],
          ["3구간", "100만원 이상"],
        ],
        fill: "ok",
        src: SPEC,
      },
      { id: "p6-ex", kind: "text", label: "제외 대상", text: "무이자할부 · 현금서비스 · 카드론 · 수수료와 이자 · 연회비 · 국세 · 지방세 · 공과금 · 관리비 · 상품권 · 선불 충전 · 취소 매출은 실적과 할인에서 빠져요.", fill: "ref", src: REFW },
      {
        id: "p6-first",
        kind: "callout",
        label: "첫 카드 응원",
        text: "처음 발급받은 달과 그다음 달은 실적이 없어도 1구간 혜택 — 월 한도는 50%만.",
        tone: "info",
        fill: "risk",
        src: PLAN,
        why: "기획안에는 '한도 50%' 조건이 없음 — 레퍼런스 문구가 섞여 들어옴",
      },
      {
        id: "p6-calc",
        kind: "table",
        label: "실적 계산 예시",
        rows: [
          ["이번 달 쓴 곳", "금액", "실적"],
          ["카페 · 식당 · 쇼핑", "42만원", "들어가요"],
          ["노트북 무이자할부", "20만원", "빠져요"],
          ["아파트 관리비", "15만원", "빠져요"],
          ["다음 달 실적", "42만원", "1구간"],
        ],
        numeric: [1],
        fill: "draft",
        src: PLAN,
      },
    ],
  },
  {
    id: "p7",
    no: 7,
    title: "연회비 · 발급 안내",
    unit: "fee",
    intent: "돈 이야기는 숨기지 않고 한 쪽에",
    follows: "우리 PAY 7쪽 · 현대 3쪽(앞쪽 배치)",
    blocks: [
      { id: "p7-h", kind: "heading", label: "연회비", text: "연회비 · 발급 안내", fill: "ok", src: SPEC },
      {
        id: "p7-t",
        kind: "table",
        label: "연회비",
        rows: [
          ["구분", "연회비"],
          ["국내전용", "12,000원"],
          ["해외겸용 Mastercard", "15,000원"],
          ["모바일 단독", "8,000원"],
        ],
        numeric: [1],
        fill: "ok",
        src: SPEC,
      },
      { id: "p7-cb", kind: "callout", label: "연회비 캐시백", text: "발급 후 3개월 안에 50만원 이상 쓰면 첫 해 연회비를 돌려드려요.", tone: "info", fill: "ok", src: PLAN },
      { id: "p7-refund", kind: "text", label: "연회비 반환", text: "유효기간 전에 해지하면 남은 기간을 일할 계산해 10영업일 안에 돌려드려요. 발급 · 배송 비용과 이미 제공한 부가서비스 비용은 빼요.", fill: "ref", src: REFW },
    ],
  },
  {
    id: "p8",
    no: 8,
    title: "꼭 알아 두세요",
    unit: "notice",
    intent: "법정 · 공통 고지 — 빠뜨리면 배포 불가",
    follows: "모든 카드사 공통 (문구는 새로 씀)",
    blocks: [
      { id: "p8-h", kind: "heading", label: "꼭 알아 두세요", text: "꼭 알아 두세요", fill: "ok", src: REFW },
      { id: "p8-change", kind: "text", label: "부가서비스 변경", text: "출시일 2027년 3월 2일. 부가서비스는 출시 후 3년 이상 줄이거나 없애지 않아요. 불가피한 사유로 바뀌면 두 가지 이상의 방법으로 미리 알려 드려요.", fill: "ref", src: REFW },
      { id: "p8-notice", kind: "text", label: "이용 유의사항", text: "금융소비자보호법 제19조 제1항에 따라 상품 설명을 받을 권리가 있어요. 사용액이 상환능력보다 많으면 개인신용평점이 내려갈 수 있어요.", fill: "ref", src: REFW },
      { id: "p8-late", kind: "text", label: "연체이자율", text: "정상이자율 + 연 3%p 이내, 법정 최고금리(연 20%) 이내.", fill: "ref", src: REFW },
      { id: "p8-contact", kind: "callout", label: "고객센터 · 심의필", text: "고객센터 1600-2030 · 분실신고 1600-2031 · 여신금융협회 심의필 (심의 후 기재)", tone: "info", fill: "draft", src: PLAN },
    ],
  },
];

/* ── ① 뼈대: 마구 쓴 메모 → 쪽 ── */

export interface Note {
  id: string;
  text: string;
  depth: number;
  /** AI 가 알아들은 쪽 (없으면 모름) */
  to: string[];
}

export const MESSY: Note[] = [
  { id: "n1", text: "2030 첫 카드!! 혜택 고정 말고 매달 바꾸는 팩", depth: 0, to: ["p1", "p4"] },
  { id: "n2", text: "구독 30% 넷플 티빙 멜론 노션 클로드", depth: 0, to: ["p3"] },
  { id: "n3", text: "간편결제 클로드페이 10 / 네카토 5", depth: 0, to: ["p3"] },
  { id: "n4", text: "구독이랑 중복 X", depth: 1, to: ["p3"] },
  { id: "n5", text: "배달 카페 운동 팩 택1 10%", depth: 0, to: ["p4"] },
  { id: "n6", text: "해외 수수료 0 + 라운지 2회 (60만 이상)", depth: 0, to: ["p5"] },
  { id: "n7", text: "첫 카드면 2달은 실적 없어도 1구간", depth: 0, to: ["p6"] },
  { id: "n8", text: "연회비 12000 / 해외 15000 / 모바일 8000", depth: 0, to: ["p7"] },
  { id: "n9", text: "법정 고지는 다른 카드사 보고 새로 쓰기", depth: 0, to: ["p6", "p7", "p8"] },
  { id: "n10", text: "홍보 영상 QR 넣을까?", depth: 0, to: [] },
];

/** AI 가 메모만으로는 못 채운 쪽 — 정돈하면서 묻는다 */
export const GAPS: { page: string; what: string; how: string }[] = [
  { page: "p2", what: "혜택 한눈에 쪽이 메모에 없어요", how: "KB · 삼성 · 현대 · ALL 은 있어요 — 넣을까요?" },
  { page: "p8", what: "출시일이 어디에도 없어요", how: "기획안에서 2027년 3월 2일을 찾았어요" },
];

/* ── 레퍼런스 책상: 다른 카드사 안내장 ── */

export interface Ref {
  id: string;
  company: string;
  product: string;
  form: string;
  /** 혜택 묶는 방식 */
  grouping: string;
  /** 쪽 수 (막대 그림용) */
  pages: number;
  /** 의미 단위마다 그 안내장의 이름 · 쪽 */
  units: Partial<Record<Unit, string>>;
  tone: string;
}

export const REFS: Ref[] = [
  { id: "pay", company: "우리카드", product: "카드의정석2 PAY", form: "10쪽 리플릿", grouping: "결제 수단별", pages: 10, tone: "#2563eb", units: { identity: "1쪽 · 간편결제 할인의 정석", benefit: "2–4쪽 · 간편결제 · 일상 · 정기결제", criteria: "5–6쪽 · 유의사항 · 실적 산정", fee: "7쪽 · 연회비 · 모바일", overseas: "8쪽 · 해외 이용", notice: "9–10쪽 · 부가서비스 · 기타 · 심의필" } },
  { id: "kb", company: "KB국민카드", product: "YOU Prime", form: "4쪽 상품설명서", grouping: "팩 택1", pages: 4, tone: "#d97706", units: { identity: "1쪽 · 바꾸는 혜택", summary: "1쪽 · 서비스팩 표", benefit: "1–2쪽 · 일상팩 · 가족팩", criteria: "2쪽 · 서비스제공공통기준", fee: "3쪽 · 이용전 확인사항 안", overseas: "3쪽 · 이용전 확인사항 안", notice: "3–4쪽 · 기타 · 연체이자율" } },
  { id: "samsung", company: "삼성카드", product: "트레이더스신세계", form: "20쪽 소책자", grouping: "가맹점마다 한 쪽", pages: 20, tone: "#1d4ed8", units: { identity: "1–2쪽", summary: "3쪽 · 서비스 목록", benefit: "4–13쪽 · 가맹점별", criteria: "14쪽 · 서비스 제공 기준 표", fee: "16쪽", overseas: "19쪽", notice: "18쪽 · 유의사항" } },
  { id: "hyundai", company: "현대카드", product: "제네시스 · Pink Edition3", form: "14 · 16쪽 가이드북", grouping: "기본 · 추가 · 보너스 · 우대", pages: 14, tone: "#111827", units: { identity: "2쪽", summary: "3쪽 · 혜택", benefit: "4–9쪽", criteria: "10–11쪽 · 혜택 제공 기준", fee: "3쪽 · 혜택 요약 옆", overseas: "12쪽 · 해외 결제", notice: "12–13쪽 · 카드 이용 유의사항" } },
  { id: "all", company: "우리카드", product: "ALL Infinite", form: "11쪽 프리미엄", grouping: "제휴 브랜드", pages: 11, tone: "#7c3aed", units: { identity: "2쪽", summary: "3쪽 · 주요 서비스", benefit: "4–7쪽 · 아코르 · Premium", criteria: "8쪽", fee: "3쪽 · 요약 안", overseas: "8쪽", notice: "9쪽" } },
  { id: "cbs", company: "우리카드", product: "CBS크리스천 (2022)", form: "2쪽 접지", grouping: "서비스 나열", pages: 2, tone: "#0f766e", units: { identity: "1쪽", benefit: "2쪽", criteria: "2쪽", fee: "1쪽 · 맨 앞", overseas: "2쪽", notice: "1쪽" } },
  { id: "visa", company: "VISA", product: "국제브랜드 선택서비스", form: "2쪽 부속", grouping: "서비스 하나", pages: 2, tone: "#1e3a8a", units: { identity: "1쪽", benefit: "2쪽 · 발레파킹", criteria: "1쪽 · 제공 횟수", notice: "1쪽 맨 위 · 심의필" } },
];

/* ── 근거 (리소스) ── */

export const SOURCES: Record<string, { name: string; excerpt: string }> = {
  [PLAN]: { name: "클로드카드_2030_신상품_기획안.md", excerpt: "첫 상품은 20–30대가 처음 만드는 신용카드. 혜택을 고정하지 않고 매달 바꿔 쓰는 라이프 팩을 핵심으로." },
  [SPEC]: { name: "혜택_정의서_v1.md", excerpt: "표 2. 간편결제 — 클로드페이 10%, 네이버 · 카카오 · 토스페이 5%, 통합 월 한도 1구간 6천원 · 2구간 1만원 · 3구간 1만 5천원." },
  [REFW]: { name: "레퍼런스 8종 (구조만)", excerpt: "법정 · 공통 고지는 모든 카드사에 같은 자리 · 같은 뜻으로 나온다. 문장은 따라 쓰지 않고 새로 썼다." },
};

/* ── ② 서식: 블록 서랍 · 판형 ── */

export const BLOCK_SHELF: { kind: Block["kind"]; name: string; hint: string }[] = [
  { kind: "hero", name: "표지 히어로", hint: "상품명 · 한 줄 소개" },
  { kind: "cards", name: "카드 3단", hint: "혜택 셋 · 팩 · 팁" },
  { kind: "table", name: "표", hint: "할인율 · 한도 · 연회비" },
  { kind: "callout", name: "안내 상자", hint: "중복 · 특례 · 주의" },
  { kind: "heading", name: "제목", hint: "쪽 안의 소제목" },
  { kind: "text", name: "본문", hint: "조건 · 고지 문장" },
];

export const FORMATS = [
  { id: "a4-8", name: "A4 8쪽 리플릿", note: "읽는 순서 = 인쇄 순서" },
  { id: "a4-fold", name: "A4 2쪽 접지", note: "인쇄 면과 읽는 순서가 다름 (CBS 방식)" },
] as const;

export const BRANDS = [
  { id: "coral", name: "클로드 코랄", main: "#e8603c", soft: "#fdeee8", ink: "#1f1b18" },
  { id: "ink", name: "잉크 블루", main: "#2a3fd1", soft: "#eaedfc", ink: "#141833" },
  { id: "mint", name: "민트", main: "#0f9d7a", soft: "#e3f6f0", ink: "#0f1f1b" },
] as const;

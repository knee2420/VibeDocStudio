/**
 * 카드 상품안내장 시제품 데이터 — reports/사용자 되어보기 - 카드 상품안내장.md 의 세 겹.
 *  ① 의미 뼈대: 회사와 상관없이 안내장이 말해야 하는 것 (U1~U9)
 *  ② 회사 문법: 우리카드 안내장의 이름 · 묶음 · 순서 (= 시제품의 뼈대 나무)
 *  ③ 판형: 10쪽 리플릿 · 2쪽 접지 · 가이드북
 * 다른 카드사 대응표는 받은 안내장 8개(7곳)를 읽고 만든 것이다. 내용은 짧게 요약했다.
 */

/* ── ① 의미 뼈대 ── */

export type UnitId = "U1" | "U2" | "U3" | "U4" | "U5" | "U6" | "U7" | "U8" | "U9";

export const UNITS: Record<UnitId, { name: string; legal?: boolean }> = {
  U1: { name: "상품 정체성" },
  U2: { name: "혜택 요약" },
  U3: { name: "혜택 상세" },
  U4: { name: "제공 기준 (실적 산정 · 제외 대상)" },
  U5: { name: "연회비" },
  U6: { name: "해외 이용", legal: true },
  U7: { name: "부가서비스 변경 고지 · 출시일", legal: true },
  U8: { name: "이용 유의사항 · 연체이자율", legal: true },
  U9: { name: "심의 번호 · 연락처", legal: true },
};

/* ── ② 회사 문법: 우리카드 안내장 순서 ── */

export interface ScafNode {
  key: string;
  title: string;
  unit: UnitId;
  children?: ScafNode[];
  /** 레퍼런스 문구를 거의 그대로 쓰는 곳 */
  ref?: boolean;
}

export const SCAFFOLD: ScafNode[] = [
  {
    key: "identity",
    title: "표지",
    unit: "U1",
    children: [
      { key: "identity-name", title: "상품명", unit: "U1" },
      { key: "identity-line", title: "한 줄 소개", unit: "U1" },
    ],
  },
  {
    key: "b-pay",
    title: "간편결제 할인",
    unit: "U3",
    children: [
      { key: "b-pay-sum", title: "혜택 요약", unit: "U3" },
      { key: "b-pay-rate", title: "결제사별 할인율 표", unit: "U3" },
      { key: "b-pay-limit", title: "실적 구간별 월 한도 표", unit: "U3" },
      { key: "b-pay-cond", title: "제공 조건", unit: "U3" },
    ],
  },
  {
    key: "b-daily",
    title: "일상 할인",
    unit: "U3",
    children: [
      { key: "b-daily-shops", title: "대상 가맹점 표", unit: "U3" },
      { key: "b-daily-cond", title: "가맹점별 조건", unit: "U3", ref: true },
    ],
  },
  {
    key: "b-sub",
    title: "정기결제 할인",
    unit: "U3",
    children: [
      { key: "b-sub-shops", title: "대상 가맹점 표", unit: "U3" },
      { key: "b-sub-dup", title: "중복 적용", unit: "U3" },
    ],
  },
  {
    key: "criteria",
    title: "할인 제공 시 유의사항 · 실적 산정 방법",
    unit: "U4",
    children: [
      { key: "criteria-ex", title: "할인 · 실적 제외 대상", unit: "U4", ref: true },
      { key: "criteria-calc", title: "실적 산정 방법", unit: "U4", ref: true },
      { key: "criteria-first", title: "최초 발급 특례", unit: "U4" },
    ],
  },
  { key: "fee", title: "연회비 · 모바일카드 안내", unit: "U5" },
  { key: "overseas", title: "해외 이용 안내", unit: "U6", ref: true },
  { key: "change", title: "상품 출시일 · 부가서비스 변경 안내", unit: "U7", ref: true },
  { key: "notice", title: "기타 안내 · 심의필", unit: "U8", ref: true },
];

/** 다른 카드사에는 있는데 우리 뼈대에 없는 것 — 넣으면 표지 뒤에 */
export const OPTIONAL_SUMMARY: ScafNode = { key: "summary", title: "혜택 한눈에 보기", unit: "U2" };

export function flatScaffold(withSummary: boolean): { node: ScafNode; depth: number; parent?: string }[] {
  const out: { node: ScafNode; depth: number; parent?: string }[] = [];
  for (const n of SCAFFOLD) {
    out.push({ node: n, depth: 0 });
    for (const c of n.children ?? []) out.push({ node: c, depth: 1, parent: n.key });
    if (n.key === "identity" && withSummary) out.push({ node: OPTIONAL_SUMMARY, depth: 0 });
  }
  return out;
}

export function findNode(key: string): ScafNode | undefined {
  if (key === OPTIONAL_SUMMARY.key) return OPTIONAL_SUMMARY;
  for (const n of SCAFFOLD) {
    if (n.key === key) return n;
    for (const c of n.children ?? []) if (c.key === key) return c;
  }
  return undefined;
}

export function parentOf(key: string): ScafNode | undefined {
  return SCAFFOLD.find((n) => n.children?.some((c) => c.key === key));
}

/** 뼈대 번호 — "2 간편결제 할인 › 할인율 표" */
export function nodeLabel(key: string): string {
  const p = parentOf(key);
  const top = p ?? findNode(key);
  const no = top ? SCAFFOLD.indexOf(top) + 1 : 0;
  const n = findNode(key);
  if (!n) return key;
  return p ? `${no} ${p.title} › ${n.title}` : `${no || "+"} ${n.title}`;
}

/* ── 마구 쓴 메모 → 뼈대 (시제품용 짝 맞추기 규칙) ── */

/** 한 줄이 뼈대 어디에 붙는지. 여러 곳일 수 있다 ("기존꺼 그대로" → 장 넷). */
export function mapText(raw: string): string[] {
  const t = raw.toLowerCase();
  if (!t.trim()) return [];
  if (/그대로|유의사항|법정|고지/.test(t)) {
    const keys = ["criteria-ex", "criteria-calc"];
    if (/해외|그대로/.test(t)) keys.push("overseas");
    keys.push("change", "notice");
    return keys;
  }
  if (/첫 ?발급|최초 ?발급|신규 ?발급/.test(t)) return ["criteria-first"];
  if (/연회비|모바일/.test(t)) return ["fee"];
  if (/해외/.test(t)) return ["overseas"];
  if (/출시/.test(t)) return ["change"];
  if (/넷플|유튭|유튜브|구독|정기 ?결제|멤버십|티빙|디즈니/.test(t)) return /중복/.test(t) ? ["b-sub-dup"] : ["b-sub-shops"];
  if (/중복/.test(t)) return ["b-sub-dup"];
  if (/생활|일상|배민|올영|올리브영|다이소|ssg|컬리|무신사|29|w ?컨셉/.test(t)) return /조건|제외/.test(t) ? ["b-daily-cond"] : ["b-daily-shops"];
  if (/한도/.test(t)) return ["b-pay-limit"];
  if (/실적|특별|기본/.test(t)) return ["b-pay-cond"];
  if (/간편결제|우리 ?페이|원페이|네카토|네이버|카카오|토스|페이/.test(t)) {
    // "메인!!" 처럼 강조 + 숫자면 요약 한 줄과 할인율 표 둘 다 (한 줄 → 두 곳)
    const hasRate = /\d/.test(t);
    const isMain = /메인|핵심|대표|!!/.test(t);
    return hasRate && isMain ? ["b-pay-sum", "b-pay-rate"] : hasRate ? ["b-pay-rate"] : ["b-pay-sum"];
  }
  if (/메인|핵심|대표/.test(t)) return ["b-pay-sum"];
  if (/표지|이름|슬로건|소개/.test(t)) return ["identity-line"];
  if (/요약|한눈/.test(t)) return ["summary"];
  return [];
}

/** 일기 2번 순간 — 기획안을 옆에 두고 마구 쓴 메모 */
export const MESSY_NOTES: { text: string; depth: number }[] = [
  { text: "간편결제가 메인!! 우리페이 15 / 네카토 10 / 나머지 1%", depth: 0 },
  { text: "실적 40 이상이어야 특별, 미만은 기본 1%", depth: 1 },
  { text: "한도 구간 4개 (기획안 표 3 참고)", depth: 1 },
  { text: "생활 5% 배민 올영 다이소 ssg 컬리 무신사 29 w컨셉", depth: 0 },
  { text: "넷플 유튭 등 구독 30", depth: 0 },
  { text: "간편결제랑 중복 X", depth: 1 },
  { text: "첫 발급하면 다음달까지 실적 없어도 특별 — 근데 한도 50%만", depth: 0 },
  { text: "연회비 22000 모바일 16000", depth: 0 },
  { text: "나머지 유의사항 해외 이런건 기존꺼 그대로", depth: 0 },
];

/** 뼈대에서 내 메모도, 레퍼런스도 안 닿는 곳 — AI 가 묻는다 */
export const MISSING_HINT: Record<string, { what: string; action: string }> = {
  "identity-name": { what: "상품명", action: "기획안에서 가져오기" },
  "identity-line": { what: "한 줄 소개", action: "기획안 보고 제안받기" },
  "b-pay-sum": { what: "간편결제 혜택 한 줄", action: "메모에서 뽑기" },
  "b-daily-cond": { what: "가맹점별 조건 (배민은 앱 결제만 등)", action: "작년 안내장에서 가져오기" },
  change: { what: "상품 출시일", action: "물어보기 — 기획안에 없음" },
};

/* ── 다른 카드사 대응표 (① 단위마다) ── */

export interface Company {
  id: string;
  name: string;
  form: string;
  mine?: boolean;
}

export const COMPANIES: Company[] = [
  { id: "pay", name: "우리 카드의정석2 PAY", form: "10쪽 리플릿", mine: true },
  { id: "kb", name: "KB YOU Prime", form: "4쪽 상품설명서" },
  { id: "samsung", name: "삼성 트레이더스신세계", form: "20쪽 소책자" },
  { id: "hyundai", name: "현대 제네시스 · Pink Edition3", form: "14 · 16쪽 가이드북 (같은 틀)" },
  { id: "all", name: "우리 ALL Infinite", form: "11쪽 프리미엄 안내장" },
  { id: "cbs", name: "우리 CBS크리스천 (2022)", form: "2쪽 접지" },
  { id: "visa", name: "VISA 선택서비스", form: "2쪽 부속 안내장 (그림 PDF)" },
];

/** 단위 → 회사 → 그 안내장에서의 이름 · 쪽 · 한 줄 (없으면 생략) */
export const CROSSWALK: Record<UnitId, Partial<Record<string, string>>> = {
  U1: {
    pay: "1쪽 · 이름 + '간편결제 할인의 정석'",
    kb: "1쪽 · 이름 + 혜택을 바꿔 쓰는 카드라는 한 줄",
    samsung: "1–2쪽 · 이름 + 실용을 내세운 한 줄",
    hyundai: "2쪽 · 이름만",
    all: "2쪽 · 'Product Service Guide'",
    cbs: "1쪽 · 이름 + 회사 로고",
    visa: "1쪽 · 서비스 이름 + 적용 상품",
  },
  U2: {
    kb: "1쪽 · 서비스팩 두 개를 표 한 장으로",
    samsung: "3쪽 · 서비스 6개를 한 쪽 목록으로",
    hyundai: "3쪽 · '제네시스 현대카드 혜택' 한 쪽",
    all: "3쪽 · '주요 서비스 내용'",
  },
  U3: {
    pay: "2–4쪽 · 결제 수단별 (간편결제 · 일상 · 정기결제)",
    kb: "1–2쪽 · 팩 택1 (일상팩 · 가족팩) + 기본서비스",
    samsung: "4–13쪽 · 가맹점마다 한 쪽",
    hyundai: "4–9쪽 · 기본 · 추가 · 연간 보너스 · 우대 서비스",
    all: "4–7쪽 · 제휴 브랜드 (아코르 · Premium Service)",
    cbs: "2쪽 · 서비스 3개 나열",
    visa: "2쪽 · 서비스 하나 (발레파킹)만",
  },
  U4: {
    pay: "5–6쪽 · '할인 제공 시 유의사항' + '실적 산정 방법 안내'",
    kb: "2쪽 · '서비스제공공통기준'",
    samsung: "14쪽 · '서비스 제공 기준' 표 한 장 (서비스 × 할인율 × 한도 × 실적)",
    hyundai: "10–11쪽 · '혜택 제공 기준'",
    all: "8쪽 · 전월 · 전년도 실적 기준",
    cbs: "2쪽 · 월한도 · 취소 매출",
    visa: "1쪽 · 서비스 제공 횟수와 전월 실적",
  },
  U5: {
    pay: "7쪽 · 연회비 + 모바일카드",
    kb: "3쪽 · '이용전 확인사항' 제목 안에",
    samsung: "16쪽",
    hyundai: "3쪽 · 혜택 요약 바로 옆",
    all: "3쪽 · 주요 서비스 요약 안",
    cbs: "1쪽 · 맨 앞",
  },
  U6: {
    pay: "8쪽",
    kb: "3쪽 · '이용전 확인사항' 제목 안에",
    samsung: "19쪽 · 유의사항 끝",
    hyundai: "12쪽 · '해외 결제 이용 안내'",
    all: "8쪽",
    cbs: "2쪽",
  },
  U7: {
    pay: "9쪽 · 출시일과 함께",
    kb: "3쪽 · '이용전 확인사항' 제목 안에",
    samsung: "18–19쪽 · 유의사항 안",
    hyundai: "유의사항 안",
    all: "9쪽",
    cbs: "2쪽 · 출시일과 함께",
  },
  U8: {
    pay: "9–10쪽 · '기타 안내'",
    kb: "3–4쪽 · '기타' · 연체이자율",
    samsung: "18쪽 · '유의사항'",
    hyundai: "12–13쪽 · '카드 이용 유의사항' · '연체 금리'",
    all: "9쪽",
    cbs: "1쪽",
  },
  U9: {
    pay: "10쪽 · 여신금융협회 심의필",
    kb: "1쪽 · 상품설명서 번호",
    samsung: "20쪽 · 대표전화",
    cbs: "1쪽 · 준법 심의필",
    visa: "1쪽 맨 위 · 협회 심의필",
  },
};

/* ── Phase 3: AI 가 채운 내용 (안내장 PDF 의 내용) ── */

export type FillState = "draft" | "copied" | "nocite" | "changed" | "wait";

export interface Fill {
  text: string;
  state: FillState;
  /** 근거 리소스 · 레퍼런스 */
  src?: string;
  /** 위험한 까닭 */
  why?: string;
}

export const FILLS: Record<string, Fill> = {
  "identity-name": { text: "카드의정석2 PAY", state: "draft", src: "신상품 기획안 1쪽" },
  "identity-line": { text: "간편결제 할인의 정석", state: "draft", src: "신상품 기획안 1쪽" },
  summary: { text: "간편결제 최대 15% · 생활 5% · 정기결제 30% 청구할인", state: "draft", src: "혜택 정의서 v3" },
  "b-pay-sum": { text: "간편결제 최대 15% 청구할인 — 국내 온/오프라인 가맹점, 건당 할인한도 3천원", state: "draft", src: "혜택 정의서 v3" },
  "b-pay-rate": { text: "특별할인: 우리WON페이 15% · 네이버페이 · 카카오페이 · 토스페이 10% / 기본할인: 4곳 모두 1%", state: "draft", src: "혜택 정의서 v3 표 1" },
  "b-pay-limit": {
    text: "40만원 미만 1만 8천원 · 40–80만원 1만 8천원 · 80–120만원 3만 6천원 · 120만원 이상 5만 4천원 (통합)",
    state: "nocite",
    src: "혜택 정의서 v3 표 3",
    why: "120만원 이상 구간 '5만 4천원'은 혜택 정의서에서 못 찾음",
  },
  "b-pay-cond": { text: "특별할인은 전월 국내외 가맹점 실적 40만원 이상, 미만이면 기본할인", state: "draft", src: "혜택 정의서 v3" },
  "b-daily-shops": { text: "온라인: 배달의민족 · SSG.COM · 컬리 · 무신사 · 29CM · W컨셉 / 오프라인: 올리브영 · 다이소 — 5%, 통합 월 3천원", state: "draft", src: "혜택 정의서 v3 표 4" },
  "b-daily-cond": { text: "배달의민족은 앱 내 카드결제만 · 쇼핑몰은 공식 홈페이지 · 앱의 배송 구매만 · 오프라인은 직영 매장만", state: "copied", src: "작년 안내장 3쪽" },
  "b-sub-shops": { text: "디지털 콘텐츠: 넷플릭스 · 유튜브 프리미엄 · 티빙 · 디즈니+ / 멤버십: 쿠팡 와우 · 네이버플러스 · 배민클럽 · 컬리멤버스 — 30%, 월 5천원", state: "draft", src: "혜택 정의서 v3 표 5" },
  "b-sub-dup": { text: "'간편결제 할인'과 중복 적용 불가", state: "draft", src: "혜택 정의서 v3" },
  "criteria-ex": { text: "할인 제외: 무이자할부 · 정부지원금 · 각종 수수료 · 카드대출 · 아파트 관리비 · 국세 · 지방세 · 상품권 …", state: "copied", src: "작년 안내장 5쪽" },
  "criteria-calc": { text: "전월 1일부터 말일까지(승인일 기준) 카드별 가맹점 이용실적 · 취소 매출은 접수월 실적에서 차감", state: "copied", src: "작년 안내장 6쪽" },
  "criteria-first": {
    text: "최초 발급 후 다음달 말일까지 실적 40만원 미만이어도 40–80만원 구간 서비스 제공 (월 할인한도 50%만)",
    state: "changed",
    src: "작년 안내장 6쪽 + 신상품 기획안",
    why: "작년 법정 · 공통 문구와 다름: '월 할인한도 50%만' 이 새로 붙음 — 준법 검토에서 물어볼 곳",
  },
  fee: { text: "실물카드 22,000원 (기본 7,000 + 제휴 15,000) · 모바일카드 16,000원 (기본 1,000 + 제휴 15,000)", state: "draft", src: "연회비 · 제휴 계약 요약" },
  overseas: { text: "국제브랜드 수수료 Mastercard 1.1% + 해외서비스 수수료 0.3% · 원화결제 차단 안내", state: "copied", src: "작년 안내장 8쪽" },
  change: { text: "상품 출시일 2026년 9월 30일 · 부가서비스 3년 유지 · 변경 사유 ①~④ · 고지 방법", state: "copied", src: "작년 안내장 9쪽 + 출시일은 사용자 답" },
  notice: { text: "금융소비자보호법 제19조 설명받을 권리 · 연체이자율 · 신용평점 안내 · 고객센터 · 여신금융협회 심의필 (심의 후 번호)", state: "wait", src: "작년 안내장 10쪽", why: "심의필 번호는 심의 후에" },
};

/* ── ③ 판형 ── */

export type LayoutId = "leaflet" | "fold" | "guide";

export const LAYOUTS: { id: LayoutId; name: string; like: string }[] = [
  { id: "leaflet", name: "10쪽 리플릿", like: "우리 카드의정석2 PAY 방식" },
  { id: "fold", name: "2쪽 접지 (앞 · 뒤)", like: "우리 CBS크리스천 방식 — 인쇄 순서 ≠ 읽는 순서" },
  { id: "guide", name: "가이드북", like: "현대 · 삼성 방식 — 혜택 요약 쪽, 혜택마다 한 쪽" },
];

/** 판형마다 쪽(또는 면)에 뼈대 장을 놓는 규칙 */
export function paginate(layout: LayoutId, tops: string[]): { label: string; keys: string[]; read?: number[] }[] {
  const has = (k: string) => tops.includes(k);
  const pick = (...ks: string[]) => ks.filter(has);
  if (layout === "leaflet") {
    return [
      { label: "1쪽", keys: pick("identity", "summary") },
      { label: "2쪽", keys: pick("b-pay") },
      { label: "3쪽", keys: pick("b-daily") },
      { label: "4쪽", keys: pick("b-sub") },
      { label: "5–6쪽", keys: pick("criteria") },
      { label: "7쪽", keys: pick("fee") },
      { label: "8쪽", keys: pick("overseas") },
      { label: "9쪽", keys: pick("change") },
      { label: "10쪽", keys: pick("notice") },
    ].filter((p) => p.keys.length);
  }
  if (layout === "fold") {
    // 접는 안내장: 인쇄 면 1 에 연회비 · 기타 · 표지, 면 2 에 혜택 · 기준 · 해외 · 변경 (CBS 와 같은 배치)
    const front = pick("fee", "notice", "identity", "summary");
    const back = pick("change", "criteria", "overseas", "b-pay", "b-daily", "b-sub");
    const order = tops; // 읽는 순서 = 아웃라인 순서
    return [
      { label: "인쇄 면 1 (바깥)", keys: front, read: front.map((k) => order.indexOf(k) + 1) },
      { label: "인쇄 면 2 (안쪽)", keys: back, read: back.map((k) => order.indexOf(k) + 1) },
    ];
  }
  const pages: { label: string; keys: string[] }[] = [{ label: "표지", keys: pick("identity") }];
  pages.push({ label: "혜택 한눈에", keys: has("summary") ? ["summary"] : [] });
  for (const k of pick("b-pay", "b-daily", "b-sub")) pages.push({ label: `${findNode(k)?.title}`, keys: [k] });
  pages.push({ label: "혜택 제공 기준", keys: pick("criteria") }, { label: "연회비", keys: pick("fee") }, { label: "해외 · 변경", keys: pick("overseas", "change") }, { label: "카드 이용 유의사항", keys: pick("notice") });
  return pages.filter((p) => p.keys.length || p.label === "혜택 한눈에");
}

/** 레이아웃 실험용 더미 데이터 — 화면 구조를 맛보기 위한 것이라 실제 문서 · 서버와 무관하다. */

export interface LabPage {
  id: string;
  title: string;
  elements: string[];
}

export const LAB_DOC = {
  project: "2026 엔터프라이즈 문서 거버넌스 & 제안 패키지",
  title: "10월 4주차 아키텍처 정례 회의록",
  pages: [
    { id: "p1", title: "회의 개요 및 핵심 의결사항 매트릭스", elements: ["회의 기본 메타데이터", "핵심 협의 및 결의사항", "[표] 결정사항 합의 표", "차주 핵심 실행 과제", "사진 표지"] },
    { id: "p2", title: "반상회 회의록 (예스폼 07번)", elements: ["회의 개요", "안건 1 · 주차 문제", "안건 2 · 관리비", "결의 사항"] },
    { id: "p3", title: "Atticus Invoice #000817709", elements: ["청구처", "품목 표", "합계"] },
    { id: "p4", title: "학술정보운영위원회 규정", elements: ["제1조 목적", "제2조 구성", "제3조 운영"] },
    { id: "p5", title: "설계 심사회의록 (예스폼 51번)", elements: ["심사 개요", "심사 의견", "보완 요청"] },
    { id: "p6", title: "시험 불참원", elements: ["신청인 정보", "불참 내용", "시험 교과목 표", "확인 · 결재란"] },
    { id: "p7", title: "시험 · 분석 · 검정 성적서 증명 교부신청서", elements: ["접수 정보", "신청인", "성적서 정보", "신청 문구 · 서명", "처리 절차"] },
  ] as LabPage[],
};

/** 레퍼런스 뼈대 한 칸 — 글 흐름 · 레이아웃을 보려는 용도 */
export type SkeletonPart =
  | { t: "title"; text: string }
  | { t: "meta"; text: string }
  | { t: "text"; label: string; lines: number; sample: string }
  | { t: "image"; label: string }
  | { t: "images"; count: number; label: string }
  | { t: "table"; label: string };

export type LabKind = "블로그" | "PDF" | "웹" | "이미지" | "HWPX" | "XLSX" | "메모";

export interface LabItem {
  id: string;
  title: string;
  kind: LabKind;
  source: string;
  /** 레퍼런스로 볼 때의 뼈대 */
  skeleton?: SkeletonPart[];
  /** 리소스(근거)로 볼 때 인용할 수 있는 대목 */
  quotes?: string[];
}

export const LAB_ITEMS: LabItem[] = [
  {
    id: "r-nyc",
    title: "뉴욕 여행 지도 맨해튼 구역별 가볼만한 곳 추천 리스트",
    kind: "블로그",
    source: "blog.naver.com/jiphap",
    skeleton: [
      { t: "title", text: "[공지] 뉴욕 여행 지도 맨해튼 구역별 가볼만한곳 추천 리스트" },
      { t: "meta", text: "조매구 · 2023. 12. 11." },
      { t: "text", label: "도입 — 왜 이 글을 썼나", lines: 3, sample: "처음 뉴욕에 가면 어디부터 봐야 할지 막막하죠. 구역별로 동선을 짜면 하루를 훨씬 알차게 쓸 수 있어요." },
      { t: "image", label: "대표 사진 · 맨해튼 거리" },
      { t: "text", label: "구역 1 — 미드타운", lines: 4, sample: "타임스스퀘어에서 시작해 록펠러센터까지 걸어서 20분. 전망대는 해 질 녘 예약이 가장 빨리 찹니다." },
      { t: "images", count: 2, label: "사진 2장 나란히" },
      { t: "text", label: "구역 2 — 다운타운", lines: 3, sample: "월스트리트와 배터리파크는 오전에, 브루클린 브리지는 노을 무렵에 건너는 걸 추천해요." },
      { t: "table", label: "구역별 소요 시간 표" },
      { t: "text", label: "마무리 — 요약과 팁", lines: 2, sample: "하루 두 구역 이상은 무리예요. 지하철 7일권이 가장 경제적입니다." },
    ],
  },
  {
    id: "r-ddd",
    title: "DDD_ Frame the Problem",
    kind: "PDF",
    source: "ddd-crew.pdf",
    skeleton: [
      { t: "title", text: "Frame the Problem" },
      { t: "text", label: "문제 정의", lines: 3, sample: "도메인 전문가와 함께 해결하려는 문제를 한 문장으로 적는다." },
      { t: "table", label: "이해관계자 · 기대 · 우려 표" },
      { t: "text", label: "다음 단계", lines: 2, sample: "이벤트 스토밍으로 넘어가기 전에 범위를 고정한다." },
    ],
  },
  {
    id: "r-redhash",
    title: "[레드해시랩] AI 개발 플랫폼 제작 · 기능 정의서",
    kind: "PDF",
    source: "기능정의서_v3.pdf",
    skeleton: [
      { t: "title", text: "AI 개발 플랫폼 기능 정의서" },
      { t: "meta", text: "문서 번호 · 작성자 · 개정 이력" },
      { t: "table", label: "기능 목록 표 (ID · 이름 · 우선순위)" },
      { t: "text", label: "기능 상세", lines: 4, sample: "F-01 프로젝트 생성: 사용자는 템플릿을 골라 새 프로젝트를 만든다." },
      { t: "image", label: "화면 흐름도" },
    ],
  },
  {
    id: "r-card",
    title: "상품안내장 카드 PAY_2610",
    kind: "PDF",
    source: "상품안내장_2610.pdf",
    skeleton: [
      { t: "title", text: "PAY 카드 상품안내장" },
      { t: "images", count: 3, label: "혜택 아이콘 3개" },
      { t: "table", label: "연회비 · 실적 기준 표" },
      { t: "text", label: "유의 사항", lines: 3, sample: "전월 실적 30만 원 이상일 때 할인이 적용됩니다." },
    ],
    quotes: ["연회비 국내전용 15,000원 / 해외겸용 18,000원", "전월 이용실적 30만 원 이상 시 통합 할인 적용"],
  },
  {
    id: "r-dog",
    title: "애견페스티벌 포스터 (1)",
    kind: "이미지",
    source: "poster_dog.png",
    skeleton: [
      { t: "title", text: "2026 애견 페스티벌" },
      { t: "image", label: "메인 일러스트" },
      { t: "meta", text: "일시 · 장소 · 주최" },
    ],
  },
  {
    id: "s-minutes",
    title: "2026 아키텍처 위원회 회의 녹취록.pdf",
    kind: "PDF",
    source: "로컬 폴더 · 회의록",
    quotes: [
      "LibreOffice 와 VS Code 의 구조를 비교한 결과, 거대 모놀리식보다 확장 가능한 코어 + 플러그인 구조가 유지보수에 유리하다는 데 합의했다.",
      "Kolas Editor 를 참고해 칸(슬롯)을 독립 단위로 분리하는 방식으로 검증을 마쳤다.",
    ],
  },
  {
    id: "s-libre",
    title: "LibreOffice 아키텍처 분석 메모.md",
    kind: "메모",
    source: "Raw Resource Explorer · (Articles) TECH Blog",
    quotes: ["LibreOffice 코어는 약 1,000만 줄, 빌드 시간은 평균 3시간 이상이다."],
  },
  {
    id: "s-kolas",
    title: "Kolas Editor 기술 검토서.hwpx",
    kind: "HWPX",
    source: "Raw Resource Explorer · (Library) 망고네 도서관",
    quotes: ["슬롯 단위 분리로 편집 충돌이 82% 줄었다 (내부 시험, 2026.09)."],
  },
  {
    id: "s-vscode",
    title: "VS Code 확장 구조 문서",
    kind: "웹",
    source: "code.visualstudio.com/api",
    quotes: ["확장은 별도 프로세스(Extension Host)에서 돌아 편집기 본체를 멈추게 하지 않는다."],
  },
  {
    id: "s-budget",
    title: "예산 집행 현황표.xlsx",
    kind: "XLSX",
    source: "지식 덱 · 2026 예산",
    quotes: ["4분기 집행률 64%, 남은 예산 1억 2천만 원"],
  },
];

export const itemById = (id: string) => LAB_ITEMS.find((i) => i.id === id);

/** 이 문서에서의 역할 — 같은 자료실 항목이 레퍼런스로도, 근거로도 물릴 수 있다. */
export interface LabRole {
  ref: boolean;
  res: boolean;
}

export const DEFAULT_ROLES: Record<string, LabRole> = {
  "r-nyc": { ref: true, res: false },
  "r-ddd": { ref: true, res: false },
  "r-redhash": { ref: true, res: false },
  "r-card": { ref: true, res: true },
  "r-dog": { ref: true, res: false },
  "s-minutes": { ref: false, res: true },
  "s-libre": { ref: false, res: true },
  "s-kolas": { ref: false, res: true },
  "s-vscode": { ref: false, res: true },
  "s-budget": { ref: false, res: true },
};

/** 캔버스 글에 단 출처 — 번호 → 자료 · 몇 번째 대목 */
export const CITATIONS: Record<number, { itemId: string; quote: number }> = {
  1: { itemId: "s-minutes", quote: 0 },
  2: { itemId: "s-kolas", quote: 0 },
  3: { itemId: "s-budget", quote: 0 },
  4: { itemId: "s-libre", quote: 0 },
};

/** AI 가 이번 답을 만들며 거친 도구 기록 (접혀 보인다) */
export const AI_TOOL_LOG = [
  "ws_overview",
  "rf_map",
  "ws_glob *안내*",
  "ws_glob *.pdf",
  "ws_grep 결정사항",
  "rf_read 회의 녹취록 p.3",
  "rf_read Kolas 검토서",
  "rf_consensus",
  "read_file 예산 집행 현황표",
  "dc_build",
];

import { S, type SbChapter, type SbScenario, type SbSection, type SbSlot, type ScenarioId } from "./sidebarDummy";
import { NUDGE } from "./sidebarNudge";

/* ════════ 1. 회의록 서식 (6쪽) — 칸 위주 ════════ */

const MINUTES: SbScenario = {
  id: "minutes",
  name: "회의록 서식 · 6쪽",
  desc: "정해진 서식의 칸을 채우는 문서 — 정보 칸 · 표 · 결재란",
  project: "2026 엔터프라이즈 문서 거버넌스 & 제안 패키지",
  sources: [
    { id: "m-r1", label: "10월 4주차 회의 녹취록.txt", kind: "resource" },
    { id: "m-r2", label: "discovery_trial1_아키텍처_회의록.md", kind: "resource" },
    { id: "m-f1", label: "정례 회의록 표준 양식 GSV-01", kind: "reference" },
  ],
  docs: [
    {
      id: "m-d1",
      name: "아키텍처 위원회 의사결정 회의록",
      chapters: [
        {
          id: "m-c1",
          name: "회의 개요와 핵심 의결",
          syn: "참석자 명단 · 상정 안건 3건 · 액션 아이템 표",
          template: "정례 회의록 표준 양식 GSV-01",
          pages: 2,
          sections: [
            {
              id: "m-c1s1",
              name: "회의 정보",
              intent: "언제 · 누가 · 어떤 기조로 모였나",
              form: "info",
              formLabel: "정보 2단",
              slots: [
                { ...S.ok("m-c1s1a", "개최 일시", "2026-10-28 (수) 14:00", ["m-r1"]), key: "Meeting.Date" },
                { ...S.empty("m-c1s1b", "주관", "아키텍처 위원회 (위원장 서민규)", ["m-r1"]), key: "Meeting.Owner" },
                S.ok("m-c1s1c", "전용 포맷", "*.vdoc (UTF-8 JSON)"),
                S.draft("m-c1s1d", "핵심 기조", "PandaDoc 80% + 백데이터 · 인라인 AI 20%", ["m-r2"]),
              ],
            },
            {
              id: "m-c1s2",
              name: "핵심 협의와 결의사항",
              intent: "무엇을 왜 정했는지 세 줄로",
              form: "text",
              formLabel: "본문",
              slots: [
                S.ok("m-c1s2a", "Executive Summary", "거대 모놀리식(LibreOffice/VSCode) 통째 Fork 를 지양하고 초경량 React 오픈소스 코어를 _upstreams/ 에 발췌 이식한다.", ["m-r2"]),
                S.empty("m-c1s2b", "결의사항 본문", "REA 로 판다독(Kolas Editor)을 해부하여 모든 블록과 표 셀이 독립 슬롯으로 분리된 구조를 검증 완료했다.", ["m-r1", "m-r2"]),
              ],
            },
            {
              id: "m-c1s3",
              name: "오픈소스 발췌 결정사항",
              intent: "레이어마다 무엇을 가져오고 무엇을 버렸나",
              form: "table",
              formLabel: "표 3×3",
              slots: [
                S.ok("m-c1s3a", "편집 엔진", "Tiptap · maily.to 커스텀 노드 · 채택", ["m-r2"]),
                S.empty("m-c1s3b", "레이아웃", "Puck JSON Schema + CSS Grid · 채택", ["m-r2"]),
                S.nocite("m-c1s3c", "저장 형식", ".vdoc 100% JSON · 확장자 고정"),
              ],
            },
            {
              id: "m-c1s4",
              name: "차주 실행 과제",
              intent: "다음 회의 전까지 누가 무엇을",
              form: "list",
              formLabel: "목록 · 담당 꼬리표",
              slots: [
                S.empty("m-c1s4a", "과제 1", "사이드바 시안 A · B · C 사용성 테스트 (서민규)", ["m-r1"]),
                S.empty("m-c1s4b", "과제 2", "칸 상태(필수 · 대기) 스키마 확정", ["m-r1"]),
                S.empty("m-c1s4c", "과제 3", "결재란 서명 순서 규칙 정리"),
              ],
            },
            {
              id: "m-c1s5",
              name: "결재",
              intent: "누구에게 몇 명에게 서명을 받나",
              form: "sign",
              formLabel: "결재란 2칸",
              slots: [S.ok("m-c1s5a", "작성자 (인)", "서혜린"), S.wait("m-c1s5b", "위원장 (인)", "위원장 서명")],
            },
          ],
        },
        {
          id: "m-c2",
          name: "반상회 회의록",
          syn: "예스폼 07번 서식 · 안건 · 건의 사항",
          template: "예스폼 07번 정밀 서식",
          pages: 2,
          sections: [
            {
              id: "m-c2s1",
              name: "일시 및 장소",
              intent: "언제 어디서",
              form: "info",
              formLabel: "정보 2단",
              slots: [S.ok("m-c2s1a", "개최 일시", "2026-11-10 (화) 19:30"), S.ok("m-c2s1b", "장소", "행복동 주민센터 2층")],
            },
            {
              id: "m-c2s2",
              name: "상정 안건",
              intent: "이번 달 다룬 안건",
              form: "list",
              formLabel: "목록",
              slots: [S.ok("m-c2s2a", "안건 1", "재활용 분리수거 요일 변경"), S.draft("m-c2s2b", "안건 2", "노후 CCTV 및 조명 교체 요청", ["m-r1"])],
            },
            {
              id: "m-c2s3",
              name: "건의요망 사항요지",
              intent: "주민이 올린 건의 요점",
              form: "text",
              formLabel: "본문",
              slots: [S.empty("m-c2s3a", "건의 요지", "11월 7일(토) 10:00 가을맞이 마을 대청소 참여 요청", ["m-r1"])],
            },
          ],
        },
        {
          id: "m-c3",
          name: "학술정보운영위원회 규정",
          syn: "조문 · 부칙 · 위원장 결재",
          template: "기관 규정 서식",
          pages: 2,
          sections: [
            {
              id: "m-c3s1",
              name: "목적과 정의",
              intent: "규정이 다루는 범위",
              form: "notice",
              formLabel: "조문",
              slots: [S.copy("m-c3s1a", "제1조 목적", "이 규정은 학술정보운영위원회의 구성과 운영에 필요한 사항을 정한다.", "기관 규정 서식 1조")],
            },
            {
              id: "m-c3s2",
              name: "결재",
              intent: "위원장 확인",
              form: "sign",
              formLabel: "결재란 1칸",
              slots: [S.wait("m-c3s2a", "위원장 (인)", "위원장 서명")],
            },
          ],
        },
      ],
    },
  ],
};

/* ════════ 2. 카드 상품안내장 (10쪽) — 레퍼런스 따라 쓰기 + 리소스 근거 ════════ */

const REF = "카드의정석 PAY 안내장 (2024)";

const CARD: SbScenario = {
  id: "card",
  name: "카드 상품안내장 · 10쪽",
  desc: "다른 카드 안내장을 레퍼런스로 따라 쓰고, 기획안 · 혜택 정의서를 근거로 채우는 문서 — 표 · 법정 고지",
  project: "카드의정석2 PAY 출시 자료",
  sources: [
    { id: "k-r1", label: "신상품 기획안_카드의정석2 PAY.pdf", kind: "resource" },
    { id: "k-r2", label: "혜택 정의서 v3 (할인율 · 한도 · 가맹점).xlsx", kind: "resource" },
    { id: "k-r3", label: "연회비 · 제휴 계약 요약.docx", kind: "resource" },
    { id: "k-r4", label: "준법 검토 체크리스트.pdf", kind: "resource" },
    { id: "k-f1", label: REF, kind: "reference" },
    { id: "k-f2", label: "카드의정석 EVERY1 안내장", kind: "reference" },
  ],
  docs: [
    {
      id: "k-d1",
      name: "카드의정석2 PAY 상품안내장",
      chapters: [
        {
          id: "k-c1",
          name: "표지",
          syn: "상품명 · 한 줄 소개",
          template: `레퍼런스 · ${REF} 표지`,
          pages: 1,
          sections: [
            {
              id: "k-c1s1",
              name: "표지",
              intent: "무슨 카드인지 한눈에",
              form: "info",
              formLabel: "표지 1단",
              slots: [
                { ...S.ok("k-c1s1a", "상품명", "카드의정석2 PAY", ["k-r1"]), key: "Product.Name" },
                S.draft("k-c1s1b", "한 줄 소개", "간편결제 할인의 정석", ["k-r1"]),
              ],
            },
          ],
        },
        {
          id: "k-c2",
          name: "간편결제 할인",
          syn: "결제사별 할인율 · 실적 구간별 월 한도",
          template: `레퍼런스 · ${REF} 2쪽 (결제사 열 3 → 4로 고침)`,
          pages: 1,
          sections: [
            {
              id: "k-c2s1",
              name: "혜택 요약",
              intent: "가장 큰 혜택을 제목으로",
              form: "text",
              formLabel: "제목 + 안내 3줄",
              slots: [
                S.ok("k-c2s1a", "제목", "간편결제 최대 15% 청구할인", ["k-r2"]),
                S.copy("k-c2s1b", "중복 적용", "‘기본할인’ 서비스는 ‘특별할인’ 서비스와 중복 적용 불가", `${REF} 2쪽`),
                S.draft("k-c2s1c", "건당 할인한도", "건당 할인한도 : 3천원", ["k-r2"]),
              ],
            },
            {
              id: "k-c2s2",
              name: "결제사별 할인율",
              intent: "누구에게 몇 % 인가",
              form: "table",
              formLabel: "표 3열 · 결제사 4곳",
              slots: [
                S.ok("k-c2s2a", "특별할인 · 우리WON페이", "15%", ["k-r2"]),
                S.draft("k-c2s2b", "특별할인 · 네이버 · 카카오 · 토스페이", "10%", ["k-r2"]),
                S.empty("k-c2s2c", "기본할인 · 결제사 4곳", "1%", ["k-r2"]),
              ],
            },
            {
              id: "k-c2s3",
              name: "실적 구간별 월 할인한도",
              intent: "얼마 쓰면 얼마까지 깎아 주나",
              form: "table",
              formLabel: "표 5열 · 구간 4개",
              slots: [
                S.draft("k-c2s3a", "40만원 미만", "1만 2천원 / 6천원 / 통합 1만 8천원", ["k-r2"]),
                S.draft("k-c2s3b", "40만원 이상 80만원 미만", "1만 2천원 / 6천원 / 통합 1만 8천원", ["k-r2"]),
                S.empty("k-c2s3c", "80만원 이상 120만원 미만", "2만 4천원 / 1만 2천원 / 통합 3만 6천원", ["k-r2"]),
                S.nocite("k-c2s3d", "120만원 이상", "3만 6천원 / 1만 8천원 / 통합 5만 4천원"),
              ],
            },
            {
              id: "k-c2s4",
              name: "제공 조건",
              intent: "특별할인 · 기본할인이 갈리는 기준",
              form: "text",
              formLabel: "본문",
              slots: [
                S.draft("k-c2s4a", "특별할인 조건", "전월 국내외 가맹점 이용 실적 40만원 이상 시 제공. ‘정기결제 30% 할인’ 대상 가맹점은 할인 제외.", ["k-r1", "k-r2"]),
                S.nocite("k-c2s4b", "신규 발급 특례", "최초발급 후 다음달 말일까지는 전월 실적 40만원 미만 시에도 ‘특별할인’ 기준으로 제공."),
              ],
            },
          ],
        },
        {
          id: "k-c3",
          name: "일상 할인 5%",
          syn: "온라인 6곳 · 오프라인 2곳 · 가맹점별 조건",
          template: `레퍼런스 · ${REF} 3쪽`,
          pages: 1,
          sections: [
            {
              id: "k-c3s1",
              name: "대상 가맹점",
              intent: "어디서 깎이나",
              form: "table",
              formLabel: "표 4열",
              slots: [
                S.ok("k-c3s1a", "온라인", "배달의민족, SSG.COM, 컬리, 무신사, 29CM, W컨셉 · 5% · 월 3천원", ["k-r2"]),
                S.ok("k-c3s1b", "오프라인", "올리브영, 다이소 · 5% · 월 3천원", ["k-r2"]),
              ],
            },
            {
              id: "k-c3s2",
              name: "가맹점별 조건",
              intent: "가맹점마다 빠지는 결제",
              form: "text",
              formLabel: "본문 · 가맹점 머리글",
              slots: [
                S.draft("k-c3s2a", "배달의민족", "공식 배달앱에서 ‘앱 내 카드결제’ 통한 온라인 결제 건에 한하여 할인 제공. 만나서/현장 결제는 제외.", ["k-r2"]),
                S.empty("k-c3s2b", "온라인 쇼핑몰 5곳", "공식 홈페이지 또는 앱을 통한 물품 배송 구매에 한하여 할인. 멤버십 · 구독 · 티켓 결제는 제외.", ["k-r2"]),
                S.empty("k-c3s2c", "올리브영 · 다이소", "오프라인 매장 상품 구매 건에 한하여 할인. 백화점 · 대형마트 입점 매장은 제외.", ["k-r2"]),
              ],
            },
          ],
        },
        {
          id: "k-c4",
          name: "정기결제 30% 할인",
          syn: "디지털 콘텐츠 · 멤버십 구독",
          template: `레퍼런스 · 카드의정석 EVERY1 안내장 4쪽`,
          pages: 1,
          sections: [
            {
              id: "k-c4s1",
              name: "대상 가맹점",
              intent: "어떤 구독이 깎이나",
              form: "table",
              formLabel: "표 4열",
              slots: [
                S.empty("k-c4s1a", "디지털 콘텐츠", "넷플릭스, 유튜브 프리미엄, 티빙, 디즈니+ · 30% · 월 5천원", ["k-r2"]),
                S.empty("k-c4s1b", "멤버십", "쿠팡 와우, 네이버플러스, 배민클럽, 컬리멤버스 · 30% · 월 5천원", ["k-r2"]),
              ],
            },
            {
              id: "k-c4s2",
              name: "조건",
              intent: "정기결제만, 인앱결제 제외",
              form: "text",
              formLabel: "본문",
              slots: [S.copy("k-c4s2a", "인앱결제 제외", "인앱결제(구글 플레이스토어, 앱스토어 등) 결제 시 할인 제공 불가", "카드의정석 EVERY1 안내장 4쪽")],
            },
          ],
        },
        {
          id: "k-c5",
          name: "할인 유의사항과 실적 산정",
          syn: "제외 대상 · 실적 산정 · 공공요금 내역",
          template: `레퍼런스 · ${REF} 5–6쪽`,
          pages: 2,
          sections: [
            {
              id: "k-c5s1",
              name: "할인 제공 시 유의사항",
              intent: "공통 고지 — 레퍼런스 그대로, 바뀐 곳만 확인",
              form: "notice",
              formLabel: "고지 목록",
              slots: [
                S.copy("k-c5s1a", "할인 제외 대상 목록", "무이자할부금액, 정부지원금, 각종 수수료 및 이자, 연회비, 단기 · 장기카드대출, 아파트 관리비, 국세 · 지방세 …", `${REF} 5쪽`),
                S.copy("k-c5s1b", "결제대행(PG) 가맹점 안내", "가맹점 정보가 결제대행업체 또는 간편결제 전용 가맹점으로 확인되는 경우 할인 대상에서 제외됩니다.", `${REF} 5쪽`),
                S.ok("k-c5s1c", "고객센터 번호", "1588-9955", ["k-r4"]),
              ],
            },
            {
              id: "k-c5s2",
              name: "실적 산정 방법",
              intent: "전월 실적을 어떻게 세나",
              form: "notice",
              formLabel: "고지 목록",
              slots: [
                S.copy("k-c5s2a", "산정 기준", "전월 1일부터 말일(매출 승인일 기준)까지 카드별 가맹점 이용실적", `${REF} 6쪽`),
                S.copy("k-c5s2b", "취소 매출", "취소 매출은 취소 매출표 접수월 이용실적에서 차감합니다.", `${REF} 6쪽`),
                S.draft("k-c5s2c", "최초 발급 특례", "다음달 말일까지 40만원 이상~80만원 미만 서비스 제공 (월 할인한도 50%) — 레퍼런스와 다름", ["k-r1"]),
              ],
            },
          ],
        },
        {
          id: "k-c6",
          name: "연회비와 모바일카드",
          syn: "실물 · 모바일 연회비 · 반환 규정",
          template: `레퍼런스 · ${REF} 7쪽`,
          pages: 1,
          sections: [
            {
              id: "k-c6s1",
              name: "연회비",
              intent: "카드 종류별 연회비",
              form: "table",
              formLabel: "표 3열",
              slots: [
                S.draft("k-c6s1a", "실물카드", "22,000원 (기본 7,000원 + 제휴 15,000원)", ["k-r3"]),
                S.empty("k-c6s1b", "모바일카드", "16,000원 (기본 1,000원 + 제휴 15,000원)", ["k-r3"]),
              ],
            },
            {
              id: "k-c6s2",
              name: "연회비 반환 · 모바일카드 안내",
              intent: "법정 고지",
              form: "notice",
              formLabel: "고지 목록",
              slots: [
                S.copy("k-c6s2a", "연회비 반환", "계약을 해지한 날로부터 10영업일 이내에 반환하여 드립니다.", `${REF} 7쪽`),
                S.copy("k-c6s2b", "모바일카드란", "카드 실물 없이 간편결제에 카드 정보 등록 후 본인 명의의 모바일 기기에서 이용 가능한 카드입니다.", `${REF} 7쪽`),
              ],
            },
          ],
        },
        {
          id: "k-c7",
          name: "해외 이용",
          syn: "수수료 · 청구금액 산출 · 원화결제 차단",
          template: `레퍼런스 · ${REF} 8쪽`,
          pages: 1,
          sections: [
            {
              id: "k-c7s1",
              name: "수수료",
              intent: "해외에서 얼마가 더 붙나",
              form: "info",
              formLabel: "정보 2단",
              slots: [S.draft("k-c7s1a", "국제브랜드 수수료", "Mastercard 1.1%", ["k-r3"]), S.ok("k-c7s1b", "해외서비스 수수료", "0.3%", ["k-r3"])],
            },
            {
              id: "k-c7s2",
              name: "청구금액 산출 · 원화결제 안내",
              intent: "공통 고지",
              form: "notice",
              formLabel: "고지 목록",
              slots: [S.copy("k-c7s2a", "원화결제 안내", "해외에서는 원화가 아닌 '현지통화'로 결제하시길 권장해드립니다.", `${REF} 8쪽`)],
            },
          ],
        },
        {
          id: "k-c8",
          name: "출시일 · 부가서비스 변경 · 기타",
          syn: "법정 고지 · 준법 심의",
          template: `레퍼런스 · ${REF} 9–10쪽`,
          pages: 2,
          sections: [
            {
              id: "k-c8s1",
              name: "상품 출시일",
              intent: "언제부터",
              form: "info",
              formLabel: "정보 1단",
              slots: [S.empty("k-c8s1a", "상품 출시일", "2026년 9월 30일", ["k-r1"])],
            },
            {
              id: "k-c8s2",
              name: "부가서비스 변경 안내",
              intent: "3년 유지 · 변경 사유 ①~④ — 법정 문구",
              form: "notice",
              formLabel: "고지 목록",
              slots: [
                S.copy("k-c8s2a", "3년 유지", "카드 이용 시 제공되는 부가서비스는 카드 신규 출시 이후 3년 이상 축소 · 폐지 없이 유지됩니다.", `${REF} 9쪽`),
                S.copy("k-c8s2b", "변경 사유 ①~④", "카드사의 휴업 · 파산 · 경영상의 위기 등에 따른 불가피한 경우 …", `${REF} 9쪽`),
              ],
            },
            {
              id: "k-c8s3",
              name: "준법 심의",
              intent: "심의필 번호를 받아야 배포할 수 있다",
              form: "sign",
              formLabel: "심의필 칸",
              slots: [S.ok("k-c8s3a", "작성 부서", "카드상품팀"), S.wait("k-c8s3b", "준법감시인 심의필", "준법감시인 심의")],
            },
          ],
        },
      ],
    },
  ],
};

/* ════════ 3. 집단 청원서 (약 280쪽) — 긴 글 · 근거 수백 건 · 서명부 ════════ */

const REGIONS = ["가", "나", "다", "라", "마", "바", "사", "아", "자", "차", "카", "타"];

/** 지구마다 진행 정도가 다르게: 앞쪽은 확인, 가운데는 초안, 뒤쪽은 비어 있음 */
function regionSlot(r: number, k: number, id: string, name: string, text: string, cites: string[]): SbSlot {
  if (r < 4) return k === 3 && r === 2 ? S.nocite(id, name, text) : S.ok(id, name, text, cites);
  if (r < 8) return (r + k) % 4 === 0 ? S.nocite(id, name, text) : (r + k) % 3 === 0 ? S.empty(id, name, text, cites) : S.draft(id, name, text, cites);
  return k === 0 && r === 8 ? S.draft(id, name, text, cites) : S.empty(id, name, text, cites);
}

function regionChapter(name: string, r: number): SbChapter {
  const id = `p-reg${r}`;
  const households = 40 + ((r * 37) % 90);
  const sec = (n: number, s: Omit<SbSection, "id">): SbSection => ({ id: `${id}s${n}`, ...s });
  return {
    id,
    part: "제2부 피해 사실",
    name: `${name} 지구 침수 피해`,
    syn: `침수 ${households}가구 · 주민 진술 ${8 + (r % 5)}건 · 현장 사진`,
    template: "레퍼런스 · ○○천 청원서 (2019) 2부 지구별 장",
    pages: 9,
    sections: [
      sec(1, {
        name: "피해 개요",
        intent: "언제 어디가 얼마나 잠겼나",
        form: "text",
        formLabel: "본문 2–3쪽",
        slots: [
          regionSlot(r, 0, `${id}s1a`, "범람 경과", `2026년 7월 14일 새벽 ○○천 수위가 제방 높이를 넘어 ${name} 지구 저지대로 물이 들어왔다.`, ["p-r4", "p-r3"]),
          regionSlot(r, 1, `${id}s1b`, "침수 범위", `${name} 지구 ${households}가구, 상가 ${6 + (r % 7)}곳이 1층 높이까지 잠겼다.`, ["p-r2"]),
        ],
      }),
      sec(2, {
        name: "피해 가구 현황",
        intent: "숫자로 보는 피해",
        form: "table",
        formLabel: "표 4열",
        slots: [
          regionSlot(r, 2, `${id}s2a`, "침수 가구", `${households}가구`, ["p-r1"]),
          regionSlot(r, 3, `${id}s2b`, "이재민", `${Math.round(households * 2.1)}명`, ["p-r1"]),
          regionSlot(r, 4, `${id}s2c`, "재산 피해 추정", `${(households * 0.38).toFixed(1)}억 원`, ["p-r1", "p-r5"]),
        ],
      }),
      sec(3, {
        name: "주민 진술 요지",
        intent: "피해 주민의 말을 근거로",
        form: "text",
        formLabel: "인용 본문 4–5쪽",
        slots: [
          regionSlot(r, 5, `${id}s3a`, "대피 과정", "새벽 3시에 안내 문자 없이 물이 무릎까지 찼다는 진술이 여럿이다.", ["p-r1"]),
          regionSlot(r, 6, `${id}s3b`, "사전 민원", "범람 두 달 전 배수구 막힘 민원을 냈으나 처리되지 않았다.", ["p-r1", "p-r3"]),
          regionSlot(r, 7, `${id}s3c`, "복구 지원", "복구 지원금 안내를 받지 못한 가구가 있다.", ["p-r1"]),
        ],
      }),
      sec(4, {
        name: "현장 사진",
        intent: "붙임 사진 대지로 이어지는 목록",
        form: "list",
        formLabel: "사진 목록",
        slots: [regionSlot(r, 8, `${id}s4a`, "사진 묶음", `${name} 지구 사진 ${60 + r * 7}장 (붙임 2 사진 대지 참고)`, ["p-r2"])],
      }),
    ],
  };
}

function petitionChapters(): SbChapter[] {
  const part1: SbChapter[] = [
    {
      id: "p-c1",
      part: "제1부 청원의 취지",
      name: "청원 요지",
      syn: "무엇을 누구에게 요구하나 — 한 쪽 요약",
      template: "레퍼런스 · 국민권익위 집단민원 서식",
      pages: 3,
      sections: [
        {
          id: "p-c1s1",
          name: "청원 요지",
          intent: "요구 사항 다섯 가지를 한 문단으로",
          form: "text",
          formLabel: "본문 1쪽",
          slots: [S.draft("p-c1s1a", "요지 문단", "○○천 범람으로 피해를 입은 12개 지구 주민 2,140명은 피해 보상, 재발 방지 시설, 책임 규명을 청원합니다.", ["p-r1", "p-r3"])],
        },
        {
          id: "p-c1s2",
          name: "청원 대상",
          intent: "어느 기관 어느 부서",
          form: "info",
          formLabel: "정보 2단",
          slots: [S.ok("p-c1s2a", "기관", "○○시"), S.empty("p-c1s2b", "담당 부서", "안전총괄과 · 하천관리과", ["p-r3"])],
        },
      ],
    },
    {
      id: "p-c2",
      part: "제1부 청원의 취지",
      name: "청원인과 대표자",
      syn: "대표 청원인 · 연락처 · 청원인 수",
      template: "레퍼런스 · 국민권익위 집단민원 서식",
      pages: 2,
      sections: [
        {
          id: "p-c2s1",
          name: "대표 청원인",
          intent: "연락 받을 사람",
          form: "info",
          formLabel: "정보 2단",
          slots: [S.ok("p-c2s1a", "대표 청원인", "피해 주민 대책위원장"), S.empty("p-c2s1b", "연락처", "대책위 사무실 (주민센터 3층)"), S.draft("p-c2s1c", "청원인 수", "2,140명", ["p-r6"])],
        },
      ],
    },
  ];

  const part2 = REGIONS.map((n, i) => regionChapter(n, i));

  const cause = (id: string, name: string, syn: string, pages: number, slots: SbSlot[], form: SbSection["form"] = "text"): SbChapter => ({
    id,
    part: "제3부 원인과 책임",
    name,
    syn,
    template: "레퍼런스 · ○○천 청원서 (2019) 3부",
    pages,
    sections: [{ id: `${id}s1`, name, intent: syn, form, formLabel: form === "notice" ? "법령 인용" : "본문", slots }],
  });
  const part3: SbChapter[] = [
    cause("p-c20", "배수 시설 관리 이력", "점검 보고서로 본 5년간의 관리 공백", 6, [
      S.draft("p-c20a", "점검 주기", "2021–2025년 배수펌프장 정기 점검이 계획 대비 40%만 시행되었다.", ["p-r3"]),
      S.nocite("p-c20b", "예산 집행", "하천 정비 예산의 절반이 이월되었다."),
      S.empty("p-c20c", "펌프 고장 기록", "범람 당일 펌프 3기 중 2기가 작동하지 않았다.", ["p-r3"]),
    ]),
    cause("p-c21", "행정 대응 경과", "경보 · 대피 안내 · 복구 지원의 시간표", 8, [
      S.empty("p-c21a", "경보 발령 시각", "호우 경보 발령 후 대피 문자까지 2시간 40분이 걸렸다.", ["p-r4", "p-r5"]),
      S.empty("p-c21b", "대피소 운영", "대피소 2곳 중 1곳이 개방되지 않았다.", ["p-r5"]),
    ]),
    cause("p-c22", "전문가 의견", "하천 공학 · 도시 계획 자문", 5, [S.empty("p-c22a", "자문 요지", "제방 높이와 배수 용량이 30년 빈도 강우에 못 미친다.")]),
    cause(
      "p-c23",
      "관련 법령",
      "자연재해대책법 · 하천법 조문",
      6,
      [
        S.copy("p-c23a", "자연재해대책법", "제○조 재해 예방을 위한 시설의 정비 …", "○○천 청원서 (2019) 3부 4장"),
        S.copy("p-c23b", "하천법", "제○조 하천관리청은 하천을 유지 · 보수하여야 한다 …", "○○천 청원서 (2019) 3부 4장"),
      ],
      "notice",
    ),
  ];

  const demand = (id: string, name: string, text: string, pages: number, st: "draft" | "empty" | "ok"): SbChapter => ({
    id,
    part: "제4부 요구 사항",
    name,
    syn: text,
    template: "레퍼런스 · 국민권익위 집단민원 서식 요구 사항",
    pages,
    sections: [
      {
        id: `${id}s1`,
        name,
        intent: "요구 한 가지와 그 근거",
        form: "text",
        formLabel: "요구 + 근거 문단",
        slots: [st === "ok" ? S.ok(`${id}a`, "요구", text, ["p-r1"]) : st === "draft" ? S.draft(`${id}a`, "요구", text, ["p-r1"]) : S.empty(`${id}a`, "요구", text, ["p-r1"])],
      },
    ],
  });
  const part4: SbChapter[] = [
    demand("p-c30", "피해 보상", "침수 가구 · 상가 피해 전액 보상과 지급 일정 공개", 2, "ok"),
    demand("p-c31", "재발 방지 시설", "배수펌프 증설과 제방 보강 공사 일정 확정", 2, "draft"),
    demand("p-c32", "책임 규명", "점검 누락 경위 조사와 결과 공개", 2, "empty"),
    demand("p-c33", "정보 공개", "배수시설 점검 기록 5년 치 공개", 1, "empty"),
    demand("p-c34", "주민 참여 협의체", "복구 · 재발 방지 과정에 주민 대표 참여", 1, "draft"),
  ];

  const book = (n: number, range: string, count: number, pages: number): SbChapter => ({
    id: `p-sign${n}`,
    part: "제5부 서명부",
    name: `서명부 ${n}권 (${range})`,
    syn: `${count.toLocaleString()}명 서명`,
    template: "서명부 서식 (쪽당 20명)",
    pages,
    sections: [
      {
        id: `p-sign${n}s1`,
        name: "서명 확인",
        intent: "서명 수 확인 · 대표 날인",
        form: "sign",
        formLabel: "확인란 2칸",
        slots: [S.ok(`p-sign${n}a`, "서명 수", `${count}명`, ["p-r6"]), S.wait(`p-sign${n}b`, "대표 청원인 확인 (인)", "대표 청원인 날인")],
      },
    ],
  });
  const part5 = [book(1, "가–다 지구", 580, 29), book(2, "라–바 지구", 560, 28), book(3, "사–자 지구", 540, 27), book(4, "차–타 지구", 460, 23)];

  const attach: SbChapter[] = [
    {
      id: "p-att1",
      part: "붙임",
      name: "증거 목록",
      syn: "진술서 · 보고서 · 기록 번호 목록",
      template: "레퍼런스 · ○○천 청원서 (2019) 붙임 1",
      pages: 4,
      sections: [
        {
          id: "p-att1s1",
          name: "증거 목록",
          intent: "본문 인용 번호와 짝",
          form: "table",
          formLabel: "표 4열",
          slots: [
            S.ok("p-att1a", "주민 진술서", "214건 (갑 제1–214호증)", ["p-r1"]),
            S.draft("p-att1b", "점검 보고서", "3건 (갑 제215–217호증)", ["p-r3"]),
            S.empty("p-att1c", "언론 보도", "37건 (갑 제218–254호증)", ["p-r5"]),
          ],
        },
      ],
    },
    {
      id: "p-att2",
      part: "붙임",
      name: "사진 대지",
      syn: "지구별 현장 사진",
      template: "사진 대지 서식 (쪽당 6장)",
      pages: 20,
      sections: [
        {
          id: "p-att2s1",
          name: "사진 대지",
          intent: "지구별 사진 배치",
          form: "list",
          formLabel: "사진 6장 격자",
          slots: [S.draft("p-att2a", "사진 배치", "12개 지구 사진 1,180장 중 대표 120장", ["p-r2"])],
        },
      ],
    },
  ];

  return [...part1, ...part2, ...part3, ...part4, ...part5, ...attach];
}

const PETITION: SbScenario = {
  id: "petition",
  name: "집단 청원서 · 약 280쪽",
  desc: "부 · 장이 수십 개인 긴 글 — 근거 자료 수백 건, 서명부 수천 명",
  project: "○○천 범람 피해 주민 대책위",
  sources: [
    { id: "p-r1", label: "주민 진술서 214건", kind: "resource" },
    { id: "p-r2", label: "현장 사진 1,180장", kind: "resource" },
    { id: "p-r3", label: "○○시 배수시설 점검 보고서 2021–2025", kind: "resource" },
    { id: "p-r4", label: "기상청 강수 · 수위 기록 (7월 13–15일)", kind: "resource" },
    { id: "p-r5", label: "언론 보도 스크랩 37건", kind: "resource" },
    { id: "p-r6", label: "서명 집계표.xlsx", kind: "resource" },
    { id: "p-f1", label: "국민권익위 집단민원 서식", kind: "reference" },
    { id: "p-f2", label: "○○천 청원서 (2019)", kind: "reference" },
  ],
  docs: [
    { id: "p-d1", name: "○○천 범람 피해 보상과 재발 방지를 위한 집단 청원서", chapters: petitionChapters() },
    {
      id: "p-d2",
      name: "보도자료 (청원서 제출 알림)",
      chapters: [
        {
          id: "p-pr1",
          name: "보도자료",
          syn: "제출 일시 · 핵심 요구 · 문의처",
          template: "보도자료 1쪽 서식",
          pages: 1,
          sections: [
            {
              id: "p-pr1s1",
              name: "본문",
              intent: "기자가 바로 쓸 수 있게",
              form: "text",
              formLabel: "본문",
              slots: [S.empty("p-pr1a", "리드 문단", "○○천 범람 피해 주민 2,140명이 ○○시에 집단 청원서를 제출했다.", ["p-r6"])],
            },
          ],
        },
      ],
    },
  ],
};

export const SCENARIOS: SbScenario[] = [MINUTES, CARD, PETITION, NUDGE];

export const getScenario = (id: ScenarioId): SbScenario => SCENARIOS.find((s) => s.id === id) ?? CARD;

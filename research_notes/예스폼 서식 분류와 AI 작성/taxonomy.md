# 예스폼(yesform.com) 서식 분류 체계 (taxonomy)

> 조사 방법: 2026-11-17에 사이트를 직접 수집했다. 페이지 HTML을 curl로 받아 EUC-KR(CP949)을 UTF-8로 바꾼 뒤, 메뉴 링크, 필터 `<input>`의 name/value, 페이지 내 JS 변수를 분석했다. WebFetch는 EUC-KR 인코딩 때문에 한글이 깨져서 보조로만 썼다. 차단은 없었다. robots.txt에서 `/docs/`는 `#Disallow`로 주석 처리되어 허용 상태다. 외부 블로그나 보도자료 검색은 하지 않았다. 아래 내용은 모두 사이트 1차 자료에서 왔다.
> 저작권: 서식 본문은 옮기지 않았다. 분류명, 코드, 메타데이터 필드명, 수치만 기록했다.

## 1. 최상위 카테고리 트리 (대분류 → 중분류 → 소분류)

### Takeaway
분류는 3단계 코드 트리다. 대분류는 `A11`~`A17`이고, 서비스(서브도메인)별로 문서서식/엑셀/파워포인트/사업계획서/계약서/자기소개서/인사말로 나뉜다. 중분류는 `B11~`, 소분류는 `C11~`이다. 중분류 이름은 "성격"(회사/법률/생활/교육행정)을 따르고, 소분류는 대개 "직무/부서"(기획/전략, 인사/HR …)를 따른다. 교안에서 흔히 보는 "인사/총무/회계/계약/공문/학교"는 한 층에 나란히 있지 않다. 여러 층과 여러 대분류에 흩어져 있다.

### Cited Findings
**대분류 · 중분류: 사이트 GNB "카테고리" 메뉴 기준** — [홈](https://www.yesform.com/), [문서서식 메인](https://www.yesform.com/docs/formMain.php)

| 대분류(코드, 도메인) | 중분류 (코드: 이름) |
|---|---|
| **문서서식** `A11` (www.yesform.com) | `A11B11` 회사서식 · `A11B12` 법률서식 · `A11B13` 생활서식 · `A11B14` 교육행정 서식 (+ `menu=freeData` "무료 서식") |
| **엑셀** `A12` (excel.yesform.com) | `A12B11` 엑셀프로그램 · `A12B12` 엑셀템플릿 · `A12B13` 차트/대시보드 (+ 엑셀 강의 영상 `excel_video.php`) |
| **파워포인트** `A13` (powerpoint.yesform.com) | `A13B11` 파워포인트 템플릿 · `A13B12` 인포그래픽 |
| **사업계획서** `A14` (plan.yesform.com) | `A14B11` 사업계획서 샘플 · `A14B12` 목차별 슬라이드 · `A14B13` 무료 사업계획서 (+ 자동 사업계획서 `plan_auto/template/step01.php`) |
| **계약서** `A15` (contract.yesform.com) | `A15B11` 계약서 양식 · `A15B12` 계약서 작성가이드 · "변호사 계약서"(= `A15B11` + 검색어 q=변호사) · 조항 템플릿 `templateList.php` |
| **자기소개서** `A16` (resume.yesform.com) | `A16B11` 자소서 예시 · `A16B12` 경력기술서 · `A16B13` 이력서 · 자소서 항목 `organization.php` |
| **인사말** `A17` (speech.yesform.com) | `A17B11` 상황별 스피치 · AI 인사말/AI 스피치/이메일 인사말/카드 만들기/이미지 카드 (별도 생성형 페이지) |
| **영문서식** (english.yesform.com, `language=en`) | 위 코드를 다시 쓴다: `A11B11` 회사서식, `A11B12` 법률서식, `A11B13` 생활서식, `A16` 취업문서, `A17B11` 영문레터 |

Source: [홈](https://www.yesform.com/), [문서서식 메인](https://www.yesform.com/docs/formMain.php)

**소분류(C단계): 각 목록 페이지 필터 "카테고리"의 `name="cDepth"` 값**
- `A11B11` 회사서식: `C11` 기획/전략 · `C12` 인사/HR · `C13` 재무/회계 · `C14` 영업/마케팅 · `C15` 구매/자재/생산 · `C16` 총무/기타 · `C17` ISO 표준서식 — [A11B11](https://www.yesform.com/docs/formList.php?division=A11B11)
- `A11B12` 법률서식, `A11B13` 생활서식, `A11B14` 교육행정 서식: 필터에 cDepth(소분류)가 **없다**. 대신 목록 상단에 키워드 칩이 줄지어 있다. 예시:
  - 법률서식: 가압류 신청서, 합의서, 진술서, 고소장, 내용증명, 탄원서, 위임장, 동업계약서 등 — [A11B12](https://www.yesform.com/docs/formList.php?division=A11B12)
  - 생활서식: 청첩장, 식순, 경위서, 반성문, 여행계획표, 진료확인서, 지방/축문, 경조사봉투 등 — [A11B13](https://www.yesform.com/docs/formList.php?division=A11B13)
  - 교육행정: 가정통신문, 수업계획서, 출석부, 생활기록부, 성적증명서, 장학금신청서, 시간표 등 — [A11B14](https://www.yesform.com/docs/formList.php?division=A11B14)
- 회사서식 상단 키워드 칩 예시: 업무일지, 인수인계, 출장보고서, 급여명세서, 근로계약서, 이사회의사록, 사직서, 견적서, 거래명세서 등 — [A11B11](https://www.yesform.com/docs/formList.php?division=A11B11)
- `A12B11`/`A12B12`/`A12B13` 엑셀: 회사서식과 같은 직무 6분류(C11 기획/전략 ~ C16 총무/기타)다. ISO는 없다 — [A12B12](https://excel.yesform.com/docs/formList.php?division=A12B12), [A12B11](https://excel.yesform.com/docs/formList.php?division=A12B11), [A12B13](https://excel.yesform.com/docs/formList.php?division=A12B13)
- `A13B11` PPT 템플릿 (산업/주제): C11 비즈니스 · C12 IT/기술 · C13 교육/미디어 · C14 문화/환경 · C15 건축/건설 · C16 의학/스포츠 · C17 기타 — [A13B11](https://powerpoint.yesform.com/docs/formList.php?division=A13B11)
- `A13B12` 인포그래픽 (도식 형태): C11 조직도형 · C12 프로세스형 · C13 열거형 · C14 확산형 · C15 SWOT형 · C16 표/테이블형 · C17 지도형 · C18 그래픽형 · C19 차트 · C20 아이콘 — [A13B12](https://powerpoint.yesform.com/docs/formList.php?division=A13B12)
- `A14B11` 사업계획서 샘플 (문서 종류): C11 사업계획서 · C12 보고서 · C13 제안서 · C14 회사소개서/IR · C15 기타 — [A14B11](https://plan.yesform.com/docs/formList.php?division=A14B11)
- `A14B12` 목차별 슬라이드 (**문서 내부 섹션 단위**): C11 표지 · C12 목차 · C13 요약 정보 · C14 시장 분석 · C15 제품 서비스 · C16 마케팅 전략 · C17 운영 계획 · C18 투자 제안 · C19 재무 계획 · C20 맺음말 — [A14B12](https://plan.yesform.com/docs/formList.php?division=A14B12)
- `A14B13` 무료 사업계획서: C11 회사소개서 · C12 사업제안서 · C13 IR자료 · C14 제품소개서 · C15 사업계획서 · C16 기타홍보자료 — [A14B13](https://plan.yesform.com/docs/formList.php?division=A14B13)
- `A15B11` 계약서 양식 (거래 유형): C11 물품/서비스 거래 · C12 지식/ 기술 거래 · C13 금전/금융 거래 · C14 부동산 거래 · C15 고용/인사 · C16 건설/공사 · C17 회사운영/관리 · C18 기타 — [A15B11](https://contract.yesform.com/docs/formList.php?division=A15B11)
- `A16B11` 자소서 예시: C11 직무별 자소서 · C12 공채 자소서 · C13 학업계획서 · C14 기타 / `A16B12`: C11 경력기술서 · C12 직무수행계획서 / `A16B13` 이력서: 소분류 없음 — [A16B11](https://resume.yesform.com/docs/formList.php?division=A16B11), [A16B12](https://resume.yesform.com/docs/formList.php?division=A16B12)
- `A17B11` 상황별 스피치 (감정/목적): C11 축하 · C12 격려 · C13 감사 · C14 이별 · C15 시작 · C16 행사 · C17 기타 — [A17B11](https://speech.yesform.com/docs/formList.php?division=A17B11)
- 상세 페이지 breadcrumb은 3단계를 그대로 보여 준다. 예: "문서서식 > 회사서식 > 총무/기타" — [상세 예시](https://www.yesform.com/forms/vform_100577.php)

### Inferences
- 코드 문법은 `A{2자리}` + `B{2자리}` + `C{2자리}`이고, 각 단계 번호는 11부터 시작한다. 값을 이어 붙여 경로를 만드는 문자열 경로 코드다(예: `A11B11C17`). D단계는 관찰되지 않았다.
- 소분류의 축이 중분류마다 다르다. 직무(회사·엑셀), 산업(PPT 템플릿), 도식형(인포그래픽), 문서 섹션(목차별 슬라이드), 거래 유형(계약서), 감정·목적(스피치)이 쓰인다. 하나의 공통 축이 아니라 "중분류마다 가장 자연스러운 축"을 고른 실용적 설계다.
- 법률·생활·교육행정처럼 성격이 다양한 묶음은 트리를 더 깊게 나누지 않는다. 대신 문서 종류 키워드 칩으로 탐색하게 한다.

### Gaps
- 교안 예시의 "비즈니스/인사/총무/회계/계약/공문/법률/생활/학교"가 그대로 한 층에 있는 구조는 확인되지 않았다. "공문"이라는 분류명은 메뉴에서 찾지 못했다.
- 법률/생활/교육행정에 숨은 C코드가 있는지(예: `A11B12C11`을 직접 넣어 조회) 확인하지 않았다.
- 서브도메인 `/z_n/atwrt/...` 경로의 옛 분류는 robots.txt Disallow라서 조사하지 않았다.

## 2. URL 파라미터 체계 (division, menu 등)

### Takeaway
`formList.php`는 하나의 GET 폼(`detailFrm`)으로 모든 패싯을 조합한다. `division`은 트리 경로이고 `menu`는 특수 컬렉션(무료 서식)이다. 나머지 패싯은 별도 파라미터로 받는다. 패싯 값도 `Z11B11` 같은 같은 코드 문법을 쓴다(분류 트리는 A, 패싯 사전은 Z).

### Cited Findings
- `division`: 위 A/B/C 경로 코드다. 메뉴 링크와 hidden input `name="division" value="A11B11"`으로 확인했다 — [A11B11](https://www.yesform.com/docs/formList.php?division=A11B11)
- `menu`: `menu=freeData`와 `menu=Fdownfree`가 둘 다 "무료 서식"으로 표기되고, 두 페이지의 총 페이지 수도 381로 같다 — [freeData](https://www.yesform.com/docs/formList.php?division=A11&menu=freeData), [Fdownfree](https://www.yesform.com/docs/formList.php?division=A11&menu=Fdownfree)
- 문서서식 메인의 섹션 링크: "신규 업데이트 서식"은 `division=A11&sort=Date&Fcs=filter`로, 각 중분류 최신순은 `division=A11B1x&sort=Date`로 연결된다 — [formMain](https://www.yesform.com/docs/formMain.php)
- 목록 폼의 hidden 필드 전체: `action_type, division, language, menu, Fcs, q, listScale(기본 50), listSort(기본 Date), mode(기본 ALBUM), aDiv, dDiv, aFilter, free, aFormat, Upjong, Type, aColor, Gubun, aUse, aStyle, page, sort, scale` — [A11B11](https://www.yesform.com/docs/formList.php?division=A11B11)
- `Fcs` 값은 `filter`(필터 적용)와 `docSec`(페이지 이동)이 관찰되었다. 주석에는 "docSec, thinkzonSec, webSec, filter"가 적혀 있다 — [A11B11](https://www.yesform.com/docs/formList.php?division=A11B11), [curation](https://www.yesform.com/curation/)
- 작성자 필터: `formList.php?maker=victory997&division=A11B11`. 상세 페이지의 작성자 링크가 이 URL을 쓴다 — [상세](https://www.yesform.com/forms/vform_100577.php)
- 검색: `/z_n/forms/search.php?q=` (EUC-KR로 URL 인코딩). 상세 페이지의 키워드 태그가 이 URL로 연결된다 — [상세](https://www.yesform.com/forms/vform_100577.php)
- 계약서 "변호사 계약서" = `action_type=1&division=A15B11&q=변호사`. 큐레이션 컬렉션을 검색어로 만든 사례다 — [홈](https://www.yesform.com/)
- 영문: `language=en` 파라미터와 english.yesform.com 도메인 — [홈](https://www.yesform.com/)
- 상세 URL은 `/forms/vform_{번호}.php`(예: vform_100577)다. 페이지 JS의 내부 ID는 `100100577`이다 — [상세](https://www.yesform.com/forms/vform_100577.php)
- 큐레이션 URL: `/curation/Customlist.php?ReUsers=Z11B12`(사용자), `?ReSeason=14`(시즌) — [상세](https://www.yesform.com/forms/vform_100577.php)
- 목록은 50페이지 넘게 넘길 수 없다. JS 경고문: "예스폼 품질을 위해 50 페이지 이상을 제공하지 않습니다… Filters 옵션을 이용" — [A11B11](https://www.yesform.com/docs/formList.php?division=A11B11)

### Inferences
- 찜하기 `data-value`로 보이는 내부 ID는 100…/200…/500… 접두로 시작한다. 콘텐츠 출처(자체 제작/제휴/쇼핑몰 등)별 ID 공간으로 보이지만 확인하지는 않았다.
- "무료 자료", "유료 서식", "테마서식", "업종별", "직무별", "법정서식" 같은 별도 menu 섹션은 없다. 유·무료는 `free` 필터와 `menu=freeData`로, 업종은 `Upjong` 필터로, 직무는 회사서식 C단계와 큐레이션 "사용자"로 표현된다.

### Gaps
- `menu`의 다른 값은 freeData와 Fdownfree 외에 관찰되지 않았다. `aDiv`/`dDiv`/`aFilter`/`action_type`의 정확한 의미는 확인하지 못했다.

## 3. 트리 외의 교차 패싯 (필터, 정렬, 태그, 큐레이션)

### Takeaway
목록 우측 "Filters" 패널에 보기형식 · 카테고리 · 정렬순서 · 포맷 · 업종별 · 언어 · 리스트 수가 공통으로 있다. 대분류가 PPT/사업계획서이면 등급 · 용도별 · 스타일별 · 슬라이드 비율 · 색상이, 엑셀이면 속성(일반/매크로)이 추가된다. 이와 별도로 "맞춤 서식 큐레이션"이 사용자(직무·역할 39개) · 시즌(48개) · 상황(대분류 9개 → 중분류 → 상황) 3축 패싯을 제공한다. 서식마다 자유 키워드 태그도 붙어 있다.

### Cited Findings
**공통 Filters 패널** — [A11B11](https://www.yesform.com/docs/formList.php?division=A11B11)
- 보기형식 `MODE`: `ALBUM` / `IMGS` / `LIST`
- 정렬순서 `SORT`: `Date`=최신순 · `view`=다운로드 순 · `match`=정확도순 · `RANK`=추천순
- 포맷 `Format`: `1` 한글 · `5` PDF · `2` 워드 · `18` 구글 닥스 · `6` 엑셀 · `19` 구글 시트 · `4` 파워포인트 · `20` 구글 슬라이드 · `7` 노션 · `100` 기타 (복수 선택 → `aFormat`)
- 업종별 `Upjong`: `Z11B11` 제조/생산 · `Z11B12` 서비스 · `Z11B13` 판매/유통 · `Z11B14` IT 및 통신 · `Z11B15` 금융 · `Z11B16` 건설 · `Z11B17` 교육/미디어 · `Z11B18` 기타
- 언어 `language`: `kr` 한국어 · `en` 영어
- 리스트 수 `SCALE`: 10 / 30 / 50 / 100
- 버튼: "필터적용", "Clear all", "초기화"

**대분류별 추가 패싯**
- 엑셀 속성 `Type`: `Z12B11` 일반 · `Z12B12` 매크로 — [A12B12](https://excel.yesform.com/docs/formList.php?division=A12B12)
- PPT 등급 `free`: 프리미엄 / 유료 — [A13B11](https://powerpoint.yesform.com/docs/formList.php?division=A13B11)
- PPT 용도별 `Use`: `Z13B11` 회사소개서 · `Z13B12` 사업계획서 · `Z13B13` 보고서 · `Z13B14` 제안서 · `Z13B15` 브랜딩 · `Z13B16` 피치덱 · `Z13B17` 포트폴리오 — [A13B11](https://powerpoint.yesform.com/docs/formList.php?division=A13B11)
- 사업계획서 용도별 `Use`: `Z13B18` 창업 사업계획서 · `Z13B19` 신년도 사업계획서 · `Z13B11` 회사소개서 · `Z13B20` 투자제안서 · `Z13B21` 사업제안서 · `Z13B22` 정책지원사업 — [A14B11](https://plan.yesform.com/docs/formList.php?division=A14B11)
- 스타일별 `Style`(PPT): `Z14B11` 포토그래피 · `Z14B12` 일러스트 · `Z14B13` 심플/모던 · `Z14B14` 3D — [A13B11](https://powerpoint.yesform.com/docs/formList.php?division=A13B11)
- 슬라이드 `Gubun`: `garo_wide` 와이드스크린 (16:9) · `garo` 표준 (4:3) · `sero` 세로형 (A4) — 같은 출처
- 색상 `Color`: Red, Orange, Green, Blue, Brown, Grey, Pink, Yellow, Teal, Purple, Black, White (12색) — 같은 출처

**맞춤 서식 큐레이션** (`/curation/`, 탭: 사용자 / 시즌 / 상황) — [curation](https://www.yesform.com/curation/)
- 사용자(`ReUsers=Z11B..`), 39개: 경영진·관리자, 인사 담당자, 법률·법무 담당자, 회계·세무 담당자, 학교·교육기관 종사자, 마케팅·홍보 담당자, 재무 담당자, 총무 담당자, 품질 관리 담당자, 행정 직원, 영업 담당자, IT·개발 담당자·엔지니어, 고객 서비스 담당자, 현장 관리자, 구매·자재 담당자, 연구원·분석가, 학생, 운영 담당자, 의료진·의료기관, 부동산·임대관리, 안전 관리자, 프로젝트 매니저, 공무원·공공기관, 물류·재고 담당자, 이벤트·행사 담당자, 소규모 사업자·창업자, 비영리·종교·공익단체, 기획·전략 담당자, 생산·제조 관리자, 감사 담당자, 건설업자·건축주, 취업 준비생·구직자, 채권·채무 당사자, 법무사·공증, 프리랜서·1인사업자, 사회복지사·복지기관, 외식·판매 종사자, 이커머스·온라인판매 운영자, 기업 교육·HRD 담당자, 노무사·노동 담당자
  - 확인된 코드: Z11B11 경영진·관리자, Z11B12 인사 담당자, Z11B13 법률·법무 담당자, Z11B20 행정 직원, Z11B42 취업 준비생·구직자, Z11B50 노무사·노동 담당자 — [상세 1](https://www.yesform.com/forms/vform_100577.php), [상세 2](https://www.yesform.com/forms/vform_107621.php)
  - 업종 필터 `Upjong`과 사용자 `ReUsers`가 같은 `Z11B..` 접두를 공유한다. 예를 들어 Z11B11은 업종 필터에서는 "제조/생산", 큐레이션에서는 "경영진·관리자"다. 코드 네임스페이스가 화면마다 다르게 쓰인다.
- 시즌(`ReSeason={id}`, `data-season-type` 1/2/3), 48개. 확인된 예:
  - type1 (계절·생활 이벤트): 새해·신년계획, 봄, 가정의 달, 여름휴가, 연말·송년, 손 없는 날, 정기 인사평가, 채용·공채(id 14), 이사·인테리어, 혼수·웨딩, 방학, 동절기 안전, 장마·우기 안전, 태풍 대비 등
  - type2 (명절·세무·신고 일정): 신정, 설날 연휴, 추석 연휴, 부가세/법인세 신고·납부, 연말정산, 원천세·지급명세서 신고, 자동차세/재산세 납부, 종합소득세, 주주총회 등
  - type3 (법·제도 변경): 최저임금 인상, 건강보험료율 변경, 국민연금료율 단계 인상, 노동법 개정, 법정의무교육(5대) 등
  - 출처: [curation](https://www.yesform.com/curation/)
- 상황(대분류 → 중분류 → 상황 선택, 3단계 마법사). 대분류 9개: 총무·경영지원·일반사무 / 영업·마케팅·사업기획 / AI·IT / 현장·공사·부동산 관리 / 생산·구매·자재·SCM 관리 / 회계·경리·재무 실무 / 법무·계약·지식재산 / 공공행정·생활·서비스 / HR 관리·채용. 상황 문구는 "~할 때" 형식이다(예: "사업계획을 수립할 때", "부동산을 매매할 때", "결혼을 준비할 때") — [curation](https://www.yesform.com/curation/)

**키워드 태그**: 상세 페이지 "키워드 영역"에 태그 여러 개가 붙고, 각 태그는 `search.php?q=`로 연결된다(예: 무료양식, 취업규칙, 근로기준법, 인사노무, 계약법률). "더보기/접기"로 펼친다 — [상세](https://www.yesform.com/forms/vform_100577.php)

### Inferences
- "법정서식 vs 일반서식"은 별도 패싯으로 존재하지 않는다. 법정·제도 성격은 시즌 type3(법·제도 변경)와 제목의 연도 표기(예: "[2027년] …")로 드러난다.
- 유·무료는 3등급(무료 / 유료 / 프리미엄)이다. 문서서식 쪽에서는 `free` 히든 필드와 `menu=freeData`로 거른다.
- 에디터 제품에 옮길 만한 패턴: (a) 트리 + 직교 패싯을 하나의 쿼리 폼으로 묶기, (b) 역할(누가)·시즌(언제)·상황(왜/무엇을 할 때) 3축 큐레이션, (c) 문서 내부 섹션 단위 분류(목차별 슬라이드).

### Gaps
- 상황 중분류와 상황 항목 전체 목록은 AJAX나 숨은 패널로 로드되는 것으로 보여 완전히 수집하지 못했다.
- 시즌 48개 중 일부 이름은 원문 추출 중 잘렸다(예: "원천세·지급명세서 신…", "육아지원·일가정양립…").
- "직무별", "업종별" 전용 랜딩 페이지가 있는지는 확인하지 못했다.

## 4. 목록 · 상세 페이지 메타데이터 필드

### Takeaway
목록 카드는 가볍다: 썸네일, 제목, 등급 배지, 후기 수, 조회수, 포맷 아이콘, Update/N 배지. 상세 페이지는 필드가 많다: breadcrumb, 미리보기 슬라이더, 키워드 태그, 작성자/팀, 회원 등급, 후기 수, 페이지 수, 조회수, "목적 및 용도", "사용 가능한 포맷", 가격 카드, "추천 사용자", "추천 시즌", "추천 상황", "목차", "본문 내용"(텍스트 미리보기), "자주 묻는 질문", "함께 많이 확인한 서식", "이용후기". 파일 크기와 등록일은 상세 화면에 표시되지 않았다.

### Cited Findings
**목록 카드** — [A11B11](https://www.yesform.com/docs/formList.php?division=A11B11), [freeData](https://www.yesform.com/docs/formList.php?division=A11&menu=freeData)
- 제목(연도 접두 관행, 예: "[2027년] …")
- 등급 배지: "무료" / "유료" / "프리미엄"
- "후기" + 숫자(후기 수)
- 조회·다운로드 수(예: "4,730", "487k", "99+" 표기)
- 포맷 아이콘의 alt 값: "한글 (hwp)", "워드 (docx)", "엑셀 (xlsx)", "Adobe PDF (pdf)", "구글 문서", "구글 시트", "파워포인트 (pptx)"
- 배지: "Update", "N"(신규)

**상세 페이지** (`/forms/vform_100577.php`, `vform_107621.php`에서 확인) — [상세 1](https://www.yesform.com/forms/vform_100577.php), [상세 2](https://www.yesform.com/forms/vform_107621.php)
- breadcrumb (`view-head__breadcrumb`): "문서서식 > 회사서식 > 총무/기타"
- 제목 (`h1.view-head__title`)
- 미리보기: 썸네일 세로 슬라이더 + 메인 큰 이미지 + 페이지 표시(fraction), "에디터 편집하기" 배지, "서식 찜하기"
- 키워드 영역(태그 → 검색 링크)
- 작성자 블록: 작성자명(예: 닉네임), 소속 "예스폼 콘텐츠제작팀"(인증 아이콘), 회원 등급 이미지(alt "무료회원"), "후기 N", 페이지 수(Draft 아이콘, 예 "11p"), 조회수(Visibility 아이콘, 예 "20,074")
- "목적 및 용도" (설명 문단)
- "사용 가능한 포맷" / "사용 가능한 포맷을 선택해 주세요." (예: 한글, 워드, 구글 문서) + "에디터로 열기"
- 가격 카드: "프리미엄 무제한", 월 9,000원, 항목 "이용 범위", "혜택 제공", "사용 기한"
- "추천 사용자" (큐레이션 ReUsers 링크 태그)
- "추천 시즌" (ReSeason 링크 + 설명 한 줄)
- "추천 상황" (HTML 주석만 있고 이 서식에서는 비어 있음)
- HTML 주석 "AI 생성 안내 (샘플 데이터)" 블록 자리가 있다(비어 있음)
- "목차" (문서 장 구성 목록)
- "본문 내용" (텍스트 미리보기, 접기 버튼)
- "자주 묻는 질문을 확인해 보세요" (서식별 FAQ 3개 내외)
- "함께 많이 확인한 서식" (관련 서식 슬라이더, 카드 형식은 목록과 같음)
- "이용후기" (후기 작성은 다운로드한 회원만 가능하다는 안내)
- 공유: 카카오톡, Gmail

### Inferences
- 상세 페이지의 숫자 지표는 페이지 수와 조회수 두 가지다. 정렬 옵션 "다운로드 순"(`view`)의 값 이름으로 보아, 목록의 숫자는 조회수와 다운로드 수가 섞인 하나의 인기 지표일 가능성이 있다.
- 메타데이터에 사용자·시즌·상황이 들어가면서, 서식 한 건이 트리 1곳과 큐레이션 여러 축에 동시에 연결된다(다중 분류).

### Gaps
- 파일 크기, 등록일·수정일, 가격(서식 단건 가격)은 확인한 두 상세 페이지에 보이지 않았다. 유료 단건 서식 상세는 확인하지 않았다.
- "추천 상황" 블록이 채워진 사례는 확인하지 못했다.

## 5. 카탈로그 규모 (전체, A11)

### Takeaway
사이트는 "100만 서식"과 "국내 1위 문서서식 플랫폼"을 내세운다. 목록 JS의 총 페이지 수로 추정하면 문서서식(A11)은 약 8만 건(1,595페이지 × 50)이고, 무료 서식은 약 1.9만 건이다. 이 건수는 추정치다.

### Cited Findings
- 문구: "국내 최고 100만개 문서서식을 월 9,000원으로 무제한 이용해보세요." / "국내 1위 문서서식 플랫폼, 예스폼입니다." — [A11B11](https://www.yesform.com/docs/formList.php?division=A11B11)
- 목록 JS 변수 `Total`은 주석상 "총 페이지수"이고, 기본 `listScale`은 50이다. 관찰 값은 아래 표와 같다 — [A11](https://www.yesform.com/docs/formList.php?division=A11) 및 각 목록 URL

| division | Total(총 페이지) | ×50 추정 건수 |
|---|---|---|
| A11 문서서식 전체 | 1,595 | ≈ 79,750 |
| A11B11 회사서식 | 1,010 | ≈ 50,500 |
| A11B12 법률서식 | 158 | ≈ 7,900 |
| A11B13 생활서식 | 297 | ≈ 14,850 |
| A11B14 교육행정 서식 | 132 | ≈ 6,600 |
| A11 무료 서식(menu=freeData) | 381 | ≈ 19,050 |
| A11B11C11 회사서식 > 기획/전략 | 81 | ≈ 4,050 |
| A12B11 / B12 / B13 엑셀 | 13 / 48 / 6 | ≈ 650 / 2,400 / 300 |
| A13B11 PPT 템플릿 / A13B12 인포그래픽 | 215 / 139 | ≈ 10,750 / 6,950 |
| A14B11 / B12 / B13 사업계획서 | 119 / 129 / 51 | ≈ 5,950 / 6,450 / 2,550 |
| A15B11 계약서 양식 / A15B12 작성가이드 | 199 / 2 | ≈ 9,950 / 100 |
| A16B11 / B12 / B13 자소서·경력·이력서 | 173 / 15 / 17 | ≈ 8,650 / 750 / 850 |
| A17B11 상황별 스피치 | 384 | ≈ 19,200 |

- A11B11+B12+B13+B14 = 1,597페이지로 A11 전체(1,595)와 거의 같다. 중분류 합산 구조가 맞는다는 근거다.
- 큐레이션 페이지에 "3,351,130명 뉴스레터 구독 중"이라는 수치가 있다 — [curation](https://www.yesform.com/curation/)

### Inferences
- 위 대분류들의 합(×50 기준)은 약 25만 건 수준이다. "100만 서식"은 연도별 개정판, 제휴·쇼핑몰 콘텐츠, 영문, 기타 서비스를 합친 마케팅 수치로 보인다(확인되지 않음).
- 마지막 페이지가 꽉 차지 않을 수 있으므로 ×50 값은 상한에 가까운 추정치다.

### Gaps
- 사이트 어디에도 정확한 총 건수 표시는 없었다. `Total`이 페이지 수라는 해석은 JS 주석("총 페이지수")에 근거하며, 검색 결과 수를 직접 표시하는 부분은 찾지 못했다.
- 외부 보도자료나 블로그로 교차 검증하지 않았다.
